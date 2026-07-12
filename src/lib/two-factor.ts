import { authenticator } from "otplib";
import QRCode from "qrcode";
import { randomBytes, createHash } from "crypto";

authenticator.options = { window: 1 };

const ISSUER = "Klinik Yönetim Paneli";

export function generateTwoFactorSecret() {
  return authenticator.generateSecret();
}

export function twoFactorKeyUri(identityNo: string, secret: string) {
  return authenticator.keyuri(identityNo, ISSUER, secret);
}

export async function twoFactorQrCodeDataUrl(otpauthUrl: string) {
  return QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
}

export function verifyTwoFactorToken(token: string, secret: string) {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

function hashBackupCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function generateBackupCodes(count = 8) {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    plain.push(randomBytes(4).toString("hex"));
  }
  const hashed = plain.map(hashBackupCode);
  return { plain, hashed };
}

export function verifyBackupCode(code: string, hashedCodes: string[]) {
  const hash = hashBackupCode(code.trim().toLowerCase());
  return hashedCodes.includes(hash);
}

export function removeUsedBackupCode(code: string, hashedCodes: string[]) {
  const hash = hashBackupCode(code.trim().toLowerCase());
  return hashedCodes.filter((c) => c !== hash);
}
