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

## Demo Giris

- Kurum: whitedental
- Kimlik: 11509380760
- Sifre: 10711453

## Notlar

- Node.js 20+ gereklidir.
- Uretime cikarken `JWT_SECRET` degerini guclu bir degerle degistirin.
