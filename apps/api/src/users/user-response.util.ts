import { User } from '@prisma/client';

type PublicFields = Omit<User, 'passwordHash' | 'emailVerificationToken'>;

// Always strips passwordHash/emailVerificationToken itself, regardless of
// whether the caller's Prisma query already omitted them (some call sites,
// e.g. login credential checks, must fetch passwordHash to verify it, so
// this cannot assume the input is already clean).
export function toUserResponse(user: User, viewerIsOwnerOrAdmin: boolean): Partial<PublicFields> {
  const { passwordHash: _passwordHash, emailVerificationToken: _evt, ...safe } = user;
  if (viewerIsOwnerOrAdmin) return safe;
  const { email: _email, ...publicFields } = safe;
  return publicFields;
}
