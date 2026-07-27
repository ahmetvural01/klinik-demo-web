-- New staff accounts get their TC kimlik no as the default password (no
-- password prompt during creation). This flag forces a redirect to the
-- change-password step on first login.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
