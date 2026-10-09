/**
 * WhatsApp QR bağlantısı için telefon yardımcıları. Yan etkisizdir; hem API
 * rotası hem bağlantı kartı aynı doğrulamayı kullanır ki kullanıcı tarayıcıda
 * kabul edilen bir numaranın sunucuda reddedilmesiyle karşılaşmasın.
 */

export type PairingPhoneResult = { ok: true; digits: string } | { ok: false; error: string };

const INVALID_PHONE_MESSAGE =
  "Numarayı 5XX XXX XX XX biçiminde yazın. Yurt dışı numarası ise başına + ve ülke kodunu ekleyin.";

/**
 * Telefonla bağlama (eşleştirme kodu) için girilen numarayı uluslararası
 * rakam dizisine çevirir: Türkiye için 5XXXXXXXXX → 905XXXXXXXXX; diğer
 * ülkeler yalnız "+ülke kodu" ile kabul edilir (yanlış ülkeye kod istenmesin).
 */
export function normalizePairingPhone(raw: string): PairingPhoneResult {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "WhatsApp'ın kurulu olduğu telefonun numarasını yazın." };
  if (value.length > 32 || /[^\d\s()+\-.]/.test(value)) return { ok: false, error: INVALID_PHONE_MESSAGE };

  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+") || value.startsWith("00")) {
    const international = value.startsWith("00") ? digits.slice(2) : digits;
    if (international.startsWith("90")) {
      return /^905\d{9}$/.test(international)
        ? { ok: true, digits: international }
        : { ok: false, error: "Türkiye numarası +90 5XX XXX XX XX biçiminde olmalı." };
    }
    if (international.length >= 8 && international.length <= 15 && !international.startsWith("0")) {
      return { ok: true, digits: international };
    }
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  if (/^5\d{9}$/.test(digits)) return { ok: true, digits: `90${digits}` };
  if (/^05\d{9}$/.test(digits)) return { ok: true, digits: `9${digits}` };
  if (/^905\d{9}$/.test(digits)) return { ok: true, digits };
  return { ok: false, error: INVALID_PHONE_MESSAGE };
}

/** "905321234567" → "+90 532 123 45 67"; diğer ülkeler "+<rakamlar>". */
export function formatWhatsappDisplayPhone(rawDigits: string | null | undefined): string {
  const digits = String(rawDigits ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (/^90\d{10}$/.test(digits)) {
    return `+90 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return `+${digits}`;
}

/** Log ve denetim kaydı için: yalnız son 4 hane görünür. */
export function maskPhoneDigits(rawDigits: string | null | undefined): string {
  const digits = String(rawDigits ?? "").replace(/\D/g, "");
  return digits.length <= 4 ? "***" : `***${digits.slice(-4)}`;
}

/** WhatsApp eşleştirme kodu 8 karakterdir; okunması kolay olsun diye "ABCD-1234" gösterilir. */
export function formatPairingCode(code: string | null | undefined): string {
  const clean = String(code ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
