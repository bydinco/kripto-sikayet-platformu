# Dağıtım notları (taslak)

Kısa bir runbook — henüz hiçbir gerçek VPS'e karşı çalıştırılmadı.
Buradaki her adım, mevcut kodun ne yaptığına (CLAUDE.md, env.validation.ts,
docker-compose.prod.yml şablonu) dayanıyor; hiçbir gerçek kimlik bilgisi
veya alan adı burada geçmiyor.

## Bekleyen kararlar

Aşağıdakiler henüz seçilmedi; bu adımlara bağımlı kısımlar işaretlendi:

- **Alan adı** — `WEB_ORIGIN`, `COOKIE_DOMAIN`, `NEXT_PUBLIC_API_URL`,
  `Content-Security-Policy`'deki API origin'i buna bağlı.
- **E-posta sağlayıcı** — şifre sıfırlama/e-posta doğrulama (CLAUDE.md'de
  "Henüz yapılmayanlar") bu seçime bağlı; henüz hiç yok.
- **Nesne depolaması** — `STORAGE_DRIVER=s3` bu depoda gerçek bir bucket'la
  hiç test edilmedi (CLAUDE.md). Seçilene kadar `local` driver ile tek-VPS'e
  bağımlı kalınır; bu durumda kanıt dosyalarının bulunduğu dizin de yedek
  kapsamına girmeli (sadece DB yedeği yeterli değil).

## Mimari: Docker Compose + Nginx + Let's Encrypt

Dev ortamı zaten Docker Compose kullanıyor; aynı modeli prod'a taşımak
(PM2 + çıplak Node süreçleri yerine) image tag'leriyle basit rollback ve
Dockerfile ile pin'li Node/pnpm sürümü sağlıyor.

- **Nginx** host üzerinde (compose dışında veya ayrı bir container), 80/443
  tek dış kapı; `docker-compose.prod.yml`'deki `api`/`web` servislerine
  (sadece `127.0.0.1:3001`/`127.0.0.1:3002`'ye yayınlanır) reverse proxy
  yapar. Postgres/Redis'e **hiç** port yayınlanmaz — sadece iç compose
  ağından erişilebilir.
- **TLS**: Let's Encrypt (certbot), 80→443 redirect.
- **Güvenlik duvarı**: ufw veya Hetzner Cloud Firewall — sadece 22 (mümkünse
  özel bir port)/80/443 açık; SSH key-only, parola girişi kapalı, fail2ban.
- **Gizli bilgi**: `apps/api/.env.production` ve `apps/web/.env.production`
  — **`apps/api/.env`/`apps/web/.env.local` değil**, onlar dev-only ve
  `docker-compose.prod.yml` onları hiç okumaz (bkz. o dosyadaki yorumlar).
  Host'ta `chmod 600`, git'e hiç girmez (`.gitignore`'da `.env.production`).
- **Log döndürme**: `docker-compose.prod.yml`'de her servis için
  `logging.driver: json-file`, `max-size: 10m`, `max-file: 5` zaten tanımlı.
- **Yedek**: `pg_dump` gecelik cron → sıkıştır → nesne depolamasına gönder
  (seçim bekliyor, yukarıda). `STORAGE_DRIVER=local` kullanılıyorsa kanıt
  dosyalarının bulunduğu dizin de yedek kapsamına girmeli.
- **İzleme**: Başlangıç için harici uptime kontrolü (gerçek bir health
  endpoint'ine — şu an yok, bkz. "Henüz yapılmayanlar") + Sentry (küçük
  efor, launch öncesi eklenmesi önerilir, henüz yok).
- **Staging**: Aynı compose yapısının küçük bir kopyası; prod'a uygulamadan
  önce migration'ları burada dene.

## İlk dağıtım adımları (sıralı)

1. VPS kur: SSH key-only, firewall (22/80/443), unattended-upgrades.
2. Docker + Docker Compose kur.
3. Repo'yu çek; `apps/api/.env.production` ve `apps/web/.env.production`'ı
   **elle** oluştur, gerçek rastgele değerlerle (`POSTGRES_PASSWORD`,
   `REDIS_PASSWORD`, `JWT_ACCESS_SECRET` — en az 32 karakter, env.validation
   zaten prod'da zayıf/placeholder değerleri reddediyor — `WEB_ORIGIN`,
   `COOKIE_DOMAIN` de prod'da zorunlu), `chmod 600`.
4. `docker compose -f docker-compose.prod.yml up -d postgres redis` —
   Postgres/Redis'i SADECE iç ağda başlat.
5. `pnpm prisma:deploy` (= `migrate deploy`) çalıştır — **`pnpm
   prisma:migrate` (= `migrate dev`) ASLA prod'a karşı çalıştırılmaz**,
   interaktif/dev-amaçlıdır.
6. İlk ADMIN hesabı için tek-seferlik, elle bir script/DB insert (API
   üzerinden rol yükseltme yolu kasıtlı olarak yok — bkz. CLAUDE.md "Rol
   yükseltme"). `pnpm --filter api seed:dev` **ASLA** prod'da çalıştırılmaz
   (kurgusal veri, zaten `NODE_ENV=production`'da reddediliyor).
7. `docker compose -f docker-compose.prod.yml up -d api web` (önce gerçek
   bir Dockerfile yazılmalı — şablon henüz placeholder).
8. Nginx + certbot ile TLS al; `SECURE_HEADERS_HTTPS=true` ile web'i
   **build et** (next.config.ts'nin `headers()`'ı build-time'da
   değerlendiriliyor, start-time'da değil — `SECURE_HEADERS_HTTPS` build'den
   önce set edilmeli).
9. Health/uptime/Sentry bağla (henüz hiçbiri yok, bkz. yukarı).
10. Staging'de `pnpm test:smoke` çalıştır; prod'a karşı **asla** (gerçek
    kullanıcı verisini silmez ama gerçek test hesapları/raporları oluşturur).
11. DNS'i yönlendir, go-live.

## Asla yapılmaz

- `prisma migrate reset` veya `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`
  prod'a karşı (bkz. CLAUDE.md "e2e testleri").
- `pnpm --filter api seed:dev` prod'da (zaten `NODE_ENV=production`'da
  reddediliyor).
- `docker-compose.prod.yml`'i gerçek değerler olmadan veya gözden
  geçirmeden `up` ile çalıştırmak.
- `apps/api/.env`/`apps/web/.env.local`'i prod'a kopyalamak — dev-only
  sırlar, prod kendi `.env.production` dosyalarını kullanır.
