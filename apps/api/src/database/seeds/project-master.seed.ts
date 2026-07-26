import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { canonicalHash } from '../../modules/risk-change/domain/canonical-hash';
import {
  AssetEntity, AssetOperationalStatus, AssignmentScopeType, BessPlantEntity, CompanyEntity,
  CostCodeClass, CostCodeEntity, CostCodeStatus, EquipmentEntity, EquipmentLifecycleStatus,
  EquipmentModelEntity, EquipmentModelStatus, LegalEntityEntity, MasterRecordStatus,
  OrganizationType, PlantStatus, PortfolioEntity, ProjectEntity, ProjectPhase,
  SupplierProfileEntity, SupplierQualificationStatus,
  ProjectRecordStatus, ProjectType, RoleAssignmentEntity, RoleEntity, SiteEntity,
  SolarPlantEntity, TenantEntity, UserAccountEntity
} from '../entities';

/**
 * Must equal the highest policy version any role-grant migration writes, because this seed re-saves
 * every catalog role on each run and would otherwise downgrade roles the migrations already raised.
 * Bump together with the next `*RoleGrants`/`Grant*Permissions` migration.
 */
const rolePolicyVersion = 12;

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
      'cost.read', 'budget.submit', 'commitment.create', 'payment.create', 'payment.read',
      'equipmentModel.read', 'equipmentModel.create', 'bom.read', 'bom.release',
      'solarPlant.read', 'solarPlant.configure', 'bessPlant.read', 'bessSimulation.run',
      'supplier.read', 'requisition.create', 'rfq.issue', 'bid.evaluate',
      'award.submit', 'purchaseOrder.issue', 'shipment.create', 'shipment.updateMilestone',
      'goodsReceipt.create', 'opportunity.read', 'opportunity.create', 'opportunity.update',
      'opportunity.convert', 'survey.create', 'scenario.create', 'scenario.submit',
      'workfront.read', 'workfront.release', 'dailyLog.create', 'dailyLog.submit',
      'permitToWork.request', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage',
      'permission.read.self', 'delegation.create', 'delegation.revoke', 'workflow.escalate',
      'search.execute', 'savedView.read', 'savedView.create', 'report.create', 'report.read'
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
      'cost.read', 'payment.create', 'payment.read',
      'equipmentModel.read', 'equipmentModel.create', 'bom.read', 'bom.release',
      'solarPlant.read', 'solarPlant.configure', 'bessPlant.read', 'bessSimulation.run',
      'supplier.read', 'requisition.create', 'rfq.issue', 'bid.evaluate',
      'award.submit', 'purchaseOrder.issue', 'shipment.create', 'shipment.updateMilestone',
      'goodsReceipt.create', 'opportunity.read', 'survey.create', 'scenario.create',
      'scenario.submit',
      'workfront.read', 'workfront.release', 'dailyLog.create', 'dailyLog.submit',
      'permitToWork.request', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage',
      'permission.read.self', 'delegation.create', 'delegation.revoke', 'workflow.escalate',
      'search.execute', 'savedView.read', 'savedView.create', 'report.create', 'report.read'
    ]
  },
  {
    code: 'EXECUTIVE', name: 'Executive',
    permissions: [
      'portfolio.read', 'project.read', 'package.read', 'schedule.read', 'riskChange.read',
      'notification.read', 'notification.acknowledge', 'workflowDefinition.read',
      'workflow.read', 'approvalTask.read', 'document.read', 'documentRevision.read',
      'contract.read', 'cost.read',
      'equipmentModel.read', 'bom.read', 'solarPlant.read', 'bessPlant.read',
      'supplier.read', 'opportunity.read',
      'workfront.read', 'hseIncident.report', 'stopWork.issue',
      'permission.read.self', 'search.execute', 'savedView.read', 'savedView.create',
      'report.create', 'report.read'
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
      'payment.read',
      'equipmentModel.read', 'equipmentModel.create', 'bom.read',
      'solarPlant.read', 'bessPlant.read', 'bessSimulation.run',
      'supplier.read', 'requisition.create', 'bid.evaluate', 'shipment.create',
      'shipment.updateMilestone', 'goodsReceipt.create',
      'workfront.read', 'dailyLog.create', 'hseIncident.report', 'stopWork.issue',
      'permission.read.self', 'search.execute', 'savedView.read', 'savedView.create',
      'report.create', 'report.read'
    ]
  },
  {
    code: 'PACKAGE_OWNER', name: 'Package Owner', permissions: [
      'package.read', 'schedule.read', 'progress.record', 'user.read',
      'riskChange.read', 'riskChange.create', 'riskChange.manage',
      'riskChange.requestClosure', 'notification.read', 'notification.acknowledge',
      'workflow.read', 'approvalTask.read',
      'document.read', 'documentRevision.read', 'documentComment.create',
      'equipmentModel.read', 'bom.read',
      'goodsReceipt.create',
      'workfront.read', 'dailyLog.create', 'permitToWork.request',
      'hseIncident.report', 'stopWork.issue',
      'permission.read.self', 'search.execute', 'savedView.read', 'savedView.create'
    ]
  },
  {
    code: 'TENANT_ADMIN', name: 'Tenant Administrator', permissions: [
      'organization.read', 'organization.create', 'legalEntity.read',
      'legalEntity.create', 'roleAssignment.manage', 'systemStatus.read',
      'notification.read', 'notification.acknowledge', 'workflowDefinition.read',
      'workflowDefinition.publish', 'workflow.read', 'document.read', 'documentRevision.read',
      'equipmentModel.read',
      'supplier.read',
      'workfront.read', 'hseIncident.report', 'stopWork.issue',
      'permission.read.self', 'tenant.read', 'roleAssignment.grant', 'roleAssignment.revoke',
      'audit.read', 'delegation.revoke'
    ]
  },
  {
    code: 'HSE_MANAGER', name: 'HSE Manager', permissions: [
      'workfront.read', 'permitToWork.issue', 'hseIncident.report',
      'stopWork.issue', 'stopWork.lift',
      'permission.read.self'
    ]
  },
  {
    code: 'QAQC_MANAGER', name: 'QA/QC Manager', permissions: [
      'workfront.read', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage',
      'permission.read.self'
    ]
  },
  {
    code: 'PERMIT_ISSUER', name: 'Permit Issuer', permissions: [
      'workfront.read', 'permitToWork.issue', 'hseIncident.report', 'stopWork.issue',
      'permission.read.self'
    ]
  },
  {
    code: 'CONTRACTOR', name: 'Contractor', permissions: [
      'workfront.read', 'dailyLog.create', 'permitToWork.request',
      'hseIncident.report', 'stopWork.issue',
      'permission.read.self'
    ]
  }
] as const;

