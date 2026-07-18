import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString,
  IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches,
  Max, MaxLength, Min, ValidateNested
} from 'class-validator';
import {
  ChangeRequestStatus, ChangeSourceType, ExposureLevel, IssueSeverity, IssueStatus,
  RiskChangeDecision, RiskIssueActionStatus, RiskIssueActionType,
  RiskResponseStrategy, RiskStatus
} from '../../../database/entities';

const codePattern = /^[A-Z0-9][A-Z0-9_.-]{1,79}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const moneyPattern = /^-?[0-9]{1,15}(\.[0-9]{1,4})?$/;
const upper = ({ value }: { value: unknown }) => (
  typeof value === 'string' ? value.trim().toUpperCase() : value
);

export class EvidenceReferenceDto {
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  objectType!: string;

  @IsUUID()
  objectId!: string;

  @IsOptional()
  @IsUUID()
  revisionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  label?: string;
}

export class RiskResidualAssessmentDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) probability!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) costImpactRating!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) scheduleImpactRating!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) hseImpactRating!: number;
  @IsOptional() @IsString() @Length(3, 2000) rationale?: string;
}

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class RiskListQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsEnum(RiskStatus) status?: RiskStatus;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsEnum(ExposureLevel) exposureLevel?: ExposureLevel;
  @IsOptional() @Matches(datePattern) @IsDateString() reviewBefore?: string;
}

export class IssueListQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsEnum(IssueSeverity) severity?: IssueSeverity;
  @IsOptional() @Matches(datePattern) @IsDateString() targetBefore?: string;
  @IsOptional() @IsUUID() sourceRiskId?: string;
}

export class ActionListQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() riskId?: string;
  @IsOptional() @IsUUID() issueId?: string;
  @IsOptional() @IsEnum(RiskIssueActionStatus) status?: RiskIssueActionStatus;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @Matches(datePattern) @IsDateString() dueBefore?: string;
}

export class ChangeListQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsEnum(ChangeRequestStatus) status?: ChangeRequestStatus;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsEnum(ChangeSourceType) sourceType?: ChangeSourceType;
  @IsOptional() @IsUUID() sourceId?: string;
}

export class DetailQueryDto {
  @IsOptional() @IsString() @MaxLength(500) closureCycleCursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) closureCycleLimit = 50;
}

export class RiskChangeSummaryQueryDto {
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsEnum(RiskStatus) riskStatus?: RiskStatus;
  @IsOptional() @IsString() @Length(1, 100) riskCategory?: string;
  @IsOptional() @Matches(datePattern) @IsDateString() riskReviewBefore?: string;
  @IsOptional() @IsString() @Length(1, 100) scoringVersion?: string;
  @IsOptional() @IsString() @Length(1, 100) thresholdVersion?: string;
}

export enum RiskChangeHistorySourceTypeDto {
  RISK = 'RISK', ISSUE = 'ISSUE', ACTION = 'ACTION', CHANGE_REQUEST = 'CHANGE_REQUEST'
}

export class RiskChangeHistoryQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsEnum(RiskChangeHistorySourceTypeDto) sourceType?: RiskChangeHistorySourceTypeDto;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsString() @Length(1, 100) eventType?: string;
  @IsOptional() @IsUUID() actorId?: string;
}

export class CreateRiskDto {
  @IsOptional() @IsUUID() packageId?: string;
  @Transform(upper) @Matches(codePattern) code!: string;
  @IsString() @Length(1, 100) category!: string;
  @IsString() @Length(3, 2000) cause!: string;
  @IsString() @Length(3, 2000) event!: string;
  @IsString() @Length(3, 4000) impact!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) probability!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) costImpactRating!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) scheduleImpactRating!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) hseImpactRating!: number;
  @IsUUID() ownerId!: string;
  @Matches(datePattern) @IsDateString() reviewDate!: string;
  @IsOptional() @IsEnum(RiskResponseStrategy) responseStrategy?: RiskResponseStrategy;
  @IsOptional() @IsString() @MaxLength(4000) responsePlan?: string;
  @IsOptional() @IsString() @MaxLength(2000) trigger?: string;
  @IsOptional() @IsString() @MaxLength(4000) contingencyPlan?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs: EvidenceReferenceDto[] = [];
}

