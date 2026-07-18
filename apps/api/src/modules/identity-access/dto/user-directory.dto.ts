import { Transform, Type } from 'class-transformer';
import {
  IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (
  typeof value === 'string' ? value.trim() : value
);

export class UserAssigneeQueryDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  packageId?: string;

  @IsIn(['riskChange.read', 'riskChange.manage'])
  requiredPermission!: 'riskChange.read' | 'riskChange.manage';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

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
