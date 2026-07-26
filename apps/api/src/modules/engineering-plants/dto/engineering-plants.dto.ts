import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional,
  IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested
} from 'class-validator';
import { EquipmentModelStatus } from '../../../database/entities';

/**
 * QUANTITIES ARE TEXT. Every numeric(19,4) field is validated as a decimal string and passed
 * through to Postgres untouched — nothing in this file is ever transformed into a JS number
 * except plain integer counters (versions, line numbers, minutes).
 */
const QUANTITY = /^\d{1,15}(\.\d{1,4})?$/;
/** Signed variant for dispatch power steps, where charge is negative by convention. */
const SIGNED_QUANTITY = /^-?\d{1,15}(\.\d{1,4})?$/;
/** SOC percent as text; the envelope band is the real bound, checked exactly in TS. */
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class EquipmentModelListQueryDto extends PageQueryDto {
  /** Default APPROVED (the usable catalog); 'ALL' widens to every lifecycle state. */
  @IsOptional() @IsIn([...Object.values(EquipmentModelStatus), 'ALL'])
  status?: EquipmentModelStatus | 'ALL';
  @IsOptional() @IsString() @Length(1, 100) equipmentClass?: string;
  @IsOptional() @IsString() @Length(1, 200) manufacturer?: string;
}

export class CreateEquipmentModelDto {
  @IsString() @Length(1, 100) equipmentClass!: string;
  @IsString() @Length(1, 200) manufacturer!: string;
  @IsString() @Length(1, 200) model!: string;
  @IsString() @Length(1, 60) specVersion!: string;
  @IsOptional() @IsObject() ratings?: Record<string, unknown>;
  @IsOptional() @IsUUID() manufacturerCompanyId?: string;
}

export class BomListQueryDto extends PageQueryDto {
  /** When it matches a listed BOM version, that item embeds its full ordered line set. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) linesForVersion?: number;
}

export class BomLineInputDto {
  @Type(() => Number) @IsInt() @Min(1) lineNo!: number;
  @IsString() @Length(1, 80) itemCode!: string;
  @IsOptional() @IsString() @Length(1, 1000) description?: string;
  /** numeric(19,4) as text; `> 0` is the database's check, not a JS comparison. */
  @Matches(QUANTITY) quantity!: string;
  @IsString() @Length(1, 40) unit!: string;
  @IsOptional() @IsUUID() equipmentModelId?: string;
}

/**
 * API-070 — the honest V1 reading, recorded: no catalog operation creates or edits a DRAFT BOM,
 * so the release command receives the draft content itself (`designRevisionId` + `lines`) and
 * creates-and-releases the next BOM version in one transaction.
 */
export class ReleaseBomDto {
  @IsUUID() designRevisionId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => BomLineInputDto)
  lines!: BomLineInputDto[];
}

export class ReleaseSolarConfigurationDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  /** The full topology snapshot of the version being released; hashed with the canonical hash. */
  @IsObject() configuration!: Record<string, unknown>;
  @IsOptional() @Matches(QUANTITY) dcCapacityKwp?: string;
  @IsOptional() @Matches(QUANTITY) acCapacityKw?: string;
  @IsOptional() @IsObject() baselineRef?: Record<string, unknown>;
}

export class DispatchStepDto {
  /** Positive discharges, negative charges — advisory numbers only, never a setpoint. */
  @Matches(SIGNED_QUANTITY) powerMw!: string;
}

export class SimulateDispatchDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(60) intervalMinutes!: number;
  @IsOptional() @Matches(PERCENT) initialSocPercent?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(288)
  @ValidateNested({ each: true }) @Type(() => DispatchStepDto)
  steps!: DispatchStepDto[];
}
