import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

// JwtAuthGuard verifies the token if present and attaches req.user, but
// never throws 401 when it's missing or invalid: req.user stays undefined.
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
