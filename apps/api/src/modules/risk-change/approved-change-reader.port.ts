import type { EntityManager } from 'typeorm';
import type { ChangeImpactRecord } from '../../database/entities/change-request.entity';

export const APPROVED_CHANGE_READER = Symbol('APPROVED_CHANGE_READER');

export interface ResolveApprovedChangeInput {
  tenantId: string;
  projectId: string;
  changeRequestId: string;
  currentBaselineId: string;
}

export interface BaselineHistoryChangeReferenceInput {
  tenantId: string;
  projectId: string;
  changeRequestId: string;
}

export interface ApprovedChangeForRebaseline {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  title: string;
  changeReason: string;
  sourceBaselineId: string;
  scheduleImpactSummary: string;
  impactSnapshot: ChangeImpactRecord;
  impactSnapshotHash: string;
  approvalSnapshotHash: string;
  decisionVersion: number;
  approvedBy: string;
  approvedAt: Date;
  versionNo: number;
}

export interface ApprovedChangeReader {
  resolveForRebaseline(
    manager: EntityManager,
    input: ResolveApprovedChangeInput
  ): Promise<ApprovedChangeForRebaseline>;

  assertReferenceForBaselineHistory(
    manager: EntityManager,
    input: BaselineHistoryChangeReferenceInput
  ): Promise<void>;
}

export const APPROVED_CHANGE_DENIAL = {
  NOT_FOUND_OR_SCOPE_MISMATCH: 'CHANGE_APPROVAL_REQUIRED',
  NOT_APPROVED: 'CHANGE_APPROVAL_REQUIRED',
  BASELINE_MISMATCH: 'BASELINE_MISMATCH',
  SCHEDULE_IMPACT_NOT_APPROVED: 'SCHEDULE_IMPACT_NOT_APPROVED'
} as const;
