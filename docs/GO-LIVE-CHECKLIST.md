# Go-Live Checklist

## 1) Ortam Hazirligi
1. `.env.production.example` baz alinarak production env dosyasi hazirlandi.
2. `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `APP_URL` dolduruldu.
3. PostgreSQL backup ve WAL politikasi aktif (bkz. [BACKUP-RUNBOOK.md](BACKUP-RUNBOOK.md)).
4. Redis erisimi dogrulandi.

## 2) Build ve Migrasyon
1. `npm ci`
2. `npm run prisma:generate`
3. `npx prisma migrate deploy`
4. `npm run build`

## 3) Release Oncesi Dogrulama
1. `npm run preflight:prod`
2. `npm run test:smoke`
3. `npm run test:integration`
4. `npm run verify:redis:realtime`

## 4) Servis Baslatma
1. `pm2 start ecosystem.config.cjs`
2. `pm2 save`
3. `pm2 status`

## 5) Go-Live Sonrasi Kontrol
1. `/api/system/health` 200 donuyor.
2. `/api/system/metrics` yonetici hesabi ile erisilebilir.
3. `/api/system/alerts` kritik alarm uretmiyor.
4. Login, hasta, randevu, gorevler, hasta takip akislari manuel kontrol edildi.
5. SMS queue worker aktif ve backlog yok.

## 6) Rollback Kriteri
1. Health endpoint 5 dakika boyunca bozuksa.
2. API hata orani kabul esigini asarsa.
3. Kritik veri yazma akislari bozulursa.
4. Realtime senkron klinik operasyonunu etkiliyorsa.

Rollback adimlari icin [docs/ROLLBACK-RUNBOOK.md](docs/ROLLBACK-RUNBOOK.md) kullanin.