-- CreateTable
CREATE TABLE "RolePermissionConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "map" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermissionConfig_pkey" PRIMARY KEY ("id")
);

-- Satır kasıtlı olarak burada eklenmiyor: src/lib/role-permission-store.ts'deki
-- readState() tabloyu boş bulduğunda otomatik olarak DEFAULT_ROLE_PERMISSIONS
-- (src/lib/role-permissions.ts) ile ilk satırı oluşturur. Böylece yetki
-- matrisinin "doğru" hali tek bir kaynakta (kod) yaşar, migration dosyasında
-- ayrıca bakımı gereken bir JSON kopyası olmaz.
