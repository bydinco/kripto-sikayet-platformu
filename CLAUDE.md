# Kripto Şikayet ve Risk Platformu

Global, kripto piyasasına özel şikayet + risk skoru platformu (Şikayetvar tarzı
hibrit: şikayet/yanıt/çözüm akışı + kanıt zorunluluğu + risk skoru). Ürün
kararları ve tam veritabanı şeması için bkz. proje notları
(`kripto-sikayet-platformu-notlar.md`, bu depo dışında).

## Çalışma kuralları

Bir görev "bitti" sayılmadan önce şunların hepsi yeşil olmalı:

- `pnpm lint` (tüm paketler + `e2e-smoke/`)
- `pnpm run typecheck`
- `pnpm test` (tüm paketlerin birim testleri)
- `pnpm --filter api test:e2e`
- `pnpm build` (tüm paketler)
- `pnpm test:smoke` (bkz. "Duman testleri (Playwright)")

Bunlardan biri çalıştırılmadıysa veya kırmızıysa görev bitmemiş kabul
edilir — "muhtemelen çalışır" yeterli değildir.

Test silinmez, `.skip`'lenmez, yorum satırına alınmaz veya gevşetilmez
(`--max-warnings` artırmak, bir assertion'ı zayıflatmak vb.) sırf
geçsin diye; bir test kırmızıysa kök nedeni düzeltilir. Bunun tek
istisnası: kullanıcının kendisi açıkça bir testin kaldırılmasını/
atlanmasını istemesi.

Arayüzü (web) etkileyen her değişiklik gerçek bir tarayıcıda denenir
(Claude in Chrome bağlıysa onunla, değilse en azından Playwright duman
testlerinin sürdüğü gerçek akışla — bkz. aşağıdaki bölüm); "derlendi/
typecheck geçti, o yüzden çalışıyor" tek başına yeterli değildir.

## Duman testleri (Playwright)

`e2e-smoke/` — kalıcı, tek komutla çalışan duman testi paketi:
`pnpm test:smoke` (kök dizinden). Kapsadığı akışlar: ana sayfa, kayıt/
giriş, şikayet formu (varlık ara/seç, kanıt ekle, `.jpg`/`.jpeg`/`.JPG`/
`.png` dosya yükleme, onay kutusu, gönder), moderatör incelemesi ve
yayınlama, anonim kullanıcı için yayınlanmış rapor + onaylı görsel,
onaysız dosyanın anonim için 404 vermesi, varlık sayfası.

- **Sadece ayrılmış test veritabanını (port 5435) kullanır, dev DB'ye
  (5434) hiç dokunmaz.** `playwright.config.ts`'in `webServer` adımı
  önce `apps/api/test/smoke-reset.ts`'i çalıştırır (aynı guarded
  `assertTestDatabaseUrl`/`truncateAllTables` — bkz. "e2e testleri"
  bölümü — artı `prisma/seed.ts`), sonra API'yi `NODE_ENV=test` ile
  başlatır.
- Her spec `e2e-smoke/fixtures.ts`'teki `test`/`watchPage`'i kullanır:
  **herhangi bir konsol hatası veya beklenmeyen 4xx/5xx yanıtı testi
  otomatik olarak başarısız eder** — her spec'in kendi başına bunu
  kurması gerekmez. Bu paketteki tek bilinçli 4xx (onaysız dosya), sayfa
  gezintisi/kaynak yüklemesi üzerinden değil, doğrudan `request.get(...)`
  ile kontrol edilir — o yüzden bu kurala hiç dokunmaz.
- `reuseExistingServer: false` kasıtlı: 3001/3002 portlarında halihazırda
  bir şey çalışıyorsa (örn. elle başlatılmış `pnpm dev:api`/`dev:web`)
  suit o sunucuya **asla** bağlanmaz, port çatışmasıyla gürültülü
  başarısız olur — sessizce yanlış (dev) sunucuya/veritabanına karşı
  çalışmaktan daha iyidir.
