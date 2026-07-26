import {
  ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  AuditEventEntity, BudgetVersionEntity, BudgetVersionStatus, CommitmentEntity,
  CommitmentSourceType, CommitmentStatus, ContractAppendixEntity, ContractAppendixStatus,
  ContractEntity, ContractPartyEntity, ContractStatus, CostCodeEntity, CostCodeStatus,
  DocumentEntity, FxSnapshotEntity, InvoiceEntity, InvoiceStatus, LegalEntityEntity,
  ObligationEntity, ObligationStatus, PaymentComponentEntity, PaymentEntity, PaymentStatus,
  ProjectEntity, UserAccountEntity
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { canonicalHash } from '../risk-change/domain/canonical-hash';
import { decodeContractCostCursor, encodeContractCostCursor } from './domain/cursor';
import { OBLIGATION_EFFECTIVE_STATUS_SQL } from './domain/obligation-projection';
import type {
  ContractListQueryDto, CreateBudgetVersionDto, CreateCommitmentDto, CreateContractAppendixDto,
  CreateContractDto, CreateContractPartyDto, CreateObligationDto, CreatePaymentDto,
  FulfillObligationDto, ObligationListQueryDto, UpdateContractDto
} from './dto/contract-cost.dto';

export interface RequestContext extends AuthContext { correlationId: string }

/** One raw row of the API-059 page: the stored columns plus the derived status projection. */
interface ObligationPageRecord {
  id: string;
  contractId: string;
  projectId: string;
  appendixId: string | null;
  clauseRef: string;
  title: string;
  obligorPartyId: string;
  beneficiaryPartyId: string;
  ownerUserId: string;
  triggerType: string;
  triggerReference: string | null;
  dueDate: string | null;
  status: string;
  storedStatus: string;
  evidenceRefs: string[];
  consequence: string | null;
  decisionType: string | null;
  decisionBy: string | null;
  decisionAt: Date | null;
  decisionReason: string | null;
  decisionEvidenceRefs: string[] | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * US Contract & Cost (API-053…API-066).
 *
 * The two rules the whole module is built around:
 * - MONEY NEVER TOUCHES JS. Every monetary value crosses this service as a string; every sum or
 *   comparison — the consolidated contract value, the invoice fact match, the payment component
 *   identity — is computed by Postgres in `numeric`.
 * - Out of ABAC scope is indistinguishable from missing: 404, never 403. Contracts are
 *   project-level, so a package-only principal has no reach at all.
 *
 * V1 precondition relaxation (deliberate, recorded): appendices (API-058) and payments (API-065)
 * require the parent contract to exist and not be CLOSED/EXPIRED. The documented "parent
 * effective" precondition is unsatisfiable — no operation in the catalog can make a contract
 * EFFECTIVE yet.
 */
@Injectable()
export class ContractCostService {
  constructor(
    @InjectRepository(ContractEntity)
    private readonly contracts: Repository<ContractEntity>,
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-053 — the project contract register. */
  async listContracts(context: RequestContext, projectId: string, query: ContractListQueryDto) {
    const scope = await this.permissions.accessScopeSets(context, 'contract.read');
    await this.assertProjectVisible(this.contracts.manager, context, projectId, scope);
    const cursor = decodeContractCostCursor(query.cursor);
    const builder = this.contracts.createQueryBuilder('contract')
      .where('contract.tenantId = :tenantId AND contract.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    if (query.type) builder.andWhere('contract.type = :type', { type: query.type });
    if (query.status) builder.andWhere('contract.status = :status', { status: query.status });
    if (cursor) this.applyCursor(builder, 'contract', cursor, 'contracts', context.tenantId);
    const rows = await builder
      .orderBy('contract.createdAt', 'DESC').addOrderBy('contract.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => this.contractView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-054 — register a contract; it is born DRAFT, unsigned and without legal hold. */
  async createContract(
    context: RequestContext, projectId: string, input: CreateContractDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'contract.create');
    return this.commands.execute({
      context, operation: 'API-054:create-contract', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'Contract',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Contract', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        this.assertDateWindow(input.effectiveFrom ?? null, input.effectiveTo ?? null);
        await this.assertRootDocument(manager, context, projectId, input.rootDocumentId ?? null);

        const row = manager.getRepository(ContractEntity).create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          contractNo: input.contractNo, title: input.title, type: input.type,
          status: ContractStatus.DRAFT,
          effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null,
          value: input.value, currency: input.currency,
          rootDocumentId: input.rootDocumentId ?? null, legalHold: false,
          signedAt: null, signedBy: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.rethrowUnique(
          () => manager.getRepository(ContractEntity).save(row),
          'CONTRACT_NUMBER_CONFLICT', 'Số hợp đồng đã tồn tại trong dự án'
        );
        // Re-read so money leaves as the numeric text Postgres stores, not the client's spelling.
        const saved = await manager.getRepository(ContractEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Contract', saved.id, saved.versionNo,
          'Contract.Created', {
            projectId, contractNo: saved.contractNo, type: saved.type,
            currency: saved.currency,
            summary: `Contract ${saved.contractNo} created`
          });
        return this.contractView(saved);
      }
    });
  }

  /**
   * API-055 — the consolidated contract view. `consolidatedValue` = value + SUM(value_impact of
   * EFFECTIVE appendices), computed entirely in Postgres numeric and returned as text.
   */
  async getContract(context: RequestContext, contractId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'contract.read');
    const contract = await this.loadContract(this.contracts.manager, context, contractId, scope);
    const manager = this.contracts.manager;
    const parties = await manager.getRepository(ContractPartyEntity).find({
      where: { tenantId: context.tenantId, contractId: contract.id },
      order: { createdAt: 'ASC', id: 'ASC' }
    });
    const appendices = await manager.getRepository(ContractAppendixEntity).find({
      where: { tenantId: context.tenantId, contractId: contract.id },
      order: { createdAt: 'ASC', id: 'ASC' }
    });
    const [consolidated] = await manager.query<Array<{ consolidatedValue: string }>>(
      `SELECT (contract.value + COALESCE((
          SELECT SUM(appendix.value_impact)
          FROM contract_appendices appendix
          WHERE appendix.tenant_id = contract.tenant_id
            AND appendix.contract_id = contract.id
            AND appendix.status = 'EFFECTIVE'
        ), 0))::text AS "consolidatedValue"
      FROM contracts contract
      WHERE contract.tenant_id = $1 AND contract.id = $2`,
      [context.tenantId, contract.id]
    );
    return {
      data: {
        ...this.contractView(contract),
        consolidatedValue: consolidated.consolidatedValue
      },
      parties: parties.map((row) => this.partyView(row)),
      appendices: appendices.map((row) => this.appendixView(row))
    };
  }

  /** API-056 — DRAFT-only edit with optimistic concurrency; a legal hold freezes even drafts. */
  async updateContract(
    context: RequestContext, contractId: string, input: UpdateContractDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'contract.update');
    return this.commands.execute({
      context, operation: 'API-056:update-contract', idempotencyKey,
      request: { contractId, input }, responseStatus: 200,
      resourceType: 'Contract', resourceId: contractId,
      execute: async (manager) => {
        const contract = await this.lockContract(manager, context, contractId, scope);
        if (contract.legalHold) {
          throw this.unprocessable('LEGAL_HOLD', 'Hợp đồng đang bị legal hold; không thể sửa');
        }
        if (contract.status !== ContractStatus.DRAFT) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ hợp đồng DRAFT mới được sửa trực tiếp'
          );
        }
        this.assertVersion(contract.versionNo, input.expectedVersion);

        const effectiveFrom = input.effectiveFrom !== undefined
          ? input.effectiveFrom : contract.effectiveFrom;
        const effectiveTo = input.effectiveTo !== undefined
          ? input.effectiveTo : contract.effectiveTo;
        this.assertDateWindow(effectiveFrom, effectiveTo);
        if (input.rootDocumentId !== undefined) {
          await this.assertRootDocument(manager, context, contract.projectId, input.rootDocumentId);
        }

        await manager.getRepository(ContractEntity).update(
          { id: contract.id, tenantId: context.tenantId },
          {
            title: input.title ?? contract.title,
            type: input.type ?? contract.type,
            value: input.value ?? contract.value,
            currency: input.currency ?? contract.currency,
            effectiveFrom, effectiveTo,
            rootDocumentId: input.rootDocumentId ?? contract.rootDocumentId,
            updatedBy: context.userId, versionNo: contract.versionNo + 1
          }
        );
        const updated = await manager.getRepository(ContractEntity)
          .findOneByOrFail({ id: contract.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Contract', updated.id, updated.versionNo,
          'Contract.Updated', {
            projectId: updated.projectId, contractNo: updated.contractNo,
            summary: `Contract ${updated.contractNo} draft updated`
          });
        return this.contractView(updated);
      }
    });
  }

  /**
   * API-057 — append a party as a legal snapshot (FR-037). The snapshot fields are copied from the
   * legal-entity master inside the same transaction and hashed with the shared canonical hash, so
   * later master edits can never rewrite who was contracted with.
   */
  async createContractParty(
    context: RequestContext, contractId: string,
    input: CreateContractPartyDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'contractParty.create');
    return this.commands.execute({
      context, operation: 'API-057:create-contract-party', idempotencyKey,
      request: { contractId, input }, responseStatus: 201, resourceType: 'ContractParty',
      resultReference: (result: { id: string }) => ({
        resourceType: 'ContractParty', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const contract = await this.lockContract(manager, context, contractId, scope);
        const legalEntity = await manager.getRepository(LegalEntityEntity).findOneBy({
          id: input.legalEntityId, tenantId: context.tenantId, companyId: input.companyId
        });
        if (!legalEntity) {
          throw this.unprocessable(
            'LEGAL_ENTITY_NOT_FOUND', 'Pháp nhân không tồn tại trong công ty này'
          );
        }

        const snapshotAt = new Date();
        const snapshot = {
          contractId: contract.id, companyId: legalEntity.companyId,
          legalEntityId: legalEntity.id, partyRole: input.partyRole,
          legalName: legalEntity.legalName, country: legalEntity.country,
          registrationNo: legalEntity.registrationNo, taxId: legalEntity.taxId,
          representativeName: input.representativeName ?? null,
          representativeTitle: input.representativeTitle ?? null,
          authorityReference: input.authorityReference ?? null,
          snapshotAt: snapshotAt.toISOString()
        };
        const id = randomUUID();
        const parties = manager.getRepository(ContractPartyEntity);
        await this.rethrowUnique(
          () => parties.insert({
            id, tenantId: context.tenantId, contractId: contract.id,
            projectId: contract.projectId, companyId: legalEntity.companyId,
            legalEntityId: legalEntity.id, partyRole: input.partyRole,
            legalNameSnapshot: legalEntity.legalName, countrySnapshot: legalEntity.country,
            registrationNoSnapshot: legalEntity.registrationNo,
            taxIdSnapshot: legalEntity.taxId,
            representativeName: input.representativeName ?? null,
            representativeTitle: input.representativeTitle ?? null,
            authorityReference: input.authorityReference ?? null,
            snapshotAt, snapshotHash: canonicalHash(snapshot),
            createdBy: context.userId
          }),
          'CONTRACT_PARTY_CONFLICT', 'Pháp nhân này đã giữ vai trò đó trong hợp đồng'
        );
        const saved = await parties.findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'ContractParty', saved.id, 1,
          'ContractParty.Created', {
            projectId: contract.projectId, contractId: contract.id,
            partyRole: saved.partyRole, legalEntityId: saved.legalEntityId,
            snapshotHash: saved.snapshotHash,
            summary: `Contract party ${saved.partyRole} recorded`
          });
        return this.partyView(saved);
      }
    });
  }

  /** API-058 — appendix under the V1 relaxed precondition: parent exists, not CLOSED/EXPIRED. */
  async createContractAppendix(
    context: RequestContext, contractId: string,
    input: CreateContractAppendixDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'contractAppendix.create');
    return this.commands.execute({
      context, operation: 'API-058:create-contract-appendix', idempotencyKey,
      request: { contractId, input }, responseStatus: 201, resourceType: 'ContractAppendix',
      resultReference: (result: { id: string }) => ({
        resourceType: 'ContractAppendix', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const contract = await this.lockContract(manager, context, contractId, scope);
        this.assertContractOpen(contract);
        if (input.currency && input.currency !== contract.currency) {
          throw this.unprocessable(
            'CURRENCY_MISMATCH', 'Phụ lục phải dùng đúng loại tiền của hợp đồng'
          );
        }
        const status = input.status ?? ContractAppendixStatus.DRAFT;
        if (status === ContractAppendixStatus.EFFECTIVE && !input.effectiveDate) {
          throw this.unprocessable(
            'EFFECTIVE_DATE_REQUIRED', 'Phụ lục EFFECTIVE cần ngày hiệu lực'
          );
        }
        if (input.documentId) {
          const documentExists = await manager.getRepository(DocumentEntity).existsBy({
            id: input.documentId, tenantId: context.tenantId, projectId: contract.projectId
          });
          if (!documentExists) {
            throw this.unprocessable('DOCUMENT_NOT_FOUND', 'Tài liệu không thuộc dự án này');
          }
        }

        const row = manager.getRepository(ContractAppendixEntity).create({
          id: randomUUID(), tenantId: context.tenantId, contractId: contract.id,
          projectId: contract.projectId, appendixNo: input.appendixNo,
          revisionNo: input.revisionNo ?? 1, type: input.type,
          effectiveDate: input.effectiveDate ?? null,
          valueImpact: input.valueImpact ?? '0', currency: contract.currency,
          documentId: input.documentId ?? null, status,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(ContractAppendixEntity).save(row),
          {
            uq_contract_appendix_revision: () => this.conflict(
              'CONTRACT_APPENDIX_CONFLICT', 'Số phụ lục và revision đã tồn tại trong hợp đồng'
            ),
            fk_contract_appendix_contract_currency: () => this.unprocessable(
              'CURRENCY_MISMATCH', 'Phụ lục phải dùng đúng loại tiền của hợp đồng'
            )
          }
        );
        const saved = await manager.getRepository(ContractAppendixEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'ContractAppendix', saved.id, saved.versionNo,
          'ContractAppendix.Created', {
            projectId: contract.projectId, contractId: contract.id,
            appendixNo: saved.appendixNo, revisionNo: saved.revisionNo, status: saved.status,
            valueImpact: saved.valueImpact, currency: saved.currency,
            summary: `Contract appendix ${saved.appendixNo} rev ${saved.revisionNo} created`
          });
        return this.appendixView(saved);
      }
    });
  }

  /** API-059 — obligations of one contract; DUE/OVERDUE derived in the SQL projection. */
  async listObligations(
    context: RequestContext, contractId: string, query: ObligationListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'obligation.read');
    const contract = await this.loadContract(this.contracts.manager, context, contractId, scope);
    const cursor = decodeContractCostCursor(query.cursor);
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => `$${parameters.push(value)}`;
    const predicates = [
      `obligation.tenant_id = ${bind(context.tenantId)}::uuid`,
      `obligation.contract_id = ${bind(contract.id)}::uuid`
    ];
    if (cursor) {
      // Same row-wise keyset as `applyCursor`, spelled out because this list is raw SQL: the cursor
      // ISO string only carries milliseconds, so the boundary has to be read back from `obligations`
      // or rows with sub-millisecond `created_at` digits fall between the two comparison branches.
      const at = `${bind(cursor.createdAt)}::timestamptz`;
      const id = `${bind(cursor.id)}::uuid`;
      predicates.push(
        `((obligation.created_at, obligation.id) < (
            SELECT boundary.created_at, boundary.id FROM obligations boundary WHERE boundary.id = ${id}
          ) OR (
            NOT EXISTS (SELECT 1 FROM obligations missing WHERE missing.id = ${id})
            AND (obligation.created_at < ${at}
              OR (obligation.created_at = ${at} AND obligation.id < ${id}))
          ))`
      );
    }
    const rows: ObligationPageRecord[] = await this.contracts.manager.query(
      `SELECT
        obligation.id AS "id",
        obligation.contract_id AS "contractId",
        obligation.project_id AS "projectId",
        obligation.appendix_id AS "appendixId",
        obligation.clause_ref AS "clauseRef",
        obligation.title AS "title",
        obligation.obligor_party_id AS "obligorPartyId",
        obligation.beneficiary_party_id AS "beneficiaryPartyId",
        obligation.owner_user_id AS "ownerUserId",
        obligation.trigger_type AS "triggerType",
        obligation.trigger_reference AS "triggerReference",
        obligation.due_date::text AS "dueDate",
        ${OBLIGATION_EFFECTIVE_STATUS_SQL} AS "status",
        obligation.status AS "storedStatus",
        obligation.evidence_refs AS "evidenceRefs",
        obligation.consequence AS "consequence",
        obligation.decision_type AS "decisionType",
        obligation.decision_by AS "decisionBy",
        obligation.decision_at AS "decisionAt",
        obligation.decision_reason AS "decisionReason",
        obligation.decision_evidence_refs AS "decisionEvidenceRefs",
        obligation.version_no AS "versionNo",
        obligation.created_by AS "createdBy",
        obligation.updated_by AS "updatedBy",
        obligation.created_at AS "createdAt",
        obligation.updated_at AS "updatedAt"
      FROM obligations obligation
      WHERE ${predicates.join('\n        AND ')}
      ORDER BY obligation.created_at DESC, obligation.id DESC
      LIMIT ${bind(query.limit + 1)}`,
      parameters
    );
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        ...row,
        decisionAt: row.decisionAt === null ? null : row.decisionAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      })),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-060 — obligation over parties of THIS contract; the composite FK is the backstop. */
  async createObligation(
    context: RequestContext, contractId: string,
    input: CreateObligationDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'obligation.create');
    return this.commands.execute({
      context, operation: 'API-060:create-obligation', idempotencyKey,
      request: { contractId, input }, responseStatus: 201, resourceType: 'Obligation',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Obligation', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const contract = await this.lockContract(manager, context, contractId, scope);
        if (input.obligorPartyId === input.beneficiaryPartyId) {
          throw this.unprocessable(
            'CONTRACT_PARTY_DUPLICATED', 'Bên chịu nghĩa vụ và bên thụ hưởng phải khác nhau'
          );
        }
        const parties = manager.getRepository(ContractPartyEntity);
        for (const partyId of [input.obligorPartyId, input.beneficiaryPartyId]) {
          const exists = await parties.existsBy({
            id: partyId, tenantId: context.tenantId, contractId: contract.id
          });
          if (!exists) {
            throw this.unprocessable(
              'CONTRACT_PARTY_NOT_FOUND', 'Bên tham gia không thuộc hợp đồng này'
            );
          }
        }
        if (input.appendixId) {
          const appendixExists = await manager.getRepository(ContractAppendixEntity).existsBy({
            id: input.appendixId, tenantId: context.tenantId, contractId: contract.id
          });
          if (!appendixExists) {
            throw this.unprocessable('APPENDIX_NOT_FOUND', 'Phụ lục không thuộc hợp đồng này');
          }
        }
        const ownerUserId = input.ownerUserId ?? context.userId;
        const ownerExists = await manager.getRepository(UserAccountEntity).existsBy({
          id: ownerUserId, tenantId: context.tenantId
        });
        if (!ownerExists) {
          throw this.unprocessable('OWNER_NOT_FOUND', 'Người phụ trách không thuộc tenant này');
        }

        const row = manager.getRepository(ObligationEntity).create({
          id: randomUUID(), tenantId: context.tenantId, contractId: contract.id,
          projectId: contract.projectId, appendixId: input.appendixId ?? null,
          clauseRef: input.clauseRef, title: input.title,
          obligorPartyId: input.obligorPartyId, beneficiaryPartyId: input.beneficiaryPartyId,
          ownerUserId, triggerType: input.triggerType,
          triggerReference: input.triggerReference ?? null, dueDate: input.dueDate ?? null,
          status: ObligationStatus.OPEN, evidenceRefs: input.evidenceRefs ?? [],
          consequence: input.consequence ?? null,
          decisionType: null, decisionBy: null, decisionAt: null,
          decisionReason: null, decisionEvidenceRefs: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await this.withConstraintMap(
          () => manager.getRepository(ObligationEntity).save(row),
          {
            fk_obligation_obligor: () => this.unprocessable(
              'CONTRACT_PARTY_NOT_FOUND', 'Bên tham gia không thuộc hợp đồng này'
            ),
            fk_obligation_beneficiary: () => this.unprocessable(
              'CONTRACT_PARTY_NOT_FOUND', 'Bên tham gia không thuộc hợp đồng này'
            )
          }
        );
        await this.emit(manager, context, 'Obligation', saved.id, saved.versionNo,
          'Obligation.Created', {
            projectId: contract.projectId, contractId: contract.id,
            clauseRef: saved.clauseRef, dueDate: saved.dueDate, ownerUserId: saved.ownerUserId,
            summary: `Obligation ${saved.clauseRef} created`
          });
        return this.obligationView(saved);
      }
    });
  }

  /**
   * API-061 — fulfil or waive with evidence. Segregation of duties is checked here for a domain
   * error and again by `ck_obligation_sod` as a row constraint: the decision maker can be neither
   * the obligation owner nor its creator.
   */
  async fulfillObligation(
    context: RequestContext, obligationId: string,
    input: FulfillObligationDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'obligation.fulfill');
    return this.commands.execute({
      context, operation: 'API-061:fulfill-obligation', idempotencyKey,
      request: { obligationId, input }, responseStatus: 200,
      resourceType: 'Obligation', resourceId: obligationId,
      execute: async (manager) => {
        const obligation = await this.lockObligation(manager, context, obligationId, scope);
        if (obligation.status !== ObligationStatus.OPEN) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ nghĩa vụ đang OPEN mới được quyết định'
          );
        }
        this.assertVersion(obligation.versionNo, input.expectedVersion);
        if (context.userId === obligation.ownerUserId || context.userId === obligation.createdBy) {
          throw this.unprocessable(
            'SOD_CONFLICT', 'Người phụ trách hoặc người tạo không được tự quyết định nghĩa vụ'
          );
        }

        await this.withConstraintMap(
          () => manager.getRepository(ObligationEntity).update(
            { id: obligation.id, tenantId: context.tenantId },
            {
              status: input.decisionType === 'WAIVED'
                ? ObligationStatus.WAIVED : ObligationStatus.FULFILLED,
              decisionType: input.decisionType, decisionBy: context.userId,
              decisionAt: new Date(), decisionReason: input.reason,
              decisionEvidenceRefs: input.evidenceRefs,
              updatedBy: context.userId, versionNo: obligation.versionNo + 1
            }
          ),
          {
            ck_obligation_sod: () => this.unprocessable(
              'SOD_CONFLICT', 'Người phụ trách hoặc người tạo không được tự quyết định nghĩa vụ'
            )
          }
        );
        const updated = await manager.getRepository(ObligationEntity)
          .findOneByOrFail({ id: obligation.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Obligation', updated.id, updated.versionNo,
          `Obligation.${input.decisionType === 'WAIVED' ? 'Waived' : 'Fulfilled'}`, {
            projectId: updated.projectId, contractId: updated.contractId,
            decisionType: updated.decisionType, decisionBy: updated.decisionBy,
            evidenceCount: input.evidenceRefs.length,
            summary: `Obligation ${updated.clauseRef} ${input.decisionType.toLowerCase()}`
          });
        return this.obligationView(updated);
      }
    });
  }

  /**
   * API-062 — cost summary grouped by currency (and cost code for commitments). Sums are SQL
   * aggregates returned as text; nothing is ever converted or summed across currencies, and
   * `reportingCurrency` is explicitly null to say so.
   */
  async getCostSummary(context: RequestContext, projectId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'cost.read');
    const manager = this.contracts.manager;
    await this.assertProjectVisible(manager, context, projectId, scope);
    const budget = await manager.query<Array<Record<string, unknown>>>(
      `SELECT DISTINCT ON (budget.status)
        budget.status AS "status", budget.budget_version AS "budgetVersion",
        budget.currency AS "currency", budget.total_amount::text AS "totalAmount"
      FROM budget_versions budget
      WHERE budget.tenant_id = $1 AND budget.project_id = $2
      ORDER BY budget.status, budget.budget_version DESC`,
      [context.tenantId, projectId]
    );
    const commitments = await manager.query<Array<Record<string, unknown>>>(
      `SELECT commitment.currency AS "currency", commitment.status AS "status",
        cost_code.id AS "costCodeId", cost_code.code AS "costCode",
        SUM(commitment.amount)::text AS "amount"
      FROM commitments commitment
      JOIN cost_codes cost_code
        ON cost_code.tenant_id = commitment.tenant_id AND cost_code.id = commitment.cost_code_id
      WHERE commitment.tenant_id = $1 AND commitment.project_id = $2
      GROUP BY commitment.currency, commitment.status, cost_code.id, cost_code.code
      ORDER BY cost_code.code, commitment.currency, commitment.status`,
      [context.tenantId, projectId]
    );
    const payments = await manager.query<Array<Record<string, unknown>>>(
      `SELECT payment.currency AS "currency", payment.status AS "status",
        SUM(payment.requested_amount)::text AS "requestedAmount",
        SUM(payment.approved_amount)::text AS "approvedAmount",
        SUM(payment.paid_amount)::text AS "paidAmount",
        COUNT(*)::int AS "paymentCount"
      FROM payments payment
      WHERE payment.tenant_id = $1 AND payment.project_id = $2
      GROUP BY payment.currency, payment.status
      ORDER BY payment.currency, payment.status`,
      [context.tenantId, projectId]
    );
    return { data: { projectId, reportingCurrency: null, budget, commitments, payments } };
  }

  /** API-063 — new budget version, born SUBMITTED; the number is allocated in-transaction. */
  async createBudgetVersion(
    context: RequestContext, projectId: string,
    input: CreateBudgetVersionDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'budget.submit');
    return this.commands.execute({
      context, operation: 'API-063:create-budget-version', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'BudgetVersion',
      resultReference: (result: { id: string }) => ({
        resourceType: 'BudgetVersion', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const [next] = await manager.query<Array<{ next: number }>>(
          `SELECT (COALESCE(MAX(budget_version), 0) + 1)::int AS "next"
          FROM budget_versions WHERE tenant_id = $1 AND project_id = $2`,
          [context.tenantId, projectId]
        );
        const now = new Date();
        const snapshot = input.snapshot ?? null;
        const row = manager.getRepository(BudgetVersionEntity).create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          budgetVersion: next.next, currency: input.currency, totalAmount: input.totalAmount,
          status: BudgetVersionStatus.SUBMITTED,
          snapshot, snapshotHash: snapshot === null ? null : canonicalHash(snapshot),
          submittedBy: context.userId, submittedAt: now, approvedBy: null, approvedAt: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.rethrowUnique(
          () => manager.getRepository(BudgetVersionEntity).save(row),
          'BUDGET_VERSION_CONFLICT', 'Budget version vừa được cấp bởi yêu cầu khác; hãy thử lại'
        );
        const saved = await manager.getRepository(BudgetVersionEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'BudgetVersion', saved.id, saved.versionNo,
          'BudgetVersion.Submitted', {
            projectId, budgetVersion: saved.budgetVersion, currency: saved.currency,
            totalAmount: saved.totalAmount,
            summary: `Budget version ${saved.budgetVersion} submitted`
          });
        return this.budgetVersionView(saved);
      }
    });
  }

  /**
   * API-064 — record a commitment. `uq_commitment_source` on (source type, id, version) is the
   * anti-duplicate control: a replay of the same source version conflicts instead of
   * double-counting the exposure.
   */
  async createCommitment(
    context: RequestContext, projectId: string,
    input: CreateCommitmentDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'commitment.create');
    return this.commands.execute({
      context, operation: 'API-064:create-commitment', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'Commitment',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Commitment', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const contract = await manager.getRepository(ContractEntity).findOneBy({
          id: input.contractId, tenantId: context.tenantId, projectId
        });
        if (!contract) {
          throw this.unprocessable('CONTRACT_NOT_FOUND', 'Hợp đồng không thuộc dự án này');
        }
        if (input.currency && input.currency !== contract.currency) {
          throw this.unprocessable(
            'CURRENCY_MISMATCH', 'Commitment phải dùng đúng loại tiền của hợp đồng'
          );
        }
        if (input.sourceType === CommitmentSourceType.CONTRACT && input.sourceId !== contract.id) {
          throw this.unprocessable(
            'COMMITMENT_SOURCE_INVALID', 'Nguồn CONTRACT phải trỏ đúng hợp đồng đã khai báo'
          );
        }
        if (input.sourceType === CommitmentSourceType.CONTRACT_APPENDIX) {
          const appendixExists = await manager.getRepository(ContractAppendixEntity).existsBy({
            id: input.sourceId, tenantId: context.tenantId, contractId: contract.id
          });
          if (!appendixExists) {
            throw this.unprocessable('APPENDIX_NOT_FOUND', 'Phụ lục không thuộc hợp đồng này');
          }
        }
        const costCode = await manager.getRepository(CostCodeEntity).findOneBy({
          id: input.costCodeId, tenantId: context.tenantId
        });
        if (!costCode || costCode.status !== CostCodeStatus.ACTIVE) {
          throw this.unprocessable('COST_CODE_NOT_FOUND', 'Cost code không tồn tại hoặc không ACTIVE');
        }
        if (input.reversesCommitmentId) {
          const originalExists = await manager.getRepository(CommitmentEntity).existsBy({
            id: input.reversesCommitmentId, tenantId: context.tenantId, projectId
          });
          if (!originalExists) {
            throw this.unprocessable(
              'COMMITMENT_NOT_FOUND', 'Commitment gốc để đảo không thuộc dự án này'
            );
          }
        }

        const row = manager.getRepository(CommitmentEntity).create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          contractId: contract.id, costCodeId: costCode.id,
          amount: input.amount, currency: contract.currency,
          status: CommitmentStatus.ACTIVE, sourceType: input.sourceType,
          sourceId: input.sourceId, sourceVersion: input.sourceVersion,
          reversesCommitmentId: input.reversesCommitmentId ?? null,
          createdBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(CommitmentEntity).save(row),
          {
            uq_commitment_source: () => this.conflict(
              'COMMITMENT_SOURCE_CONFLICT',
              'Nguồn này ở đúng phiên bản này đã được ghi nhận commitment'
            ),
            ck_commitment_amount_sign: () => this.unprocessable(
              'COMMITMENT_AMOUNT_SIGN_INVALID',
              'Commitment gốc phải dương; commitment đảo phải âm và tham chiếu bản gốc'
            )
          }
        );
        const saved = await manager.getRepository(CommitmentEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Commitment', saved.id, saved.versionNo,
          'Commitment.Created', {
            projectId, contractId: saved.contractId, costCodeId: saved.costCodeId,
            amount: saved.amount, currency: saved.currency,
            sourceType: saved.sourceType, sourceId: saved.sourceId,
            sourceVersion: saved.sourceVersion,
            summary: `Commitment recorded from ${saved.sourceType}`
          });
        return this.commitmentView(saved);
      }
    });
  }

  /**
   * API-065 — one transaction: reuse-or-create the invoice on its duplicate-control key, insert
   * the DRAFT payment, insert its components, optionally capture the FX snapshot, then force the
   * deferred component-sum trigger with SET CONSTRAINTS ALL IMMEDIATE so a mismatch surfaces as
   * COMPONENT_SUM_MISMATCH and rolls the whole write back.
   */
  async createPayment(
    context: RequestContext, contractId: string, input: CreatePaymentDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'payment.create');
    return this.commands.execute({
      context, operation: 'API-065:create-payment', idempotencyKey,
      request: { contractId, input }, responseStatus: 201, resourceType: 'Payment',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Payment', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const contract = await this.lockContract(manager, context, contractId, scope);
        this.assertContractOpen(contract);
        if (input.payerLegalEntityId === input.payeeLegalEntityId) {
          throw this.unprocessable(
            'PAYER_PAYEE_SAME', 'Pháp nhân chi trả và thụ hưởng phải khác nhau'
          );
        }
        await this.assertLegalEntity(
          manager, context, input.payerCompanyId, input.payerLegalEntityId, 'PAYER_NOT_FOUND'
        );
        await this.assertLegalEntity(
          manager, context, input.payeeCompanyId, input.payeeLegalEntityId, 'PAYEE_NOT_FOUND'
        );
        const currency = input.currency ?? contract.currency;

        const invoiceId = input.invoice === undefined
          ? null : await this.resolveInvoice(manager, context, contract, input.invoice);
        const fxSnapshotId = input.fxSnapshot === undefined
          ? null : await this.resolveFxSnapshot(manager, context, input.fxSnapshot);

        const paymentId = randomUUID();
        await this.withConstraintMap(
          () => manager.getRepository(PaymentEntity).insert({
            id: paymentId, tenantId: context.tenantId, projectId: contract.projectId,
            contractId: contract.id, invoiceId,
            payerCompanyId: input.payerCompanyId, payerLegalEntityId: input.payerLegalEntityId,
            payeeCompanyId: input.payeeCompanyId, payeeLegalEntityId: input.payeeLegalEntityId,
            fxSnapshotId, milestoneRef: input.milestoneRef ?? null,
            requestedAmount: input.requestedAmount, approvedAmount: null, paidAmount: null,
            currency, status: PaymentStatus.DRAFT, paidAt: null,
            bankReference: null, externalPostingRef: null,
            evidenceRefs: input.evidenceRefs ?? [],
            requestedBy: context.userId, submittedBy: null, approvedBy: null,
            createdBy: context.userId, updatedBy: context.userId
          }),
          {
            ck_payment_distinct_parties: () => this.unprocessable(
              'PAYER_PAYEE_SAME', 'Pháp nhân chi trả và thụ hưởng phải khác nhau'
            ),
            ck_payment_requested_amount: () => this.unprocessable(
              'PAYMENT_AMOUNT_INVALID', 'Số tiền yêu cầu phải lớn hơn 0'
            )
          }
        );

        const components = manager.getRepository(PaymentComponentEntity);
        for (const component of input.components ?? []) {
          await this.withConstraintMap(
            () => components.insert({
              id: randomUUID(), tenantId: context.tenantId, paymentId,
              sequenceNo: component.sequenceNo, componentType: component.componentType,
              basisAmount: component.basisAmount ?? null, rate: component.rate ?? null,
              amount: component.amount, currency: component.currency ?? currency,
              ruleVersion: component.ruleVersion
            }),
            {
              fk_payment_component_payment: () => this.unprocessable(
                'CURRENCY_MISMATCH', 'Thành phần thanh toán phải dùng đúng loại tiền của payment'
              ),
              ck_payment_component_sign: () => this.unprocessable(
                'COMPONENT_SIGN_INVALID',
                'Thành phần khấu trừ phải âm hoặc bằng 0; thành phần cộng phải dương hoặc bằng 0'
              ),
              uq_payment_component_sequence: () => this.conflict(
                'COMPONENT_SEQUENCE_CONFLICT', 'Trùng số thứ tự thành phần trong payment'
              )
            }
          );
        }

        // Force the DEFERRABLE INITIALLY DEFERRED sum trigger to run now, inside the transaction,
        // so a wrong breakdown becomes a domain error instead of a COMMIT-time failure — and the
        // rollback removes the payment, its components and the invoice together.
        await this.withConstraintMap(
          () => manager.query('SET CONSTRAINTS ALL IMMEDIATE'),
          {
            ck_payment_component_sum: () => this.unprocessable(
              'COMPONENT_SUM_MISMATCH',
              'Tổng các thành phần phải đúng bằng số tiền yêu cầu của payment'
            )
          }
        );

        const saved = await manager.getRepository(PaymentEntity)
          .findOneByOrFail({ id: paymentId, tenantId: context.tenantId });
        const storedComponents = await components.find({
          where: { tenantId: context.tenantId, paymentId },
          order: { sequenceNo: 'ASC', componentType: 'ASC' }
        });
        await this.emit(manager, context, 'Payment', saved.id, saved.versionNo,
          'Payment.Created', {
            projectId: saved.projectId, contractId: saved.contractId,
            invoiceId: saved.invoiceId, fxSnapshotId: saved.fxSnapshotId,
            requestedAmount: saved.requestedAmount, currency: saved.currency,
            componentCount: storedComponents.length,
            summary: `Payment request created for contract ${contract.contractNo}`
          });
        return {
          ...this.paymentView(saved),
          components: storedComponents.map((row) => this.componentView(row))
        };
      }
    });
  }

  /** API-066 — one payment and its component breakdown. */
  async getPayment(context: RequestContext, paymentId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'payment.read');
    const payment = await this.payments.findOneBy({ id: paymentId, tenantId: context.tenantId });
    if (!payment || !this.inScope(payment.projectId, scope)) {
      throw this.notFound('PAYMENT_NOT_FOUND', 'Không tìm thấy payment');
    }
    const components = await this.payments.manager.getRepository(PaymentComponentEntity).find({
      where: { tenantId: context.tenantId, paymentId: payment.id },
      order: { sequenceNo: 'ASC', componentType: 'ASC' }
    });
    return {
      data: {
        ...this.paymentView(payment),
        components: components.map((row) => this.componentView(row))
      }
    };
  }

  /**
   * Reuse-or-create on the duplicate-invoice key. The fact comparison runs in SQL so numeric
   * equality is decided by Postgres, never by JS string or number comparison.
   */
  private async resolveInvoice(
    manager: EntityManager, context: RequestContext, contract: ContractEntity,
    input: NonNullable<CreatePaymentDto['invoice']>
  ): Promise<string> {
    await this.assertLegalEntity(
      manager, context, input.supplierCompanyId, input.supplierLegalEntityId, 'SUPPLIER_NOT_FOUND'
    );
    const [existing] = await manager.query<Array<{ id: string; matches: boolean }>>(
      `SELECT invoice.id AS "id",
        (invoice.invoice_date = $5::date
          AND invoice.gross_amount = $6::numeric
          AND invoice.vat_amount = $7::numeric
          AND invoice.net_amount = $8::numeric
          AND invoice.supplier_company_id = $9::uuid) AS "matches"
      FROM invoices invoice
      WHERE invoice.tenant_id = $1 AND invoice.contract_id = $2
        AND invoice.supplier_legal_entity_id = $3 AND invoice.invoice_no = $4`,
      [
        context.tenantId, contract.id, input.supplierLegalEntityId, input.invoiceNo,
        input.invoiceDate, input.grossAmount, input.vatAmount, input.netAmount,
        input.supplierCompanyId
      ]
    );
    if (existing) {
      if (!existing.matches) {
        throw this.conflict(
          'INVOICE_DUPLICATE',
          'Hóa đơn cùng số của pháp nhân này đã tồn tại với nội dung khác'
        );
      }
      return existing.id;
    }
    const id = randomUUID();
    await this.withConstraintMap(
      () => manager.getRepository(InvoiceEntity).insert({
        id, tenantId: context.tenantId, contractId: contract.id,
        projectId: contract.projectId, supplierCompanyId: input.supplierCompanyId,
        supplierLegalEntityId: input.supplierLegalEntityId, invoiceNo: input.invoiceNo,
        invoiceDate: input.invoiceDate, grossAmount: input.grossAmount,
        vatAmount: input.vatAmount, netAmount: input.netAmount,
        currency: contract.currency, status: InvoiceStatus.RECEIVED,
        createdBy: context.userId
      }),
      {
        uq_invoice_supplier_number: () => this.conflict(
          'INVOICE_DUPLICATE',
          'Hóa đơn cùng số của pháp nhân này đã tồn tại với nội dung khác'
        )
      }
    );
    await this.emit(manager, context, 'Invoice', id, 1, 'Invoice.Received', {
      projectId: contract.projectId, contractId: contract.id, invoiceNo: input.invoiceNo,
      supplierLegalEntityId: input.supplierLegalEntityId,
      summary: `Invoice ${input.invoiceNo} received`
    });
    return id;
  }

  /** Reuse-or-create an FX snapshot on its unique key; a diverging rate is a conflict, not an edit. */
  private async resolveFxSnapshot(
    manager: EntityManager, context: RequestContext,
    input: NonNullable<CreatePaymentDto['fxSnapshot']>
  ): Promise<string> {
    const [existing] = await manager.query<Array<{ id: string; matches: boolean }>>(
      `SELECT fx.id AS "id", (fx.rate = $6::numeric) AS "matches"
      FROM fx_snapshots fx
      WHERE fx.tenant_id = $1 AND fx.source = $2 AND fx.rate_date = $3::date
        AND fx.base_currency = $4 AND fx.quote_currency = $5`,
      [
        context.tenantId, input.source, input.rateDate,
        input.baseCurrency, input.quoteCurrency, input.rate
      ]
    );
    if (existing) {
      if (!existing.matches) {
        throw this.conflict(
          'FX_SNAPSHOT_CONFLICT',
          'Đã có snapshot tỷ giá cùng nguồn/ngày/cặp tiền với giá trị khác'
        );
      }
      return existing.id;
    }
    const id = randomUUID();
    await this.withConstraintMap(
      () => manager.getRepository(FxSnapshotEntity).insert({
        id, tenantId: context.tenantId, baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency, rate: input.rate, rateDate: input.rateDate,
        source: input.source, createdBy: context.userId
      }),
      {
        uq_fx_snapshot_key: () => this.conflict(
          'FX_SNAPSHOT_CONFLICT',
          'Đã có snapshot tỷ giá cùng nguồn/ngày/cặp tiền với giá trị khác'
        ),
        ck_fx_snapshot_rate: () => this.unprocessable(
          'FX_RATE_INVALID', 'Tỷ giá phải lớn hơn 0'
        ),
        ck_fx_snapshot_distinct_currencies: () => this.unprocessable(
          'FX_CURRENCY_INVALID', 'Cặp tiền của snapshot tỷ giá phải khác nhau'
        )
      }
    );
    await this.emit(manager, context, 'FxSnapshot', id, 1, 'FxSnapshot.Captured', {
      baseCurrency: input.baseCurrency, quoteCurrency: input.quoteCurrency,
      rateDate: input.rateDate, source: input.source,
      summary: `FX snapshot ${input.baseCurrency}/${input.quoteCurrency} captured`
    });
    return id;
  }

  private async lockContract(
    manager: EntityManager, context: RequestContext, contractId: string, scope: AccessScopeSets
  ): Promise<ContractEntity> {
    const contract = await manager.getRepository(ContractEntity)
      .createQueryBuilder('contract')
      .setLock('pessimistic_write')
      .where('contract.id = :id AND contract.tenantId = :tenantId', {
        id: contractId, tenantId: context.tenantId
      })
      .getOne();
    return this.resolveContract(contract, scope);
  }

  private async loadContract(
    manager: EntityManager, context: RequestContext, contractId: string, scope: AccessScopeSets
  ): Promise<ContractEntity> {
    const contract = await manager.getRepository(ContractEntity).findOneBy({
      id: contractId, tenantId: context.tenantId
    });
    return this.resolveContract(contract, scope);
  }

  /**
   * Scope comes from the register row that owns the record, never from the request. Out of scope is
   * indistinguishable from missing, so a contract id cannot be probed from another project or
   * tenant — nor by a package-only principal.
   */
  private resolveContract(contract: ContractEntity | null, scope: AccessScopeSets): ContractEntity {
    if (!contract || !this.inScope(contract.projectId, scope)) {
      throw this.notFound('CONTRACT_NOT_FOUND', 'Không tìm thấy hợp đồng');
    }
    return contract;
  }

  private async lockObligation(
    manager: EntityManager, context: RequestContext, obligationId: string, scope: AccessScopeSets
  ): Promise<ObligationEntity> {
    const obligation = await manager.getRepository(ObligationEntity)
      .createQueryBuilder('obligation')
      .setLock('pessimistic_write')
      .where('obligation.id = :id AND obligation.tenantId = :tenantId', {
        id: obligationId, tenantId: context.tenantId
      })
      .getOne();
    if (!obligation || !this.inScope(obligation.projectId, scope)) {
      throw this.notFound('OBLIGATION_NOT_FOUND', 'Không tìm thấy nghĩa vụ');
    }
    return obligation;
  }

  /**
   * Contracts carry no package granularity, so the reachability test is deliberately narrower than
   * document-control's: tenant-wide or explicit project reach only. A package-scoped assignment
   * grants nothing here, and an unreachable project answers 404 — the same as a missing one.
   */
  private async assertProjectVisible(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets
  ): Promise<void> {
    const exists = await manager.getRepository(ProjectEntity).existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!exists || !this.inScope(projectId, scope)) {
      throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    }
  }

  private inScope(projectId: string, scope: AccessScopeSets): boolean {
    return scope.tenantWide || scope.projectIds.includes(projectId);
  }

  /** V1 relaxed precondition for API-058/API-065: the parent contract is not terminally closed. */
  private assertContractOpen(contract: ContractEntity): void {
    if (contract.status === ContractStatus.CLOSED || contract.status === ContractStatus.EXPIRED) {
      throw this.unprocessable(
        'INVALID_STATE_TRANSITION', 'Hợp đồng đã CLOSED/EXPIRED không nhận thay đổi mới'
      );
    }
  }

  private assertDateWindow(effectiveFrom: string | null, effectiveTo: string | null): void {
    if (effectiveFrom !== null && effectiveTo !== null && effectiveTo < effectiveFrom) {
      throw this.unprocessable(
        'CONTRACT_DATES_INVALID', 'Ngày hết hiệu lực phải không sớm hơn ngày hiệu lực'
      );
    }
  }

  private async assertRootDocument(
    manager: EntityManager, context: RequestContext, projectId: string,
    rootDocumentId: string | null
  ): Promise<void> {
    if (rootDocumentId === null) return;
    const exists = await manager.getRepository(DocumentEntity).existsBy({
      id: rootDocumentId, tenantId: context.tenantId, projectId
    });
    if (!exists) {
      throw this.unprocessable('DOCUMENT_NOT_FOUND', 'Tài liệu gốc không thuộc dự án này');
    }
  }

  private async assertLegalEntity(
    manager: EntityManager, context: RequestContext,
    companyId: string, legalEntityId: string, code: string
  ): Promise<void> {
    const exists = await manager.getRepository(LegalEntityEntity).existsBy({
      id: legalEntityId, tenantId: context.tenantId, companyId
    });
    if (!exists) {
      throw this.unprocessable(code, 'Pháp nhân không tồn tại trong công ty này');
    }
  }

  private assertVersion(currentVersion: number, expectedVersion: number): void {
    if (currentVersion !== expectedVersion) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
        retryable: false, currentVersion
      });
    }
  }

  /**
   * Keyset predicate compared row-wise against the cursor row's stored values.
   *
   * The naive form — `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)` —
   * silently loses rows. Postgres keeps `timestamptz` at microsecond precision while a JS `Date`
   * (and so the ISO string inside the cursor) only carries milliseconds, so any row whose stored
   * timestamp has sub-millisecond digits matches neither branch and disappears from the next page.
   * Reading the boundary straight out of `table` compares the real stored values instead, and
   * `(created_at, id) < (…)` stays a row-wise comparison the `(created_at DESC, id DESC)` ordering
   * index can drive.
   *
   * When the cursor row itself has gone (deleted, or filtered out of scope) the old millisecond
   * comparison is used as a fallback — a marginally conservative page is better than failing a
   * request that carries a stale cursor.
   */
  private applyCursor<T extends { createdAt: Date; id: string }>(
    builder: SelectQueryBuilder<T>, alias: string, cursor: { createdAt: string; id: string },
    table: string, tenantId: string
  ): void {
    builder.andWhere(new Brackets((where) => where
      .where(
        `(${alias}.createdAt, ${alias}.id) < (
           SELECT boundary.created_at, boundary.id FROM ${table} boundary
           WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
         )`,
        { cursorId: cursor.id, cursorTenantId: tenantId }
      )
      .orWhere(new Brackets((fallback) => fallback
        .where(`NOT EXISTS (SELECT 1 FROM ${table} missing WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId)`)
        .andWhere(new Brackets((legacy) => legacy
          .where(`${alias}.createdAt < :cursorTime`, { cursorTime: cursor.createdAt })
          .orWhere(`${alias}.createdAt = :cursorTime AND ${alias}.id < :cursorId`, {
            cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: tenantId
          })))))));
  }

  private pageMeta<T extends { createdAt: Date; id: string }>(
    rows: T[], page: T[], limit: number
  ) {
    const last = page.at(-1);
    return {
      limit,
      nextCursor: rows.length > limit && last
        ? encodeContractCostCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    };
  }

  private contractView(row: ContractEntity) {
    return {
      id: row.id, projectId: row.projectId, contractNo: row.contractNo, title: row.title,
      type: row.type, status: row.status,
      effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
      value: row.value, currency: row.currency, rootDocumentId: row.rootDocumentId,
      legalHold: row.legalHold,
      signedAt: row.signedAt === null ? null : row.signedAt.toISOString(),
      signedBy: row.signedBy, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private partyView(row: ContractPartyEntity) {
    return {
      id: row.id, contractId: row.contractId, projectId: row.projectId,
      companyId: row.companyId, legalEntityId: row.legalEntityId, partyRole: row.partyRole,
      legalNameSnapshot: row.legalNameSnapshot, countrySnapshot: row.countrySnapshot,
      registrationNoSnapshot: row.registrationNoSnapshot, taxIdSnapshot: row.taxIdSnapshot,
      representativeName: row.representativeName, representativeTitle: row.representativeTitle,
      authorityReference: row.authorityReference,
      snapshotAt: row.snapshotAt.toISOString(), snapshotHash: row.snapshotHash,
      createdBy: row.createdBy, createdAt: row.createdAt.toISOString()
    };
  }

  private appendixView(row: ContractAppendixEntity) {
    return {
      id: row.id, contractId: row.contractId, projectId: row.projectId,
      appendixNo: row.appendixNo, revisionNo: row.revisionNo, type: row.type,
      effectiveDate: row.effectiveDate, valueImpact: row.valueImpact, currency: row.currency,
      documentId: row.documentId, status: row.status, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private obligationView(row: ObligationEntity) {
    return {
      id: row.id, contractId: row.contractId, projectId: row.projectId,
      appendixId: row.appendixId, clauseRef: row.clauseRef, title: row.title,
      obligorPartyId: row.obligorPartyId, beneficiaryPartyId: row.beneficiaryPartyId,
      ownerUserId: row.ownerUserId, triggerType: row.triggerType,
      triggerReference: row.triggerReference, dueDate: row.dueDate, status: row.status,
      evidenceRefs: row.evidenceRefs, consequence: row.consequence,
      decisionType: row.decisionType, decisionBy: row.decisionBy,
      decisionAt: row.decisionAt === null ? null : row.decisionAt.toISOString(),
      decisionReason: row.decisionReason, decisionEvidenceRefs: row.decisionEvidenceRefs,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private budgetVersionView(row: BudgetVersionEntity) {
    return {
      id: row.id, projectId: row.projectId, budgetVersion: row.budgetVersion,
      currency: row.currency, totalAmount: row.totalAmount, status: row.status,
      snapshot: row.snapshot, snapshotHash: row.snapshotHash,
      submittedBy: row.submittedBy,
      submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private commitmentView(row: CommitmentEntity) {
    return {
      id: row.id, projectId: row.projectId, contractId: row.contractId,
      costCodeId: row.costCodeId, amount: row.amount, currency: row.currency,
      status: row.status, sourceType: row.sourceType, sourceId: row.sourceId,
      sourceVersion: row.sourceVersion, reversesCommitmentId: row.reversesCommitmentId,
      versionNo: row.versionNo, createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private paymentView(row: PaymentEntity) {
    return {
      id: row.id, projectId: row.projectId, contractId: row.contractId,
      invoiceId: row.invoiceId, payerCompanyId: row.payerCompanyId,
      payerLegalEntityId: row.payerLegalEntityId, payeeCompanyId: row.payeeCompanyId,
      payeeLegalEntityId: row.payeeLegalEntityId, fxSnapshotId: row.fxSnapshotId,
      milestoneRef: row.milestoneRef, requestedAmount: row.requestedAmount,
      approvedAmount: row.approvedAmount, paidAmount: row.paidAmount,
      currency: row.currency, status: row.status,
      paidAt: row.paidAt === null ? null : row.paidAt.toISOString(),
      bankReference: row.bankReference, externalPostingRef: row.externalPostingRef,
      evidenceRefs: row.evidenceRefs, requestedBy: row.requestedBy,
      submittedBy: row.submittedBy, approvedBy: row.approvedBy, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private componentView(row: PaymentComponentEntity) {
    return {
      id: row.id, paymentId: row.paymentId, sequenceNo: row.sequenceNo,
      componentType: row.componentType, basisAmount: row.basisAmount, rate: row.rate,
      amount: row.amount, currency: row.currency, ruleVersion: row.ruleVersion,
      createdAt: row.createdAt.toISOString()
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId };
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: eventType, result: 'SUCCEEDED', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: aggregateType, objectId: aggregateId, payload: safePayload
    });
    await this.outbox.append(manager, context, {
      aggregateType, aggregateId, aggregateVersion, eventType,
      eventKey: createHash('sha256')
        .update(`${aggregateType}:${aggregateId}:${aggregateVersion}:${eventType}`)
        .digest('hex'),
      payload: safePayload
    });
  }

  private async rethrowUnique<T>(action: () => Promise<T>, code: string, message: string): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as { code?: string; driverError?: { code?: string } };
      if ((candidate.code ?? candidate.driverError?.code) === '23505') {
        throw new ConflictException({ code, message, retryable: false });
      }
      throw cause;
    }
  }

  /**
   * Maps a named database constraint violation (unique, check or foreign key) to its domain error.
   * The constraint stays the enforcement; this only translates its failure for the wire.
   */
  private async withConstraintMap<T>(
    action: () => Promise<T>, map: Record<string, () => HttpException>
  ): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as {
        code?: string; constraint?: string;
        driverError?: { code?: string; constraint?: string };
      };
      const code = candidate.code ?? candidate.driverError?.code;
      const constraint = candidate.constraint ?? candidate.driverError?.constraint;
      if (
        constraint !== undefined
        && (code === '23505' || code === '23514' || code === '23503')
        && map[constraint] !== undefined
      ) {
        throw map[constraint]();
      }
      throw cause;
    }
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message, retryable: false });
  }

  private unprocessable(code: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, message, retryable: false });
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message, retryable: false });
  }
}
