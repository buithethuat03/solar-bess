import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID,
  Length, Matches, Max, MaxLength, Min, ValidateNested
} from 'class-validator';
import {
  InvestmentScenarioType, OpportunityStage, ProjectType, SurveyDataQuality
} from '../../../database/entities';

/**
 * MONEY/QUANTITY IS TEXT. `expectedCapacityKwp`, `capexTotal`, `npv` and `irr` are validated as
 * decimal strings and passed to Postgres `numeric` untouched — never a JS number.
 */
const MONEY = /^\d{1,15}(\.\d{1,4})?$/;
/** Signed variant — NPV may legitimately be negative. */
const SIGNED_MONEY = /^-?\d{1,15}(\.\d{1,4})?$/;
/** numeric(9,6) rate as text; IRR may be negative. */
const RATE = /^-?\d{1,3}(\.\d{1,6})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z0-9][A-Z0-9_./-]{0,63}$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class OpportunityListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(OpportunityStage) stage?: OpportunityStage;
  @IsOptional() @IsUUID() customerCompanyId?: string;
}

export class CreateOpportunityDto {
  @Matches(CODE) code!: string;
  @IsString() @Length(3, 400) name!: string;
  @IsOptional() @IsUUID() customerCompanyId?: string;
  /** Opaque candidate-site reference — deliberately not validated against DB-011 (no FK). */
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsString() @Length(1, 500) locationText?: string;
  @IsOptional() @Matches(MONEY) expectedCapacityKwp?: string;
  /** Defaults to the caller; an explicit owner must still belong to the same tenant. */
  @IsOptional() @IsUUID() ownerId?: string;
}

export class UpdateOpportunityDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  /** Only legal adjacent WF-002 moves; command-owned stages answer 422. */
  @IsOptional() @IsEnum(OpportunityStage) stage?: OpportunityStage;
  @IsOptional() @IsString() @Length(3, 400) name?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() customerCompanyId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsString() @Length(1, 500) locationText?: string;
  @IsOptional() @Matches(MONEY) expectedCapacityKwp?: string;
}

export class CreateSurveyPackageDto {
  /** Defaults to RAW; APPROVED rows become immutable the moment they land. */
  @IsOptional()
  @IsIn([SurveyDataQuality.RAW, SurveyDataQuality.VALIDATED, SurveyDataQuality.APPROVED])
  dataQuality?: SurveyDataQuality;
  /** Opaque document references only — never bytes. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) documentRefs?: string[];
  @IsOptional() @IsString() @Length(1, 4000) notes?: string;
}

export class CreateInvestmentScenarioDto {
  @IsEnum(InvestmentScenarioType) scenarioType!: InvestmentScenarioType;
  @Matches(CURRENCY) currency!: string;
  @IsOptional() @Matches(MONEY) capexTotal?: string;
  @IsOptional() @Matches(SIGNED_MONEY) npv?: string;
  @IsOptional() @Matches(RATE) irr?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paybackMonths?: number;
  /** Client evidence, stored verbatim — the server computes no financial figures. */
  @IsObject() inputSnapshot!: Record<string, unknown>;
  @IsOptional() @IsObject() outputSnapshot?: Record<string, unknown>;
  @IsString() @Length(1, 40) formulaVersion!: string;
}

export class SubmitInvestmentScenarioDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(1, 2000) comment?: string;
}

export class ConvertPrimarySiteDto {
  @IsString() @Length(1, 64) code!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @Length(1, 500) location?: string;
  @IsString() @Length(1, 100) timezone!: string;
}

export class ConvertOpportunityDto {
  @IsUUID() portfolioId!: string;
  @IsUUID() ownerLegalEntityId!: string;
  /** Required only when the opportunity itself has no customer company. */
  @IsOptional() @IsUUID() customerCompanyId?: string;
  @IsOptional() @IsUUID() projectManagerId?: string;
  /** Defaults to the opportunity code. */
  @IsOptional() @Matches(CODE) projectCode?: string;
  /** Defaults to the opportunity name (clamped to the DB-010 250-char limit). */
  @IsOptional() @IsString() @Length(3, 250) projectName?: string;
  @IsEnum(ProjectType) projectType!: ProjectType;
  @IsString() @Length(1, 80) contractModel!: string;
  @Matches(CURRENCY) currency!: string;
  @Matches(DATE_ONLY) plannedCod!: string;
  @ValidateNested() @Type(() => ConvertPrimarySiteDto) primarySite!: ConvertPrimarySiteDto;
}
