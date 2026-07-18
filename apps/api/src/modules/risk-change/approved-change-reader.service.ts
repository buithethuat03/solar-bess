import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { ChangeRequestEntity, ChangeRequestStatus } from '../../database/entities';
import type {
  ApprovedChangeForRebaseline, ApprovedChangeReader,
  BaselineHistoryChangeReferenceInput, ResolveApprovedChangeInput
} from './approved-change-reader.port';
import { APPROVED_CHANGE_DENIAL } from './approved-change-reader.port';

@Injectable()
export class TypeOrmApprovedChangeReader implements ApprovedChangeReader {
  async assertReferenceForBaselineHistory(
    manager: Parameters<ApprovedChangeReader['assertReferenceForBaselineHistory']>[0],
    input: BaselineHistoryChangeReferenceInput
  ): Promise<void> {
    const found = await manager.getRepository(ChangeRequestEntity).existsBy({
      id: input.changeRequestId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      status: ChangeRequestStatus.APPROVED
    }) || await manager.getRepository(ChangeRequestEntity).existsBy({
      id: input.changeRequestId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      status: ChangeRequestStatus.IMPLEMENTED
    }) || await manager.getRepository(ChangeRequestEntity).existsBy({
      id: input.changeRequestId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      status: ChangeRequestStatus.CLOSED
    });
    if (!found) {
      throw new NotFoundException({
        code: 'CHANGE_REQUEST_NOT_FOUND',
        message: 'Không tìm thấy approved Change trong tenant/project hiện tại', retryable: false
      });
    }
  }

  async resolveForRebaseline(
    manager: Parameters<ApprovedChangeReader['resolveForRebaseline']>[0],
    input: ResolveApprovedChangeInput
  ): Promise<ApprovedChangeForRebaseline> {
    const change = await manager.getRepository(ChangeRequestEntity).findOneBy({
      id: input.changeRequestId, tenantId: input.tenantId, projectId: input.projectId
    });
    if (!change) {
      throw new UnprocessableEntityException({
        code: APPROVED_CHANGE_DENIAL.NOT_FOUND_OR_SCOPE_MISMATCH,
        message: 'Không có approved Change hợp lệ cho rebaseline', retryable: false
      });
    }
    if (![ChangeRequestStatus.APPROVED, ChangeRequestStatus.IMPLEMENTED,
      ChangeRequestStatus.CLOSED].includes(change.status)) {
      throw new ConflictException({
        code: APPROVED_CHANGE_DENIAL.NOT_APPROVED,
        message: 'Không có approved Change hợp lệ cho rebaseline', retryable: false
      });
    }
    if (!change.scheduleImpactApproved || !change.sourceBaselineId) {
      throw new UnprocessableEntityException({
        code: APPROVED_CHANGE_DENIAL.SCHEDULE_IMPACT_NOT_APPROVED,
        message: 'Change Request không phê duyệt tác động yêu cầu rebaseline', retryable: false
      });
    }
    if (change.sourceBaselineId !== input.currentBaselineId) {
      throw new ConflictException({
        code: APPROVED_CHANGE_DENIAL.BASELINE_MISMATCH,
        message: 'Change Request không tham chiếu current baseline hiện tại', retryable: false
      });
    }
    if (!change.impactSnapshot || !change.impactSnapshotHash || !change.approvalSnapshotHash
      || !change.decisionVersion || !change.approvedBy || !change.approvedAt) {
      throw new ConflictException({
        code: APPROVED_CHANGE_DENIAL.NOT_APPROVED,
        message: 'Approved Change thiếu snapshot quyết định bất biến', retryable: false
      });
    }
    const schedule = change.impactSnapshot.schedule;
    if (!this.isRecord(schedule) || typeof schedule.summary !== 'string'
      || schedule.summary.trim().length < 3) {
      throw new ConflictException({
        code: APPROVED_CHANGE_DENIAL.NOT_APPROVED,
        message: 'Approved Change thiếu schedule impact summary bất biến', retryable: false
      });
    }
    return {
      id: change.id,
      projectId: change.projectId,
      packageId: change.packageId,
      code: change.code,
      title: change.title,
      changeReason: change.reason,
      sourceBaselineId: change.sourceBaselineId,
      scheduleImpactSummary: schedule.summary,
      impactSnapshot: change.impactSnapshot,
      impactSnapshotHash: change.impactSnapshotHash,
      approvalSnapshotHash: change.approvalSnapshotHash,
      decisionVersion: change.decisionVersion,
      approvedBy: change.approvedBy,
      approvedAt: change.approvedAt,
      versionNo: change.versionNo
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
