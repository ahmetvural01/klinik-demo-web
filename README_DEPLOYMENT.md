# Render + Neon Demo Deployment Rehberi

Bu rehber, projeyi yerel geliştirme ortamına zarar vermeden GitHub üzerinden Render Web Service üzerinde, Neon PostgreSQL veritabanı ile geçici demo/test ortamı olarak yayınlamak için hazırlanmıştır.

Gerçek hasta verisi, yerel `.env`, yerel PostgreSQL veritabanı, upload dosyaları ve gizli anahtarlar GitHub veya Neon demo ortamına taşınmamalıdır.

## 1. Proje Özeti

- Framework: Next.js 14 App Router
- Frontend: React 18, Tailwind CSS
- Backend: Next.js API Routes
- Veritabanı: PostgreSQL
- ORM: Prisma
- Package manager: npm
- Monorepo: Hayır, tek Next.js uygulaması
- Node.js: 20.x
- Realtime: Server-Sent Events, opsiyonel Redis pub/sub
- Queue/background job: SMS için opsiyonel Redis queue ve `worker:sms`
- Dosya yükleme: `data/uploads` yerel klasörü

## 2. Render Ayarları

Root Directory:

```text
.
```

Build Command:

```bash
npm ci && npm run build:render
```

Start Command:

```bash
npm run start:render
```

Health Check Path:

```text
/health
```

Render start komutu uygulama başlangıcında yalnızca güvenli production migration komutu olan `prisma migrate deploy` çalıştırır ve ardından Next.js sunucusunu `0.0.0.0` üzerinde başlatır.

## 3. Neon PostgreSQL

Neon üzerinde yeni bir proje ve boş PostgreSQL database oluşturun. Yerel veritabanı dump'ı yüklemeyin.

