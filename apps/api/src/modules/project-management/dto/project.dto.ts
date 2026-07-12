import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString,
  IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested
} from 'class-validator';
import {
  ProjectPartyRole, ProjectPhase, ProjectRecordStatus, ProjectType, RaciRole
} from '../../../database/entities';

const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSiteDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  code!: string;

  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateProjectDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  code!: string;

  @IsString()
  @Length(2, 250)
  name!: string;

  @IsEnum(ProjectType)
  type!: ProjectType;

  @IsUUID()
  portfolioId!: string;

  @IsUUID()
  ownerLegalEntityId!: string;

  @IsUUID()
  customerCompanyId!: string;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @IsString()
  @Length(1, 80)
  contractModel!: string;

  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsDateString()
  plannedCod!: string;

  @ValidateNested()
  @Type(() => CreateSiteDto)
  primarySite!: CreateSiteDto;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(2, 250)
  name?: string;

  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;

  @IsOptional()
  @IsEnum(ProjectPhase)
  phase?: ProjectPhase;

  @IsOptional()
  @IsEnum(ProjectRecordStatus)
  recordStatus?: ProjectRecordStatus;

  @IsOptional()
  @IsUUID()
  portfolioId?: string;

  @IsOptional()
  @IsUUID()
  ownerLegalEntityId?: string;

  @IsOptional()
  @IsUUID()
  customerCompanyId?: string;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  contractModel?: string;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsDateString()
  plannedCod?: string;

  @IsOptional()
  @IsDateString()
  forecastCod?: string | null;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ProjectListQueryDto {
  @IsOptional() @IsUUID() portfolioId?: string;
  @IsOptional() @IsUUID() ownerLegalEntityId?: string;
  @IsOptional() @IsUUID() customerCompanyId?: string;
  @IsOptional() @IsUUID() projectManagerId?: string;
  @IsOptional() @IsEnum(ProjectType) type?: ProjectType;
  @IsOptional() @IsEnum(ProjectPhase) phase?: ProjectPhase;
  @IsOptional() @IsEnum(ProjectRecordStatus) recordStatus?: ProjectRecordStatus;
  @IsOptional() @IsString() @MaxLength(200) search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class UpsertProjectPartyDto {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsEnum(ProjectPartyRole)
  roleCode!: ProjectPartyRole;

  @IsEnum(RaciRole)
  raci!: RaciRole;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
