/**
 * Türkçe tutar girişi — uygulama genelinde TEK kural seti (ui/MoneyInput ve
 * form doğrulaması bunu kullanır).
 *
 * Neden: tutar ayrıştırma her ekranda ayrı yazılmıştı ve "3.500" bazı
 * ekranlarda 3,50 TL'ye dönüşüyordu (lab faturası, hasta dosyası), "1.250,50"
 * ise bazılarında reddediliyordu. Tutar burada JS number'a ÇEVRİLMEZ;
 * "1250.50" biçiminde normalize METİN olarak taşınır (sunucudaki
 * Prisma.Decimal ile aynı; hesap number ile yapılmaz).
 *
 * Kullanıcının yazdığı metin için kurallar:
 *  - Virgül ondalıktır: "1250,5" → "1250.50"
 *  - Nokta + tam 3 hane binliktir: "3.500" → "3500.00", "1.250.000" → "1250000.00"
 *  - Diğer tek nokta ondalıktır: "1250.5" → "1250.50", "3.75" → "3.75"
 *  - İkisi birlikteyse sondaki ondalıktır: "1.250,50" ve "1,250.50" → "1250.50"
 *  - ₺, TL ve boşluk yok sayılır; kuruş en fazla 2 hane (fazlası hata, yuvarlanmaz).
 */

/** Veritabanındaki tutar sütunlarının üst sınırı (Decimal(10,2)). */
export const MONEY_MAX = "99999999.99";

const MAX_INTEGER_DIGITS = 12;

export type MoneyParseFailure = "empty" | "invalid" | "decimals" | "negative" | "too-large";
export type MoneyParseResult = { ok: true; value: string } | { ok: false; reason: MoneyParseFailure };

type ParseOptions = {
  /** Eksi tutara izin ver (ör. fiyat farkı, düzeltme). Varsayılan: hayır. */
  allowNegative?: boolean;
};

const GROUPED: Record<"." | ",", RegExp> = {
  ".": /^\d{1,3}(\.\d{3})+$/,
  ",": /^\d{1,3}(,\d{3})+$/,
};

function countOf(text: string, char: string) {
  return text.split(char).length - 1;
}

function finish(negative: boolean, rawInteger: string, fraction: string, options: ParseOptions): MoneyParseResult {
  if (!/^\d*$/.test(rawInteger) || !/^\d*$/.test(fraction)) return { ok: false, reason: "invalid" };
  if (!rawInteger && !fraction) return { ok: false, reason: "invalid" };
  if (fraction.length > 2) return { ok: false, reason: "decimals" };
  const integer = rawInteger.replace(/^0+(?=\d)/, "") || "0";
  if (integer.length > MAX_INTEGER_DIGITS) return { ok: false, reason: "too-large" };
  const isZero = /^0+$/.test(integer) && /^0*$/.test(fraction);
  if (negative && !isZero && !options.allowNegative) return { ok: false, reason: "negative" };
  return { ok: true, value: `${negative && !isZero ? "-" : ""}${integer}.${fraction.padEnd(2, "0")}` };
}

/**
 * Kullanıcının yazdığı tutar metnini ayrıştırır; başarısızsa NEDENİNİ döner
 * (hata metni seçmek için). Çoğu yerde `parseTurkishMoney` yeterlidir.
 */