Render `DATABASE_URL` değeri Neon connection string olmalıdır:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&schema=public
```

Bu proje şu anda Prisma schema içinde `directUrl` kullanmıyor. Demo ortamında Neon'un direct connection string'i `DATABASE_URL` olarak kullanılmalıdır. Neon pooled URL kullanılırsa migration tarafında ayrıca direct connection gerekebilir; bu durumda schema değişikliği yapılmadan önce ayrıca değerlendirilmelidir.

## 4. Render Environment Variables

Gerçek değerleri sadece Render Environment ekranına girin.

Zorunlu:

```text
NODE_ENV=production
APP_URL=https://RENDER-SERVICE.onrender.com
DATABASE_URL=postgresql://...
JWT_SECRET=...
FIELD_ENCRYPTION_KEY=...
SMTP_MASTER_PASSWORD=...
```

Önerilen/opsiyonel:

```text
SUPERADMIN_MASTER_SECRET=
SMS_PROVIDER=NETGSM
NETGSM_USERCODE=
NETGSM_PASSWORD=
NETGSM_HEADER=
REDIS_URL=
SMS_QUEUE_KEY=ks:sms:jobs
DEMO_PASSWORD=
```

`FIELD_ENCRYPTION_KEY` üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Bu anahtar kaybolursa şifreli hasta alanları ve şifreli belge dosyaları geri açılamaz. Güvenli bir parola kasasında saklayın.

## 5. GitHub Hazırlığı

`.env`, `.env.production`, upload klasörleri, database dump dosyaları, loglar ve credential dosyaları `.gitignore` kapsamındadır.

GitHub'a gönderilecek dosyalar:

```bash
git add .
git commit -m "Prepare Render and Neon demo deployment"
git push
```

GitHub'a gönderilmemesi gerekenler:

- Gerçek `.env`
- Gerçek Neon connection string
- Gerçek JWT veya encryption secret
- Yerel PostgreSQL dump/yedekleri
- Hasta belgeleri ve röntgen dosyaları
- Gerçek hasta verisi

## 6. Migration Yöntemi

Production/demo migration komutu:

```bash
prisma migrate deploy
```

Kullanılmaması gereken komutlar:

```bash
prisma migrate reset
prisma migrate dev
prisma db push --force-reset
```

Render `start:render` komutu migration'ı uygulama başlangıcında çalıştırır. Migration mevcut verileri silmez; fakat destructive migration yazılırsa veritabanı etkilenebilir. Böyle bir migration eklenmeden önce manuel review yapılmalıdır.

## 7. Seed ve Demo Verisi

Production/demo ortamına gerçek hasta verisi taşımayın.

Demo veri gerekiyorsa yalnızca sahte demo verisi oluşturun. `prisma:seed` otomatik deployment akışına bağlı değildir. Gerekiyorsa Render Shell üzerinden bilinçli şekilde ve sadece boş demo database üzerinde çalıştırılmalıdır.

Örnek:

```bash
npm run prisma:seed
```

Bu komutu gerçek veri bulunan bir ortamda çalıştırmayın.

## 8. Dosya Yükleme Riski

Mevcut belge/röntgen yükleme akışı dosyaları şu klasöre yazar:

```text
data/uploads
```

İlgili tablo:

```text
Document
```

Saklanan alanlar:

- `fileName`: orijinal dosya adı
- `storedName`: diskteki random dosya adı
- `mimeType`
- `fileSize`

Render Web Service diski kalıcı dosya deposu değildir. Yeni deploy, restart veya instance yeniden oluşturma sırasında yüklenen dosyalar kaybolabilir.

Geçici demo için belge yükleme özelliği test edilebilir, ancak kalıcılık beklenmemelidir. Kalıcı üretim için Cloudflare R2, Supabase Storage, AWS S3 veya benzeri object storage entegrasyonu gerekir.

Not: Hasta onam imzası `PatientConsent.signatureDataUrl` alanında veritabanında saklanır; bu dosya sistemi riskinden ayrı değerlendirilir.

## 9. Diğer Yerel Dosya Yazımları

`src/lib/role-permission-store.ts` çalışma zamanında `data/role-permissions.json` dosyasına yazabilir. Render'da bu dosyaya yapılan runtime değişiklikleri kalıcı kabul edilmemelidir. Kalıcı production kullanımında bu yapı DB tabanlı hale taşınmalıdır.

## 10. Realtime, Redis ve Worker

Uygulamada SSE endpoint'i vardır:

```text
/api/realtime/stream
```

Redis yoksa tek process demo kullanımında local in-memory realtime fallback çalışır. Çoklu worker, cluster veya ayrı SMS worker kurulacaksa `REDIS_URL` gerekir.

SMS queue için:

```bash
npm run worker:sms
```

Render üzerinde ilk demo aşamasında yalnızca web service yeterlidir. SMS queue gerçek kullanım istenirse ayrı Background Worker servisi ve Redis eklenmelidir.

## 11. Auth ve Cookie Güvenliği

Kimlik doğrulama JWT + HttpOnly cookie ile çalışır.

Production ortamında:

- `secure: true`
- `sameSite: lax`
- `httpOnly: true`

aktif olur. Render HTTPS arkasında çalıştığı için bu yapı uygundur. `JWT_SECRET` güçlü ve benzersiz olmalıdır.

## 12. Health Check

Basit Render health endpoint:

```text
GET /health
```

Beklenen cevap:

```json
{ "status": "ok" }
```

Veritabanı bağlantısını da kontrol eden endpoint:

```text
GET /api/system/health
```

Bu endpoint hassas bağlantı bilgisi döndürmez.

## 13. Güncelleme Akışı

Kod değişikliği sonrası:

```bash
git add .
git commit -m "Açıklama"
git push
```

Render auto deploy açıksa push sonrası otomatik:

1. `npm ci`
2. `npm run build:render`
3. `npm run start:render`
4. `prisma migrate deploy`
5. `next start -H 0.0.0.0`

çalışır.

## 14. Rollback ve Hata Durumları

Build başarısız olursa:

- Yeni sürüm ayağa kalkmaz.
- Render önceki çalışan deploy'u koruyabilir; Render panelinden log kontrolü yapılmalıdır.

Migration başarısız olursa:

- `start:render` başarısız olur.
- Uygulama yeni sürümle başlamaz.
- Veritabanı migration rollback otomatik garanti değildir.
- Destructive migration varsa önceden backup alınmalıdır.

Start başarısız olursa:

- Render servis loglarında hata görünür.
- Önceki deployment'a Render panelinden manuel rollback yapılabilir.

Veritabanı rollback:

- Prisma migration için otomatik güvenli geri dönüş yoktur.
- Geri dönüş için yeni düzeltici migration veya Neon backup/branch restore gerekir.

Yerelde `prisma generate` EPERM hatası:

- Windows üzerinde çalışan `next dev` süreci `node_modules/.prisma/client/query_engine-windows.dll.node` dosyasını kilitleyebilir.
- Bu durumda yerelde `npm run build:render` veya `npx prisma generate` başarısız olabilir.
- Render fresh build container kullandığı için bu dosya kilidi beklenmez.
- Yerelde tam Render build doğrulaması yapılacaksa önce çalışan Next/Node dev server kapatılmalıdır.

## 15. Manuel Render Kurulum Adımları

1. GitHub'da yeni/private repo oluşturun.
2. Yerel projeyi GitHub'a push edin.
3. Neon'da yeni PostgreSQL proje/database oluşturun.
4. Neon direct connection string'i alın.
5. Render'da New Web Service oluşturun.
6. GitHub repo'yu bağlayın.
7. Root Directory değerini `.` bırakın.
8. Build Command: `npm ci && npm run build:render`
9. Start Command: `npm run start:render`
10. Health Check Path: `/health`
11. Environment variables alanına bu rehberdeki zorunlu değişkenleri girin.
12. Auto Deploy açık bırakılabilir.
13. İlk deploy loglarını kontrol edin.
14. `/health` ve `/api/system/health` endpointlerini kontrol edin.

## 16. Yerel Ortam Neden Etkilenmez?

- Yerel `.env` dosyasına dokunulmaz.
- Yerel PostgreSQL veritabanına migration/reset/drop komutu çalıştırılmaz.
- Render environment variables yerelden bağımsızdır.
- Neon ayrı bir production/demo veritabanıdır.
- GitHub push yerel dosyaları silmez.
- Render deploy işlemleri Render sunucusunda çalışır, kullanıcı bilgisayarında çalışmaz.

## 17. Açık Onay Gerektiren Konular

Şu işler kullanıcı onayı olmadan yapılmamalıdır:

- Gerçek Render deploy başlatma
- Neon database'e migration çalıştırma
- Yerel database dump'ını Neon'a taşıma
- Dosya yükleme sistemini object storage'a taşıma
- Migration geçmişini yeniden oluşturma
- Destructive migration uygulama
- Redis/background worker servisleri oluşturma
