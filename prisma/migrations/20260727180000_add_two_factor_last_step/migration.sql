-- Prevents replay of a valid TOTP code within its ~30-90s acceptance window
-- (e.g. an eavesdropped/shoulder-surfed code being submitted a second time).
ALTER TABLE "User" ADD COLUMN "twoFactorLastStep" INTEGER;