- `apps/api/src/main.ts` artık `app.module.ts`'teki
  `NODE_ENV === 'test' ? '.env.test' : '.env'` seçimini birebir
  yansıtıyor (önceden koşulsuz `import 'dotenv/config'` her zaman dev
  `.env`'i önce yüklüyordu ve dotenv zaten set edilmiş değişkenleri asla
  override etmediği için `.env.test`'in sonradan yüklenmesi sessizce
  hiçbir şey değiştirmiyordu). Bu, sadece vitest üzerinden `AppModule`'ü
  doğrudan import eden mevcut e2e paketinde hiç görünmeyen, gerçek
  sunucuyu (`nest start`) `NODE_ENV=test` ile çalıştırdığında ortaya
  çıkan gerçek bir hataydı — duman testi tam da bunun için değerli.

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
pnpm lint        # tüm paketler + e2e-smoke/
pnpm run typecheck
pnpm test        # tüm paketler (vitest)
pnpm --filter api test:e2e
pnpm test:smoke  # Playwright duman testi — bkz. "Duman testleri (Playwright)"
pnpm prisma:validate
pnpm prisma:migrate   # = migrate dev — SADECE dev, prod'da KULLANILMAZ
pnpm prisma:deploy    # = migrate deploy — prod/CI için, interaktif değil
```

Host portları (5434/6380/3001/3002) bu makinedeki diğer projelerle
çakışmaması için varsayılanlardan kaydırıldı; `.env` ile değiştirilebilir.
Dev `docker-compose.yml`'daki tüm portlar `127.0.0.1`'e sabitlenmiştir
(dışarıdan erişilemez). Prod için `docker-compose.prod.yml` (şablon,
bu depoda hiç çalıştırılmadı) — Postgres/Redis'i hiç port yayınlamadan
sadece iç ağda tutar, `POSTGRES_PASSWORD`/`REDIS_PASSWORD` zorunlu
(varsayılan yok), bkz. `docs/DEPLOY.md`.

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

## Rapor etkileşimi: faydalı oyu, "ben de yaşadım", yorum

`apps/api/src/engagement/` (top-level modül, `responses/` ile aynı
desende — `reports/`'daki `canView`/`isPublicStatus` kopyalarına
dokunmadan, kendi `report-visibility.util.ts`'i üzerinden doğrudan
`report-state-machine.ts`'teki `isPublicStatus`'u kullanır).

- **Faydalı oyu** (`ReportVote`, alan tek değer: `helpful` her zaman
  `true`): `POST /reports/:reportId/votes` idempotent (tekrar çağrı aynı
  satırı günceller, hata vermez), `DELETE /reports/:reportId/votes`
  kendi oyunu siler (yoksa 404).
- **"Ben de yaşadım"**: `ReportComment` satırı, `isMeToo: true`,
  `body` opsiyonel (boş string olabilir, en fazla 500 karakter).
  Kullanıcı başına rapor başına bir tane: `meTooReportId` (nullable
  `String`, me-too satırında `reportId` ile aynı değer, düz yorumlarda
  `null`) + `@@unique([meTooReportId, userId])` — Postgres `NULL`'ları
  ayrı saydığı için düz yorumlar hiç çarpışmaz. Kısmi indeks
  kullanılmadı (Prisma migration drift riski). `POST
  /reports/:reportId/me-too`, `DELETE /reports/:reportId/me-too`
  (satırı tamamen siler, soft-hide değil). **Karar:** ikinci "ben de
  yaşadım" isteği `409 Conflict` döner (votes'taki gibi idempotent
  DEĞİL) — geri almak için `DELETE` kullanılır; tutarlılık için her
  yerde bu kural geçerli.
- **Yorum**: `POST /reports/:reportId/comments` (`body`, 2-1000 karakter,
  trim edilir, en fazla 2 URL — fazlası 400), `GET
  /reports/:reportId/comments?limit=20&page=1` (`@OptionalAuth`, en çok
  50). Yanıt şekli: `{ id, body, isMeToo, createdAt, author: { handle },
  isReportAuthor }` — `userId`/`email`/iç alanlar asla dönmez. Liste
  hem düz yorumları hem me-too satırlarını `isMeToo` ile birlikte
  döner (aynı tablo, tek akış). Rapor sahibi kendi raporuna yorum
  yazabilir (`isReportAuthor: true`) ama oy/me-too veremez (403).
- **Silme/gizleme**: `ReportComment.removedAt`/`removedById`/
  `removedReason` (soft-hide, hard delete yok). Yazarın kendi yorumunu
  silmesi gerekçesiz (`removedReason: null`, `ModerationLog`'a hiç
  yazılmaz); MODERATOR/ADMIN başkasının yorumunu gizlerken gerekçe
  zorunlu (400 yoksa) ve `ModerationLog`'a `commentId` + yeni
  `ModerationAction.HIDE_COMMENT` ile kayıt düşülür. Kaldırılan yorumlar
  `GET /comments` listesinden ve `GET /engagement`'in sayımlarından
  (moderatör dahil, herkes için) tamamen çıkar — denetim izi
  `ModerationLog`'da kalır. Başkasının yorumunu silmeye çalışan normal
  kullanıcı 403, var olmayan/zaten gizli yorum 404.
- **Özet**: `GET /reports/:reportId/engagement` (`@OptionalAuth`) →
  `{ helpfulCount, meTooCount, commentCount, myHelpful, myMeToo }`.
  `commentCount` yalnızca `isMeToo: false` + gizlenmemiş satırları
  sayar; `meTooCount` me-too satırlarını. Giriş yoksa `my*` hep
  `false`. Web tarafı `myHelpful`/`myMeToo`'yu SSR'da hiç bilemez (SSR
  oturumu yok, bkz. "Auth mimarisi") — `ReportEngagement` bileşeni
  mount olduğunda kendi access token'ıyla bu uç noktayı tekrar çeker.
- **Yetki**: tüm yazma uçları login zorunlu (varsayılan guard), sadece
  `GET`'ler `@OptionalAuth`. Rapor `isPublicStatus` değilse (PENDING,
  NEEDS_EVIDENCE, REJECTED, REMOVED) herkese 404 — varlığı sızdırmaz
  (yazar/moderatör hâlâ görür, `canViewReport` üzerinden).
- **Throttle/kota**: oy ve me-too dakikada 20, yorum dakikada 5
  (`apps/api/src/engagement/engagement.constants.ts`, `@Throttle`
  burst kontrolü — `evidence-file.constants.ts` deseninde ama tüm
  sabitler bu dosyada). Günlük yorum kotası kullanıcı başına 30; hesap
  24 saatten yeniyse günlük 5 (`assertDailyQuota`, rolling 24s
  pencere). Kota aşımı `429` döner (burada evidence upload'ın 403
  tercihinden bilerek farklı — bu özellik için açık karar). Burst
  throttle'ın kendisi `NODE_ENV=test`'te global olarak skip edildiği
  için (`app.module.ts`) e2e'de test edilemez; kota ise
  `ThrottlerGuard`'a değil kendi servis mantığına bağlı olduğundan e2e
  ile test edilir (`test/comments.e2e-spec.ts`).
- **Revalidation**: her başarılı yazma (oy, me-too, yorum, silme/gizleme)
  sonrası `RevalidateService.revalidate({ tags: ['report:<reportId>'] })`
  — skor/entity tag'lerine gerek yok, sadece rapor sayfası değişir.
- **Risk skoru hiç etkilenmez**: oy/me-too/yorum `gatherInputs`'a/
  `RiskEngineInputs`'a asla girmez (manipülasyon riski). Statik
  kaynak-kontrolü testi: `scoring/risk-score-engagement-independence.spec.ts`;
  uçtan uca kanıt: `test/engagement-scoring-independence.e2e-spec.ts`
  (oy/me-too/yorum/gizleme sonrası `RiskScore` satırı birebir aynı
  kalıyor).
- **Web**: rapor detay sayfası engagement özetini ve yorum listesini
  sunucu tarafında aynı `report:<id>` tag'iyle çeker (ISR bozulmaz);
  etkileşim `ReportEngagement` (`apps/web/src/components/
  report-engagement.tsx`) istemci bileşeninde — optimistik güncelleme +
  hata durumunda geri alma. Admin rapor sayfasında her yorumun yanında
  "Gizle" + zorunlu gerekçe alanı (`HideCommentControl`,
  `admin-report-detail.tsx`).

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

## On-demand revalidation

Web'de `POST /api/revalidate` (`apps/web/src/app/api/revalidate/route.ts`):
`x-revalidate-secret` header'ı `REVALIDATE_SECRET`'a eşit olmalı (yoksa
500/401); body `{ paths?, tags? }`. API tarafı: `RevalidateService`
(`apps/api/src/revalidate/`) `${WEB_ORIGIN}/api/revalidate`'e POST atar,
**hiçbir zaman throw etmez** (sadece loglar) — ana işlemi (rapor geçişi,
model aktifleştirme, Notice kararı) asla bozmaz. `REVALIDATE_SECRET`
ayarlı değilse sessizce no-op (yerel/e2e'de varsayılan budur — `.env.test`
bilerek ayarlamaz).

Tag/path eşlemesi (web sayfaları `next: { tags: [...] }` ile fetch eder):

| Tag | Hangi sayfa(lar) | Ne zaman tetiklenir |
| --- | --- | --- |
| `report:<reportId>` | `/[locale]/reports/[id]` (tüm fetch'leri) | Rapor durum geçişi (özellikle REMOVED/RESTORE), çözüm onayı, o rapora bağlı Notice kararı |
| `entity:<slug>` | `/[locale]/entities/[slug]` — sadece slug'a göre yapılan ilk varlık fetch'i (entityId henüz bilinmiyor) | `recomputeScore` sonrası |
| `entity-id:<entityId>` | Varlık sayfasının entityId'ye göre alt fetch'leri (raporlar, skorlar) + rapor sayfasının skor fetch'i | `recomputeScore` sonrası, rapor durum geçişi, o varlığa bağlı Notice kararı |
| `scoring` | Varlık sayfasının skor fetch'i, rapor sayfasının skor fetch'i, ana sayfanın "en yüksek risk" fetch'i | Model aktifleştirme/pasifleştirme (tek tag ile, tek tek varlık saymadan) |
| `methodology` | `/[locale]/methodology` | Model aktifleştirme/pasifleştirme |
| `home` | `/[locale]` (ana sayfa, tüm fetch'leri) | Rapor durum geçişi, model aktifleştirme/pasifleştirme |

Notice'ın `entityId`'si varsa ama `reportId`'si yoksa (`NoticesService.update`),
revalidate'den önce Entity'den `slug` sorgulanır, böylece hem `entity-id:`
hem `entity:<slug>` tag'i aynı anda tetiklenir — varlık sayfasının ne üst
(slug'a göre) fetch'i ne de alt fetch'leri 600s'lik pencereyi beklemez.

## Piyasa fiyat verisi (CoinGecko)

**⚠️ Yayına çıkmadan önce CoinGecko'nun plan/kullanım koşullarını kontrol
et** — bu özellik ücretsiz Demo API'ye karşı yazıldı, ticari kullanım
koşulları bu depoda hiç doğrulanmadı.

Fiyat **risk skoruna hiç girmez** (`RiskEngineInputs`'ta fiyat alanı yok,
bkz. `risk-score-engine.spec.ts`'teki type-level test) — tamamen bilgi
amaçlı. Tek bir sunucu tarafı iş (`apps/api/src/market/
market-price-refresh.service.ts`) her `MARKET_REFRESH_INTERVAL_SECONDS`
(varsayılan 120sn) `/coins/markets`'ı tüm `Entity.status=ACTIVE` +
`Coin.coingeckoId` dolu coinler için TOPLU çeker, sonucu Redis'te tek bir
JSON snapshot olarak tutar (`MarketCache`, `market:prices:v1`); çoklu
instance'ta çift çalışmaya karşı Redis `SET NX PX` kilidi
(`market:refresh:lock`). 429/ağ hatasında eski veri korunur. Ziyaretçi
başına CoinGecko'ya istek **atılmaz**. `COINGECKO_API_KEY` boşsa özellik
tamamen kapalı: iş hiç çalışmaz, `GET /market/prices[/:entitySlug]` hep
boş/stale döner — sahte veri asla üretilmez. `MARKET_STALE_THRESHOLD_MINUTES`
(varsayılan 15) aşılan snapshot gizlenir. `NODE_ENV=test` iken periyodik
zamanlayıcı hiç başlamaz (testler `refreshNow()`'ı doğrudan çağırır).

`Coin.coingeckoId` ADMIN/EDITOR tarafından `PATCH /entities/:id` ile
düzenlenebilir (Coin profili yoksa sessizce no-op — profil oluşturma API'si
hâlâ yok, bkz. `recordContractAudit`). Web: `SiteHeader` altındaki fiyat
bandı ve varlık sayfasındaki "Piyasa" kutusu CoinGecko atıfı + yatırım
tavsiyesi olmadığı notunu taşır; ikisi de veri yoksa hiç render edilmez.

## Kanıt dosyası depolama (ekran görüntüsü yükleme)

`apps/api/src/storage/` arkasındaki `StorageProvider` arayüzü (`put`,
`getObject`, `delete`) iki driver'dan birine bağlanır (`STORAGE_DRIVER`
env'i): `local` (dev/test, `STORAGE_LOCAL_DIR` altında — web'in `public`
klasörü dışında, `.gitignore`'da) veya `s3` (Hetzner Object Storage/R2
gibi S3-uyumlu, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`).
**S3 driver'ı bu depoda hiç gerçek anahtarla/bucket'la test edilmedi** —
`s3-storage.provider.spec.ts` SDK client'ını mock'lar; prod'a çıkmadan
önce gerçek bir bucketla doğrulanmalı ve bucket **mutlaka özel (private)**
olmalı, asla herkese açık okuma izni verilmemeli.

