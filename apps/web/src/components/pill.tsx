import type { ReactNode } from 'react';

export type PillVariant = 'ok' | 'wa' | 'co' | 'ne' | 'ac';

export function Pill({ variant = 'ne', children }: { variant?: PillVariant; children: ReactNode }) {
  return <span className={`pill pill-${variant}`}>{children}</span>;
}
