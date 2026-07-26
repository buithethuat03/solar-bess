import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ChangeRequestEntity, WorkflowObjectType } from '../../database/entities';
import type {
  WorkflowTarget, WorkflowTargetContext, WorkflowTargetResolver
} from './workflow-target.port';

/**
 * Adapter for the only object type the MVP engine routes. It reads the aggregate to derive scope and
 * version; it never writes to it, because the Change Request still owns its own final transition.
 */
@Injectable()
export class ChangeRequestTargetResolver implements WorkflowTargetResolver {
  supports(objectType: WorkflowObjectType): boolean {
    return objectType === WorkflowObjectType.CHANGE_REQUEST;
  }

  async resolve(
    manager: EntityManager,
    context: WorkflowTargetContext,
    objectType: WorkflowObjectType,
    objectId: string
  ): Promise<WorkflowTarget | null> {
    if (!this.supports(objectType)) return null;
    const row = await manager.getRepository(ChangeRequestEntity).findOneBy({
      id: objectId, tenantId: context.tenantId
    });
    if (!row) return null;
    return {
      projectId: row.projectId,
      packageId: row.packageId,
      objectVersion: row.versionNo,
      requesterId: row.requesterId,
      submittedBy: row.submittedBy
    };
  }
}
