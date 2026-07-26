import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AssignmentScopeType, MasterRecordStatus, PackageEntity, PackageStatus, ProjectEntity,
  RoleAssignmentEntity
} from '../../database/entities';
import type { AuthContext } from './auth.types';
import type { PermissionScope } from './permission.decorator';

export interface EffectiveAssignment {
  roleCode: string;
  permissions: string[];
  scopeType: AssignmentScopeType;
  scopeId: string | null;
  /** The role's catalog policy version, so API-002 can report max() without a second evaluator. */
  policyVersion: number;
}

/**
 * Flattened ABAC reach of one action, usable as a single SQL predicate. `tenantWide` short-circuits
 * the other two sets; otherwise a row is authorized when its project is in `projectIds` (full-project
 * reach, any package) or its package is in `packageIds` (package-scoped reach only).
 */
export interface AccessScopeSets {
  tenantWide: boolean;
  projectIds: string[];
  packageIds: string[];
}

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(RoleAssignmentEntity)
    private readonly assignments: Repository<RoleAssignmentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(PackageEntity)
    private readonly packages: Repository<PackageEntity>
  ) {}

  async effectiveAssignments(context: AuthContext): Promise<EffectiveAssignment[]> {
    const now = new Date();
    const rows = await this.assignments.createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.role', 'role')
      .where('assignment.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('assignment.userAccountId = :userId', { userId: context.userId })
      .andWhere('assignment.status = :status', { status: MasterRecordStatus.ACTIVE })
      .andWhere('role.status = :status', { status: MasterRecordStatus.ACTIVE })
      .andWhere('assignment.effectiveFrom <= :now', { now })
      .andWhere('(assignment.effectiveTo IS NULL OR assignment.effectiveTo > :now)', { now })
      .getMany();
    return rows.map((row) => ({
      roleCode: row.role.code,
      permissions: row.role.permissions,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      policyVersion: row.role.policyVersion
    }));
  }

  async has(
    context: AuthContext,
    action: string,
    requiredScope: PermissionScope,
    scopeId?: string
  ): Promise<boolean> {
    const assignments = await this.effectiveAssignments(context);
    if (assignments.some((assignment) => {
      if (!assignment.permissions.includes(action)) return false;
      if (requiredScope === 'ANY') return true;
      if (requiredScope === 'TENANT') return assignment.scopeType === AssignmentScopeType.TENANT;
      return assignment.scopeType === AssignmentScopeType.TENANT
        || (assignment.scopeType === AssignmentScopeType.PROJECT && assignment.scopeId === scopeId);
    })) return true;
    if (requiredScope !== 'PROJECT' || !scopeId) return false;
    const portfolioIds = assignments
      .filter((assignment) => (
        assignment.permissions.includes(action)
        && assignment.scopeType === AssignmentScopeType.PORTFOLIO
        && assignment.scopeId
      ))
      .map((assignment) => assignment.scopeId!);
    if (portfolioIds.length > 0 && await this.projects.existsBy({
      id: scopeId, tenantId: context.tenantId, portfolioId: In(portfolioIds)
    })) return true;
    const packageIds = assignments
      .filter((assignment) => (
        assignment.permissions.includes(action)
        && assignment.scopeType === AssignmentScopeType.PACKAGE
        && assignment.scopeId
      ))
      .map((assignment) => assignment.scopeId!);
    return packageIds.length > 0 && this.packages.existsBy({
      id: In(packageIds), tenantId: context.tenantId, projectId: scopeId,
      status: PackageStatus.ACTIVE
    });
  }

  async projectScopeIds(context: AuthContext, action: string): Promise<string[] | null> {
    const assignments = (await this.effectiveAssignments(context))
      .filter((assignment) => assignment.permissions.includes(action));
    if (assignments.some((assignment) => assignment.scopeType === AssignmentScopeType.TENANT)) return null;
    const projectIds = assignments
      .filter((assignment) => assignment.scopeType === AssignmentScopeType.PROJECT && assignment.scopeId)
      .map((assignment) => assignment.scopeId!);
    const portfolioIds = assignments
      .filter((assignment) => assignment.scopeType === AssignmentScopeType.PORTFOLIO && assignment.scopeId)
      .map((assignment) => assignment.scopeId!);
    const packageIds = assignments
      .filter((assignment) => assignment.scopeType === AssignmentScopeType.PACKAGE && assignment.scopeId)
      .map((assignment) => assignment.scopeId!);
    if (packageIds.length > 0) {
      const packageProjects = await this.packages.find({
        select: { projectId: true },
        where: { tenantId: context.tenantId, id: In(packageIds), status: PackageStatus.ACTIVE }
      });
      projectIds.push(...packageProjects.map((row) => row.projectId));
    }
    if (portfolioIds.length === 0) return [...new Set(projectIds)];
    const portfolioProjects = await this.projects.find({
      select: { id: true },
      where: { tenantId: context.tenantId, portfolioId: In(portfolioIds) }
    });
    return [...new Set([...projectIds, ...portfolioProjects.map((project) => project.id)])];
  }

  async packageScopeIds(
    context: AuthContext, action: string, projectId: string
  ): Promise<string[] | null> {
    const assignments = (await this.effectiveAssignments(context))
      .filter((assignment) => assignment.permissions.includes(action));
    if (assignments.some((assignment) => assignment.scopeType === AssignmentScopeType.TENANT)) {
      return null;
    }
    if (assignments.some((assignment) => (
      assignment.scopeType === AssignmentScopeType.PROJECT && assignment.scopeId === projectId
    ))) return null;
    const portfolioIds = assignments
      .filter((assignment) => assignment.scopeType === AssignmentScopeType.PORTFOLIO && assignment.scopeId)
      .map((assignment) => assignment.scopeId!);
    if (portfolioIds.length > 0 && await this.projects.existsBy({
      id: projectId, tenantId: context.tenantId, portfolioId: In(portfolioIds)
    })) return null;
    const packageIds = assignments
      .filter((assignment) => assignment.scopeType === AssignmentScopeType.PACKAGE && assignment.scopeId)
      .map((assignment) => assignment.scopeId!);
    if (packageIds.length === 0) return [];
    const rows = await this.packages.find({
      select: { id: true },
      where: {
        tenantId: context.tenantId, projectId, id: In(packageIds), status: PackageStatus.ACTIVE
      }
    });
    return [...new Set(rows.map((row) => row.id))];
  }

  /**
   * Resolve one action into tenant/project/package reach in a single pass so a cross-project reader
   * can filter in SQL instead of authorizing row by row after pagination, which would let a page
   * return fewer rows than its limit while more authorized rows remain.
   */
  async accessScopeSets(context: AuthContext, action: string): Promise<AccessScopeSets> {
    const assignments = (await this.effectiveAssignments(context))
      .filter((assignment) => assignment.permissions.includes(action));
    if (assignments.some((assignment) => assignment.scopeType === AssignmentScopeType.TENANT)) {
      return { tenantWide: true, projectIds: [], packageIds: [] };
    }
    const scopeIds = (scopeType: AssignmentScopeType) => assignments
      .filter((assignment) => assignment.scopeType === scopeType && assignment.scopeId)
      .map((assignment) => assignment.scopeId!);
    const projectIds = scopeIds(AssignmentScopeType.PROJECT);
    const portfolioIds = scopeIds(AssignmentScopeType.PORTFOLIO);
    if (portfolioIds.length > 0) {
      const portfolioProjects = await this.projects.find({
        select: { id: true },
        where: { tenantId: context.tenantId, portfolioId: In(portfolioIds) }
      });
      projectIds.push(...portfolioProjects.map((project) => project.id));
    }
    const packageIds = scopeIds(AssignmentScopeType.PACKAGE);
    const activePackageIds = packageIds.length === 0 ? [] : (await this.packages.find({
      select: { id: true },
      where: {
        tenantId: context.tenantId, id: In(packageIds), status: PackageStatus.ACTIVE
      }
    })).map((row) => row.id);
    return {
      tenantWide: false,
      projectIds: [...new Set(projectIds)],
      packageIds: [...new Set(activePackageIds)]
    };
  }

  async identityPermissions(context: AuthContext) {
    const assignments = await this.effectiveAssignments(context);
    return {
      roles: [...new Set(assignments.map((assignment) => assignment.roleCode))].sort(),
      permissions: [...new Set(assignments.flatMap((assignment) => assignment.permissions))].sort(),
      scopes: assignments.map(({ roleCode, permissions, scopeType, scopeId }) => ({
        roleCode,
        permissions: [...permissions].sort(),
        scopeType,
        scopeId
      })),
      // The highest policy version among the caller's ACTIVE roles: an explainability anchor for
      // API-002 so a client can tell which catalog release produced this answer. 0 = no roles.
      policyVersion: assignments.reduce(
        (highest, assignment) => Math.max(highest, assignment.policyVersion), 0
      )
    };
  }
}
