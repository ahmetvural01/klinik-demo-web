import { getAuditActionLabel, hasAuditActionLabel } from "@/lib/audit-labels";

// İşlem Kayıtları (/log) ekranının TEK sınıflandırması: hem "İşlem türü"
// filtresi (api/logs) hem satırdaki bölüm etiketi buradan okunur. Önceden
// ikisi farklı listelerdi; personel işlemleri etikette "Genel", filtrede
// "Sistem" altında görünüyor, ~20 işlem türü hiçbir filtrede çıkmıyordu.

export type AuditCategoryKey =
  | "hasta" | "randevu" | "tedavi" | "finans" | "lab" | "stok" | "gorev"
  | "iletisim" | "personel" | "guvenlik" | "ayar" | "destek" | "diger";

export const AUDIT_CATEGORIES: Array<{ key: AuditCategoryKey; label: string }> = [
  { key: "hasta", label: "Hasta" },
  { key: "randevu", label: "Randevu" },
  { key: "tedavi", label: "Tedavi / reçete" },
  { key: "finans", label: "Finans" },
  { key: "lab", label: "Laboratuvar" },
  { key: "stok", label: "Stok" },
  { key: "gorev", label: "Görev / hatırlatma" },
  { key: "iletisim", label: "SMS / WhatsApp / mesaj" },
  { key: "personel", label: "Personel" },
  { key: "guvenlik", label: "Giriş ve güvenlik" },
  { key: "ayar", label: "Ayarlar" },
  { key: "destek", label: "Destek" },
  { key: "diger", label: "Diğer" },
];

type AuditRule = {
  category: Exclude<AuditCategoryKey, "diger">;
  /** "_" ile bitiyorsa önek, değilse tam işlem kodu. */
  code: string;
  /** Yalnız ayrıntı metni bunu içeriyorsa eşleşir (ör. SMS ayarı). */
  detailContains?: string;
};

// Sıra önemlidir: ilk eşleşen kural kazanır (TREATMENT_TYPE_ ayardır,
// TREATMENT_ tedavidir; EXAM_SETTINGS_ ayardır, EXAM_ tedavidir).
const RULES: AuditRule[] = [
  { category: "iletisim", code: "SETTINGS_UPDATE", detailContains: "SMS" },
  { category: "ayar", code: "SETTINGS_" },
  { category: "ayar", code: "TREATMENT_TYPE_" },
  { category: "ayar", code: "EXAM_SETTINGS_" },
  { category: "ayar", code: "POS_" },
  { category: "ayar", code: "PRICE_" },
  { category: "ayar", code: "FOLLOW_UP_TYPES_" },
  { category: "ayar", code: "CLINIC_UNIT_" },
  { category: "ayar", code: "PACKAGE_DEFINITION_" },
  { category: "ayar", code: "CONSENT_TEMPLATE_" },
  { category: "ayar", code: "PLATFORM_THEME_" },
  { category: "hasta", code: "PATIENT_" },
  { category: "hasta", code: "DOCUMENT_" },
  { category: "hasta", code: "DOSYA_GORUNTULEME" },
  { category: "hasta", code: "VERI_DISA_AKTARMA" },
  { category: "randevu", code: "APPOINTMENT_" },
  { category: "randevu", code: "BOOKING_REQUEST_" },
  { category: "randevu", code: "PUBLIC_BOOKING_" },
  { category: "randevu", code: "WAITLIST_" },
  { category: "randevu", code: "DOCTOR_BLOCK_" },
  { category: "tedavi", code: "EXAM_" },
  { category: "tedavi", code: "TREATMENT_" },
  { category: "tedavi", code: "PRESCRIPTION_" },
  { category: "finans", code: "PAYMENT_" },
  { category: "finans", code: "KASA_" },
  { category: "finans", code: "GIDER_" },
  { category: "finans", code: "TAKSIT_" },
  { category: "finans", code: "FIRMA_" },
  { category: "finans", code: "PURCHASE_" },
  { category: "finans", code: "EXPENSE_" },
  { category: "lab", code: "LAB_" },
  { category: "stok", code: "STOCK_" },
  { category: "gorev", code: "CLINIC_TASK_" },
  { category: "gorev", code: "REMINDER_" },
  { category: "iletisim", code: "SMS_" },
  { category: "iletisim", code: "WHATSAPP_" },
  { category: "iletisim", code: "MESSAGE_" },
  { category: "iletisim", code: "ANNOUNCEMENT_" },
  { category: "iletisim", code: "CELEBRATION_DAY_" },
  { category: "personel", code: "STAFF_" },
  { category: "guvenlik", code: "LOGIN" },
  { category: "guvenlik", code: "LOGOUT" },
  { category: "guvenlik", code: "LOGOUT_ALL_DEVICES" },
  { category: "guvenlik", code: "PASSWORD_" },
  { category: "guvenlik", code: "PROFILE_" },
  { category: "guvenlik", code: "TWO_FACTOR_" },
  { category: "guvenlik", code: "BRANCH_CONTEXT_" },
  { category: "guvenlik", code: "IMPERSONATE_" },
  { category: "destek", code: "SUPPORT_" },
];

