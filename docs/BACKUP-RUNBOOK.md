# Backup Runbook

## 1) Amac
Bu dokuman PostgreSQL verisinin duzenli ve dogrulanabilir sekilde yedeklenmesi icin minimum operasyon adimlarini tanimlar.

## 2) Hazirlik
1. `DATABASE_URL` tanimli olmalidir.
2. Makinede `pg_dump` ve `pg_restore` komutlari erisilebilir olmalidir.
3. Proje kokunde `npm run backup:db` komutu calisabilmelidir.

## 3) Manuel Backup
1. Proje kokunde su komutu calistirin:
   - `npm run backup:db`
2. Cikti dizini:
   - `backups/db`
3. Dosya formati:
   - `klinik-modern-YYYYMMDD-HHmmss.dump`

## 4) Retention
- Varsayilan saklama suresi: 14 gun.
- Degistirmek icin ortam degiskeni:
  - `BACKUP_RETENTION_DAYS=30`

## 5) Windows Zamanlama (Task Scheduler)
Gunluk 03:00 icin ornek:

```powershell
schtasks /Create /SC DAILY /ST 03:00 /TN "KlinikModern-DB-Backup" /TR "cmd /c cd /d C:\path\to\project && npm run backup:db" /F
```

Not: `C:\path\to\project` kismini kendi proje dizininizle degistirin.

## 6) Restore Dogrulamasi (Aylik)
1. Bos bir test veritabanina geri yukleyin:
   - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname=<TEST_DB_URL> backups/db/<dosya>.dump`
2. Uygulama smoke testi:
   - `npm run test:smoke`
3. Sonucu operasyon kaydina ekleyin.

## 7) Operasyon Standardi
- En az gunluk 1 backup alinmali.
- Ayda en az 1 restore tatbikati yapilmali.
- Backup dosyalari farkli disk/bolgeye kopyalanmali.
