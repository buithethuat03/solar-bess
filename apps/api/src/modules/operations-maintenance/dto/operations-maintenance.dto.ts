import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsISO8601, IsOptional,
  IsString, IsUUID, Length, Matches, Max, MaxLength, Min
} from 'class-validator';
import {
  AlarmCaseSeverity, AlarmCaseState, ServiceIncidentSeverity, ServiceIncidentStatus,
  WorkOrderPriority, WorkOrderStatus
} from '../../../database/entities';
import { WORK_ORDER_COMMAND_TYPES, type WorkOrderCommandType } from '../domain/work-order-policy';

const CODE = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;
const WORK_TYPE = /^[A-Z][A-Z0-9_]{0,39}$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

/** API-114 — the local alarm-case register for one site. */
export class AlarmCaseListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(AlarmCaseState) state?: AlarmCaseState;
  @IsOptional() @IsEnum(AlarmCaseSeverity) severity?: AlarmCaseSeverity;
  @IsOptional() @IsUUID() assetId?: string;
}

/**
 * API-115 — acknowledge the LOCAL case. There is deliberately no field here that could describe a
 * source action: no clear, no reset, no suppress, no source event id, no acknowledgement target.
 * The only inputs are the optimistic-lock version and a local note (SEC-127/SEC-128).
 */
export class AcknowledgeAlarmCaseDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(3, 2000) note?: string;
}

/** API-116 — the service-incident/SLA register for one site. */
export class ServiceIncidentListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(ServiceIncidentStatus) status?: ServiceIncidentStatus;
  @IsOptional() @IsEnum(ServiceIncidentSeverity) severity?: ServiceIncidentSeverity;
  @IsOptional() @IsUUID() assetId?: string;
}

/**
 * API-117 — open a service incident from a case or a field report. The incident is born OPEN; the
 * downtime window and the SLA clock are optional because a report often precedes both.
 */
export class CreateServiceIncidentDto {
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() alarmCaseId?: string;
  @IsOptional() @IsUUID() hseIncidentId?: string;
  @IsEnum(ServiceIncidentSeverity) severity!: ServiceIncidentSeverity;
  @IsString() @Length(3, 400) title!: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
  @IsISO8601() detectedAt!: string;
  @IsOptional() @IsISO8601() downtimeStart?: string;
  @IsOptional() @IsISO8601() downtimeEnd?: string;
  @IsOptional() @IsISO8601() slaResponseDueAt?: string;
  @IsOptional() @IsISO8601() slaResolutionDueAt?: string;
}

/** API-118 — the work-order register for one asset. */
export class WorkOrderListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
  @IsOptional() @IsEnum(WorkOrderPriority) priority?: WorkOrderPriority;
}

/**
 * API-119 — create a work order for an asset. `requiresPermit` declares that this work needs a
 * permit to work; when it does, `permitToWorkId` must reference a permit that is live, in window
 * and on the asset's site, or the operation answers 422 PTW_REQUIRED.
 */
export class CreateWorkOrderDto {
  @Matches(CODE) code!: string;
  @Matches(WORK_TYPE) workType!: string;
  @IsString() @Length(3, 400) title!: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
  @IsEnum(WorkOrderPriority) priority!: WorkOrderPriority;
  @IsOptional() @IsBoolean() requiresPermit?: boolean;
  @IsOptional() @IsUUID() permitToWorkId?: string;
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsUUID() serviceIncidentId?: string;
  @IsOptional() @IsUUID() maintenancePlanId?: string;
}

export type { WorkOrderCommandType };

/**
 * API-120 — the closed work-order command union. The service validates per-command field presence
 * and re-checks the independence rule that `ck_work_order_verifier_independent` also enforces.
 */
export class WorkOrderCommandDto {
  @IsIn(WORK_ORDER_COMMAND_TYPES) commandType!: WorkOrderCommandType;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  /** HOLD / CANCEL / REOPEN justification, and the closure-cycle comments. */
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
  // DISPATCH
  @IsOptional() @IsUUID() assigneeUserId?: string;
  // START
  @IsOptional() @IsUUID() permitToWorkId?: string;
  // COMPLETE
  @IsOptional() @IsString() @Length(3, 4000) workSummary?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
  // CLOSE
  @IsOptional() @IsString() @Length(1, 200) returnToServiceRef?: string;
  // RAISE_WARRANTY_CLAIM
  @IsOptional() @Matches(CODE) claimCode?: string;
  @IsOptional() @IsString() @Length(3, 4000) failureDescription?: string;
}