function ruleMatches(rule: AuditRule, action: string, detail?: string | null) {
  const codeOk = rule.code.endsWith("_") ? action.startsWith(rule.code) : action === rule.code;
  if (!codeOk) return false;
  if (rule.detailContains) return (detail || "").toLocaleUpperCase("tr-TR").includes(rule.detailContains.toLocaleUpperCase("tr-TR"));
  return true;
}

export function auditCategoryOf(action: string, detail?: string | null): AuditCategoryKey {
  return RULES.find((rule) => ruleMatches(rule, action, detail))?.category || "diger";
}

export function auditCategoryLabel(key: AuditCategoryKey): string {
  return AUDIT_CATEGORIES.find((category) => category.key === key)?.label || "Diğer";
}

export function isAuditCategoryKey(value: string): value is AuditCategoryKey {
  return AUDIT_CATEGORIES.some((category) => category.key === value);
}

// Prisma `where` parçası (yalnız düz nesne; @prisma/client tipine bağlı
// kalmamak için Record kullanılır). Bir kayıt, kendisine ilk eşleşen kuralın
// kategorisine aittir; bu yüzden her kural, ondan önce gelen başka
// kategorilerin kurallarıyla eşleşmeyen kayıtları seçer.
type WhereFragment = Record<string, unknown>;

function ruleWhere(rule: AuditRule): WhereFragment {
  const action = rule.code.endsWith("_") ? { startsWith: rule.code } : rule.code;
  return rule.detailContains
    ? { action, detail: { contains: rule.detailContains, mode: "insensitive" } }
    : { action };
}

export function auditCategoryWhere(key: AuditCategoryKey): WhereFragment {
  if (key === "diger") return { NOT: { OR: RULES.map(ruleWhere) } };
  const branches = RULES.flatMap((rule, index) => {
    if (rule.category !== key) return [];
    const earlierOthers = RULES.slice(0, index).filter((other) => other.category !== key).map(ruleWhere);
    return [earlierOthers.length > 0 ? { AND: [ruleWhere(rule), { NOT: { OR: earlierOthers } }] } : ruleWhere(rule)];
  });
  return { OR: branches };
}

/**
 * İşlem kodunun okunur adı (tek sözlük: src/lib/audit-labels.ts). Sözlükte
 * olmayan kodlar için tahmini/bozuk sözcük sözcük çeviri yerine "Diğer işlem"
 * gösterilir; ham kod ayrıntı penceresinde görünür.
 */
export function auditActionLabel(action: string, detail?: string | null): string {
  if (hasAuditActionLabel(action)) return getAuditActionLabel(action, detail);
  return "Diğer işlem";
}
