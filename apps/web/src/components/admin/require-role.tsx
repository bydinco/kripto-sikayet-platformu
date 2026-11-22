'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import type { Role } from '../../lib/api-models';
import type { Dictionary } from '../../dictionaries/types';
import type { Locale } from '../../lib/locale';

// The API already enforces every one of these roles via @Roles() guards;
// this is only a convenience so an unauthorized visitor doesn't see a panel
// full of 403s. Never the actual security boundary.
export function RequireRole({
  roles,
  locale,
  dictionary,
  children,
}: {
  roles: Role[];
  locale: Locale;
  dictionary: Dictionary;
  children: (accessToken: string) => ReactNode;
}) {
  const { status, user, accessToken } = useAuth();

  if (status === 'loading') return null;

  if (status !== 'authenticated' || !user || !accessToken || !roles.includes(user.role)) {
    return (
      <div className="card stack">
        <p>{dictionary.admin.unauthorized}</p>
        <Link href={`/${locale}/login`} className="button">
          {dictionary.auth.loginTitle}
        </Link>
      </div>
    );
  }

  return <>{children(accessToken)}</>;
}
