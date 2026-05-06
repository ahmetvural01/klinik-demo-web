# Rollback Runbook

## 1) Ne Zaman Rollback?
1. Health endpoint 503 donuyor.
2. Login veya veri yazma akislari kritik olarak bozuk.
3. Realtime/SMS queue sistemi operasyonu aksatiyor.

## 2) Hizli Rollback
1. Trafik bakim moduna alin veya load balancer ile yeni release'i kesin.
2. Son stabil release'e donun.
3. `pm2 restart ecosystem.config.cjs --only klinik-modern-web,klinik-modern-sms-worker`
4. `npm run test:smoke`
5. `npm run test:integration`

## 3) Veri Katmani
1. Prisma migrate deploy sonrasinda problem varsa son stabil build ile devam edin.
2. Veri tutarsizligi varsa [docs/DR-RUNBOOK.md](docs/DR-RUNBOOK.md) adimlarini izleyin.

## 4) Dogrulama
1. `/api/system/health` 200
2. Login calisiyor
3. Randevu/Hasta/Gorev yazma akislari calisiyor
4. Queue worker loglari temiz