import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsObject, IsOptional,
  IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested
} from 'class-validator';
import {
  CommitmentSourceType, ContractAppendixStatus, ContractAppendixType, ContractPartyRole,
  ContractStatus, ContractType, ObligationDecisionType, PaymentComponentType
} from '../../../database/entities';

/**
 * MONEY IS TEXT. Every monetary field is validated as a decimal string and passed through to
 * Postgres `numeric` untouched — no field in this file is ever transformed into a JS number.
 */
const MONEY = /^\d{1,15}(\.\d{1,4})?$/;
/** Signed variant for fields where negatives are legal (appendix impact, deduction components). */
const SIGNED_MONEY = /^-?\d{1,15}(\.\d{1,4})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
/** numeric(9,6) component rate as text. */
const COMPONENT_RATE = /^-?\d{1,3}(\.\d{1,6})?$/;
/** numeric(28,12) FX rate as text; `> 0` is the database's check, not a JS comparison. */
const FX_RATE = /^\d{1,16}(\.\d{1,12})?$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class ContractListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(ContractType) type?: ContractType;
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
}

export class ObligationListQueryDto extends PageQueryDto {}

export class CreateContractDto {
  @Matches(/^[A-Z0-9][A-Z0-9_./-]{1,79}$/) contractNo!: string;
  @IsString() @Length(3, 400) title!: string;
  @IsEnum(ContractType) type!: ContractType;
  @Matches(MONEY) value!: string;
  @Matches(CURRENCY) currency!: string;
  @IsOptional() @Matches(DATE_ONLY) effectiveFrom?: string;
  @IsOptional() @Matches(DATE_ONLY) effectiveTo?: string;
  @IsOptional() @IsUUID() rootDocumentId?: string;
}

export class UpdateContractDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(3, 400) title?: string;
  @IsOptional() @IsEnum(ContractType) type?: ContractType;
  @IsOptional() @Matches(MONEY) value?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @Matches(DATE_ONLY) effectiveFrom?: string;
  @IsOptional() @Matches(DATE_ONLY) effectiveTo?: string;
  @IsOptional() @IsUUID() rootDocumentId?: string;
}

export class CreateContractPartyDto {
  @IsUUID() companyId!: string;
  @IsUUID() legalEntityId!: string;
  @IsEnum(ContractPartyRole) partyRole!: ContractPartyRole;
  @IsOptional() @IsString() @Length(1, 200) representativeName?: string;
  @IsOptional() @IsString() @Length(1, 200) representativeTitle?: string;
  @IsOptional() @IsString() @Length(1, 400) authorityReference?: string;
}

export class CreateContractAppendixDto {
  @Matches(/^[A-Z0-9][A-Z0-9_./-]{1,79}$/) appendixNo!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revisionNo?: number;
  @IsEnum(ContractAppendixType) type!: ContractAppendixType;
  @IsOptional() @Matches(DATE_ONLY) effectiveDate?: string;
  @IsOptional() @Matches(SIGNED_MONEY) valueImpact?: string;
  /** Defaults to the parent contract's currency; a different value is a CURRENCY_MISMATCH. */
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsUUID() documentId?: string;
  /**
   * DRAFT (default) or directly EFFECTIVE: no appendix transition operation exists in the catalog,
   * and an appendix that can never become effective could never consolidate a contract value.
   */
  @IsOptional() @IsIn([ContractAppendixStatus.DRAFT, ContractAppendixStatus.EFFECTIVE])
  status?: ContractAppendixStatus;
}

export class CreateObligationDto {
  @IsString() @Length(1, 200) clauseRef!: string;
  @IsString() @Length(3, 400) title!: string;
  @IsUUID() obligorPartyId!: string;
  @IsUUID() beneficiaryPartyId!: string;
  /** Defaults to the caller; an explicit owner must still belong to the same tenant. */
  @IsOptional() @IsUUID() ownerUserId?: string;
  @Matches(/^[A-Z][A-Z0-9_]{0,29}$/) triggerType!: string;
  @IsOptional() @IsString() @Length(1, 400) triggerReference?: string;
  @IsOptional() @Matches(DATE_ONLY) dueDate?: string;
  @IsOptional() @IsString() @Length(1, 2000) consequence?: string;
  @IsOptional() @IsUUID() appendixId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
}

export class FulfillObligationDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsEnum(ObligationDecisionType) decisionType!: ObligationDecisionType;
  @IsString() @Length(3, 2000) reason!: string;
  /** FR-040: no fulfilment or waiver without at least one piece of evidence. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs!: string[];
}

export class CreateBudgetVersionDto {
  @Matches(CURRENCY) currency!: string;
  @Matches(MONEY) totalAmount!: string;
  @IsOptional() @IsObject() snapshot?: Record<string, unknown>;
}

export class CreateCommitmentDto {
  @IsUUID() contractId!: string;
  @IsUUID() costCodeId!: string;
  @Matches(SIGNED_MONEY) amount!: string;
  /** Defaults to the contract's currency; a different value is a CURRENCY_MISMATCH. */
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsEnum(CommitmentSourceType) sourceType!: CommitmentSourceType;
  @IsUUID() sourceId!: string;
  @Type(() => Number) @IsInt() @Min(1) sourceVersion!: number;
  @IsOptional() @IsUUID() reversesCommitmentId?: string;
}

export class InvoiceInputDto {
  @IsString() @Length(1, 80) invoiceNo!: string;
  @Matches(DATE_ONLY) invoiceDate!: string;
  @IsUUID() supplierCompanyId!: string;
  @IsUUID() supplierLegalEntityId!: string;
  @Matches(MONEY) grossAmount!: string;
  @Matches(MONEY) vatAmount!: string;
  /** Stored as declared; the gross/vat/net relation is deliberately NOT recomputed or enforced. */
  @Matches(MONEY) netAmount!: string;
}

export class PaymentComponentInputDto {
  @Type(() => Number) @IsInt() @Min(1) sequenceNo!: number;
  @IsEnum(PaymentComponentType) componentType!: PaymentComponentType;
  @IsOptional() @Matches(SIGNED_MONEY) basisAmount?: string;
  @IsOptional() @Matches(COMPONENT_RATE) rate?: string;
  @Matches(SIGNED_MONEY) amount!: string;
  /** Defaults to the payment's currency; a different value is a CURRENCY_MISMATCH. */
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsString() @Length(1, 40) ruleVersion!: string;
}

export class FxSnapshotInputDto {
  @Matches(CURRENCY) baseCurrency!: string;
  @Matches(CURRENCY) quoteCurrency!: string;
  @Matches(FX_RATE) rate!: string;
  @Matches(DATE_ONLY) rateDate!: string;
  @IsString() @Length(1, 80) source!: string;
}

export class CreatePaymentDto {
  @IsOptional() @ValidateNested() @Type(() => InvoiceInputDto) invoice?: InvoiceInputDto;
  @IsUUID() payerCompanyId!: string;
  @IsUUID() payerLegalEntityId!: string;
  @IsUUID() payeeCompanyId!: string;
  @IsUUID() payeeLegalEntityId!: string;
  @Matches(MONEY) requestedAmount!: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsString() @Length(1, 200) milestoneRef?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  @MaxLength(500, { each: true }) evidenceRefs?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => PaymentComponentInputDto)
  components?: PaymentComponentInputDto[];
  @IsOptional() @ValidateNested() @Type(() => FxSnapshotInputDto)
  fxSnapshot?: FxSnapshotInputDto;
}
