import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from './access.guard';
import type { ContextRequest } from './context-request';
import { UserAssigneeQueryDto } from './dto/user-directory.dto';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';
import { UserDirectoryService } from './user-directory.service';

@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class UserDirectoryController {
  constructor(private readonly directory: UserDirectoryService) {}

  @Get('users')
  @RequirePermission('user.read')
  async list(@Req() request: ContextRequest, @Query() query: UserAssigneeQueryDto) {
    const result = await this.directory.listAssignees({
      ...request.auth!, correlationId: request.correlationId
    }, query);
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor, limit: result.limit },
      correlationId: request.correlationId
    };
  }
}