export class UpdateRiskDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(1, 100) category?: string;
  @IsOptional() @IsString() @Length(3, 2000) cause?: string;
  @IsOptional() @IsString() @Length(3, 2000) event?: string;
  @IsOptional() @IsString() @Length(3, 4000) impact?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) probability?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) costImpactRating?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) scheduleImpactRating?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) hseImpactRating?: number;
  @IsOptional() @ValidateNested() @Type(() => RiskResidualAssessmentDto)
  residualAssessment?: RiskResidualAssessmentDto;
  @IsOptional() @IsString() @Length(3, 2000) residualAssessmentReason?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @Matches(datePattern) @IsDateString() reviewDate?: string;
  @IsOptional() @IsEnum(RiskResponseStrategy) responseStrategy?: RiskResponseStrategy | null;
  @IsOptional() @IsString() @MaxLength(4000) responsePlan?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) trigger?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) contingencyPlan?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs?: EvidenceReferenceDto[];
  @IsOptional() @IsEnum(RiskStatus) status?: RiskStatus;
  @IsOptional() @IsUUID() occurredIssueId?: string;
  @IsOptional() @IsString() @Length(3, 2000) closureReason?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  closureEvidenceRefs?: EvidenceReferenceDto[];
}

export class CreateIssueDto {
  @IsOptional() @IsUUID() packageId?: string;
  @Transform(upper) @Matches(codePattern) code!: string;
  @IsString() @Length(3, 250) title!: string;
  @IsString() @Length(3, 4000) description!: string;
  @IsISO8601() occurredAt!: string;
  @IsString() @Length(3, 4000) rootCause!: string;
  @IsString() @Length(3, 4000) actualImpact!: string;
  @IsEnum(IssueSeverity) severity!: IssueSeverity;
  @IsUUID() ownerId!: string;
  @Matches(datePattern) @IsDateString() targetDate!: string;
  @IsOptional() @IsUUID() sourceRiskId?: string;
  @IsOptional() @IsBoolean() markSourceRiskOccurred = false;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs: EvidenceReferenceDto[] = [];
}

export class UpdateIssueDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(3, 250) title?: string;
  @IsOptional() @IsString() @Length(3, 4000) description?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() @Length(3, 4000) rootCause?: string;
  @IsOptional() @IsString() @Length(3, 4000) actualImpact?: string;
  @IsOptional() @IsEnum(IssueSeverity) severity?: IssueSeverity;
  @IsOptional() @IsString() @MaxLength(4000) decisionSummary?: string | null;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @Matches(datePattern) @IsDateString() targetDate?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs?: EvidenceReferenceDto[];
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
  @IsOptional() @IsString() @Length(3, 4000) resolutionSummary?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  resolutionEvidenceRefs?: EvidenceReferenceDto[];
  @IsOptional() @IsString() @Length(3, 2000) closureReason?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  closureEvidenceRefs?: EvidenceReferenceDto[];
}

export class CreateActionDto {
  @IsOptional() @IsUUID() riskId?: string;
  @IsOptional() @IsUUID() issueId?: string;
  @Transform(upper) @Matches(codePattern) code!: string;
  @IsEnum(RiskIssueActionType) actionType!: RiskIssueActionType;
  @IsString() @Length(3, 250) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsUUID() ownerId!: string;
  @Matches(datePattern) @IsDateString() dueDate!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs: EvidenceReferenceDto[] = [];
}

