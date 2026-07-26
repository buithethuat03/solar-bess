import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsISO8601, IsObject,
  IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min
} from 'class-validator';
import {
  CodGateCategory, CodGateReviewDecision, CommissioningSystemStatus, TestRunResult
} from '../../../database/entities';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;
const SYSTEM_TYPE = /^[A-Z][A-Z0-9_]{0,39}$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

/** API-098 — commissioning system register filters. */
export class CommissioningSystemListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(CommissioningSystemStatus) status?: CommissioningSystemStatus;
  @IsOptional() @Matches(SYSTEM_TYPE) systemType?: string;
  @IsOptional() @IsUUID() parentSystemId?: string;
}

/** API-099 — create a system boundary. A sub-system names its parent inside the same project. */
export class CreateCommissioningSystemDto {
  @Matches(CODE) code!: string;
  @IsString() @Length(3, 250) name!: string;
  @Matches(SYSTEM_TYPE) systemType!: string;
  @IsOptional() @IsUUID() parentSystemId?: string;
  @IsOptional() @IsObject() boundary?: Record<string, unknown>;
}

/**
 * API-100 — create a test pack from an ISSUED + CLEAN procedure revision. There is no separate
 * approve operation in the catalog, so the pack is created already APPROVED (the summary reads
 * "Tạo/approve test pack revision") and the trigger freezes it from that point on.
 */
export class CreateTestPackDto {
  @Matches(CODE) code!: string;
  @IsString() @Length(3, 400) title!: string;
  @IsUUID() procedureRevisionId!: string;
  @IsOptional() @IsObject() prerequisitesSnapshot?: Record<string, unknown>;
}

/** API-101 — start a run. Prerequisites are re-checked against the pack's frozen snapshot. */
export class StartTestRunDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  @MaxLength(200, { each: true }) satisfiedPrerequisites?: string[];
  @IsOptional() @IsObject() instrumentSnapshot?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsObject({ each: true })
  witnesses?: Array<Record<string, unknown>>;
}

/** API-102 — record the immutable result; evidence is mandatory, whatever the outcome. */
export class CompleteTestRunDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsEnum(TestRunResult) result!: TestRunResult;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs!: string[];
  @IsOptional() @IsString() @MaxLength(500) rawDataRef?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsObject({ each: true })
  witnesses?: Array<Record<string, unknown>>;
}

/** API-103 — a retest is a NEW run row linked by `previousRunId`; the failed run never changes. */
export class CreateRetestDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  @MaxLength(200, { each: true }) satisfiedPrerequisites?: string[];
  @IsOptional() @IsObject() instrumentSnapshot?: Record<string, unknown>;
  @IsString() @Length(3, 2000) reason!: string;
}

/** API-104 — readiness is evaluated as of an instant so an expiry answer is reproducible. */
export class CodReadinessQueryDto {
  @IsOptional() @IsISO8601() asOf?: string;
}

export const COD_COMMAND_TYPES = [
  'DEFINE_GATE', 'REVIEW_EVIDENCE', 'WAIVE_GATE', 'SUBMIT_COD', 'SIGN_COD', 'ACCEPT_HANDOVER'
] as const;
export type CodCommandType = (typeof COD_COMMAND_TYPES)[number];

/**
 * API-105 — the closed COD transition command union.
 *
 * RECORDED DECISION: the API catalog names only submit/sign/accept for this operation, but
 * AC-058 (define each COD condition with its source, mandatory/waivable flag, reviewer, evidence
 * and due date), AC-059 (a reviewer records Pass/Fail/Conditional on submitted evidence) and
 * AC-060 (a blocked condition may not be waived) all need write paths that no other operation in
 * the catalog provides. Rather than invent API ids — which `AGENTS.md` §4 forbids — the three
 * missing verbs join this operation's `commandType` union, exactly as API-149 already carries a
 * closed union of transitions under one id. The union stays closed: `@IsIn` rejects anything else.
 *
 * `REVIEW_EVIDENCE` carries `reviewAction` because AC-059 is two acts by two people: the owner
 * SUBMITs evidence (opening a review cycle) and an independent reviewer DECIDEs it. Splitting them
 * inside one command keeps the union at the six names the operation is specified with.
 */
export class CodTransitionCommandDto {
  @IsIn(COD_COMMAND_TYPES) commandType!: CodCommandType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;

  // DEFINE_GATE
  @IsOptional() @IsEnum(CodGateCategory) category?: CodGateCategory;
  @IsOptional() @Matches(CODE) code?: string;
  @IsOptional() @IsString() @Length(3, 400) title?: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsBoolean() waivable?: boolean;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @Matches(DATE_ONLY) dueDate?: string;

  // REVIEW_EVIDENCE / WAIVE_GATE
  @IsOptional() @IsUUID() codGateId?: string;
  @IsOptional() @IsIn(['SUBMIT', 'DECIDE']) reviewAction?: 'SUBMIT' | 'DECIDE';
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
  @IsOptional() @Matches(DATE_ONLY) evidenceExpiry?: string;
  @IsOptional() @IsEnum(CodGateReviewDecision) decision?: CodGateReviewDecision;
  /** Shared free-text: submission comment, decision comment, waiver reason. */
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;

  // SUBMIT_COD / SIGN_COD
  @IsOptional() @IsUUID() codPackageId?: string;
  @IsOptional() @IsString() @MaxLength(500) signedArtifactRef?: string;
  @IsOptional() @IsISO8601() effectiveAt?: string;

  // ACCEPT_HANDOVER
  @IsOptional() @IsUUID() fromPartyId?: string;
  @IsOptional() @IsUUID() recipientPartyId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsObject({ each: true })
  itemManifest?: Array<Record<string, unknown>>;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsObject({ each: true })
  openItems?: Array<Record<string, unknown>>;
}
