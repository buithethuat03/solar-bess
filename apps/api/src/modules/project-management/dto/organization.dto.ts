import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { OrganizationType } from '../../../database/entities';

const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateCompanyDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  code!: string;

  @IsString()
  @Length(2, 200)
  name!: string;

  @IsEnum(OrganizationType)
  organizationType!: OrganizationType;
}

export class CreateLegalEntityDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @Length(2, 250)
  legalName!: string;

  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  country!: string;

  @IsString()
  @Length(1, 100)
  registrationNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;
}

export class CreatePortfolioDto {
  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  code!: string;

  @IsString()
  @Length(2, 200)
  name!: string;
}
