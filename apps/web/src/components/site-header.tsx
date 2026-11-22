'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { SUPPORTED_LOCALES, type Locale } from '../lib/locale';
import type { Dictionary } from '../dictionaries/types';

function withLocale(pathname: string, locale: Locale): string {
  const rest = pathname.split('/').slice(2).join('/');
  return `/${locale}${rest ? `/${rest}` : ''}`;
}

export function SiteHeader({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const pathname = usePathname() ?? `/${locale}`;
  const { status, user, logout } = useAuth();
  const isModerator = user?.role === 'MODERATOR' || user?.role === 'ADMIN';
  const isCatalogEditor = user?.role === 'EDITOR' || user?.role === 'ADMIN';

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href={`/${locale}`} style={{ fontWeight: 700 }}>
          {dictionary.siteName}
        </Link>
        <nav className="site-nav">
          <Link href={`/${locale}/entities`}>{dictionary.nav.entities}</Link>
          {status === 'authenticated' ? (
            <>
              <Link href={`/${locale}/reports/new`}>{dictionary.nav.submitReport}</Link>
              <Link href={`/${locale}/reports/mine`}>{dictionary.nav.myReports}</Link>
              {isModerator ? (
                <>
                  <Link href={`/${locale}/admin/reports`}>{dictionary.admin.nav.reports}</Link>
                  <Link href={`/${locale}/admin/notices`}>{dictionary.admin.nav.notices}</Link>
                </>
              ) : null}
              {isCatalogEditor ? <Link href={`/${locale}/admin/entities`}>{dictionary.admin.nav.entities}</Link> : null}
              <button type="button" className="button button-secondary" onClick={() => void logout()}>
                {dictionary.nav.logout}
              </button>
            </>
          ) : (
            <>
              <Link href={`/${locale}/login`}>{dictionary.nav.login}</Link>
              <Link href={`/${locale}/register`}>{dictionary.nav.register}</Link>
            </>
          )}
          <span className="row" aria-label="language">
            {SUPPORTED_LOCALES.map((l) => (
              <Link
                key={l}
                href={withLocale(pathname, l)}
                className="muted"
                aria-current={l === locale}
                style={{ fontWeight: l === locale ? 700 : 400 }}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </span>
        </nav>
      </div>
    </header>
  );
}
