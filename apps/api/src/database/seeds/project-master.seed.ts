import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  AssignmentScopeType, CompanyEntity, CostCodeClass, CostCodeEntity, CostCodeStatus,
  LegalEntityEntity, MasterRecordStatus,
  OrganizationType, PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus,
  ProjectType, RoleAssignmentEntity, RoleEntity, SiteEntity, TenantEntity, UserAccountEntity
} from '../entities';

/**
 * Must equal the highest policy version any role-grant migration writes, because this seed re-saves
 * every catalog role on each run and would otherwise downgrade roles the migrations already raised.
 * Bump together with the next `*RoleGrants`/`Grant*Permissions` migration.
 */
const rolePolicyVersion = 7;

const roleCatalog = [
  {
    code: 'PMO', name: 'PMO', permissions: [
      'organization.read', 'legalEntity.read', 'portfolio.read', 'portfolio.create',
      'project.read', 'project.create', 'project.update', 'project.archive',
      'site.read', 'site.create', 'projectParty.manage', 'systemStatus.read',
      'package.read', 'package.create', 'schedule.read', 'schedule.manage',
      'schedule.import', 'baseline.submit', 'baseline.approve',
      'progress.record', 'progress.correct', 'user.read',
      'riskChange.read', 'riskChange.create', 'riskChange.manage', 'riskChange.submit',
      'riskChange.approve', 'riskChange.requestClosure', 'riskChange.close',
      'riskChange.closeCritical', 'notification.read', 'notification.acknowledge',
      'workflowDefinition.read', 'workflow.start', 'workflow.read', 'approvalTask.read',
      'approval.decide', 'workflow.cancel',
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentRevision.approve', 'documentRevision.issue',
      'documentComment.create', 'transmittal.issue', 'transmittal.respond',
      'documentShare.create', 'documentSignature.start',
      'contract.read', 'contract.create', 'contract.update', 'contractParty.create',
      'contractAppendix.create', 'obligation.read', 'obligation.create', 'obligation.fulfill',
      'cost.read', 'budget.submit', 'commitment.create', 'payment.create', 'payment.read'
    ]
  },
  {
    code: 'PROJECT_MANAGER', name: 'Project Manager', permissions: [
      'organization.read', 'legalEntity.read', 'portfolio.read', 'project.read',
      'project.update', 'site.read', 'site.create', 'projectParty.manage',
      'package.read', 'package.create', 'schedule.read', 'schedule.manage',
      'schedule.import', 'baseline.submit', 'baseline.approve',
      'progress.record', 'progress.correct', 'user.read',
      'riskChange.read', 'riskChange.create', 'riskChange.manage', 'riskChange.submit',
      'riskChange.approve', 'riskChange.requestClosure', 'riskChange.close',
      'riskChange.closeCritical', 'notification.read', 'notification.acknowledge',
      'workflowDefinition.read', 'workflow.start', 'workflow.read', 'approvalTask.read',
      'approval.decide', 'workflow.cancel',
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentRevision.approve', 'documentRevision.issue',
      'documentComment.create', 'transmittal.issue', 'transmittal.respond',
      'documentShare.create', 'documentSignature.start',
      'contract.read', 'contract.create', 'contract.update', 'contractParty.create',
      'contractAppendix.create', 'obligation.read', 'obligation.create', 'obligation.fulfill',
      'cost.read', 'payment.create', 'payment.read'
    ]
  },
  {
    code: 'EXECUTIVE', name: 'Executive',
    permissions: [
      'portfolio.read', 'project.read', 'package.read', 'schedule.read', 'riskChange.read',
      'notification.read', 'notification.acknowledge', 'workflowDefinition.read',
      'workflow.read', 'approvalTask.read', 'document.read', 'documentRevision.read',
      'contract.read', 'cost.read'
    ]
  },
  {
    code: 'PROJECT_CONTROLS', name: 'Project Controls', permissions: [
      'package.read', 'package.create', 'schedule.read', 'schedule.manage',
      'schedule.import', 'baseline.submit', 'progress.record', 'progress.correct',
      'user.read', 'riskChange.read', 'riskChange.create', 'riskChange.manage',
      'riskChange.requestClosure', 'notification.read', 'notification.acknowledge',
      'workflowDefinition.read', 'workflow.start', 'workflow.read', 'approvalTask.read',
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentComment.create', 'transmittal.respond',
      'contract.read', 'obligation.read', 'cost.read', 'budget.submit', 'commitment.create',
      'payment.read'
    ]
  },
  {
    code: 'PACKAGE_OWNER', name: 'Package Owner', permissions: [
      'package.read', 'schedule.read', 'progress.record', 'user.read',
      'riskChange.read', 'riskChange.create', 'riskChange.manage',
      'riskChange.requestClosure', 'notification.read', 'notification.acknowledge',
      'workflow.read', 'approvalTask.read',
      'document.read', 'documentRevision.read', 'documentComment.create'
    ]
  },
  {
    code: 'TENANT_ADMIN', name: 'Tenant Administrator', permissions: [
      'organization.read', 'organization.create', 'legalEntity.read',
      'legalEntity.create', 'roleAssignment.manage', 'systemStatus.read',
      'notification.read', 'notification.acknowledge', 'workflowDefinition.read',
      'workflowDefinition.publish', 'workflow.read', 'document.read', 'documentRevision.read'
    ]
  }
] as const;

