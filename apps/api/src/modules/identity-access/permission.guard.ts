import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditEventEntity } from '../../database/entities';
import type { ContextRequest } from './context-request';
import {
  PERMISSION_METADATA, type PermissionRequirement
} from './permission.decorator';
import { PermissionService } from './permission.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    @InjectRepository(AuditEventEntity) private readonly audits: Repository<AuditEventEntity>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(PERMISSION_METADATA, [
      context.getHandler(), context.getClass()
    ]);
    if (!requirement) return true;
    const request = context.switchToHttp().getRequest<ContextRequest>();
    if (!request.auth) return false;
    const rawProjectId = request.params?.projectId;
    const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
    const actions = typeof requirement.action === 'string'
      ? [requirement.action] : requirement.action;
    const allowed = (await Promise.all(actions.map((action) => (
      this.permissions.has(request.auth!, action, requirement.scope, projectId)
    )))).some(Boolean);
    if (allowed) return true;
    await this.audits.save({
      id: randomUUID(), tenantId: request.auth.tenantId, actorId: request.auth.userId,
      action: 'AUTHORIZATION_CHECK', result: 'DENIED', reasonCode: 'PERMISSION_DENIED',
      correlationId: request.correlationId, ipHash: null, objectType: requirement.scope,
      objectId: projectId ?? null, payload: { permissions: actions }
    });
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED', message: 'Bạn không có quyền thực hiện thao tác này', retryable: false,
      correlationId: request.correlationId
    });
  }
}
