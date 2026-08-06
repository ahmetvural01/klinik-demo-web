-- Existing installations keep a persisted permission map. Align the roles
-- whose defaults changed without replacing any institution-specific choices.
UPDATE "RolePermissionConfig"
SET "map" = jsonb_set(
  jsonb_set(
    jsonb_set(
      "map"::jsonb,
      '{DOKTOR}',
      ((COALESCE("map"::jsonb -> 'DOKTOR', '[]'::jsonb) - 'patients:phone' - 'earnings:read') || '["earnings:read"]'::jsonb),
      true
    ),
    '{ASISTAN}',
    (COALESCE("map"::jsonb -> 'ASISTAN', '[]'::jsonb) - 'patients:phone'),
    true
  ),
  '{BANKO}',
  ((COALESCE("map"::jsonb -> 'BANKO', '[]'::jsonb) - 'patients:phone') || '["patients:phone"]'::jsonb),
  true
),
"version" = "version" + 1,
"updatedAt" = CURRENT_TIMESTAMP,
"updatedBy" = 'migration:rbac-permission-alignment'
WHERE "id" = 1;
