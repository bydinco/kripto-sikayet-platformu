import type { Metadata } from 'next';
import { SUPPORTED_LOCALES, type Locale } from './locale';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002';

export interface BuildMetadataArgs {
  locale: Locale;
  /** Path WITHOUT the locale prefix, e.g. "/entities/demo-coin-a" ("" for home). */
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
}

export function buildMetadata({ locale, path, title, description, noindex = false }: BuildMetadataArgs): Metadata {
  const languages: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    languages[l] = `${SITE_URL}/${l}${path}`;
  }

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}${path}`,
      languages,
    },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}
