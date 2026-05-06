# Disaster Recovery Runbook

## 1) Hedef
Bu runbook, kritik servis kesintilerinde klinik operasyonunu en kisa surede ayaga kaldirmak icin adimlari tanimlar.

## 2) Kapsam
- PostgreSQL veri kaybi / bozulmasi
- Uygulama servis kesintisi
- Redis (realtime/queue) kesintisi

## 3) RTO / RPO
- Hedef RTO: 30 dakika
- Hedef RPO: 5 dakika (WAL + sik yedekleme)

## 4) Hazirlik
- Gunluk full backup + 5 dakikalik WAL arsivi
- Yedeklerin farkli bolgede saklanmasi
- En az ayda 1 restore tatbikati

## 5) Olay Aninda Ilk Kontrol
1. Health endpoint: /api/system/health
2. DB baglanti kontrolu
3. Uygulama pod/log kontrolu
4. Redis baglanti ve queue backlog kontrolu

## 6) DB Geri Donus Adimlari
1. Trafik bakim moduna alin
2. Son saglikli full backup geri yukle
3. WAL replay ile son noktaya yakinlat
4. Prisma migrate deploy calistir
5. Smoke + integration testleri calistir

## 7) Uygulama Geri Donus Adimlari
1. Son stabil release deploy et
2. Feature flag ile riskli modulleri gecici kapat
3. Realtime stream ve SMS queue worker durumunu dogrula

## 8) Redis Kesintisi
- Sistem local fallback ile devam eder
- Redis geri geldiginde verify:redis:realtime ile dogrula
- Worker backlog birikimini izleyerek toparla

## 9) Dogrulama Checklist
- login, hasta, randevu, gorevler akislari calisiyor
- metrics/alerts endpointleri erisilebilir
- 20 kullanicilik loadtest lite basarili

## 10) Postmortem
- 24 saat icinde RCA
- kalici aksiyonlarin issue/owner/tarih atamasi
