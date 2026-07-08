# KlinikModern

KlinikSistem benzeri tum ana modulleri iceren modern full-stack klinik paneli.

## Icerik

- Giris / oturum yonetimi (JWT + HttpOnly cookie)
- Dashboard istatistikleri
- Randevu yonetimi
- Muayene ve tedavi kayitlari
- Hasta listesi, detay ve anamnez
- Finans, odeme ve gelir raporlari
- Personel ve rol yonetimi
- Fiyat listesi (TDB + Ozel)
- Islem kayitlari (audit log)
- Sistem ayarlari
- Profil ayarlari
- Destek talepleri

## Teknoloji

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zod

## Kurulum

1. Ortam dosyasini hazirla:

   - `.env.example` dosyasini `.env` olarak kopyala.

2. PostgreSQL baslat:

   - `docker compose up -d`

3. Bagimliliklari kur:

   - `npm install`

4. Prisma islemleri:

   - `npm run prisma:generate`
   - `npm run prisma:migrate -- --name init`
   - `npm run prisma:seed`

5. Uygulamayi calistir:

   - `npm run dev`

## Realtime Kurumsal Olcek

- Paylasimli realtime event-bus icin `REDIS_URL` tanimlayin (bkz. `.env.example`).
- Lokal Redis icin (Docker varsa): `docker compose up -d redis`
- 240 eszamanli kullanici realtime yuk testi:
   - `npm run loadtest:realtime:240`

## Gozlemlenebilirlik

- Saglik kontrolu: `/api/system/health`
- Yonetici metrikleri: `/api/system/metrics`

## Kalite Kapisi

- Tip kontrolu: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Temel smoke test: `npm run test:smoke`
- Entegrasyon kontrolu: `npm run test:integration`

## Queue Worker (SMS)

- Queue modunda SMS gonderimi: `POST /api/sms?mode=queue`
- Worker calistirma: `npm run worker:sms`

## Production Hazirlik

- Production env sablonu: `.env.production.example`
- Preflight kontrolu: `npm run preflight:prod`
- PM2 surec tanimi: `ecosystem.config.cjs`
- Go-live checklist: [docs/GO-LIVE-CHECKLIST.md](docs/GO-LIVE-CHECKLIST.md)
- Rollback runbook: [docs/ROLLBACK-RUNBOOK.md](docs/ROLLBACK-RUNBOOK.md)

## Redis Dogrulama

- Realtime Redis pub/sub kontrolu: `npm run verify:redis:realtime`

## Disaster Recovery

- Felaket kurtarma proseduru: [docs/DR-RUNBOOK.md](docs/DR-RUNBOOK.md)
- Backup proseduru: [docs/BACKUP-RUNBOOK.md](docs/BACKUP-RUNBOOK.md)

## Demo Giris

- Kurum: whitedental
- Kimlik: 11509380760
- Sifre: 10711453

Hızlı yerel demo: uygulama çalışırken giriş sayfasındaki "Demo başlat" butonuna tıklayın. Bu buton lokal ortamda `npm run prisma:seed` çalıştırır ve demo verilerini yükler (dev-only).

## Notlar

- Node.js 20+ gereklidir.
- Uretime cikarken `JWT_SECRET` degerini guclu bir degerle degistirin.
