import type { EntityManager } from 'typeorm';
import type { WorkflowObjectType } from '../../database/entities';

export const WORKFLOW_TARGET_RESOLVER = Symbol('WORKFLOW_TARGET_RESOLVER');

export interface WorkflowTargetContext {
  tenantId: string;
  userId: string;
}

/**
 * The scope and version an instance must adopt, read from the target aggregate itself. The engine
 * never accepts these from the request body, otherwise a caller could start an instance claiming a
 * project they cannot reach.
 */
export interface WorkflowTarget {
  projectId: string;
  packageId: string | null;
  objectVersion: number;
  /** Who raised the underlying record; the SoD rule forbids them deciding their own request. */
  requesterId: string;
  submittedBy: string | null;
}

/**
 * Cross-module contract, kept as a Symbol port so the workflow module never imports another
 * bounded context's entity (ADR-001).
 */
export interface WorkflowTargetResolver {
  supports(objectType: WorkflowObjectType): boolean;
  resolve(
    manager: EntityManager,
    context: WorkflowTargetContext,
    objectType: WorkflowObjectType,
    objectId: string
  ): Promise<WorkflowTarget | null>;
}
