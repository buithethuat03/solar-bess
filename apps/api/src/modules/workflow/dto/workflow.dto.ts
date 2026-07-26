import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID,
  Length, Matches, Max, MaxLength, Min
} from 'class-validator';
import {
  WorkflowDecision, WorkflowDefinitionStatus, WorkflowInstanceState, WorkflowObjectType
} from '../../../database/entities';

class PageQueryDto {
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class WorkflowDefinitionListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(WorkflowObjectType) objectType?: WorkflowObjectType;
  @IsOptional() @IsEnum(WorkflowDefinitionStatus) status?: WorkflowDefinitionStatus;
}

export class PublishWorkflowVersionDto {
  @IsUUID() workflowVersionId!: string;
  /** Guards against publishing a draft that changed since the reviewer last read it. */
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @Length(3, 2000) comment!: string;
}

export class StartWorkflowInstanceDto {
  @IsUUID() workflowDefinitionId!: string;
  @IsEnum(WorkflowObjectType) objectType!: WorkflowObjectType;
  @IsUUID() objectId!: string;
}

export class ApprovalTaskListQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(WorkflowInstanceState) state?: WorkflowInstanceState;
  @IsOptional() @IsEnum(WorkflowObjectType) objectType?: WorkflowObjectType;
  @IsOptional() @IsUUID() projectId?: string;
}

export class RecordApprovalDecisionDto {
  @IsEnum(WorkflowDecision) decision!: WorkflowDecision;
  @Matches(/^[A-Z0-9][A-Z0-9_.-]{1,79}$/) stepKey!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  /** AC-070: every decision carries a justification, including an approval. */
  @IsString() @Length(3, 2000) comment!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsObject({ each: true })
  conditions?: Record<string, unknown>[];
}

export class CancelWorkflowInstanceDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @Length(3, 2000) reason!: string;
}