// DB-041 has no approve operation in the API catalog (recorded decision D2), so the demo catalog
// includes APPROVED models here to make API-067's default filter return data, plus one DRAFT
// model to make the `status=ALL` widening observable.
const demoEquipmentModels = [
  {
    equipmentClass: 'PV_MODULE', manufacturer: 'Demo Module Co', model: 'DM-550',
    specVersion: 'V1', status: EquipmentModelStatus.APPROVED,
    ratings: { note: 'Demo data — not a real model', powerWp: '550', vocV: '49.9' }
  },
  {
    equipmentClass: 'INVERTER', manufacturer: 'Demo Inverter Co', model: 'DI-3125',
    specVersion: 'V1', status: EquipmentModelStatus.APPROVED,
    ratings: { note: 'Demo data — not a real model', acPowerKva: '3125' }
  },
  {
    equipmentClass: 'BESS_CONTAINER', manufacturer: 'Demo Storage Co', model: 'DS-3440',
    specVersion: 'V1', status: EquipmentModelStatus.APPROVED,
    ratings: { note: 'Demo data — not a real model', powerMw: '2', energyMwh: '4' }
  },
  {
    equipmentClass: 'TRANSFORMER', manufacturer: 'Demo Transformer Co', model: 'DT-6300',
    specVersion: 'V1', status: EquipmentModelStatus.DRAFT,
    ratings: { note: 'Demo data — not a real model', ratedKva: '6300' }
  }
] as const;

export interface ProjectMasterSeedOutcome {
  demoProjectSeeded: boolean;
  skippedReason: string | null;
}

