# Kripto Şikayet ve Risk Platformu

Global, kripto piyasasına özel şikayet + risk skoru platformu (Şikayetvar tarzı
hibrit: şikayet/yanıt/çözüm akışı + kanıt zorunluluğu + risk skoru). Ürün
kararları ve tam veritabanı şeması için bkz. proje notları
(`kripto-sikayet-platformu-notlar.md`, bu depo dışında).

## Yığın ve klasör yapısı

```
apps/
  api/      NestJS + Prisma 7 + PostgreSQL (vitest)
  web/      Next.js 16 (App Router, [locale]), React 19
packages/
  shared/   Uygulamalar arası ortak TypeScript tipleri
```

pnpm workspace monorepo (`pnpm-workspace.yaml`). Node >= 20, pnpm 12.

## Komutlar

```bash
docker compose up -d                        # Postgres (5434), Redis (6380)
pnpm --filter api exec prisma migrate dev    # migration
pnpm --filter api seed:dev                   # kurgusal örnek veri (sadece dev)

pnpm dev:api     # http://localhost:3001 (Swagger: /api/docs)
pnpm dev:web     # http://localhost:3002

pnpm build       # tüm paketler
pnpm lint        # tüm paketler
pnpm test        # tüm paketler (vitest)
pnpm --filter api test:e2e
pnpm prisma:validate
pnpm prisma:migrate
```

Host portları (5434/6380/3001/3002) bu makinedeki diğer projelerle
çakışmaması için varsayılanlardan kaydırıldı; `.env` ile değiştirilebilir.

## Değişmez kurallar

- Sistem hiçbir yerde otomatik "scam/dolandırıcı" demez. Risk seviyeleri
  nötr etiketlerdir: `LOW`, `MEDIUM`, `HIGH_RISK_SIGNAL`, `CRITICAL_SIGNAL`,
  `INSUFFICIENT_DATA` (`RiskLevel` enum).
- `Entity.verified` rozeti kimlik doğrulamasıdır, risk skorunu asla etkilemez.
- Şikayet itirazla (`DISPUTED`) gizlenmez; yalnızca moderatör/admin
  `REMOVED`'a taşıyabilir.
- `ReportStatus` görünürlüğü: `PUBLISHED`/`DISPUTED`/`RESOLVED` herkese açık
  (`PUBLIC_REPORT_STATUSES`, `apps/api/src/reports/report-state-machine.ts`).
  `PENDING`/`NEEDS_EVIDENCE`/`REJECTED`/`REMOVED` yalnızca şikayetin yazarına
  ve MODERATOR/ADMIN'e görünür.
- Seed verisi (`apps/api/prisma/seed.ts`) tamamen kurgusal ("Demo Coin A" vb.),
  gerçek proje adı kullanılmaz; `NODE_ENV=production` veya localhost dışı
  `DATABASE_URL`'de seed reddedilir.
- Gerçek anahtar/parola/sunucu bilgisi commit edilmez; her şey `.env` üzerinden
  okunur (`.env`, `.env.local` vb. `.gitignore`'da).

## Auth mimarisi

- Parola: argon2id (`argon2.hash(..., { type: argon2.argon2id })`).
- Access token: JWT, `JWT_ACCESS_TTL` varsayılan 15 dakika; yalnızca yanıt
  body'sinde döner, web tarafında sadece bellekte tutulur (React state/ref,
  `apps/web/src/lib/auth-context.tsx`) — localStorage/cookie'ye yazılmaz.
- Refresh token: rotating, httpOnly + `sameSite=lax` cookie (`path=/auth`),
  varsayılan 30 gün (`REFRESH_TOKEN_TTL_DAYS`). Sadece hash'i DB'de tutulur.
- Zaten iptal edilmiş bir refresh token'ın 10 saniye içinde tekrar kullanımı
  (`REUSE_GRACE_WINDOW_MS`) iki sekme arası yarış kabul edilir, sadece 401
  döner; 10 saniyeden sonraki tekrar kullanım çalıntı token kabul edilir ve
  kullanıcının tüm oturumları iptal edilir (`auth.service.ts`).
- Login/register `@nestjs/throttler` ile sınırlı (5 istek/60 sn).
- E-posta doğrulama alanları şemada var ama gönderim/kontrol henüz yok (TODO).

## Durum makinesi (`Report.status`)

`apps/api/src/reports/report-state-machine.ts` tek doğruluk kaynağıdır:

- Geçişler `REPORT_TRANSITIONS` ile sabit; `REMOVED → PUBLISHED` (restore) ve
  `REJECTED → PENDING` (reopen) yalnızca ADMIN'e açık (`ADMIN_ONLY_TRANSITIONS`).
- Her geçiş `ReportStatusHistory`'e yazılır (actor, actorType, reason, from/to) —
  kim tetiklediğine bakılmaksızın tam denetim izi.
- `ModerationLog` daha dar kapsamlıdır: sadece zorunlu gerekçeli, formel
  moderatör/admin kararları.

## Henüz yapılmayanlar

- Moderasyon paneli (AdminJS/Refine vb. henüz yok)
- Risk skoru motoru (şema `RiskModel`/`RiskScore`/`RiskScoreFactor` var,
  hesaplama mantığı yok)
- SIWE / cüzdan imzası doğrulaması
- Dosya yükleme (Evidence.fileUrl alanı var, yükleme akışı yok)
- E-posta doğrulama gönderimi/kontrolü
- Ödeme (Plan/Subscription şeması var, entegrasyon yok)