export function analyzeTurkishMoney(text: string | null | undefined, options: ParseOptions = {}): MoneyParseResult {
  let body = String(text ?? "")
    .replace(/[\s  ]/g, "")
    .replace(/₺|TRY|TL/gi, "")
    .replace(/−/g, "-");
  if (!body) return { ok: false, reason: "empty" };

  let negative = false;
  if (body[0] === "-" || body[0] === "+") {
    negative = body[0] === "-";
    body = body.slice(1);
  }
  if (!body || !/^[\d.,]+$/.test(body) || !/\d/.test(body)) return { ok: false, reason: "invalid" };

  const dots = countOf(body, ".");
  const commas = countOf(body, ",");

  if (dots && commas) {
    // İki ayırıcı birlikte: sondaki ondalık, diğeri binlik (Türkçe "1.250,50"
    // ya da yapıştırılmış İngilizce "1,250.50").
    const decimalSep = body.lastIndexOf(",") > body.lastIndexOf(".") ? "," : ".";
    const groupSep = decimalSep === "," ? "." : ",";
    if (countOf(body, decimalSep) !== 1) return { ok: false, reason: "invalid" };
    const index = body.lastIndexOf(decimalSep);
    const integerPart = body.slice(0, index);
    if (!GROUPED[groupSep].test(integerPart)) return { ok: false, reason: "invalid" };
    return finish(negative, integerPart.split(groupSep).join(""), body.slice(index + 1), options);
  }

  if (commas) {
    if (commas === 1) {
      const [integerPart, fraction] = body.split(",");
      return finish(negative, integerPart, fraction, options);
    }
    if (!GROUPED[","].test(body)) return { ok: false, reason: "invalid" };
    return finish(negative, body.replace(/,/g, ""), "", options);
  }

  if (dots) {
    if (dots === 1) {
      const [integerPart, fraction] = body.split(".");
      // "3.500", "12.500", "100.000": Türkçe binlik ayırıcı. "0.500" ya da
      // "1250.555" binlik olamaz → ondalık sayılır (fazla kuruş hanesi hata verir).
      if (/^[1-9]\d{0,2}$/.test(integerPart) && /^\d{3}$/.test(fraction)) {
        return finish(negative, integerPart + fraction, "", options);
      }
      return finish(negative, integerPart, fraction, options);
    }
    if (!GROUPED["."].test(body)) return { ok: false, reason: "invalid" };
    return finish(negative, body.replace(/\./g, ""), "", options);
  }

  return finish(negative, body, "", options);
}

/**
 * Kullanıcının yazdığı tutarı normalize eder: "3.500" → "3500.00",
 * "1.250,50" → "1250.50", "1250.5" → "1250.50". Boş ya da geçersizse null.
 */
export function parseTurkishMoney(text: string | null | undefined, options: ParseOptions = {}): string | null {
  const result = analyzeTurkishMoney(text, options);
  return result.ok ? result.value : null;
}

/**
 * Sunucudan/hesaptan gelen makine değerini (Decimal metni "1250.5", ya da
 * number) normalize eder; noktayı her zaman ondalık sayar ve 2 haneye
 * yarım-yukarı yuvarlar ("33.3333" → "33.33", 1.005 → "1.01").
 * Formu sunucu değeriyle doldururken: `toMoneyValue(row.amount) ?? ""`.
 */
export function toMoneyValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) >= 10 ** MAX_INTEGER_DIGITS) return null;
    // toFixed(10) ikili kayan nokta gösteriminden ondalık metni güvenle çıkarır
    // (1.005.toFixed(2) "1.00" verir; burada "1.0050000000" → "1.01").
    text = value.toFixed(10);
  } else {
    text = value.trim();
  }
  const match = /^([-+]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const negative = match[1] === "-";
  const integer = match[2].replace(/^0+(?=\d)/, "") || "0";
  if (integer.length > MAX_INTEGER_DIGITS) return null;
  const fraction = (match[3] || "").padEnd(3, "0");
  let cents = BigInt(integer + fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) cents += BigInt(1);
  return centsToValue(negative ? -cents : cents);
}

function centsToValue(cents: bigint): string {
  const negative = cents < BigInt(0);
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  const value = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  return negative ? `-${value}` : value;
}

/** Metin → normalize (Türkçe kural); number → makine kuralı. */
function resolve(value: string | number | null | undefined, options: ParseOptions): MoneyParseResult {
  if (typeof value === "number") {
    const normalized = toMoneyValue(value);
    if (normalized === null) return { ok: false, reason: "invalid" };
    if (normalized.startsWith("-") && !options.allowNegative) return { ok: false, reason: "negative" };
    return { ok: true, value: normalized };
  }
  return analyzeTurkishMoney(value, options);
}

function toCents(normalized: string): bigint {
  return BigInt(normalized.replace(".", ""));
}

/**
 * İki tutarı karşılaştırır (-1: a küçük, 0: eşit, 1: a büyük). Biri
 * çözülemiyorsa null. Number'a çevirmeden, kuruş hassasiyetinde.
 */
