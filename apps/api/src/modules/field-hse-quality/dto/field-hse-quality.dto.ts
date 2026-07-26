import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsISO8601, IsObject,
  IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min
} from 'class-validator';
import {
  DailyLogShift, HseIncidentType, HseSeverity, InspectionResult, NcrDisposition, PunchCategory,
  QualityCycleDecision, StopWorkAction, StopWorkTargetType, WorkfrontStatus
} from '../../../database/entities';

/** Quantities are numeric(19,4) text — never a JS number; positivity is a database CHECK. */
const QUANTITY = /^\d{1,15}(\.\d{1,4})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;
const PERMIT_TYPE = /^[A-Z][A-Z0-9_]{0,39}$/;
const HOLD_POINT = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

/** API-086. */
export class WorkfrontListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(WorkfrontStatus) status?: WorkfrontStatus;
}

/** API-087. */
export class ReleaseWorkfrontDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

/**
 * API-088 — create a daily log. With `correctionOfId` this is the correction flow: a new row for
 * the SAME slot at revision + 1 (slot columns are copied from the SIGNED original, which is
 * superseded in the same transaction) and `reason` becomes mandatory.
 */
export class CreateDailyLogDto {
  @IsUUID() siteId!: string;
  @IsUUID() contractorCompanyId!: string;
  @Matches(DATE_ONLY) logDate!: string;
  @IsEnum(DailyLogShift) shift!: DailyLogShift;
  @IsString() @Length(3, 4000) summary!: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
  @IsOptional() @IsUUID() correctionOfId?: string;
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
}

/** API-089 — SUBMIT moves DRAFT → SUBMITTED; SIGN moves SUBMITTED → SIGNED with a legal snapshot. */
export class SubmitDailyLogDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(['SUBMIT', 'SIGN']) action!: 'SUBMIT' | 'SIGN';
}

/**
 * API-090 — append one quantity record. `correctionOfId` and `certificationOfId` are mutually
 * exclusive; a correction requires `reason`. `sourceKey` is the offline/system dedup key behind
 * `uq_qpr_source`.
 */
export class RecordQuantityProgressDto {
  @IsOptional() @IsUUID() wbsNodeId?: string;
  @Matches(DATE_ONLY) recordDate!: string;
  @Matches(QUANTITY) quantity!: string;
  @IsString() @Length(1, 40) unit!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
  @IsString() @Length(8, 200) sourceKey!: string;
  @IsOptional() @IsUUID() correctionOfId?: string;
  @IsOptional() @IsUUID() certificationOfId?: string;
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
}

/** API-091 — request a permit to work; it is born REQUESTED with the caller as requester. */
export class CreatePermitToWorkDto {
  @Matches(PERMIT_TYPE) permitType!: string;
  @IsOptional() @IsString() @Length(1, 2000) description?: string;
  @IsISO8601() validFrom!: string;
  @IsISO8601() validTo!: string;
}

/** API-092 — issue a permit; the isolation snapshot (>= 1 element) is captured at issue time. */
export class IssuePermitToWorkDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsObject({ each: true })
  isolationSnapshot!: Array<Record<string, unknown>>;
}

/**
 * API-093 — report an incident. `restrictedFacts` is stored but never serialized back out
 * (SEC-130). This DTO deliberately has no state fields: reporting is never gated on anything.
 */
export class ReportHseIncidentDto {
  @IsOptional() @IsUUID() siteId?: string;
  @IsISO8601() occurredAt!: string;
  @IsEnum(HseIncidentType) incidentType!: HseIncidentType;
  @IsEnum(HseSeverity) actualSeverity!: HseSeverity;
  @IsEnum(HseSeverity) potentialSeverity!: HseSeverity;
  @IsString() @Length(3, 4000) narrative!: string;
  @IsOptional() @IsString() @Length(1, 4000) immediateAction?: string;
  @IsOptional() @IsObject() restrictedFacts?: Record<string, unknown>;
}

/**
 * API-094 — one ledger append: ISSUE (targetType + matching id) or LIFT (liftsActionId +
 * verifiedControls). Which half the caller may perform is decided by the split permissions
 * `stopWork.issue` / `stopWork.lift`.
 */
