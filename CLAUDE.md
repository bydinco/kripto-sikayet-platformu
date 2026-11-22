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

## e2e testleri — ayrı test veritabanı

`pnpm --filter api test:e2e` **asla** dev DB'ye (5434) dokunmaz. Önce
`docker compose up -d postgres_test` (port 5435, db `kripto_sikayet_test`),
sonra `apps/api/.env.test`'teki `DATABASE_URL` kullanılır
(`apps/api/src/app.module.ts`, `NODE_ENV=test` iken `.env.test` yükler).
`apps/api/test/global-setup.e2e.ts` her çalıştırmada: (1) `DATABASE_URL`
hem "_test" içermeli hem 5435 portunda olmalı yoksa hata verir
(`test/reset-test-db.ts`'teki `assertTestDatabaseUrl`, kendi unit testi
var), (2) `prisma migrate deploy` (yıkıcı değil, şemayı günceller), (3)
tüm tabloları `TRUNCATE ... RESTART IDENTITY CASCADE` ile boşaltır. **Asla
`prisma migrate reset` veya `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`
kullanılmaz** — Prisma'nın kendi AI-ajan güvenlik kontrolü `migrate
reset`i engeller, kullanıcı bunun yerine truncate'i tercih etti. 16 dosya
`fileParallelism: false` ile sırayla çalışır (paylaşılan tek test DB'si).

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
- `session_hint` cookie'si (httpOnly değil, `path=/`, aynı ömürle refreshToken
  ile birlikte set edilir): web tarafı bunu görmeden `/auth/refresh` denemez,
  böylece anonim ziyaretçi/bot gereksiz 401 almaz (`auth-context.tsx`).
- `COOKIE_DOMAIN` (opsiyonel env, hem refreshToken hem session_hint için):
  boşsa host-only (yerel geliştirmede api/web ikisi de "localhost" olduğu
  için yeterli — cookie'ler portu ayırt etmez). Üretimde api ve web ayrı alt
  alan adında olacağından, `session_hint`'in web alt alan adında
  `document.cookie` ile görünebilmesi için ortak üst alan adına
  (`example.com`) ayarlanmalı.

## Durum makinesi (`Report.status`)

`apps/api/src/reports/report-state-machine.ts` tek doğruluk kaynağıdır:

- Geçişler `REPORT_TRANSITIONS` ile sabit; `REMOVED → PUBLISHED` (restore) ve
  `REJECTED → PENDING` (reopen) yalnızca ADMIN'e açık (`ADMIN_ONLY_TRANSITIONS`).
- Her geçiş `ReportStatusHistory`'e yazılır (actor, actorType, reason, from/to) —
  kim tetiklediğine bakılmaksızın tam denetim izi.
- `ModerationLog` daha dar kapsamlıdır: sadece zorunlu gerekçeli, formel
  moderatör/admin kararları.

## Moderasyon ve katalog paneli

`apps/web/src/app/[locale]/admin/` altında: `reports` (durum filtreli
kuyruk, kanıt onay/ret, geçiş formu — MODERATOR/ADMIN), `notices` (hukuki
bildirim kararı — MODERATOR/ADMIN), `entities` (varlık oluştur/düzenle,
link ekle/sil — EDITOR/ADMIN). Sayfalar `noindex`; asıl yetki kontrolü API
tarafındaki `@Roles()` guard'larında, arayüzdeki rol kontrolü sadece UX.

## Risk skoru motoru

`apps/api/src/scoring/risk-score-engine.ts`: saf, deterministik
`computeRiskScore(model, inputs)`. Veri eksikse faktör atlanır, confidence
düşer; confidence < 40 (taslak eşik) → `INSUFFICIENT_DATA`, `score: null`
(DB'de nullable, API sayı sızdırmaz). `Entity.verified` input tipinde hiç
yer almaz. `ScoringService.recomputeScore` her zaman o varlık türünün en
güncel `RiskModel` versiyonunu kullanır (active olsun olmasın — aktiflik
sadece public görünürlüğü etkiler); model yoksa sessiz no-op.
`safeRecomputeScore` hiç throw etmez, sadece loglar (rapor/yanıt/kanıt
akışını bozmaz). Tetikleyiciler: rapor durum geçişi, çözüm onayı, marka
yanıtı, kanıt onay/ret, yeni `ContractAudit` (`POST
/entities/:id/contract-audits`), + günlük `@nestjs/schedule` cron
(Postgres advisory lock ile tekilleştirilir). Model aktifleştirme/
pasifleştirme: `PATCH /scoring/models/:id` (ADMIN). Seed'deki v1 ağırlıkları
taslaktır, kalibre edilmemiştir.

## Henüz yapılmayanlar

- SIWE / cüzdan imzası doğrulaması
- Dosya yükleme (Evidence.fileUrl alanı var, yükleme akışı yok)
- E-posta doğrulama gönderimi/kontrolü
- Ödeme (Plan/Subscription şeması var, entegrasyon yok)
