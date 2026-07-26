import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { DocumentControlService } from './document-control.service';
import {
  ApproveRevisionDto, CreateDocumentDto, CreateExternalShareDto, CreateReviewCommentDto,
  CreateUploadSessionDto, DocumentDetailQueryDto, DocumentListQueryDto,
  FinalizeUploadSessionDto, IssueRevisionDto,
  IssueTransmittalDto, RecordTransmittalResponseDto, StartSignatureEnvelopeDto,
  SubmitRevisionReviewDto
} from './dto/document-control.dto';

/**
 * US-005/US-019 (API-039…API-052). Routes that carry a `{projectId}` get a project-scoped
 * pre-filter from `PermissionGuard`; the rest can only be pre-filtered at tenant level, so the real
 * project/package ABAC is resolved inside the service from the register row that owns the record.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class DocumentControlController {
  constructor(private readonly service: DocumentControlService) {}

  @Get('projects/:projectId/documents')
  @RequirePermission('document.read', 'PROJECT')
  async listDocuments(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: DocumentListQueryDto
  ) {
    return this.collection(
      await this.service.listDocuments(this.context(request), projectId, query), request
    );
  }

  @Post('projects/:projectId/documents')
  @RequirePermission('document.create', 'PROJECT')
  async createDocument(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateDocumentDto
  ) {
    return this.resource(await this.service.createDocument(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('documents/:documentId')
  @RequirePermission('document.read')
  async getDocument(
    @Req() request: ContextRequest,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Query() query: DocumentDetailQueryDto
  ) {
    return {
      ...await this.service.getDocument(this.context(request), documentId, query),
      correlationId: request.correlationId
    };
  }

  @Post('documents/:documentId/upload-sessions')
  @RequirePermission('documentRevision.upload')
  async createUploadSession(
    @Req() request: ContextRequest,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateUploadSessionDto
  ) {
    return this.resource(await this.service.createUploadSession(
      this.context(request), documentId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('upload-sessions/:uploadSessionId\\:finalize')
  @HttpCode(200)
  @RequirePermission('documentRevision.upload')
  async finalizeUploadSession(
    @Req() request: ContextRequest,
    @Param('uploadSessionId', new ParseUUIDPipe()) uploadSessionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: FinalizeUploadSessionDto
  ) {
    return this.resource(await this.service.finalizeUploadSession(
      this.context(request), uploadSessionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('document-revisions/:revisionId')
  @RequirePermission('documentRevision.read')
  async getRevision(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string
  ) {
    return {
      ...await this.service.getRevision(this.context(request), revisionId),
      correlationId: request.correlationId
    };
  }

  @Post('document-revisions/:revisionId\\:submit-review')
  @HttpCode(200)
  @RequirePermission('documentRevision.submitReview')
  async submitReview(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SubmitRevisionReviewDto
  ) {
    return this.resource(await this.service.submitRevisionReview(
      this.context(request), revisionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('document-revisions/:revisionId/comments')
  @RequirePermission('documentComment.create')
  async createComment(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateReviewCommentDto
  ) {
    return this.resource(await this.service.createReviewComment(
      this.context(request), revisionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('document-revisions/:revisionId\\:approve')
  @HttpCode(200)
  @RequirePermission('documentRevision.approve')
  async approveRevision(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ApproveRevisionDto
  ) {
    return this.resource(await this.service.approveRevision(
      this.context(request), revisionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('document-revisions/:revisionId\\:issue')
  @HttpCode(200)
  @RequirePermission('documentRevision.issue')
  async issueRevision(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: IssueRevisionDto
  ) {
    return this.resource(await this.service.issueRevision(
      this.context(request), revisionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/transmittals')
  @RequirePermission('transmittal.issue', 'PROJECT')
  async issueTransmittal(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: IssueTransmittalDto
  ) {
    return this.resource(await this.service.issueTransmittal(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('transmittals/:transmittalId/responses')
  @RequirePermission('transmittal.respond')
  async recordTransmittalResponse(
    @Req() request: ContextRequest,
    @Param('transmittalId', new ParseUUIDPipe()) transmittalId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RecordTransmittalResponseDto
  ) {
    return this.resource(await this.service.recordTransmittalResponse(
      this.context(request), transmittalId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('document-revisions/:revisionId/external-shares')
  @RequirePermission('documentShare.create')
  async createExternalShare(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateExternalShareDto
  ) {
    return this.resource(await this.service.createExternalShare(
      this.context(request), revisionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('document-revisions/:revisionId/signature-envelopes')
  @RequirePermission('documentSignature.start')
  async startSignatureEnvelope(
    @Req() request: ContextRequest,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: StartSignatureEnvelopeDto
  ) {
    return this.resource(await this.service.startSignatureEnvelope(
      this.context(request), revisionId, input, this.idempotencyKey(key)
    ), request);
  }

  private context(request: ContextRequest) {
    return { ...request.auth!, correlationId: request.correlationId };
  }

  private resource<T>(data: T, request: ContextRequest) {
    return { data, correlationId: request.correlationId };
  }

  private collection<T>(
    result: { items: T[]; meta: { nextCursor: string | null; limit: number } },
    request: ContextRequest
  ) {
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  private idempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key phải có từ 8 đến 200 ký tự', retryable: false
      });
    }
    return key;
  }
}
