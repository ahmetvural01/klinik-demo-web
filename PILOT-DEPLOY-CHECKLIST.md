# Pilot Yayın Kontrol Listesi

Bu dosya, dağıtımla ilgili dağınık bilgiyi (README_DEPLOYMENT.md + bu denetim turunda eklenen script'ler) tek bir sıralı kontrol listesinde birleştirir. Render/Neon'a özgü platform detayları için README_DEPLOYMENT.md'ye bakın; bu liste platform bağımsız, sırayla uygulanacak adımları verir.

## 1. Zorunlu environment variable'lar

```text
NODE_ENV=production
APP_URL=https://<gerçek-domain>
DATABASE_URL=postgresql://...
JWT_SECRET=<güçlü, benzersiz>
FIELD_ENCRYPTION_KEY=<32 byte, base64>
SMTP_MASTER_PASSWORD=...
```

- `FIELD_ENCRYPTION_KEY` üretimi: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- **Bu turda eklendi:** `FIELD_ENCRYPTION_KEY` production'da tanımsızsa artık uygulama sessizce düz metin kaydetmiyor — hassas alan okuma/yazma işlemi doğrudan reddediliyor (bkz. `src/lib/field-crypto.ts`). Anahtar eksikse hasta kaydı/güncellemesi 500 ile başarısız olur; bu KASITLI bir güvenlik davranışıdır, "bug" değildir.
- Anahtar kaybolursa şifreli hasta alanları ve şifreli belgeler bir daha açılamaz — güvenli bir parola kasasında saklayın, ikinci bir kopyasını tutun.

Opsiyonel (kullanım durumuna göre): `REDIS_URL` (çoklu worker/gerçek zamanlı paylaşım için), `SMS_PROVIDER`/`NETGSM_*`, `DOCUMENT_STORAGE_PROVIDER` + `DOCUMENT_S3_*` (kalıcı belge depolama için — bkz. §8).

## 2. Migration deploy

```bash
npx prisma migrate deploy
```

- `prisma migrate reset`, `prisma migrate dev`, `prisma db push --force-reset` YASAK — bunlar veri kaybına yol açabilir.
- Render/benzeri platformlarda `start:render` (`scripts/start-render.mjs`) bunu her başlangıçta otomatik çalıştırır. Kendi altyapınızda manuel deploy ediyorsanız bu adımı `next start`'tan ÖNCE elle çalıştırın.

## 3. Fine-grained permission backfill (ZORUNLU, otomatik değil)

```bash
npm run backfill:fine-grained-permissions
```

- **`start:render` bu adımı OTOMATİK ÇALIŞTIRMAZ** — deploy'dan sonra elle çalıştırılmalı. Atlanırsa, daha önce en az bir kez kaydedilmiş bir Rol Yetkileri yapılandırması olan kurumlarda DOKTOR/ASISTAN/BANKO/MUHASEBE yeni ince taneli izinleri (appointments:delete, examinations:delete, installments:delete, dashboard:stats) kaybedebilir.
- Bu turda doğrulandı: script idempotent (aynı DB'de iki kez çalıştırıldı, ikincisinde "Tüm roller zaten güncel" dedi, hiçbir değişiklik yapmadı), tek atomik `upsert`, hata durumunda `exitCode=1` döner, hangi role'e ne eklendiğini loglar.

## 4. Production build

```bash
npm run build          # yerelde ensure-postgres + clean + next build
# veya platform-özel:
npm run build:render   # prisma generate + next build (Render için)
```

## 5. Health kontrolü

```bash
GET /health              # basit canlılık kontrolü, {"status":"ok"}
GET /api/system/health   # veritabanı bağlantısını da kontrol eder, hassas bilgi döndürmez
```

- Ayrıca `npm run preflight:prod` (`scripts/preflight-prod.ts`) zorunlu env değişkenlerini (`DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `FIELD_ENCRYPTION_KEY`) ve `/api/system/health`'i tek komutta doğrular; deploy sonrası çalıştırılması önerilir. `PREFLIGHT_BASE_URL` ile hedef URL verilebilir.

## 6. Seed / demo verilerinin production'da bulunmaması

**Dikkat — `npm run prisma:seed` yalnızca superadmin oluşturmaz.** `prisma/seed.ts` incelendi: aynı çalıştırmada ayrıca sahte bir "demo-klinik" kurumu, o kuruma bağlı bir YONETICI kullanıcısı ve `Setting` kaydı oluşturur/upsert eder (`DEMO_ADMIN_*`, `DEMO_INSTITUTION_*` env değişkenleriyle özelleştirilebilir ama devre dışı bırakılamaz). Pilot için:
- Seed'i SADECE ilk superadmin bootstrap amacıyla, bilerek çalıştırın.
- Çalıştırdıktan sonra oluşan demo kurumunu (`DEMO_INSTITUTION_NAME`, varsayılan `demo-klinik`) ve demo YONETICI kullanıcısını Süperadmin panelinden silin veya pasifleştirin — pilot müşteri verisiyle karışmasın.
- Gerçek pilot kliniği/kullanıcıları seed dışında, normal "Yeni Kurum" akışıyla oluşturulmalı.

## 7. İlk superadmin oluşturma yöntemi

`prisma/seed.ts` üzerinden, zorunlu env değişkenleriyle:

```bash
SUPERADMIN_PASSWORD=<güçlü parola> \
SUPERADMIN_IDENTITY=<11 haneli TC, varsayılan 00000000001> \
SUPERADMIN_FULL_NAME="Gerçek Ad Soyad" \
DEMO_ADMIN_PASSWORD=<seed'in gerektirdiği zorunlu değişken, superadmin'den bağımsız> \
npm run prisma:seed
```

- `DEMO_ADMIN_PASSWORD` seed script'inde `requireEnv` ile zorunlu kılınmış — superadmin'le ilgisi olmasa da tanımlanmazsa script tamamen başarısız olur.
- Seed idempotent: `identityNo + role=SUPERADMIN` eşleşen kayıt varsa upsert/update yapar, tekrar çalıştırmak yeni bir superadmin YARATMAZ.
- Bootstrap'tan sonra bu varsayılan şifreyi/parolayı hemen değiştirin (Süperadmin → Profil).
- Yukarıdaki §6'daki demo kurum temizliğini unutmayın.

## 8. Belge/dosya depolama

Mevcut yükleme akışı `data/uploads` yerel klasörüne yazıyor — kalıcı disk garantisi olmayan platformlarda (Render dahil) deploy/restart sonrası dosyalar kaybolabilir. Pilotta gerçek hasta belgesi/röntgen yüklenecekse `DOCUMENT_STORAGE_PROVIDER=S3` + `DOCUMENT_S3_*` değişkenleri ayarlanmalı (bkz. `scripts/preflight-prod.ts` bu kombinasyonu zaten doğruluyor). Not: hasta onam imzası (`PatientConsent.signatureDataUrl`) veritabanında saklanır, bu riskten ayrıdır.

## 9. Veritabanı yedekleme

```bash
npm run backup:db     # scripts/backup-postgres.mjs — .env'den DATABASE_URL okur, pg_dump ile yedek alır
```

- Pilot öncesi ve düzenli aralıklarla (ör. günlük cron) çalıştırılmalı.
- Migration veya destructive bir işlemden ÖNCE mutlaka manuel bir yedek alın — Prisma migration'ları için otomatik rollback yoktur.

## 10. Rollback adımları

- **Build başarısız:** Yeni sürüm ayağa kalkmaz, platform genelde önceki çalışan deploy'u korur — platform loglarını kontrol edin.
- **Migration başarısız:** `start:render` (veya eşdeğeri) başarısız olur, uygulama yeni sürümle başlamaz; veritabanı migration'ları otomatik geri alınmaz. Destructive migration varsa §9'daki yedeği kullanarak geri dönün.
- **Start/runtime hatası:** Platform loglarından teşhis edin, önceki deploy'a platform panelinden manuel rollback yapın.
- **Veritabanı geri dönüşü:** Prisma'da otomatik güvenli rollback yok — düzeltici yeni bir migration yazın veya §9 yedeğinden/platform'un point-in-time restore özelliğinden geri yükleyin.

## 11. Auth ve cookie güvenliği (otomatik, kontrol amaçlı)

`NODE_ENV=production` iken `klinik_token`, `klinik_ghost_token` ve rol-önizleme çerezleri otomatik olarak `secure: true`, `sameSite: lax`, `httpOnly: true` ile ayarlanır (bkz. `src/lib/auth.ts`). HTTPS arkasında çalıştığınızdan emin olun, aksi halde `secure` çerezler tarayıcıda hiç set edilmez ve kimse giriş yapamaz.

## 12. GitHub'a gönderilmemesi gerekenler (hatırlatma)

`.env`, gerçek `DATABASE_URL`/`JWT_SECRET`/`FIELD_ENCRYPTION_KEY`, yerel PostgreSQL dump'ları, hasta belgeleri/röntgenleri, gerçek hasta verisi — hepsi `.gitignore` kapsamında, ama push öncesi `git status` ile elle teyit edin.

---

Platform-özel (Render/Neon) build/start komutları, environment variable ekranı adımları ve dosya yükleme detayları için: [README_DEPLOYMENT.md](./README_DEPLOYMENT.md).
