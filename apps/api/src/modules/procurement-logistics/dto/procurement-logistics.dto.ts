import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsISO8601, IsOptional,
  IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested
} from 'class-validator';
import {
  EvaluationType, GoodsReceiptCondition, ShipmentMilestoneSource, ShipmentMilestoneType,
  SupplierQualificationStatus
} from '../../../database/entities';

/**
 * MONEY IS TEXT. Every monetary/quantity field is validated as a decimal string and passed through
 * to Postgres `numeric` untouched — nothing in this file is ever transformed into a JS number.
 */
const MONEY = /^\d{1,15}(\.\d{1,4})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const BUSINESS_NUMBER = /^[A-Z0-9][A-Z0-9_./-]{1,79}$/;
const CATEGORY = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;
/**
 * Printable ASCII only: JS trim/uppercase and Postgres btrim/upper agree byte-for-byte on this
 * alphabet, so the `ck_serial_number_normalized` identity can never diverge from the service.
 */
const SERIAL = /^[\x20-\x7E]{1,120}$/;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

/** API-076 filters: the register is tenant/category scoped. */
export class SupplierListQueryDto extends PageQueryDto {
  @IsOptional() @Matches(CATEGORY) category?: string;
  @IsOptional() @IsEnum(SupplierQualificationStatus)
  qualificationStatus?: SupplierQualificationStatus;
}

/** API-077 — V1 creates the DRAFT header only; the approval walk rides the workflow engine later. */
export class CreateRequisitionDto {
  @Matches(BUSINESS_NUMBER) number!: string;
  @IsString() @Length(3, 400) title!: string;
  @IsOptional() @IsString() @Length(1, 2000) description?: string;
  @IsUUID() packageId!: string;
  @IsOptional() @IsUUID() wbsId?: string;
  @IsUUID() costCodeId!: string;
  @Matches(DATE_ONLY) needByDate!: string;
}

/** API-078 — issues the RFQ directly (no draft endpoint exists in the catalog). */
export class CreateRfqDto {
  @Matches(BUSINESS_NUMBER) number!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
  @IsISO8601() dueDate!: string;
  /** Snapshot of DB-044 ids; every invitee must be QUALIFIED with valid_to not in the past. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID(undefined, { each: true })
  invitedSupplierIds!: string[];
}

/** API-080 — the version per (bid, type, evaluator) is allocated in-transaction, never client-set. */
export class CreateEvaluationDto {
  @IsEnum(EvaluationType) evaluationType!: EvaluationType;
  @IsOptional() @Matches(MONEY) normalizedTotal?: string;
  @IsOptional() @Matches(CURRENCY) currency?: string;
  @IsOptional() @IsString() @Length(1, 400) normalizationBasis?: string;
  /** Required when a COMMERCIAL normalization differs from the sealed bid total. */
  @IsOptional() @IsString() @Length(3, 2000) overrideReason?: string;
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}

/** API-081 — the awarded bid must belong to this RFQ (also structurally via fk_rfq_awarded_bid). */
export class SubmitAwardDto {
  @IsUUID() awardedBidId!: string;
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
}

export class PurchaseOrderLineInputDto {
  @Type(() => Number) @IsInt() @Min(1) lineNo!: number;
  @IsString() @Length(1, 400) description!: string;
  @Matches(MONEY) quantity!: string;
  @IsString() @Length(1, 20) uom!: string;
  @Matches(MONEY) unitPrice!: string;
  @IsOptional() @IsUUID() requisitionId?: string;
  /** Plain reference into the deferred BOM domain; deliberately not FK-validated (recorded). */
  @IsOptional() @IsUUID() bomLineId?: string;
}

/**
 * API-082 — creates the PO ISSUED with SoD (approver ≠ creator) and writes the PURCHASE_ORDER
 * commitment in the same transaction. `totalValue` must equal the SQL sum of the lines; the
 * deferred trigger is the arbiter, never JS arithmetic.
 */
export class CreatePurchaseOrderDto {
  @Matches(BUSINESS_NUMBER) poNo!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
  @IsString() @Length(3, 400) title!: string;
  @IsUUID() supplierProfileId!: string;
  @IsOptional() @IsUUID() awardedRfqId?: string;
  @Matches(MONEY) totalValue!: string;
  @Matches(CURRENCY) currency!: string;
  /** SoD: must differ from the caller; enforced again by ck_purchase_order_sod. */
  @IsUUID() approvedBy!: string;
  /** Cost code for the commitment row recorded with the issued order. */
  @IsUUID() costCodeId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => PurchaseOrderLineInputDto)
  lines!: PurchaseOrderLineInputDto[];
}

/** API-083 — committed_date is frozen at insert; etd/eta stay correctable. */
export class CreateShipmentDto {
  @Matches(DATE_ONLY) committedDate!: string;
  @IsOptional() @Matches(DATE_ONLY) etd?: string;
  @IsOptional() @Matches(DATE_ONLY) eta?: string;
  @IsOptional() @IsString() @Length(1, 200) carrier?: string;
  @IsOptional() @IsString() @Length(1, 200) trackingNo?: string;
}

/** API-084 — appends to the immutable milestone stream and advances the derived status. */
export class CreateShipmentMilestoneDto {
  @IsEnum(ShipmentMilestoneType) milestoneType!: ShipmentMilestoneType;
  @IsISO8601() eventTime!: string;
  @IsEnum(ShipmentMilestoneSource) source!: ShipmentMilestoneSource;
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
  /** ETA correction carried with the milestone (FR-070); applied to the shipment header. */
  @IsOptional() @Matches(DATE_ONLY) eta?: string;
}

export class SerialInputDto {
  @Matches(SERIAL) serialNo!: string;
  @IsUUID() equipmentModelId!: string;
}

/** API-085 — one transaction: receipt + inventory rows + serials. */
export class CreateGoodsReceiptDto {
  @IsUUID() purchaseOrderLineId!: string;
  @IsOptional() @IsUUID() shipmentId?: string;
  @IsUUID() siteId!: string;
  @Matches(BUSINESS_NUMBER) receiptNo!: string;
  @Matches(MONEY) quantity!: string;
  @IsEnum(GoodsReceiptCondition) condition!: GoodsReceiptCondition;
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => SerialInputDto)
  serials?: SerialInputDto[];
}

/** Internal fixture shape for sealed bids while API-079 is deferred — not exposed on any route. */
export interface RegisterSealedBidInput {
  rfqId: string;
  supplierProfileId: string;
  revision?: number;
  total: string;
  currency: string;
  payloadRef?: Record<string, unknown>;
}
