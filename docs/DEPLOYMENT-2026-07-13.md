# Canli Demo Deployment Kaydi - 2026-07-13

Bu dosya, `C:\Projects\web-calisma` projesini GitHub + Neon + Render uzerinden gecici/canli demo ortamina alma sirasinda yapilan islemleri kaydetmek icin olusturuldu.

Gizli degerler bu dosyada ham olarak tutulmaz. API key, database password, JWT secret ve encryption key degerleri Render/Neon panellerinde veya yerel guvenli not dosyasinda saklanmalidir.

## Canli Ortam

- Uygulama URL: `https://klinik-demo-web.onrender.com`
- Klinik girisi: `https://klinik-demo-web.onrender.com/klinik/giris`
- Health check: `https://klinik-demo-web.onrender.com/health`
- GitHub repo: `https://github.com/ahmetvural01/klinik-demo-web`
- GitHub branch: `master`
- Render dashboard: `https://dashboard.render.com/web/srv-d9a2klbtqb8s73bd1qeg`
- Render service id: `srv-d9a2klbtqb8s73bd1qeg`
- Render service name: `klinik-demo-web`
- Render region: `frankfurt`
- Neon project id: `shy-cherry-55078491`
- Neon project name: `klinik-demo-20260713-024909`
- Neon branch id: `br-bitter-wave-ash9u4f4`
- Neon database: `neondb`

## Kullanilan CLI ve Servisler

- GitHub CLI: mevcut oturum kullanildi, kullanici `ahmetvural01`.
- Git: repo commit/push icin kullanildi.
- Node.js / npm / npx: build, Prisma, seed ve test komutlari icin kullanildi.
- Prisma CLI: migration, schema validate, seed ve runtime DB testleri icin kullanildi.
- Render REST API: service olusturma, env var tanimlama, build/start ayari, deploy tetikleme ve deploy durum takibi icin kullanildi.
- Neon REST API: project olusturma ve connection URI alma icin kullanildi.

## Kullanilan API Endpointleri

Render:

```text
POST https://api.render.com/v1/services
PATCH https://api.render.com/v1/services/{serviceId}
POST https://api.render.com/v1/services/{serviceId}/deploys
GET  https://api.render.com/v1/services/{serviceId}/deploys
GET  https://api.render.com/v1/services/{serviceId}/deploys/{deployId}
GET  https://api.render.com/v1/logs?ownerId=...&resource=...
```

Neon:

```text
POST https://console.neon.tech/api/v2/projects
GET  https://console.neon.tech/api/v2/projects/{projectId}/connection_uri?database_name=neondb&role_name=neondb_owner
```

GitHub:

```text
gh auth status
gh repo create ahmetvural01/klinik-demo-web
git push origin master
```

## Gizli Deger Politikasi

Asagidaki degerler repoya yazilmadi:

- Render API key
- Neon API key
- `DATABASE_URL`
- `JWT_SECRET`
- `FIELD_ENCRYPTION_KEY`
- `SMTP_MASTER_PASSWORD`
- `SUPERADMIN_MASTER_SECRET`
- SMS servis sifreleri

Yerel Neon database URL kopyasi su dosyada tutuldu:

```text
C:\Users\ahmet\.codex\deploy-secrets\klinik-demo-neon-database-url.txt
```

Bu dosya Git reposunun disindadir. Makine degisirse veya dosya silinirse Neon panelinden connection string tekrar alinmalidir.

## Render Ayarlari

`render.yaml` dosyasindaki guncel hedef:

```yaml
services:
  - type: web
    name: klinik-demo-web
    runtime: node
    buildCommand: npm ci --include=dev && npm run build:render
    startCommand: npm run start:render
    healthCheckPath: /health
    autoDeploy: true
```

Render environment degiskenleri:

```text
NODE_VERSION=20
NODE_ENV=production
APP_URL=https://klinik-demo-web.onrender.com
DATABASE_URL=<Neon PostgreSQL connection string>
JWT_SECRET=<generated secret>
FIELD_ENCRYPTION_KEY=<generated 32-byte base64 secret>
SMTP_MASTER_PASSWORD=<generated secret>
SUPERADMIN_MASTER_SECRET=<generated secret>
SMS_PROVIDER=NETGSM
NETGSM_USERCODE=<optional>
NETGSM_PASSWORD=<optional>
NETGSM_HEADER=<optional>
REDIS_URL=<optional>
```

Not: `buildCommand` icinde `--include=dev` zorunlu hale getirildi. Render build asamasinda `prisma`, `typescript`, `tsx` gibi dev dependency paketleri gerekiyor.

## Neon ve Prisma Akisi

Neon projesi olusturulduktan sonra Prisma migration ve seed islemleri Neon DB uzerinde calistirildi.

Kullanilan temel komutlar:

```powershell
$env:DATABASE_URL = "<Neon DATABASE_URL>"
npx prisma validate
npx prisma migrate deploy
npm run prisma:seed
```

Migration dosyalariyla ilgili kritik duzeltme:

- `.gitignore` icinde `*.sql` kuralindan dolayi bazi `prisma/migrations/**/migration.sql` dosyalari takip edilmiyordu.
- Bunun icin `.gitignore` dosyasina su exception eklendi:

```gitignore
!prisma/migrations/**/migration.sql
```

Neon deployment icin eklenen/duzeltilen migration dizinleri commitlendi. Bu olmadan Render start sirasinda `prisma migrate deploy` eksik migration nedeniyle calisamazdi.

## Deployment Sirasinda Yapilan Kritik Kod Duzeltmeleri

1. Render build komutu dev dependency'leri kuracak sekilde degistirildi:

```text
npm ci --include=dev && npm run build:render
```

