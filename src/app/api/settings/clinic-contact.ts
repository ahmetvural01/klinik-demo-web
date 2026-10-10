// Klinik iletişim alanlarının (ad, telefon, web sitesi, değerlendirme bağlantısı)
// TEK doğrulama ve biçim kuralı. Ayarlar > Klinik formu ve PUT /api/settings
// aynı fonksiyonları kullanır: canlı denetimde telefona "abc", web sitesine düz
// metin yazılıp kaydedilebiliyordu; bu değerler reçete/onam başlığına ve hasta
// mesajlarına ({{institutionPhone}}) gidiyordu. Saf fonksiyonlar — istemcide de
// sunucuda da çalışır (sunucuya özel içe aktarma yok).

export type FieldResult = { ok: true; value: string } | { ok: false; message: string };

export const CLINIC_NAME_MAX = 120;
export const CLINIC_ADDRESS_MAX = 300;

export function normalizeClinicName(raw: string | null | undefined): FieldResult {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, message: "Klinik adını yazın." };
  if (value.length > CLINIC_NAME_MAX) return { ok: false, message: `Klinik adı en fazla ${CLINIC_NAME_MAX} karakter olabilir.` };
  return { ok: true, value };
}

export function normalizeClinicAddress(raw: string | null | undefined): FieldResult {
  const value = String(raw ?? "").trim();
  if (value.length > CLINIC_ADDRESS_MAX) return { ok: false, message: `Adres en fazla ${CLINIC_ADDRESS_MAX} karakter olabilir.` };
  return { ok: true, value };
}

const PHONE_MESSAGE = "Geçerli bir telefon numarası yazın (ör. 0216 345 67 89).";

/**
 * Sabit hat, cep ve 0850 numaraları 10 hane (başında 0 ya da +90 olabilir),
 * "444 1 234" çağrı merkezi numaraları 7 hane kabul edilir; Türkiye numarası
 * "0216 345 67 89" biçiminde saklanır. Yurt dışı numarası "+" ile yazılır ve
 * olduğu gibi kalır. Boş bırakılabilir.
 */
export function normalizeClinicPhone(raw: string | null | undefined): FieldResult {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return { ok: true, value: "" };
  if (!/^[0-9+()\-.\s]+$/.test(text) || text.indexOf("+") > 0) return { ok: false, message: PHONE_MESSAGE };
  let digits = text.replace(/\D/g, "");
  const international = text.startsWith("+") && !digits.startsWith("90");
  if (international) {
    return digits.length >= 8 && digits.length <= 15 ? { ok: true, value: text } : { ok: false, message: PHONE_MESSAGE };
  }
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[2-58]/.test(digits)) {
    return { ok: true, value: `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}` };
  }
  if (digits.length === 7 && digits.startsWith("444")) {
    return { ok: true, value: `444 ${digits.slice(3, 4)} ${digits.slice(4)}` };
  }
  return { ok: false, message: PHONE_MESSAGE };
}

/**
 * Web adresi: "gulusdis.com.tr" yazılırsa başına https:// eklenir. Boşluk
 * içeren, alan adı olmayan ya da http/https dışındaki adres reddedilir.
 */
export function normalizeWebAddress(raw: string | null | undefined, message = "Geçerli bir web adresi yazın (ör. gulusdis.com.tr)."): FieldResult {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: "" };
  if (/\s/.test(text) || text.length > 500) return { ok: false, message };
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    const hostOk = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) && !url.hostname.startsWith("-") && !url.username && !url.password;
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !hostOk) return { ok: false, message };
    return { ok: true, value: candidate };
  } catch {
    return { ok: false, message };
  }
}

export const REVIEW_LINK_MESSAGE = "Geçerli bir bağlantı yazın (ör. https://g.page/r/…/review).";
