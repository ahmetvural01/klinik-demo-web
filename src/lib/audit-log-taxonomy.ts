import { getAuditActionLabel } from "@/lib/audit-labels";

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

// audit-labels.ts'de karşılığı olmayan, klinik panelinde üretilen kodlar.
// Bunlar eksikken kod sözcük sözcük çevriliyor ve "Klinik Unıt Oluşturuldu"
// gibi bozuk metinler çıkıyordu.
const EXTRA_ACTION_LABELS: Record<string, string> = {
  BRANCH_CONTEXT_CHANGE: "Çalışılan Şube Değiştirildi",
  CELEBRATION_DAY_CREATE: "Kutlama Günü Eklendi",
  CELEBRATION_DAY_UPDATE: "Kutlama Günü Güncellendi",
  CELEBRATION_DAY_DELETE: "Kutlama Günü Silindi",
  CELEBRATION_DAY_TOGGLE: "Kutlama Günü Açıldı / Kapatıldı",
  CLINIC_TASK_CANCEL: "Görev İptal Edildi",
  CLINIC_UNIT_CREATE: "Koltuk / Oda Eklendi",
  CLINIC_UNIT_UPDATE: "Koltuk / Oda Güncellendi",
  DOSYA_GORUNTULEME: "Hasta Dosyası Görüntülendi",
  EXAM_CANCEL: "Muayene Kaydı İptal Edildi",
  IMPERSONATE_START: "Destek Ekibi Hesaba Bağlandı",
  IMPERSONATE_END: "Destek Ekibi Bağlantısı Kapandı",
  LAB_ORDER_EDIT: "Laboratuvar Işi Düzenlendi",
  LAB_ORDER_INVOICE_UPDATE: "Laboratuvar Faturası Güncellendi",
  LAB_ORDER_INVOICE_CANCEL: "Laboratuvar Faturası İptal Edildi",
  LOGOUT_ALL_DEVICES: "Diğer Cihazlardaki Oturumlar Kapatıldı",
  PACKAGE_DEFINITION_CREATE: "Paket Şablonu Eklendi",
  PACKAGE_DEFINITION_UPDATE: "Paket Şablonu Güncellendi",
  PACKAGE_DEFINITION_DEACTIVATE: "Paket Şablonu Pasife Alındı",
  PATIENT_ARCHIVE: "Hasta Arşivlendi",
  PATIENT_FOLLOW_UP_CANCEL: "Hasta Takibi İptal Edildi",
  PATIENT_FOLLOW_UP_EVENT_CANCEL: "Hasta Takip Notu İptal Edildi",
  PATIENT_PACKAGE_SELL: "Hastaya Paket Satıldı",
  PATIENT_PACKAGE_USE: "Hasta Paketinden Kullanım Düşüldü",
  PATIENT_PACKAGE_CANCEL: "Hasta Paketi İptal Edildi",
  PATIENT_SMS_CONSENT_RESEND: "Hastaya SMS İzin Mesajı Yeniden Gönderildi",
  POS_DEACTIVATE: "POS Cihazı Pasife Alındı",
  PRESCRIPTION_VOID: "Reçete İptal Edildi",
  PRICE_SOURCE_UPDATE: "Kullanılan Fiyat Listesi Değiştirildi",
  REMINDER_CANCEL: "Hatırlatma İptal Edildi",
  SMS_MANUAL_FAILED: "Elle Gönderilen SMS Gönderilemedi",
  STAFF_BRANCH_DEACTIVATE: "Personelin Şube Erişimi Kapatıldı",
  STAFF_BRANCH_ACCESS_UPDATE: "Personele Şube Erişimi Verildi",
  STAFF_BRANCH_ACCESS_REVOKE: "Personelin Şube Erişimi Kaldırıldı",
  TAKSIT_PLAN_CANCEL: "Taksit Planı İptal Edildi",
  TREATMENT_PLAN_CANCEL: "Tedavi Planı İptal Edildi",
  VERI_DISA_AKTARMA: "Veri Dışa Aktarıldı",
  WAITLIST_CANCEL: "Bekleme Listesi Kaydı İptal Edildi",
  WHATSAPP_DELIVERY_SETTINGS_UPDATE: "WhatsApp Gönderim Ayarı Güncellendi",
  WHATSAPP_DISCONNECTED: "WhatsApp Bağlantısı Kesildi",
  WHATSAPP_EMBEDDED_SIGNUP_CONNECTED: "WhatsApp Hesabı Bağlandı",
  WHATSAPP_PROVIDER_CREATE: "WhatsApp Sağlayıcısı Eklendi",
  WHATSAPP_PROVIDER_TEST_SEND: "WhatsApp Deneme Mesajı Gönderildi",
  WHATSAPP_REPLY: "WhatsApp Mesajı Yanıtlandı",
  WHATSAPP_REPLY_FAILED: "WhatsApp Yanıtı Gönderilemedi",
};

/**
 * İşlem kodunun okunur adı. Ortak sözlükte (audit-labels) ya da yukarıdaki
 * ek listede olmayan kodlar için tahmini/bozuk sözcük sözcük çeviri yerine
 * "Diğer işlem" gösterilir; ham kod ayrıntı penceresinde görünür.
 */
export function auditActionLabel(action: string, detail?: string | null): string {
  if (EXTRA_ACTION_LABELS[action]) return EXTRA_ACTION_LABELS[action];
  if (KNOWN_LABEL_CODES.has(action)) return getAuditActionLabel(action, detail);
  return "Diğer işlem";
}

