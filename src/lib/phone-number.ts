const E164_MAX_DIGITS = 15;

export function getLocalPhoneDigitLimit(countryCode: string): number {
  if (countryCode === "+90") return 10;
  const countryDigitCount = countryCode.replace(/\D/g, "").length;
  return Math.max(4, E164_MAX_DIGITS - countryDigitCount);
}

export function normalizeLocalPhone(phone: string, countryCode: string): string {
  let digits = phone.replace(/\D/g, "");

  if (countryCode === "+90") {
    if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  }

  return digits;
}

export function limitLocalPhoneInput(phone: string, countryCode: string): string {
  return normalizeLocalPhone(phone, countryCode).slice(0, getLocalPhoneDigitLimit(countryCode));
}

export function getLocalPhoneError(phone: string, countryCode: string): string | null {
  const digits = phone.replace(/\D/g, "");

  if (countryCode === "+90") {
    return /^5\d{9}$/.test(digits)
      ? null
      : "Türkiye cep telefonu 5 ile başlayan 10 haneli numara olmalıdır.";
  }

  const maximum = getLocalPhoneDigitLimit(countryCode);
  if (digits.length < 4 || digits.length > maximum) {
    return `Telefon numarası 4-${maximum} haneli rakamdan oluşmalıdır.`;
  }

  return null;
}
