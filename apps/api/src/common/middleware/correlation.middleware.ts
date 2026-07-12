import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

interface CorrelatedRequest extends Request { correlationId: string }

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    const supplied = request.header('x-correlation-id');
    request.correlationId = supplied && supplied.length <= 100 ? supplied : randomUUID();
    response.setHeader('X-Correlation-Id', request.correlationId);
    next();
  }
}
