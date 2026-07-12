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
      scopeId: row.scopeId
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

  async identityPermissions(context: AuthContext) {
    const assignments = await this.effectiveAssignments(context);
    return {
      roles: [...new Set(assignments.map((assignment) => assignment.roleCode))].sort(),
      permissions: [...new Set(assignments.flatMap((assignment) => assignment.permissions))].sort(),
      scopes: assignments.map(({ roleCode, scopeType, scopeId }) => ({ roleCode, scopeType, scopeId }))
    };
  }
}
