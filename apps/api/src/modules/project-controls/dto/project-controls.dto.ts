import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString,
  IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches,
  Max, MaxLength, Min, ValidateIf, ValidateNested
} from 'class-validator';

const upper = ({ value }: { value: unknown }) => (
  typeof value === 'string' ? value.trim().toUpperCase() : value
);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const codePattern = /^[A-Z0-9][A-Z0-9_.-]{1,79}$/;
const weightPattern = /^(100(\.0{1,4})?|([0-9]{1,2})(\.[0-9]{1,4})?)$/;
const progressPattern = /^(100(\.0{1,2})?|([0-9]{1,2})(\.[0-9]{1,2})?)$/;

export enum DraftModeDto {
  PREVIEW = 'PREVIEW',
  COMMIT = 'COMMIT'
}

export enum DraftSourceFormatDto {
  MANUAL = 'MANUAL',
  CANONICAL_CSV = 'CANONICAL_CSV',
  CANONICAL_JSON = 'CANONICAL_JSON'
}

export enum ActivityTypeDto {
  TASK = 'TASK',
  MILESTONE = 'MILESTONE'
}

export enum DependencyTypeDto {
  FS = 'FS',
  SS = 'SS',
  FF = 'FF',
  SF = 'SF'
}

export enum BaselineTypeDto {
  INITIAL = 'INITIAL',
  REBASELINE = 'REBASELINE'
}

export enum BaselineDecisionValueDto {
  APPROVE = 'APPROVE',
  RETURN = 'RETURN',
  REJECT = 'REJECT'
}

export class PackageListQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class ScheduleBaselineListQueryDto {
  @IsUUID()
  approvedChangeRequestId!: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class CreatePackageDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  code!: string;

  @IsString()
  @Length(2, 200)
  name!: string;

  @IsString()
  @Length(1, 80)
  packageType!: string;

  @IsOptional()
  @IsUUID()
  parentPackageId?: string;

  @IsOptional()
  @IsUUID()
  contractorCompanyId?: string;
}

export class ScheduleQueryDto {
  @IsOptional()
  @Matches(datePattern)
  @IsDateString()
  dataDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  lookAheadDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  baselineNumber?: number;
}

export class LookAheadExportQueryDto {
  @IsOptional()
  @Matches(datePattern)
  @IsDateString()
  dataDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  lookAheadDays?: number;
}

export class CalendarExceptionDto {
  @Matches(datePattern)
  @IsDateString()
  date!: string;

  @IsBoolean()
  working!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;
}

export class ScheduleCalendarDto {
  @IsString()
  @Length(1, 100)
  timezone!: string;

  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  calendarCode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingWeek!: number[];

  @IsArray()
  @ArrayMaxSize(3660)
  @ValidateNested({ each: true })
  @Type(() => CalendarExceptionDto)
  exceptions!: CalendarExceptionDto[];
}

export class ScheduleDraftSourceDto {
  @IsEnum(DraftSourceFormatDto)
  format!: DraftSourceFormatDto;

  @IsString()
  @Length(1, 250)
  sourceName!: string;

  @IsOptional()
  @Matches(/^(sha256:)?[a-fA-F0-9]{64}$/)
  sourceHash?: string;
}

export class ScheduleWbsUpsertDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 100)
  clientRef!: string;

  @IsOptional()
  @IsUUID()
  packageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentClientRef?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @Transform(upper)
  @Matches(codePattern)
  code!: string;

  @IsString()
  @Length(1, 250)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Matches(weightPattern)
  weight!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ScheduleActivityUpsertDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 100)
  clientRef!: string;

  @IsString()
  @Length(1, 100)
  wbsClientRef!: string;

  @IsOptional()
  @IsUUID()
  packageId?: string;

  @IsUUID()
  ownerId!: string;

  @Transform(upper)
  @Matches(codePattern)
  code!: string;

  @IsString()
  @Length(1, 250)
  name!: string;

  @IsEnum(ActivityTypeDto)
  activityType!: ActivityTypeDto;

  @Matches(weightPattern)
  weight!: string;

  @Matches(datePattern)
  @IsDateString()
  plannedStart!: string;

  @IsOptional()
  @Matches(datePattern)
  @IsDateString()
  plannedFinish?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationWorkDays!: number;
}

export class ScheduleDependencyUpsertDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 100)
  predecessorClientRef!: string;

  @IsString()
  @Length(1, 100)
  successorClientRef!: string;

  @IsEnum(DependencyTypeDto)
  dependencyType!: DependencyTypeDto;

  @Type(() => Number)
  @IsInt()
  lagWorkDays!: number;
}

export class ApplyScheduleDraftDto {
  @IsEnum(DraftModeDto)
  mode!: DraftModeDto;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => ScheduleDraftSourceDto)
  source!: ScheduleDraftSourceDto;

  @ValidateNested()
  @Type(() => ScheduleCalendarDto)
  calendar!: ScheduleCalendarDto;

  @IsArray()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => ScheduleWbsUpsertDto)
  wbsUpserts!: ScheduleWbsUpsertDto[];

  @IsArray()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => ScheduleActivityUpsertDto)
  activityUpserts!: ScheduleActivityUpsertDto[];

  @IsArray()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => ScheduleDependencyUpsertDto)
  dependencyUpserts!: ScheduleDependencyUpsertDto[];

  @IsArray()
  @ArrayMaxSize(20000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  archiveWbsIds!: string[];

  @IsArray()
  @ArrayMaxSize(20000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  archiveActivityIds!: string[];

  @IsArray()
  @ArrayMaxSize(20000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  unlinkDependencyIds!: string[];
}

export class SubmitScheduleBaselineDto {
  @IsEnum(BaselineTypeDto)
  baselineType!: BaselineTypeDto;

  @Matches(datePattern)
  @IsDateString()
  dataDate!: string;

  @ValidateIf((value: SubmitScheduleBaselineDto) => value.baselineType === BaselineTypeDto.INITIAL)
  @IsString()
  @Length(3, 2000)
  reason?: string;

  @ValidateIf((value: SubmitScheduleBaselineDto) => value.baselineType === BaselineTypeDto.INITIAL)
  @IsString()
  @Length(3, 4000)
  impactSummary?: string;

  @ValidateIf((value: SubmitScheduleBaselineDto) => value.baselineType === BaselineTypeDto.REBASELINE)
  @IsUUID()
  approvedChangeRequestId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedScheduleVersion!: number;
}

export class ProgressUpdateDto {
  @IsUUID()
  activityId!: string;

  @Matches(datePattern)
  @IsDateString()
  dataDate!: string;

  @Matches(progressPattern)
  percentComplete!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  remainingDurationWorkDays!: number;

  @IsOptional()
  @Matches(/^-?[0-9]+(\.[0-9]{1,4})?$/)
  quantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @Matches(datePattern)
  @IsDateString()
  actualStart?: string | null;

  @IsOptional()
  @Matches(datePattern)
  @IsDateString()
  actualFinish?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  evidenceRefs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsUUID()
  correctionOfId?: string;

  @ValidateIf((value: ProgressUpdateDto) => Boolean(value.correctionOfId))
  @IsString()
  @Length(3, 2000)
  reason?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedActivityVersion!: number;
}

export class ProgressHistoryQueryDto {
  @IsUUID()
  activityId!: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class BaselineDecisionDto {
  @IsEnum(BaselineDecisionValueDto)
  decision!: BaselineDecisionValueDto;

  @ValidateIf((value: BaselineDecisionDto) => value.decision !== BaselineDecisionValueDto.APPROVE)
  @IsString()
  @Length(3, 2000)
  comment?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
