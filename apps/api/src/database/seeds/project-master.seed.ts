import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  AssignmentScopeType, CompanyEntity, LegalEntityEntity, MasterRecordStatus,
  OrganizationType, PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus,
  ProjectType, RoleAssignmentEntity, RoleEntity, SiteEntity, TenantEntity, UserAccountEntity
} from '../entities';

const roleCatalog = [
  {
    code: 'PMO', name: 'PMO', permissions: [
      'organization.read', 'legalEntity.read', 'portfolio.read', 'portfolio.create',
      'project.read', 'project.create', 'project.update', 'project.archive',
      'site.read', 'site.create', 'projectParty.manage', 'systemStatus.read',
      'package.read', 'package.create', 'schedule.read', 'schedule.manage',
      'schedule.import', 'baseline.submit', 'baseline.approve',
      'progress.record', 'progress.correct'
    ]
  },
  {
    code: 'PROJECT_MANAGER', name: 'Project Manager', permissions: [
      'organization.read', 'legalEntity.read', 'portfolio.read', 'project.read',
      'project.update', 'site.read', 'site.create', 'projectParty.manage',
      'package.read', 'package.create', 'schedule.read', 'schedule.manage',
      'schedule.import', 'baseline.submit', 'baseline.approve',
      'progress.record', 'progress.correct'
    ]
  },
  {
    code: 'EXECUTIVE', name: 'Executive',
    permissions: ['portfolio.read', 'project.read', 'package.read', 'schedule.read']
  },
  {
    code: 'PROJECT_CONTROLS', name: 'Project Controls', permissions: [
      'package.read', 'package.create', 'schedule.read', 'schedule.manage',
      'schedule.import', 'baseline.submit', 'progress.record', 'progress.correct'
    ]
  },
  {
    code: 'PACKAGE_OWNER', name: 'Package Owner', permissions: [
      'package.read', 'schedule.read', 'progress.record'
    ]
  },
  {
    code: 'TENANT_ADMIN', name: 'Tenant Administrator', permissions: [
      'organization.read', 'organization.create', 'legalEntity.read',
      'legalEntity.create', 'roleAssignment.manage', 'systemStatus.read'
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
      policyVersion: 2, status: MasterRecordStatus.ACTIVE
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
}
