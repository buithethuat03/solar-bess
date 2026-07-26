import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min
} from 'class-validator';
import {
  AlertType, NotificationPriority, NotificationSourceType, NotificationStatus
} from '../../../database/entities';

export class NotificationListQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsEnum(NotificationStatus) status?: NotificationStatus;
  @IsOptional() @IsEnum(NotificationPriority) priority?: NotificationPriority;
  @IsOptional() @IsEnum(NotificationSourceType) sourceType?: NotificationSourceType;
  @IsOptional() @IsEnum(AlertType) alertType?: AlertType;
  @IsOptional() @IsUUID() projectId?: string;
}
