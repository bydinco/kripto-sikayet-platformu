import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Exempts a route entirely from JwtAuthGuard: no token is read or required.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
