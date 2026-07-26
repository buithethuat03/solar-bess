import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsIn, IsInt, IsObject,
  IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min
} from 'class-validator';
import { ReportType, SavedViewTargetType } from '../../../database/entities';
import { SEARCH_RESULT_TYPES, type SearchResultType } from '../domain/search-query';

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class SearchRequestDto {
  @IsString() @Length(2, 200) query!: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ArrayUnique()
  @IsIn(SEARCH_RESULT_TYPES, { each: true })
  types?: SearchResultType[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

export class SavedViewListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(SavedViewTargetType) targetType?: SavedViewTargetType;
}

export class CreateSavedViewDto {
  @IsString() @Length(1, 200) name!: string;
  @IsEnum(SavedViewTargetType) targetType!: SavedViewTargetType;
  @IsOptional() @IsObject() filterSnapshot?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  @MaxLength(100, { each: true })
  columnSnapshot?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsObject({ each: true })
  sortSnapshot?: Record<string, unknown>[];
  /**
   * Accepted as free text on purpose: any value other than PRIVATE must surface as the recorded
   * 422 SHARE_SCOPE_NOT_SUPPORTED, not as an anonymous validation 400.
   */
  @IsOptional() @IsString() @MaxLength(40) shareScope?: string;
}

export class CreateReportJobDto {
  @IsEnum(ReportType) reportType!: ReportType;
  @IsUUID() projectId!: string;
}
