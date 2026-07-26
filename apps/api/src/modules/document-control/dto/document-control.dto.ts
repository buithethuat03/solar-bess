import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBase64, IsBoolean, IsEmail, IsEnum, IsInt,
  IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
  ValidateNested
} from 'class-validator';
import {
  DocumentClassification, ReviewCommentSeverity
} from '../../../database/entities';

/**
 * The upload body carries the bytes because the object-storage port exposes no pre-signed URL: the
 * server has to be the one that writes into the quarantine bucket, otherwise a client could put
 * unscanned bytes somewhere the finalize step would later read as if they had been vetted.
 */
const MAX_UPLOAD_BASE64_LENGTH = 8_000_000;

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

/** API-041 pages the revision history of one document; it takes no register filters. */
export class DocumentDetailQueryDto extends PageQueryDto {}

export class DocumentListQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @Length(1, 100) type?: string;
  @IsOptional() @IsString() @Length(1, 100) discipline?: string;
  @IsOptional() @IsEnum(DocumentClassification) classification?: DocumentClassification;
  @IsOptional() @IsUUID() packageId?: string;
}

export class CreateDocumentDto {
  @Matches(/^[A-Z0-9][A-Z0-9_./-]{1,79}$/) documentCode!: string;
  @IsString() @Length(3, 400) title!: string;
  @IsString() @Length(1, 100) discipline!: string;
  @IsString() @Length(1, 100) type!: string;
  @IsEnum(DocumentClassification) classification!: DocumentClassification;
  @IsOptional() @IsUUID() packageId?: string;
  /** Defaults to the caller; an explicit owner must still belong to the same tenant. */
  @IsOptional() @IsUUID() ownerId?: string;
}

export class CreateUploadSessionDto {
  @Matches(/^[A-Z0-9][A-Z0-9_.-]{0,39}$/) revisionCode!: string;
  @IsString() @Length(3, 200) purpose!: string;
  @IsString() @Length(1, 400) fileName!: string;
  @IsString() @Length(1, 200) mimeType!: string;
  @IsBase64() @MaxLength(MAX_UPLOAD_BASE64_LENGTH) content!: string;
}

export class FinalizeUploadSessionDto {
  /**
   * Optional client-declared hash. It is compared with the hash the server computes over the stored
   * bytes and never used in its place, so a client cannot certify its own upload.
   */
  @IsOptional() @Matches(/^[0-9a-f]{64}$/) contentHash?: string;
}

export class SubmitRevisionReviewDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @Length(3, 2000) note!: string;
}

export class ApproveRevisionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @Length(3, 2000) comment!: string;
}

export class IssueRevisionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @Length(3, 2000) comment!: string;
}

export class CreateReviewCommentDto {
  @IsEnum(ReviewCommentSeverity) severity!: ReviewCommentSeverity;
  @IsString() @Length(3, 4000) body!: string;
  @IsOptional() @IsString() @Length(1, 200) location?: string;
}

export class RecipientDto {
  @IsOptional() @IsUUID() partyId?: string;
  @IsString() @Length(1, 200) organisation!: string;
  @IsString() @Length(1, 200) contactName!: string;
  @IsEmail() @MaxLength(254) contactEmail!: string;
}

export class TransmittalItemInputDto {
  @IsUUID() revisionId!: string;
  @Matches(/^[A-Z0-9][A-Z0-9_.-]{0,39}$/) actionCode!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) responseDue?: string;
}

export class IssueTransmittalDto {
  @Matches(/^[A-Z0-9][A-Z0-9_./-]{1,79}$/) number!: string;
  @IsString() @Length(3, 400) purpose!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string;
  @IsOptional() @IsUUID() senderPartyId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => RecipientDto)
  recipients!: RecipientDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => TransmittalItemInputDto)
  items!: TransmittalItemInputDto[];
}

export class RecordTransmittalResponseDto {
  @IsUUID() revisionId!: string;
  @Matches(/^[A-Z0-9][A-Z0-9_.-]{0,39}$/) responseCode!: string;
  @IsOptional() @IsString() @Length(1, 2000) responseNote?: string;
}

export class CreateExternalShareDto {
  @IsString() @Length(3, 400) purpose!: string;
  @IsISO8601() expiresAt!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => RecipientDto)
  recipients!: RecipientDto[];
  /** AC-089: watermarking stays on and downloading stays off unless explicitly relaxed. */
  @IsOptional() @IsBoolean() watermarkRequired?: boolean;
  @IsOptional() @IsBoolean() downloadAllowed?: boolean;
}

export class SignerDto {
  @IsString() @Length(1, 200) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) order!: number;
  @IsString() @Length(1, 100) role!: string;
}

export class StartSignatureEnvelopeDto {
  /** Records the intended provider only; no provider is contacted because none is contracted. */
  @IsString() @Length(2, 80) provider!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => SignerDto)
  signers!: SignerDto[];
}
