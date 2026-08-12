import { randomInt } from "crypto";
import {
  consumeOneTimeSecret,
  distributedRateLimit,
  putOneTimeSecret,
} from "@/lib/security-store";

const OTP_TTL_MS = 5 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

function otpKey(institutionId: string, phone: string) {
  return `public-booking-otp:${institutionId}:${phone}`;
}

export async function generatePublicBookingOtp(institutionId: string, phone: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await putOneTimeSecret(otpKey(institutionId, phone), code, OTP_TTL_MS);
  return code;
}

export async function verifyPublicBookingOtp(institutionId: string, phone: string, code: string) {
  const attempts = await distributedRateLimit(
    `public-booking-otp-verify:${institutionId}:${phone}`,
    MAX_VERIFY_ATTEMPTS,
    OTP_TTL_MS,
  );
  if (!attempts.ok) {
    return { ok: false, error: "Çok fazla hatalı deneme. Lütfen yeni kod isteyin." };
  }

  const consumed = await consumeOneTimeSecret(otpKey(institutionId, phone), code.trim());
  return consumed
    ? { ok: true }
    : { ok: false, error: "Kod hatalı veya süresi dolmuş. Lütfen yeni kod isteyin." };
}
