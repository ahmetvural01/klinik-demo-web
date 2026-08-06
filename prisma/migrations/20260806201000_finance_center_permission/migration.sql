-- Opening the full accounting center is distinct from seeing a patient's own
-- payment history. Existing front-office and accounting roles keep the page.
UPDATE "RolePermissionConfig"
SET "map" = jsonb_set(
  jsonb_set(
    "map"::jsonb,
    '{BANKO}',
    ((COALESCE("map"::jsonb -> 'BANKO', '[]'::jsonb) - 'finance:center') || '["finance:center"]'::jsonb),
    true
  ),
  '{MUHASEBE}',
  ((COALESCE("map"::jsonb -> 'MUHASEBE', '[]'::jsonb) - 'finance:center') || '["finance:center"]'::jsonb),
  true
),
"version" = "version" + 1,
"updatedAt" = CURRENT_TIMESTAMP,
"updatedBy" = 'migration:finance-center-permission'
WHERE "id" = 1;
