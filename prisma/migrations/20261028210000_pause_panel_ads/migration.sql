-- Klinik paneli reklamları şimdilik kapalı (ürün sahibinin kararı, 28.10.2026):
-- izlenme geliri çok düşük. AdSense kimlikleri ve kliniğe göre anahtarlar
-- saklanır; Süperadmin › Reklamlar › "Reklamlar gösterilsin" ile yeniden açılır.
UPDATE "PlatformAdConfig" SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;
