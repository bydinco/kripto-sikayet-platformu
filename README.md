# Kripto Şikayet ve Risk Platformu

Global, kripto piyasasına özel şikayet ve risk skoru platformu. Ürün kararları,
hukuki çerçeve ve tam veritabanı şeması için bkz. proje notları
(`kripto-sikayet-platformu-notlar.md`).

Bu depo şu an sadece teknik temeli içeriyor: monorepo, veritabanı şeması,
boş NestJS modülleri ve bir Next.js iskeleti. Ödeme, blog/haber iş mantığı,
fenomen modülü, cüzdan imzası akışı, risk skoru algoritması ve tasarım
sonraki adımlar.

## Yapı

```
apps/
  api/      NestJS + Prisma + PostgreSQL
  web/      Next.js (App Router, [locale] route iskeleti)
packages/
  shared/   Uygulamalar arası ortak TypeScript tipleri
```

## Gereksinimler

- Node.js 20+
- pnpm (`corepack enable` veya `npm i -g pnpm`)
- Docker (sadece geliştirme veritabanı/Redis için)

## Kurulum

```bash
pnpm install

# .env dosyalarını örneklerden oluştur ve gerekirse portları düzenle
cp .env.example .env
cp apps/api/.env.example apps/api/.env

docker compose up -d        # Postgres (5434) ve Redis (6380)
pnpm --filter api exec prisma migrate dev

pnpm dev:api                # http://localhost:3001 (Swagger: /api/docs)
pnpm dev:web                # http://localhost:3002
```

Host portları (5434/6380/3001/3002) bu makinede çalışan diğer projelerle
çakışmaması için varsayılanlardan kaydırıldı; `.env` üzerinden değiştirilebilir.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `pnpm build` | Tüm paketleri derler |
| `pnpm lint` | Tüm paketlerde ESLint çalıştırır |
| `pnpm test` | Tüm paketlerde testleri çalıştırır |
| `pnpm prisma:validate` | Prisma şemasını doğrular |
| `pnpm prisma:migrate` | Yeni migration oluşturur/uygular |

## Kurallar (kod tabanı genelinde)

- Sistem otomatik "dolandırıcı/scam" ifadesi üretmez; risk seviyeleri şemadaki
  nötr etiketlerdir (`LOW`, `MEDIUM`, `HIGH_RISK_SIGNAL`, `CRITICAL_SIGNAL`,
  `INSUFFICIENT_DATA`).
- `Entity.verified` rozetü risk skorunu etkilemez.
- Gerçek anahtar/parola/canlı sunucu bilgisi commit edilmez, her şey `.env`
  üzerinden okunur.
