-- Login resolves institutions case-insensitively. The database must enforce
-- the same uniqueness rule so two visually identical tenant names can never
-- make authentication ambiguous.
CREATE UNIQUE INDEX "Institution_name_lower_key"
ON "Institution" (LOWER("name"));