/**
 * Two-phase seed:
 * 1. `seedMasterCatalog` — tenant master data (role catalog, cost codes, equipment models),
 *    idempotent on natural keys and runnable against any environment, populated or not.
 * 2. `seedDemoProject` — everything hanging off the single demo test user (assignments, demo
 *    project/site scaffold and the demo plant rows). Guarded by the exactly-one-ACTIVE-test-user
 *    rule and SKIPPED, not failed, when that guard does not hold.
 */
export async function runProjectMasterSeed(
  manager: EntityManager
): Promise<ProjectMasterSeedOutcome> {
  const tenants = await manager.getRepository(TenantEntity).findBy({ status: 'ACTIVE' });
  if (tenants.length !== 1) {
    throw new Error(`Project seed requires exactly one ACTIVE test tenant; found ${tenants.length}`);
  }
  await seedMasterCatalog(manager, tenants[0]);
  const users = await manager.getRepository(UserAccountEntity).findBy({
    tenantId: tenants[0].id, status: 'ACTIVE'
  });
  if (users.length !== 1) {
    return {
      demoProjectSeeded: false,
      skippedReason:
        `demo-project phase requires exactly one ACTIVE test user; found ${users.length}`
    };
  }
  await seedDemoProject(manager, tenants[0], users[0]);
  return { demoProjectSeeded: true, skippedReason: null };
}

/** Compatibility entry point: both phases, for callers that already resolved the single user. */
export async function seedProjectMaster(
  manager: EntityManager, tenant: TenantEntity, user: UserAccountEntity
): Promise<void> {
  await seedMasterCatalog(manager, tenant);
  await seedDemoProject(manager, tenant, user);
}

/**
 * Phase 1 — master-data reconciliation. Never requires the one-active-user guard: catalog rows
 * needing an author (`created_by`/`updated_by` are NOT NULL) are attributed to the tenant's
 * oldest ACTIVE user, picked deterministically; when the tenant has no ACTIVE user at all, those
 * rows are skipped with a log line while the role catalog still reconciles.
 */
export async function seedMasterCatalog(
  manager: EntityManager, tenant: TenantEntity
): Promise<void> {
  const roleRepository = manager.getRepository(RoleEntity);
  for (const definition of roleCatalog) {
    const role = await roleRepository.findOneBy({ tenantId: tenant.id, code: definition.code });
    await roleRepository.save({
      ...(role ?? { id: randomUUID(), tenantId: tenant.id }),
      code: definition.code, name: definition.name, permissions: [...definition.permissions],
      policyVersion: rolePolicyVersion, status: MasterRecordStatus.ACTIVE
    });
  }

  const attributionUser = await manager.getRepository(UserAccountEntity).findOne({
    where: { tenantId: tenant.id, status: MasterRecordStatus.ACTIVE },
    order: { createdAt: 'ASC', id: 'ASC' }
  });
  if (!attributionUser) {
    console.log(
      'Project seed: tenant has no ACTIVE user to attribute catalog rows to; '
      + 'cost codes and equipment models were skipped, role catalog was reconciled'
    );
    return;
  }

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
      ...(costCode ?? { id: randomUUID(), tenantId: tenant.id, createdBy: attributionUser.id }),
      parentCostCodeId: null, code: definition.code, name: definition.name,
      capexOpexClass: definition.capexOpexClass, status: CostCodeStatus.ACTIVE,
      effectiveFrom: costCode?.effectiveFrom ?? '2026-01-01', effectiveTo: null,
      updatedBy: attributionUser.id
    });
  }

  // Create-if-missing only: APPROVED models are frozen by trigger, so existing rows are left
  // untouched rather than re-saved.
  const modelRepository = manager.getRepository(EquipmentModelEntity);
  for (const definition of demoEquipmentModels) {
    const existing = await modelRepository.findOneBy({
      tenantId: tenant.id, manufacturer: definition.manufacturer,
      model: definition.model, specVersion: definition.specVersion
    });
    if (existing) continue;
    await modelRepository.save({
      id: randomUUID(), tenantId: tenant.id, manufacturerCompanyId: null,
      equipmentClass: definition.equipmentClass, manufacturer: definition.manufacturer,
      model: definition.model, ratings: { ...definition.ratings },
      specVersion: definition.specVersion, status: definition.status, supersededById: null,
      createdBy: attributionUser.id, updatedBy: attributionUser.id
    });
  }

  // DB-044 has no create operation either (API-076 is read-only — same recorded spec gap as the
  // cost codes above), so a small QUALIFIED demo supplier set is seeded idempotently on its natural
  // key (company, category) to make API-076…API-082 usable.
  const companyRepository = manager.getRepository(CompanyEntity);
  let supplierCompany = await companyRepository.findOneBy({ tenantId: tenant.id, code: 'DEMO_SUPPLIER' });
  supplierCompany = await companyRepository.save({
    ...(supplierCompany ?? { id: randomUUID(), tenantId: tenant.id }),
    code: 'DEMO_SUPPLIER', name: 'Demo Supplier Company', organizationType: OrganizationType.VENDOR,
    status: MasterRecordStatus.ACTIVE,
    idempotencyKey: supplierCompany?.idempotencyKey ?? 'seed-demo-supplier-company'
  });
  const legalEntityRepository = manager.getRepository(LegalEntityEntity);
  let supplierLegalEntity = await legalEntityRepository.findOneBy({
    tenantId: tenant.id, country: 'VN', registrationNo: 'DEMO-REG-SUP-001'
  });
  supplierLegalEntity = await legalEntityRepository.save({
    ...(supplierLegalEntity ?? { id: randomUUID(), tenantId: tenant.id }),
    companyId: supplierCompany.id, legalName: 'Demo Supplier Legal Entity', country: 'VN',
    registrationNo: 'DEMO-REG-SUP-001', taxId: null, status: MasterRecordStatus.ACTIVE,
    idempotencyKey: supplierLegalEntity?.idempotencyKey ?? 'seed-demo-supplier-legal-entity'
  });
  const supplierProfileRepository = manager.getRepository(SupplierProfileEntity);
  for (const category of ['PV_MODULE', 'BESS', 'INVERTER'] as const) {
    const profile = await supplierProfileRepository.findOneBy({
      tenantId: tenant.id, companyId: supplierCompany.id, category
    });
    await supplierProfileRepository.save({
      ...(profile ?? { id: randomUUID(), tenantId: tenant.id, createdBy: attributionUser.id }),
      companyId: supplierCompany.id, legalEntityId: supplierLegalEntity.id, category,
      qualificationStatus: SupplierQualificationStatus.QUALIFIED,
      validFrom: profile?.validFrom ?? '2026-01-01', validTo: '2030-12-31',
      updatedBy: attributionUser.id
    });
  }
}