export async function seedProjectMaster(
  manager: EntityManager, tenant: TenantEntity, user: UserAccountEntity
): Promise<void> {
  const roleRepository = manager.getRepository(RoleEntity);
  const assignmentRepository = manager.getRepository(RoleAssignmentEntity);
  for (const definition of roleCatalog) {
    let role = await roleRepository.findOneBy({ tenantId: tenant.id, code: definition.code });
    role = await roleRepository.save({
      ...(role ?? { id: randomUUID(), tenantId: tenant.id }),
      code: definition.code, name: definition.name, permissions: [...definition.permissions],
      policyVersion: rolePolicyVersion, status: MasterRecordStatus.ACTIVE
    });
    if (definition.code === 'PMO' || definition.code === 'TENANT_ADMIN') {
      const assignment = await assignmentRepository.findOneBy({
        tenantId: tenant.id, userAccountId: user.id, roleId: role.id,
        scopeType: AssignmentScopeType.TENANT
      });
      await assignmentRepository.save({
        ...(assignment ?? { id: randomUUID(), tenantId: tenant.id, userAccountId: user.id, roleId: role.id }),
        scopeType: AssignmentScopeType.TENANT, scopeId: null,
        effectiveFrom: assignment?.effectiveFrom ?? new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: null, status: MasterRecordStatus.ACTIVE
      });
    }
  }

  const companyRepository = manager.getRepository(CompanyEntity);
  const legalEntityRepository = manager.getRepository(LegalEntityEntity);
  const portfolioRepository = manager.getRepository(PortfolioEntity);
  const projectRepository = manager.getRepository(ProjectEntity);
  const siteRepository = manager.getRepository(SiteEntity);

  let ownerCompany = await companyRepository.findOneBy({ tenantId: tenant.id, code: 'DEMO_OWNER' });
  ownerCompany = await companyRepository.save({
    ...(ownerCompany ?? { id: randomUUID(), tenantId: tenant.id }),
    code: 'DEMO_OWNER', name: 'Demo Owner Company', organizationType: OrganizationType.INTERNAL,
    status: MasterRecordStatus.ACTIVE, idempotencyKey: ownerCompany?.idempotencyKey ?? 'seed-demo-owner-company'
  });
  let customerCompany = await companyRepository.findOneBy({ tenantId: tenant.id, code: 'DEMO_CUSTOMER' });
  customerCompany = await companyRepository.save({
    ...(customerCompany ?? { id: randomUUID(), tenantId: tenant.id }),
    code: 'DEMO_CUSTOMER', name: 'Demo Customer Company', organizationType: OrganizationType.CUSTOMER,
    status: MasterRecordStatus.ACTIVE, idempotencyKey: customerCompany?.idempotencyKey ?? 'seed-demo-customer-company'
  });
  let legalEntity = await legalEntityRepository.findOneBy({
    tenantId: tenant.id, country: 'VN', registrationNo: 'DEMO-REG-001'
  });
  legalEntity = await legalEntityRepository.save({
    ...(legalEntity ?? { id: randomUUID(), tenantId: tenant.id }), companyId: ownerCompany.id,
    legalName: 'Demo Owner Legal Entity', country: 'VN', registrationNo: 'DEMO-REG-001',
    taxId: null, status: MasterRecordStatus.ACTIVE,
    idempotencyKey: legalEntity?.idempotencyKey ?? 'seed-demo-owner-legal-entity'
  });
  let portfolio = await portfolioRepository.findOneBy({ tenantId: tenant.id, code: 'DEMO_PORTFOLIO' });
  portfolio = await portfolioRepository.save({
    ...(portfolio ?? { id: randomUUID(), tenantId: tenant.id }),
    code: 'DEMO_PORTFOLIO', name: 'Demo Renewable Portfolio', status: MasterRecordStatus.ACTIVE,
    idempotencyKey: portfolio?.idempotencyKey ?? 'seed-demo-portfolio'
  });
  let project = await projectRepository.findOneBy({ tenantId: tenant.id, code: 'DEMO-SOLAR-001' });
  project = await projectRepository.save({
    ...(project ?? { id: randomUUID(), tenantId: tenant.id }),
    portfolioId: portfolio.id, ownerLegalEntityId: legalEntity.id,
    customerCompanyId: customerCompany.id, projectManagerId: user.id,
    code: 'DEMO-SOLAR-001', name: 'Demo Solar Project', type: ProjectType.SOLAR,
    phase: ProjectPhase.INITIATION, recordStatus: ProjectRecordStatus.DRAFT,
    contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31', forecastCod: null,
    idempotencyKey: project?.idempotencyKey ?? 'seed-demo-solar-project'
  });
  const primarySite = await siteRepository.findOneBy({ tenantId: tenant.id, projectId: project.id, code: 'MAIN' });
  await siteRepository.save({
    ...(primarySite ?? { id: randomUUID(), tenantId: tenant.id, projectId: project.id }),
    code: 'MAIN', name: 'Demo Primary Site', location: 'Demo data — not a real site',
    timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: MasterRecordStatus.ACTIVE,
    idempotencyKey: primarySite?.idempotencyKey ?? 'seed-demo-primary-site'
  });

  // DB-034 has no CRUD operation in the API catalog (recorded spec gap), so a small demo cost code
  // set is seeded here to make the cost domain (API-062/API-064) usable and testable.
  const costCodeRepository = manager.getRepository(CostCodeEntity);
  const demoCostCodes = [
    { code: 'CAPEX-EQUIP', name: 'Demo Equipment Purchase', capexOpexClass: CostCodeClass.CAPEX },
    { code: 'CAPEX-CONST', name: 'Demo Construction Works', capexOpexClass: CostCodeClass.CAPEX },
    { code: 'OPEX-OM', name: 'Demo Operations & Maintenance', capexOpexClass: CostCodeClass.OPEX }
  ] as const;
  for (const definition of demoCostCodes) {
    const costCode = await costCodeRepository.findOneBy({ tenantId: tenant.id, code: definition.code });
    await costCodeRepository.save({
      ...(costCode ?? { id: randomUUID(), tenantId: tenant.id, createdBy: user.id }),
      parentCostCodeId: null, code: definition.code, name: definition.name,
      capexOpexClass: definition.capexOpexClass, status: CostCodeStatus.ACTIVE,
      effectiveFrom: costCode?.effectiveFrom ?? '2026-01-01', effectiveTo: null,
      updatedBy: user.id
    });
  }
}
