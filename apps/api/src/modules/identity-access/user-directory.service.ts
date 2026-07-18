import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  AssignmentScopeType, AuditEventEntity, MasterRecordStatus, PackageEntity,
  PackageStatus, ProjectEntity, RoleAssignmentEntity
} from '../../database/entities';
import type { AuthContext } from './auth.types';
import { PermissionService } from './permission.service';
import type { UserAssigneeQueryDto } from './dto/user-directory.dto';

interface RequestContext extends AuthContext { correlationId: string }

export interface AssigneeRow {
  id: string;
  displayName: string;
}

@Injectable()
export class UserDirectoryService {
  constructor(
    @InjectRepository(RoleAssignmentEntity)
    private readonly assignments: Repository<RoleAssignmentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(PackageEntity)
    private readonly packages: Repository<PackageEntity>,
    @InjectRepository(AuditEventEntity)
    private readonly audits: Repository<AuditEventEntity>,
    private readonly permissions: PermissionService
  ) {}

  async listAssignees(
    context: RequestContext, query: UserAssigneeQueryDto
  ): Promise<{ items: AssigneeRow[]; nextCursor: string | null; limit: number }> {
    const project = await this.projects.findOneBy({
      tenantId: context.tenantId, id: query.projectId
    });
    if (!project) throw new NotFoundException({
      code: 'PROJECT_NOT_FOUND', message: 'Không tìm thấy dự án', retryable: false
    });

    const callerPackages = await this.permissions.packageScopeIds(
      context, 'user.read', query.projectId
    );
    if (callerPackages?.length === 0) await this.deny(context, query.projectId);
    if (callerPackages && !query.packageId) {
      throw new BadRequestException({
        code: 'PACKAGE_SCOPE_REQUIRED',
        message: 'Người dùng package-scoped phải chọn package khi tìm assignee',
        retryable: false
      });
    }
    if (query.packageId) {
      if (callerPackages && !callerPackages.includes(query.packageId)) {
        await this.deny(context, query.projectId);
      }
      const packageExists = await this.packages.existsBy({
        tenantId: context.tenantId, projectId: query.projectId,
        id: query.packageId, status: PackageStatus.ACTIVE
      });
      if (!packageExists) throw new NotFoundException({
        code: 'PACKAGE_NOT_FOUND', message: 'Không tìm thấy package', retryable: false
      });
    }

    const now = new Date();
    const builder = this.assignments.createQueryBuilder('assignment')
      .innerJoin('assignment.userAccount', 'user')
      .innerJoin('assignment.role', 'role')
      .select('user.id', 'id')
      .addSelect('user.displayName', 'displayName')
      .distinct(true)
      .where('assignment.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('user.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('user.status = :active', { active: MasterRecordStatus.ACTIVE })
      .andWhere('assignment.status = :active', { active: MasterRecordStatus.ACTIVE })
      .andWhere('role.status = :active', { active: MasterRecordStatus.ACTIVE })
      .andWhere('assignment.effectiveFrom <= :now', { now })
      .andWhere('(assignment.effectiveTo IS NULL OR assignment.effectiveTo > :now)', { now })
      .andWhere('role.permissions @> CAST(:requiredPermission AS jsonb)', {
        requiredPermission: JSON.stringify([query.requiredPermission])
      })
      .andWhere(new Brackets((scope) => {
        scope.where('assignment.scopeType = :tenantScope', {
          tenantScope: AssignmentScopeType.TENANT
        }).orWhere(`(
          assignment.scopeType = :portfolioScope
          AND assignment.scopeId = :portfolioId
        )`, {
          portfolioScope: AssignmentScopeType.PORTFOLIO,
          portfolioId: project.portfolioId
        }).orWhere(`(
          assignment.scopeType = :projectScope
          AND assignment.scopeId = :projectId
        )`, {
          projectScope: AssignmentScopeType.PROJECT,
          projectId: query.projectId
        });
        if (query.packageId) {
          scope.orWhere(`(
            assignment.scopeType = :packageScope
            AND assignment.scopeId = :packageId
          )`, {
            packageScope: AssignmentScopeType.PACKAGE,
            packageId: query.packageId
          });
        }
      }));
    if (query.search) {
      builder.andWhere('user.displayName ILIKE :search', {
        search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
      });
    }
    if (query.cursor) builder.andWhere('user.id > :cursor', { cursor: query.cursor });
    const rows = await builder
      .orderBy('user.id', 'ASC')
      .limit(query.limit + 1)
      .getRawMany<AssigneeRow>();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
      limit: query.limit
    };
  }

  private async deny(context: RequestContext, projectId: string): Promise<never> {
    await this.audits.save({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: 'AUTHORIZATION_CHECK', result: 'DENIED', reasonCode: 'PROJECT_SCOPE_DENIED',
      correlationId: context.correlationId, ipHash: null,
      objectType: 'PROJECT', objectId: projectId,
      payload: { enforcement: 'USER_ASSIGNEE_SCOPE' }
    }).catch(() => undefined);
    throw new ForbiddenException({
      code: 'PROJECT_SCOPE_DENIED',
      message: 'Bạn không có quyền trong project/package này',
      retryable: false
    });
  }
}
