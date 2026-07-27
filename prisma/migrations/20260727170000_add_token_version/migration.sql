-- Server-side session invalidation: bumped on password change or explicit
-- "sign out of all devices". JWTs carry the tokenVersion they were issued
-- with; a mismatch against the current DB value rejects the token even if
-- it hasn't naturally expired yet.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