export class UpdateActionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(3, 250) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @Matches(datePattern) @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(RiskIssueActionStatus) status?: RiskIssueActionStatus;
  @IsOptional() @IsString() @Length(3, 2000) statusReason?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs?: EvidenceReferenceDto[];
  @IsOptional() @ValidateNested() @Type(() => RiskResidualAssessmentDto)
  residualAssessment?: RiskResidualAssessmentDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) residualRiskVersion?: number;
}

export class ChangeSourceDto {
  @IsEnum(ChangeSourceType) type!: ChangeSourceType;
  @IsOptional() @IsUUID() riskId?: string;
  @IsOptional() @IsUUID() issueId?: string;
}

export class TextImpactDimensionDto {
  @IsString() @Length(3, 4000) summary!: string;
}

export class ScheduleImpactDimensionDto extends TextImpactDimensionDto {
  @Type(() => Number) @IsInt() @Min(-3650) @Max(3650) durationDeltaDays!: number;
  @IsBoolean() requiresRebaseline!: boolean;
  @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true })
  affectedMilestoneIds!: string[];
}

export class CostImpactDimensionDto extends TextImpactDimensionDto {
  @Matches(moneyPattern) amountDelta!: string;
  @Transform(upper) @Matches(/^[A-Z]{3}$/) currency!: string;
}

export class ChangeImpactDto {
  @IsOptional() @ValidateNested() @Type(() => TextImpactDimensionDto) scope?: TextImpactDimensionDto;
  @IsOptional() @ValidateNested() @Type(() => ScheduleImpactDimensionDto) schedule?: ScheduleImpactDimensionDto;
  @IsOptional() @ValidateNested() @Type(() => CostImpactDimensionDto) cost?: CostImpactDimensionDto;
  @IsOptional() @ValidateNested() @Type(() => TextImpactDimensionDto) quality?: TextImpactDimensionDto;
  @IsOptional() @ValidateNested() @Type(() => TextImpactDimensionDto) hse?: TextImpactDimensionDto;
  @IsOptional() @ValidateNested() @Type(() => TextImpactDimensionDto) contract?: TextImpactDimensionDto;
}

export class CreateChangeDto {
  @IsOptional() @IsUUID() packageId?: string;
  @Transform(upper) @Matches(codePattern) code!: string;
  @IsString() @Length(3, 250) title!: string;
  @IsString() @Length(3, 4000) reason!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique()
  @IsString({ each: true }) @Length(3, 2000, { each: true }) options: string[] = [];
  @IsOptional() @IsString() @Length(3, 4000) recommendation?: string;
  @IsUUID() ownerId!: string;
  @IsOptional() @IsUUID() sourceBaselineId?: string;
  @ValidateNested() @Type(() => ChangeSourceDto) source!: ChangeSourceDto;
  @IsOptional() @ValidateNested() @Type(() => ChangeImpactDto) impact?: ChangeImpactDto;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs: EvidenceReferenceDto[] = [];
}

export class UpdateChangeDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(3, 250) title?: string;
  @IsOptional() @IsString() @Length(3, 4000) reason?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique()
  @IsString({ each: true }) @Length(3, 2000, { each: true }) options?: string[];
  @IsOptional() @IsString() @MaxLength(4000) recommendation?: string | null;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() sourceBaselineId?: string;
  @IsOptional() @ValidateNested() @Type(() => ChangeImpactDto) impact?: ChangeImpactDto;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs?: EvidenceReferenceDto[];
  @IsOptional() @IsEnum(ChangeRequestStatus) status?: ChangeRequestStatus;
}

export class SubmitChangeDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ChangeDecisionDto {
  @IsEnum(RiskChangeDecision) decision!: RiskChangeDecision;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @Length(3, 2000) comment!: string;
}

export class ClosureDecisionDto extends ChangeDecisionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ArrayUnique((item) => JSON.stringify(item))
  @ValidateNested({ each: true }) @Type(() => EvidenceReferenceDto)
  evidenceRefs!: EvidenceReferenceDto[];
}