export function compareMoney(a: string | number | null | undefined, b: string | number | null | undefined): -1 | 0 | 1 | null {
  const left = resolve(a, { allowNegative: true });
  const right = resolve(b, { allowNegative: true });
  if (!left.ok || !right.ok) return null;
  const diff = toCents(left.value) - toCents(right.value);
  return diff === BigInt(0) ? 0 : diff < BigInt(0) ? -1 : 1;
}

function groupThousands(integer: string) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Tutar alanında gösterilecek Türkçe metin: "1250.50" → "1.250,50",
 * "3500.00" → "3.500" (kuruş yoksa yazılmaz), 1250.5 → "1.250,50".
 * Çözülemeyen metin (kullanıcının yazdığı) olduğu gibi döner.
 */
export function formatMoneyInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const result = resolve(value, { allowNegative: true });
  if (!result.ok) return String(value);
  const negative = result.value.startsWith("-");
  const [integer, fraction] = result.value.replace("-", "").split(".");
  return `${negative ? "-" : ""}${groupThousands(integer)}${fraction === "00" ? "" : `,${fraction}`}`;
}

/** Hata metinlerinde tutar: "₺4.500,00" (Money bileşeniyle aynı biçim). */
function formatMoneyText(normalized: string) {
  const negative = normalized.startsWith("-");
  const [integer, fraction] = normalized.replace("-", "").split(".");
  return `${negative ? "-" : ""}₺${groupThousands(integer)},${fraction}`;
}

export type MoneyRules = {
  required?: boolean;
  /** Varsayılan: tutar 0'dan büyük olmalı. true ise 0 kabul edilir. */
  allowZero?: boolean;
  allowNegative?: boolean;
  /** En az (dahil). Ör. "100" ya da 100. */
  min?: string | number;
  /** En çok (dahil), ör. kalan borç. Veritabanı sınırı (±MONEY_MAX) her durumda ayrıca uygulanır. */
  max?: string | number;
};

/**
 * Tutar alanı için TEK tip hata metni (FormField `error`'a verilir); sorun
 * yoksa null. MoneyInput değeriyle ya da kullanıcı metniyle çalışır.
 *   const amountError = moneyInputError(amount, { required: true, max: kalanBorc });
 */
export function moneyInputError(value: string | number | null | undefined, rules: MoneyRules = {}): string | null {
  const result = resolve(value, { allowNegative: rules.allowNegative });
  if (!result.ok) {
    switch (result.reason) {
      case "empty": return rules.required ? "Tutarı girin." : null;
      case "decimals": return "Kuruş en fazla iki hane olabilir.";
      case "negative": return "Tutar eksi olamaz.";
      case "too-large": return `Tutar en fazla ${formatMoneyText(MONEY_MAX)} olabilir.`;
      default: return "Tutarı rakamla yazın (ör. 1.250,50).";
    }
  }
  const cents = toCents(result.value);
  if (cents === BigInt(0) && !rules.allowZero) return "Tutar 0'dan büyük olmalı.";
  const min = rules.min === undefined ? null : resolve(rules.min, { allowNegative: true });
  if (min?.ok && cents < toCents(min.value)) return `Tutar en az ${formatMoneyText(min.value)} olmalı.`;
  const max = rules.max === undefined ? null : resolve(rules.max, { allowNegative: true });
  if (max?.ok && cents > toCents(max.value)) return `Tutar en fazla ${formatMoneyText(max.value)} olabilir.`;
  // Veritabanı sınırı her durumda uygulanır: `rules.max` çözülemediğinde (veri
  // yüklenirken "", NaN) ve eksi tutarda alt sınır yoktu; Decimal(10,2)
  // sütununda sunucuda taşma hatası oluyordu.
  const limit = toCents(MONEY_MAX);
  if (cents > limit) return `Tutar en fazla ${formatMoneyText(MONEY_MAX)} olabilir.`;
  if (cents < -limit) return `Tutar en az ${formatMoneyText(`-${MONEY_MAX}`)} olabilir.`;
  return null;
}