2. `/health` endpoint'i middleware public route listesine eklendi. Render health check auth redirect'e takilmiyor.

3. Neon runtime Prisma baglantisi duzeltildi.

Problem:

- `prisma migrate deploy` ham Neon URL ile calisiyordu.
- Uygulama runtime Prisma client'i `DATABASE_URL` uzerine `connect_timeout` ve `options=-c statement_timeout=15000` ekliyordu.
- Neon pooler host'unda bu runtime baglantisi `Can't reach database server` hatasi veriyordu.

Cozum:

- `src/lib/prisma.ts` icinde `url.hostname.includes("neon.tech")` ise ham `DATABASE_URL` aynen kullaniliyor.

4. `/` ana rota production 500 hatasi duzeltildi.

Problem:

- Production ortamda `/` route'u `TypeError: Cannot read properties of undefined (reading 'clientModules')` hatasi veriyordu.
- Klinik girisi ve API calisiyordu, sorun landing root route render akisi uzerindeydi.

Cozum:

- `src/app/page.tsx` sade route redirect haline getirildi:

```ts
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/klinik/giris");
}
```

5. Klinik login input normalize edildi.

Problem:

- Kurum kodunda basta/sonda bosluk varsa canli API `404 Kurum bulunamadi` donebiliyordu.

Cozum:

- `loginSchema` kurum ve TC alanlarini `trim()` ile normalize ediyor.
- Login formu submit ederken `institution.trim()` ve `identityNo.trim()` gonderiyor.
- Kurum aramasi API tarafinda normalize edilmis `institutionInput` ile yapiliyor.
- Kurum input'u formda `required` hale getirildi.

## Son Commitler

En onemli deployment commitleri:

```text
a71532d Harden clinic login input normalization
6e43aff Stabilize root route for deployment
b0534bf Fix Neon runtime database URL handling
01e2135 Increase production database connect timeout
7eabd24 Complete migrations and health route
ebafd6b Track custom deployment migration and gitignore exception
a6f7940 Render build command uses dev deps
65d189e Prepare deployment
```

## Canli Dogrulama Komutlari

Health:

```powershell
Invoke-WebRequest -Uri https://klinik-demo-web.onrender.com/health -UseBasicParsing
```

Giris sayfasi:

```powershell
Invoke-WebRequest -Uri https://klinik-demo-web.onrender.com/klinik/giris -UseBasicParsing
```

Login API:

```powershell
$body = @{
  institution = "whitedental"
  identityNo = "10000000001"
  password = "<demo-password>"
  rememberMe = $false
} | ConvertTo-Json

Invoke-WebRequest `
  -Method Post `
  -Uri https://klinik-demo-web.onrender.com/api/auth/login `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing `
  -SessionVariable s
```

Panel erisimi:

```powershell
Invoke-WebRequest `
  -Uri https://klinik-demo-web.onrender.com/anasayfa `
  -UseBasicParsing `
  -WebSession $s
```

Beklenen sonuc:

```text
/health       -> 200
/klinik/giris -> 200
/api/auth/login -> 200
/anasayfa     -> 200
/             -> 307 /klinik/giris redirect
```

## Lokal Production Test Akisi

Canliya gondermeden once ayni build'i lokal production modda test etmek icin:

```powershell
$env:DATABASE_URL = (Get-Content -LiteralPath (Join-Path $env:USERPROFILE ".codex\deploy-secrets\klinik-demo-neon-database-url.txt") -Raw).Trim()
$env:NODE_ENV = "production"
npm run build:render
npx next start -H 127.0.0.1 -p 3050
```

Kontrol:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:3050/ -MaximumRedirection 0 -UseBasicParsing
Invoke-WebRequest -Uri http://127.0.0.1:3050/klinik/giris -UseBasicParsing
```

Lokal production server aciksa ve Prisma engine dosyasini kilitliyorsa:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "C:\\Projects\\web-calisma" -and $_.CommandLine -match "next start|3050" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## Render Deploy Tetikleme

Otomatik deploy gecikirse Render API ile manuel deploy tetiklenebilir:

```powershell
$headers = @{
  Authorization = "Bearer <RENDER_API_KEY>"
  Accept = "application/json"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.render.com/v1/services/srv-d9a2klbtqb8s73bd1qeg/deploys" `
  -Headers $headers `
  -Body (@{ clearCache = "do_not_clear" } | ConvertTo-Json)
```

Deploy durumunu izlemek:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "https://api.render.com/v1/services/srv-d9a2klbtqb8s73bd1qeg/deploys/{deployId}" `
  -Headers $headers
```

## Yeni Degisiklikleri Canliya Alma

Normal akista:

```powershell
git status --short
npm run typecheck
npx prisma validate
git add .
git commit -m "Meaningful message"
git push origin master
```

Render `autoDeploy: true` oldugu icin push sonrasi otomatik deploy baslar. Gecikirse yukaridaki manuel deploy komutu kullanilir.

## Dikkat Edilecek Noktalar

- Ham API key'leri, database URL'leri ve secret'lar repoya yazilmaz.
- `docs/LOCAL-DEPLOYMENT-SECRETS.md` local-only not dosyasidir ve `.gitignore` ile disarida tutulur.
- Render Web Service dosya sistemi kalici dosya deposu degildir. Hasta belge/rontgen upload'lari production icin object storage'a tasinmalidir.
- `data/uploads`, `.env`, `.pgdata`, loglar ve DB backup'lari repoya alinmamalidir.
- Gercek production icin Redis/SMS worker ayri servis olarak planlanmalidir.
- Demo ortaminda seed sahte veri icindir; gercek hasta verisi Neon demo DB'ye tasinmamalidir.