/** Phase 2 — the demo project scaffold and the rows that hang off the single demo test user. */
export async function seedDemoProject(
  manager: EntityManager, tenant: TenantEntity, user: UserAccountEntity
): Promise<void> {
  const roleRepository = manager.getRepository(RoleEntity);
  const assignmentRepository = manager.getRepository(RoleAssignmentEntity);
  for (const code of ['PMO', 'TENANT_ADMIN'] as const) {
    const role = await roleRepository.findOneByOrFail({ tenantId: tenant.id, code });
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
  let primarySite = await siteRepository.findOneBy({ tenantId: tenant.id, projectId: project.id, code: 'MAIN' });
  primarySite = await siteRepository.save({
    ...(primarySite ?? { id: randomUUID(), tenantId: tenant.id, projectId: project.id }),
    code: 'MAIN', name: 'Demo Primary Site', location: 'Demo data — not a real site',
    timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: MasterRecordStatus.ACTIVE,
    idempotencyKey: primarySite?.idempotencyKey ?? 'seed-demo-primary-site'
  });

  await seedDemoPlants(manager, tenant, user, project.id, primarySite.id);
}

/**
 * Recorded decision D1: no operation in the 164-op catalog creates a solar/bess plant row, so
 * API-072/073/074 would be dead code without these. One DRAFT plant of each kind is seeded for
 * the demo project's primary site — including the backing equipment root and asset rows — exactly
 * the cost-code precedent. API-073 then versions the existing solar rows.
 *
 * The seed only ever creates missing rows (natural keys: equipment type per site, asset code,
 * plant version per site); it never rewrites an existing row, so demo environments where the
 * plants were already released stay untouched.
 */
async function seedDemoPlants(
  manager: EntityManager, tenant: TenantEntity, user: UserAccountEntity,
  projectId: string, siteId: string
): Promise<void> {
  const modelRepository = manager.getRepository(EquipmentModelEntity);
  const equipmentRepository = manager.getRepository(EquipmentEntity);
  const assetRepository = manager.getRepository(AssetEntity);

  const plantDefinitions = [
    {
      equipmentType: 'SOLAR_PLANT_ROOT', assetCode: 'DEMO-SOLAR-ROOT',
      model: { manufacturer: 'Demo Inverter Co', model: 'DI-3125', specVersion: 'V1' }
    },
    {
      equipmentType: 'BESS_PLANT_ROOT', assetCode: 'DEMO-BESS-ROOT',
      model: { manufacturer: 'Demo Storage Co', model: 'DS-3440', specVersion: 'V1' }
    }
  ] as const;
  const rootAssets = new Map<string, string>();
  for (const definition of plantDefinitions) {
    let equipment = await equipmentRepository.findOneBy({
      tenantId: tenant.id, projectId, siteId, equipmentType: definition.equipmentType
    });
    if (!equipment) {
      const model = await modelRepository.findOneByOrFail({
        tenantId: tenant.id, ...definition.model
      });
      equipment = await equipmentRepository.save({
        id: randomUUID(), tenantId: tenant.id, projectId, equipmentModelId: model.id,
        serialNumberId: null, parentEquipmentId: null,
        equipmentType: definition.equipmentType, siteId, systemId: null,
        lifecycleStatus: EquipmentLifecycleStatus.RECEIVED, installedAt: null,
        replacedById: null, createdBy: user.id, updatedBy: user.id
      });
    }
    let asset = await assetRepository.findOneBy({
      tenantId: tenant.id, assetCode: definition.assetCode
    });
    if (!asset) {
      asset = await assetRepository.save({
        id: randomUUID(), tenantId: tenant.id, equipmentId: equipment.id, projectId, siteId,
        assetCode: definition.assetCode, activationDate: null,
        operationalStatus: AssetOperationalStatus.PENDING,
        dossierRef: { note: 'Demo data — not a real asset' },
        externalFinancialAssetRef: null, createdBy: user.id, updatedBy: user.id
      });
    }
    rootAssets.set(definition.assetCode, asset.id);
  }

  const solarRepository = manager.getRepository(SolarPlantEntity);
  const existingSolar = await solarRepository.findOneBy({
    tenantId: tenant.id, siteId, configurationVersion: 1
  });
  if (!existingSolar) {
    const configuration = {
      note: 'Demo data — not a real plant topology',
      arrays: [{ code: 'ARRAY-1', moduleModel: 'DM-550', stringCount: 120 }],
      inverters: [{ code: 'INV-1', inverterModel: 'DI-3125' }]
    };
    await solarRepository.save({
      id: randomUUID(), tenantId: tenant.id, projectId, siteId,
      rootAssetId: rootAssets.get('DEMO-SOLAR-ROOT')!,
      dcCapacityKwp: '5500.0000', acCapacityKw: '4000.0000',
      configurationVersion: 1, configuration, configurationHash: canonicalHash(configuration),
      baselineRef: null, status: PlantStatus.DRAFT,
      createdBy: user.id, updatedBy: user.id
    });
  }

  const bessRepository = manager.getRepository(BessPlantEntity);
  const existingBess = await bessRepository.findOneBy({
    tenantId: tenant.id, siteId, hierarchyVersion: 1
  });
  if (!existingBess) {
    await bessRepository.save({
      id: randomUUID(), tenantId: tenant.id, projectId, siteId,
      rootAssetId: rootAssets.get('DEMO-BESS-ROOT')!,
      powerMw: '2.0000', energyMwh: '4.0000', hierarchyVersion: 1,
      operatingEnvelope: {
        note: 'Demo data — advisory bounds only, never a setpoint source',
        power: { minMw: '-2.0', maxMw: '2.0' },
        energy: { minMwh: '0.4', maxMwh: '4.0' },
        stateOfCharge: { minPercent: '10', maxPercent: '90' },
        ramp: { maxMwPerMinute: '1.0' },
        efficiency: { roundTripPercent: '88' },
        temperature: { minCelsius: '-10', maxCelsius: '45' }
      },
      pointListVersion: null, status: PlantStatus.DRAFT,
      createdBy: user.id, updatedBy: user.id
    });
  }
}
