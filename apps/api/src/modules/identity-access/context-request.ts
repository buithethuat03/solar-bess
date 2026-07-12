import type { Request } from 'express';
import type { AuthContext } from './auth.types';

export interface ContextRequest extends Request {
  correlationId: string;
  auth?: AuthContext;
}
