-- Hasta arama (topbar hızlı arama, hasta listesi) `contains` (alt dize)
-- eşleşmesi kullanıyor. Normal B-tree indeks ("fullName"/"phone" üzerindeki
-- mevcut @@index) yalnızca ÖNEK aramalarını hızlandırır — "içerir" tipi
-- aramalarda hiç işe yaramaz. Hasta sayısı bin/on binlere çıktıkça bu
-- aramalar tam tablo taramasına döner. pg_trgm + GIN indeksi, "contains"
-- aramalarını da hızlandıran standart Postgres çözümüdür.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Patient_fullName_trgm_idx" ON "Patient" USING GIN ("fullName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Patient_phone_trgm_idx" ON "Patient" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Patient_tcNo_trgm_idx" ON "Patient" USING GIN ("tcNo" gin_trgm_ops);
