-- CreateTable
CREATE TABLE "RolePermissionConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "map" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermissionConfig_pkey" PRIMARY KEY ("id")
);

-- Seed: data/role-permissions.json dosyasında (artık kaldırılan, eski dosya
-- tabanlı depoya ait) elle özelleştirilmiş yetki matrisi buraya taşınıyor —
-- aksi halde bu geçişle birlikte yapılan özelleştirmeler sessizce sıfırlanırdı.
INSERT INTO "RolePermissionConfig" ("id", "version", "updatedBy", "map", "updatedAt")
VALUES (
  1,
  3,
  'Ahmet Gulden',
  '{"SUPERADMIN":["*"],"YONETICI":["*"],"DOKTOR":["dashboard:read","dashboard:stats","appointments:read","appointments:write","appointments:approve","patients:read","patients:phone","examinations:read","examinations:write","treatment:read","treatment:write","treatment:approve","prescriptions:read","prescriptions:write","prescriptions:print","lab:read","lab:write","lab:complete","xray:read","xray:write","payments:read","payments:write","hastatracking:read","hastatracking:write","documents:read","documents:write","insurance:read","announcements:read","messages:read","messages:write","notifications:manage","support:read","profile:read","profile:write","profile:password","stock:read","stock:write","stock:delete"],"ASISTAN":["dashboard:read","appointments:read","appointments:write","appointments:approve","patients:read","patients:write","examinations:read","treatment:read","lab:read","lab:write","xray:read","payments:read","payments:write","hastatracking:read","hastatracking:write","documents:read","documents:write","announcements:read","messages:read","messages:write","notifications:manage","support:read","support:write","profile:read","profile:write","profile:password","stock:read","stock:write","stock:delete"],"BANKO":["dashboard:read","appointments:read","appointments:write","patients:read","patients:write","payments:read","payments:write","installments:read","invoices:read","hastatracking:read","hastatracking:write","sms:read","sms:write","announcements:read","messages:read","messages:write","notifications:manage","support:read","support:write","profile:read","profile:write","profile:password","stock:read","stock:write","stock:delete"],"MUHASEBE":["dashboard:read","dashboard:stats","finance:read","finance:write","finance:export","reports:read","reports:write","reports:export","prices:read","prices:write","payments:read","installments:read","installments:write","invoices:read","invoices:write","invoices:send","stock:read","stock:write","campaigns:read","insurance:read","announcements:read","messages:read","support:read","profile:read","profile:write","profile:password","appointments:read","stock:delete"]}'::jsonb,
  '2026-05-08T06:06:56.641Z'
)
ON CONFLICT ("id") DO NOTHING;
