import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../types/jwt-payload.interface.js';

// Undefined on routes marked @OptionalAuth() when no token was sent.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload | undefined => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
  return request.user;
});