Akış (`apps/api/src/evidence/files/`): `POST
/reports/:reportId/evidence/files` (multipart, tek dosya, sadece rapor
yazarı, sadece PENDING/NEEDS_EVIDENCE, rapor başına en fazla 5 dosya,
kullanıcı başına günlük kota) → tür dosya içeriğinden tespit edilir
(`file-type`, uzantı/Content-Type'a hiç güvenilmez) ve sadece PNG/JPEG/
WebP kabul edilir → `sharp` ile yeniden kodlanır (tüm EXIF/GPS metadata
ve polyglot/gömülü içerik silinir, `recode-image.ts`) → depolamaya
yazılır → `Evidence` satırı (`storageKey`/`mimeType`/`sizeBytes`/
`sha256`) oluşturulur. DB yazımı başarısız olursa depolanan dosya
silinir; depolama başarısız olursa hiç satır oluşturulmaz.
`storageKey` her zaman sunucu tarafında üretilir (`evidence/<uuid>.<ext>`
, `evidence-storage-key.ts`), kullanıcı dosya adından asla türetilmez.

`GET /evidence/:id/file` yetki kuralı (`evidence-file-access.service.ts`):
yazar/MODERATOR/ADMIN her zaman; başka herkes (anonim dahil) yalnızca
kanıt onaylı VE rapor herkese açık durumdaysa — aksi halde **404**
(mevcut `GET /evidence/:id` metadata uç noktası aynı durumda 403 döner;
dosya uç noktası bilerek 404'e çevirir, kanıtın varlığını hiç sızdırmaz).
Local driver'da dosya doğrudan akıtılır; S3'te 60 saniyelik imzalı URL'e
302 yönlendirilir. Moderatör onaysız bir dosyayı görüntülediğinde
`ModerationLog`'a `VIEW_EVIDENCE` kaydı düşülür.

v1 kapsamı: sadece statik görüntü (PNG/JPEG/WebP), dosya başına 5 MB.
**PDF ve video desteklenmiyor**, **virüs taraması yok** (ClamAV entegrasyonu
sonraki bir iş — bkz. "Henüz yapılmayanlar").

## Henüz yapılmayanlar

- SIWE / cüzdan imzası doğrulaması
- Kanıt dosyası yüklemede virüs taraması (ClamAV) — PDF/video desteği de yok
- E-posta doğrulama gönderimi/kontrolü
- Ödeme (Plan/Subscription şeması var, entegrasyon yok)
