import { Type } from 'class-transformer';
import {
  Allow, ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID,
  Length, Matches, Max, MaxLength, Min, ValidateNested
} from 'class-validator';

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

/** API-009 offers exactly the scope kinds an administrator may grant; PORTFOLIO stays out of V1. */
export const ROLE_ASSIGNMENT_SCOPE_TYPES = ['TENANT', 'PROJECT', 'PACKAGE'] as const;
export type RoleAssignmentScopeType = (typeof ROLE_ASSIGNMENT_SCOPE_TYPES)[number];

export class CreateRoleAssignmentDto {
  @IsUUID() userAccountId!: string;
  @IsUUID() roleId!: string;
  @IsIn(ROLE_ASSIGNMENT_SCOPE_TYPES) scopeType!: RoleAssignmentScopeType;
  @IsOptional() @IsUUID() scopeId?: string;
  /** Defaults to "now"; an explicit window must be internally consistent. */
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveTo?: string;
}

class DelegationScopeDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50)
  @Matches(/^[A-Z0-9][A-Z0-9_.-]{1,79}$/, { each: true })
  workflowDefinitionCodes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID(undefined, { each: true })
  projectIds?: string[];
}

export class CreateDelegationDto {
  @IsUUID() delegateId!: string;
  @IsOptional() @ValidateNested() @Type(() => DelegationScopeDto) scope?: DelegationScopeDto;
  @IsISO8601() effectiveFrom!: string;
  @IsISO8601() effectiveTo!: string;
  @IsString() @Length(3, 2000) reason!: string;
  /**
   * Deliberately whitelisted so the global `forbidNonWhitelisted` pipe does not swallow it as a
   * generic 400: the service refuses it with the recorded 422 VALUE_LIMIT_NOT_SUPPORTED, because a
   * stored monetary cap nothing enforces would be a fake control.
   */
  @Allow() valueLimit?: unknown;
}

export class RevokeDelegationDto {
  @IsOptional() @IsString() @Length(3, 2000) reason?: string;
}

export class AuditEventListQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @Length(1, 80) objectType?: string;
  @IsOptional() @IsUUID() objectId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsString() @Length(1, 80) action?: string;
  @IsOptional() @IsISO8601() occurredFrom?: string;
  @IsOptional() @IsISO8601() occurredTo?: string;
}
