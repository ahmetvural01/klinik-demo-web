import { randomInt } from "crypto";

// Halka açık randevu formunda telefon numarasını doğrulamak için kısa ömürlü
// SMS kodu — RandevuNet vb. rakiplerde olan, bizde eksik olan bir spam/sahte
// talep koruması. Uygulama tek bir Node süreci olarak çalıştığından (bkz.
// src/lib/api.ts _userActiveCache ile aynı desen), in-memory Map yeterli;
// kalıcı depolama gerekmiyor çünkü kod birkaç dakika sonra geçersiz.
type OtpEntry = { code: string; expiresAt: number; attempts: number };

const OTP_TTL_MS = 5 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

const otpStore = new Map<string, OtpEntry>();

function otpKey(institutionId: string, phone: string) {
  return `${institutionId}:${phone}`;
}

export function generatePublicBookingOtp(institutionId: string, phone: string): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  otpStore.set(otpKey(institutionId, phone), { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return code;
}

export function verifyPublicBookingOtp(institutionId: string, phone: string, code: string): { ok: boolean; error?: string } {
  const key = otpKey(institutionId, phone);
  const entry = otpStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    otpStore.delete(key);
    return { ok: false, error: "Kod süresi doldu. Lütfen yeni kod isteyin." };
  }
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(key);
    return { ok: false, error: "Çok fazla hatalı deneme. Lütfen yeni kod isteyin." };
  }
  if (entry.code !== code.trim()) {
    entry.attempts += 1;
    return { ok: false, error: "Kod hatalı." };
  }
  otpStore.delete(key);
  return { ok: true };
}
