/**
 * Türkçe telefon numarası formatı
 * (0545) 404-6939 şeklinde
 */
export function formatPhoneNumber(input: string): string {
  // Sadece rakamları al
  const digits = input.replace(/\D/g, "");
  
  // 0 ile başlamazsa, başına 0 ekle (tabii ki her zaman 0 ile başlayacak)
  let phone = digits.startsWith("0") ? digits : "0" + digits;
  
  // Max 11 karakter (Türkiye'de 11 rakam)
  phone = phone.slice(0, 11);
  
  // Format: (0XXX) XXX-XXXX
  if (phone.length <= 3) {
    return phone;
  } else if (phone.length <= 6) {
    return `(${phone.slice(0, 4)}) ${phone.slice(4)}`;
  } else if (phone.length <= 10) {
    return `(${phone.slice(0, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
  } else {
    return `(${phone.slice(0, 4)}) ${phone.slice(4, 7)}-${phone.slice(7, 11)}`;
  }
}

/**
 * Formatlanmış telefon numarasından sade rakamları al
 */
export function unformatPhoneNumber(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

/**
 * Telefon numarasını doğrula
 */
export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") && digits.length === 11;
}

/**
 * TC Kimlik No formatı: XXX-XXX-XXX-XXXXX
 */
export function formatTcNo(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Para formatı: 1.234,56 ₺
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Tarih formatı: 25 Nisan 2026
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/**
 * Saat formatı: 14:30
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