export class StopWorkActionDto {
  @IsEnum(StopWorkAction) action!: StopWorkAction;
  @IsOptional() @IsEnum(StopWorkTargetType) targetType?: StopWorkTargetType;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() workfrontId?: string;
  @IsOptional() @IsUUID() permitId?: string;
  @IsOptional() @IsUUID() hseIncidentId?: string;
  @IsString() @Length(3, 2000) reason!: string;
  @IsOptional() @IsUUID() liftsActionId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) verifiedControls?: string[];
}

/**
 * API-095 — multiplexed inspection command. REQUEST opens a hold-point inspection (the first
 * command for an unknown path id materializes the ITP from that ISSUED+CLEAN document revision);
 * RECORD writes the immutable result.
 */
export class InspectionCommandDto {
  @IsIn(['REQUEST', 'RECORD']) commandType!: 'REQUEST' | 'RECORD';
  // REQUEST
  @IsOptional() @Matches(HOLD_POINT) holdPointRef?: string;
  // RECORD
  @IsOptional() @IsUUID() inspectionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
  @IsOptional() @IsEnum(InspectionResult) result?: InspectionResult;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsObject({ each: true })
  witnesses?: Array<Record<string, unknown>>;
}

export const NCR_COMMAND_TYPES = [
  'RAISE', 'CONTAIN', 'RECORD_ROOT_CAUSE', 'PROPOSE_DISPOSITION', 'DECIDE_DISPOSITION',
  'START_RECTIFICATION', 'REQUEST_VERIFICATION', 'VERIFY_CLOSE', 'REOPEN',
  'RECORD_CAPA', 'VERIFY_CAPA'
] as const;
export type NcrCommandType = (typeof NCR_COMMAND_TYPES)[number];

/** API-096 — multiplexed NCR command; the service validates per-command field presence. */
export class NcrCommandDto {
  @IsIn(NCR_COMMAND_TYPES) commandType!: NcrCommandType;
  @IsOptional() @IsUUID() ncrId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
  // RAISE
  @IsOptional() @Matches(CODE) code?: string;
  @IsOptional() @IsString() @Length(3, 400) title?: string;
  @IsOptional() @IsString() @Length(3, 4000) description?: string;
  @IsOptional() @IsEnum(HseSeverity) severity?: HseSeverity;
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  // CONTAIN / RECORD_ROOT_CAUSE
  @IsOptional() @IsString() @Length(3, 2000) containmentAction?: string;
  @IsOptional() @IsString() @Length(3, 4000) rootCause?: string;
  // PROPOSE_DISPOSITION / DECIDE_DISPOSITION
  @IsOptional() @IsEnum(NcrDisposition) disposition?: NcrDisposition;
  @IsOptional() @IsEnum(QualityCycleDecision) decision?: QualityCycleDecision;
  /** Shared free-text: proposal/decision comment, reopen reason, … */
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
  // VERIFY_CLOSE
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
  // RECORD_CAPA / VERIFY_CAPA
  @IsOptional() @IsUUID() capaActionId?: string;
  @IsOptional() @IsString() @Length(3, 400) capaTitle?: string;
  @IsOptional() @IsUUID() capaOwnerUserId?: string;
  @IsOptional() @Matches(DATE_ONLY) capaDueDate?: string;
  @IsOptional() @IsString() @Length(3, 2000) effectivenessAssessment?: string;
}

export const PUNCH_COMMAND_TYPES = [
  'CREATE', 'REQUEST_CLOSURE', 'DECIDE_CLOSURE', 'WAIVE'
] as const;
export type PunchCommandType = (typeof PUNCH_COMMAND_TYPES)[number];

/** API-097 — multiplexed punch command; the service validates per-command field presence. */
export class PunchCommandDto {
  @IsIn(PUNCH_COMMAND_TYPES) commandType!: PunchCommandType;
  @IsOptional() @IsUUID() punchItemId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
  // CREATE
  @IsOptional() @Matches(CODE) code?: string;
  @IsOptional() @IsString() @Length(3, 400) title?: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
  @IsOptional() @IsEnum(PunchCategory) category?: PunchCategory;
  @IsOptional() @IsBoolean() codBlocking?: boolean;
  @IsOptional() @IsBoolean() waivable?: boolean;
  @IsOptional() @IsUUID() ownerUserId?: string;
  // REQUEST_CLOSURE / DECIDE_CLOSURE / WAIVE
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
  @IsOptional() @IsEnum(QualityCycleDecision) decision?: QualityCycleDecision;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
}
