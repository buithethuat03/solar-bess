import { AssignmentScopeType } from 'src/database/entities';
import { PermissionService } from 'src/modules/identity-access/permission.service';

const context = { userId: 'user-1', tenantId: 'tenant-1', sessionId: 'session-1' };

describe('PermissionService — SEC-106/SEC-107', () => {
  const projects = { existsBy: jest.fn(), find: jest.fn() };
  const packages = { existsBy: jest.fn(), find: jest.fn() };
  const service = new PermissionService({} as never, projects as never, packages as never);

  afterEach(() => {
    jest.restoreAllMocks();
    projects.existsBy.mockReset();
    projects.find.mockReset();
    packages.existsBy.mockReset();
    packages.find.mockReset();
  });

  it('resolves package scope only inside its owning project', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([{
      roleCode: 'PACKAGE_OWNER', permissions: ['schedule.read'],
      scopeType: AssignmentScopeType.PACKAGE, scopeId: 'package-1'
    }]);
    packages.existsBy.mockResolvedValueOnce(true);
    await expect(service.has(context, 'schedule.read', 'PROJECT', 'project-1')).resolves.toBe(true);
    expect(packages.existsBy).toHaveBeenCalled();

    packages.find.mockResolvedValueOnce([{ id: 'package-1' }]);
    await expect(service.packageScopeIds(context, 'schedule.read', 'project-1'))
      .resolves.toEqual(['package-1']);
  });

  it('allows tenant assignment for project resources', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([{
      roleCode: 'PMO', permissions: ['project.read'],
      scopeType: AssignmentScopeType.TENANT, scopeId: null
    }]);
    await expect(service.has(context, 'project.read', 'PROJECT', 'project-1')).resolves.toBe(true);
  });

  it('does not widen a project-scoped assignment', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([{
      roleCode: 'PROJECT_MANAGER', permissions: ['project.read'],
      scopeType: AssignmentScopeType.PROJECT, scopeId: 'project-1'
    }]);
    await expect(service.has(context, 'project.read', 'PROJECT', 'project-2')).resolves.toBe(false);
  });

  it('requires tenant scope for create permissions', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([{
      roleCode: 'PROJECT_MANAGER', permissions: ['project.create'],
      scopeType: AssignmentScopeType.PROJECT, scopeId: 'project-1'
    }]);
    await expect(service.has(context, 'project.create', 'TENANT')).resolves.toBe(false);
  });

  it('returns exact project ids for list filtering', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([
      {
        roleCode: 'PROJECT_MANAGER', permissions: ['project.read'],
        scopeType: AssignmentScopeType.PROJECT, scopeId: 'project-1'
      },
      {
        roleCode: 'PROJECT_MANAGER', permissions: ['project.read'],
        scopeType: AssignmentScopeType.PROJECT, scopeId: 'project-2'
      }
    ]);
    await expect(service.projectScopeIds(context, 'project.read')).resolves.toEqual(['project-1', 'project-2']);
  });

  it('resolves portfolio scope without widening to another portfolio', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([{
      roleCode: 'PMO', permissions: ['project.read'],
      scopeType: AssignmentScopeType.PORTFOLIO, scopeId: 'portfolio-1'
    }]);
    projects.existsBy.mockResolvedValueOnce(true);
    await expect(service.has(context, 'project.read', 'PROJECT', 'project-1')).resolves.toBe(true);
    expect(projects.existsBy).toHaveBeenCalled();

    projects.find.mockResolvedValueOnce([{ id: 'project-1' }, { id: 'project-2' }]);
    await expect(service.projectScopeIds(context, 'project.read'))
      .resolves.toEqual(['project-1', 'project-2']);
  });

  it('keeps permission bundles bound to each assignment scope for safe clients', async () => {
    jest.spyOn(service, 'effectiveAssignments').mockResolvedValue([
      {
        roleCode: 'READER', permissions: ['riskChange.read'],
        scopeType: AssignmentScopeType.TENANT, scopeId: null
      },
      {
        roleCode: 'APPROVER', permissions: ['riskChange.approve'],
        scopeType: AssignmentScopeType.PROJECT, scopeId: 'project-2'
      }
    ]);
    await expect(service.identityPermissions(context)).resolves.toEqual({
      roles: ['APPROVER', 'READER'],
      permissions: ['riskChange.approve', 'riskChange.read'],
      scopes: [
        {
          roleCode: 'READER', permissions: ['riskChange.read'],
          scopeType: AssignmentScopeType.TENANT, scopeId: null
        },
        {
          roleCode: 'APPROVER', permissions: ['riskChange.approve'],
          scopeType: AssignmentScopeType.PROJECT, scopeId: 'project-2'
        }
      ]
    });
  });
});