// audit-labels.ts'deki ACTION_LABELS anahtarları (dosya yalnız fonksiyon
// dışa aktardığından listesi burada tutulur; yeni kod eklenirse iki yere de
// eklenmeli — bkz. shared_requests: etiketlerin tek sözlükte birleşmesi).
const KNOWN_LABEL_CODES = new Set<string>([
  "LOGIN", "LOGOUT", "PATIENT_CREATE", "PATIENT_UPDATE", "PATIENT_DELETE", "PATIENT_DATA_EXPORT",
  "PATIENT_CONSENT_CREATE", "PATIENT_CONSENT_VOID", "APPOINTMENT_CREATE", "APPOINTMENT_UPDATE",
  "APPOINTMENT_DELETE", "APPOINTMENT_STATUS", "APPOINTMENT_CANCEL", "BOOKING_REQUEST_UPDATE",
  "PUBLIC_BOOKING_REQUEST_CREATE", "WAITLIST_CREATE", "WAITLIST_UPDATE", "WAITLIST_DELETE",
  "DOCTOR_BLOCK_CREATE", "DOCTOR_BLOCK_DELETE", "EXAM_CREATE", "EXAM_UPDATE", "EXAM_DELETE",
  "EXAM_SETTINGS_UPDATE", "TREATMENT_PLAN_CREATE", "TREATMENT_PLAN_UPDATE", "TREATMENT_PLAN_DELETE",
  "TREATMENT_TYPE_CREATE", "TREATMENT_TYPE_UPDATE", "TREATMENT_TYPE_DELETE", "PRESCRIPTION_CREATE",
  "PRESCRIPTION_DELETE", "PAYMENT_CREATE", "PAYMENT_UPDATE", "PAYMENT_DELETE", "PAYMENT_VOID",
  "KASA_PAYMENT_CREATE", "GIDER_CREATE", "GIDER_UPDATE", "GIDER_DELETE", "TAKSIT_MARK_OVERDUE",
  "TAKSIT_ODEME", "TAKSIT_PLAN_CREATE", "TAKSIT_PLAN_UPDATE", "TAKSIT_PLAN_DELETE", "FIRMA_CREATE",
  "FIRMA_UPDATE", "FIRMA_KONTAKT_CREATE", "FIRMA_KONTAKT_UPDATE", "FIRMA_KONTAKT_DELETE",
  "FIRMA_ISLEM_CREATE", "FIRMA_ISLEM_UPDATE", "FIRMA_ISLEM_CANCEL", "PURCHASE_CREATE", "PURCHASE_UPDATE",
  "PURCHASE_CANCEL", "EXPENSE_CATEGORY_CREATE", "EXPENSE_CATEGORY_UPDATE", "PRICE_CREATE", "PRICE_UPDATE",
  "PRICE_DELETE", "STOCK_ITEM_CREATE", "STOCK_ITEM_UPDATE", "STOCK_MOVEMENT", "STOCK_ITEM_DELETE",
  "PROFILE_UPDATE", "PASSWORD_CHANGE", "SETTINGS_UPDATE", "STAFF_CREATE", "STAFF_UPDATE", "STAFF_DEACTIVATE",
  "POS_CREATE", "POS_UPDATE", "POS_DELETE", "SUPPORT_CREATE", "SUPPORT_UPDATE", "SUPPORT_DELETE",
  "SMS_TEMPLATE_UPDATE", "SMS_TEMPLATE_SAVE", "SMS_TEMPLATE_CUSTOM_SAVE", "SMS_TEMPLATE_CUSTOM_RESET",
  "SMS_BILGI", "SMS_HATIRLATMA", "SMS_ANKET", "SMS_TOPLU", "SMS_BILGI_AUTO", "SMS_REMINDER_AUTO",
  "SMS_BILGI_FAILED", "SMS_HATIRLATMA_FAILED", "SMS_ANKET_FAILED", "SMS_TOPLU_FAILED",
  "SMS_BILGI_AUTO_FAILED", "SMS_REMINDER_AUTO_FAILED", "LAB_ORDER_CREATE", "LAB_ORDER_UPDATE",
  "LAB_ORDER_RPT_REOPEN", "LAB_ORDER_INVOICE_CREATE", "LAB_TRIP_CREATE", "LAB_TRIP_UPDATE",
  "DOCUMENT_CREATE", "DOCUMENT_DELETE", "MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE",
  "ANNOUNCEMENT_CREATE", "ANNOUNCEMENT_DELETE", "CLINIC_TASK_CREATE", "CLINIC_TASK_UPDATE",
  "CLINIC_TASK_DELETE", "REMINDER_CREATE", "REMINDER_UPDATE", "REMINDER_DELETE", "TWO_FACTOR_ENABLE",
  "TWO_FACTOR_DISABLE", "PROFILE_2FA_SETUP_START", "FOLLOW_UP_TYPES_UPDATE", "PATIENT_FOLLOW_UP_CREATE",
  "PATIENT_FOLLOW_UP_UPDATE", "PATIENT_FOLLOW_UP_DELETE", "PATIENT_FOLLOW_UP_EVENT_CREATE",
  "PATIENT_FOLLOW_UP_EVENT_UPDATE", "PATIENT_FOLLOW_UP_EVENT_DELETE", "CONSENT_TEMPLATE_CREATE",
  "PLATFORM_THEME_UPDATE", "DEV_DEMO_LOAD", "DEV_DEMO_LOAD_SKIPPED", "DEMO_REQUEST_CREATE",
  "DEMO_PACKAGE_LOAD", "LIVE_DEMO_DATA_LOAD", "SEED",
]);
