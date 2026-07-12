import type { ApiEnvelope, ProjectRecordStatus } from './project.types';

export type ProjectScheduleStatus = 'DRAFT' | 'VALIDATED' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED';
export type ActivityType = 'TASK' | 'MILESTONE';
export type ActivityStatus = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE' | 'CANCELLED';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export type BaselineStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'REJECTED' | 'APPROVED' | 'SUPERSEDED';
export type BaselineType = 'INITIAL' | 'REBASELINE';

export interface SchedulePackage {
  id: string;
  projectId: string;
  parentPackageId: string | null;
  contractorCompanyId: string | null;
  code: string;
  name: string;
  packageType: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  versionNo: number;
}

export interface ScheduleCalendarException {
  date: string;
  working: boolean;
  reason?: string;
}

export interface ScheduleCalendar {
  timezone: string;
  calendarCode: string;
  workingWeek: number[];
  exceptions: ScheduleCalendarException[];
}

export interface WbsNode {
  id: string;
  packageId: string | null;
  parentWbsId: string | null;
  ownerId: string | null;
  code: string;
  name: string;
  description: string | null;
  weight: string;
  sortOrder: number;
  status: 'ACTIVE' | 'ARCHIVED';
  versionNo: number;
}

export interface ScheduleActivity {
  id: string;
  wbsId: string;
  packageId: string | null;
  ownerId: string;
  code: string;
  name: string;
  activityType: ActivityType;
  weight: string;
  plannedStart: string;
  plannedFinish: string;
  forecastStart: string | null;
  forecastFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  durationWorkDays: number;
  remainingDurationWorkDays: number;
  percentComplete: string;
  status: ActivityStatus;
  totalFloatWorkDays: number;
  critical: boolean;
  nearCritical: boolean;
  versionNo: number;
}

export interface ScheduleDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  lagWorkDays: number;
}

export interface ScheduleBaseline {
  id: string;
  baselineNumber: number;
  baselineType: BaselineType;
  status: BaselineStatus;
  dataDate: string;
  snapshotHash: string;
  approvedChangeRequestId: string | null;
  createdBy: string;
  submittedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  versionNo: number;
}

export interface ScheduleValidationIssue {
  code: string;
  path: string;
  row: number | null;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface ScheduleAlert {
  id: string;
  activityId: string;
  alertType: 'OVERDUE' | 'NEAR_CRITICAL';
  dataDate: string;
  priority: 'NORMAL' | 'HIGH';
  dueAt: string;
  thresholdVersion: string;
}

export interface DashboardScheduleAlert extends ScheduleAlert {
  projectId: string;
  projectCode: string;
  projectName: string;
  activityCode: string;
  activityName: string;
}

export interface ProjectSchedule {
  id: string;
  projectId: string;
  projectStatus: ProjectRecordStatus;
  status: ProjectScheduleStatus;
  versionNo: number;
  calendar: ScheduleCalendar;
  dataDate: string;
  packages: SchedulePackage[];
  wbsNodes: WbsNode[];
  activities: ScheduleActivity[];
  dependencies: ScheduleDependency[];
  currentBaseline: ScheduleBaseline | null;
  validationIssues: ScheduleValidationIssue[];
  plannedProgress: string;
  actualProgress: string;
  spi: string | null;
  forecastFinish: string | null;
  varianceWorkDays: number | null;
  lookAhead: ScheduleActivity[];
  alerts: ScheduleAlert[];
  calculatedAt: string;
  formulaVersion: 'SPI_WEIGHTED_LINEAR_V1';
  thresholdVersion: string;
}

export type ProjectScheduleResponse = ApiEnvelope<ProjectSchedule>;

export interface ScheduleQuery {
  dataDate?: string;
  lookAheadDays?: number;
  baselineNumber?: number;
}

export interface ScheduleWbsUpsert {
  id?: string;
  clientRef: string;
  packageId?: string;
  parentClientRef?: string;
  ownerId?: string;
  code: string;
  name: string;
  description?: string;
  weight: string;
  sortOrder: number;
}

export interface ScheduleActivityUpsert {
  id?: string;
  clientRef: string;
  wbsClientRef: string;
  packageId?: string;
  ownerId: string;
  code: string;
  name: string;
  activityType: ActivityType;
  weight: string;
  plannedStart: string;
  plannedFinish?: string;
  durationWorkDays: number;
}

export interface ScheduleDependencyUpsert {
  id?: string;
  predecessorClientRef: string;
  successorClientRef: string;
  dependencyType: DependencyType;
  lagWorkDays: number;
}

export interface ApplyScheduleDraftRequest {
  mode: 'PREVIEW' | 'COMMIT';
  expectedVersion: number;
  source: {
    format: 'MANUAL' | 'CANONICAL_CSV' | 'CANONICAL_JSON';
    sourceName: string;
    sourceHash?: string;
  };
  calendar: ScheduleCalendar;
  wbsUpserts: ScheduleWbsUpsert[];
  activityUpserts: ScheduleActivityUpsert[];
  dependencyUpserts: ScheduleDependencyUpsert[];
  archiveWbsIds: string[];
  archiveActivityIds: string[];
  unlinkDependencyIds: string[];
}

export interface ApplyScheduleDraftResult {
  mode: 'PREVIEW' | 'COMMIT';
  committed: boolean;
  scheduleVersion: number | null;
  validationIssues: ScheduleValidationIssue[];
  calculatedAt: string;
  formulaVersion: 'CPM_WORKDAY_V1';
}

export type ApplyScheduleDraftResponse = ApiEnvelope<ApplyScheduleDraftResult>;

export interface SubmitScheduleBaselineRequest {
  baselineType: BaselineType;
  dataDate: string;
  reason: string;
  impactSummary: string;
  approvedChangeRequestId?: string;
  expectedScheduleVersion: number;
}

export interface ProgressUpdateRequest {
  activityId: string;
  dataDate: string;
  percentComplete: string;
  remainingDurationWorkDays: number;
  quantity?: string;
  unit?: string;
  actualStart?: string | null;
  actualFinish?: string | null;
  evidenceRefs?: string[];
  note?: string;
  correctionOfId?: string;
  reason?: string;
  expectedActivityVersion: number;
}

export interface ProgressUpdateResult {
  id: string;
  activityId: string;
  dataDate: string;
  percentComplete: string;
  remainingDurationWorkDays: number;
  correctionOfId: string | null;
  recordedAt: string;
}

export interface ProgressHistoryItem extends ProgressUpdateResult {
  quantity: string | null;
  unit: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  evidenceRefs: string[];
  note: string | null;
  reason: string | null;
  recordedBy: string;
}

export interface ProgressHistoryResponse {
  data: ProgressHistoryItem[];
  meta: { nextCursor: string | null };
  correlationId: string;
}

export interface BaselineDecisionRequest {
  decision: 'APPROVE' | 'RETURN' | 'REJECT';
  comment?: string;
  expectedVersion: number;
}

export type ScheduleBaselineCommandResponse = ApiEnvelope<ScheduleBaseline>;
export type ProgressUpdateCommandResponse = ApiEnvelope<ProgressUpdateResult>;
