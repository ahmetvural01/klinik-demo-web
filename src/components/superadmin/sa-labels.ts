import type { BadgeTone } from "@/components/ui/Badge";
import { getAuditActionLabel } from "@/lib/audit-labels";
import { SUBSCRIPTION_PLANS, type BillingCycleId, type SubscriptionPlanId } from "@/lib/subscription-plans";
import type { InvoiceViewStatus } from "./invoice-status";

/**
 * Platform yönetimi ekranlarının sözlüğü. Kod adları (TEMEL, READ_ONLY,
 * SUPERADMIN_INVOICE_CREATE, CONNECTED…) ekranda görünmez; her ekran buradaki
 * etiketleri kullanır. "Klinik" (kurum değil), "Platform yöneticisi" (admin
 * değil), "Gizli giriş" (ghost değil) tek sözcüklerdir.
 */

export type ServiceMode = "NORMAL" | "LIMITED" | "READ_ONLY" | "SUSPENDED";

export function planLabel(plan: string | null | undefined, cycle?: string | null): string {
  const info = plan ? SUBSCRIPTION_PLANS[plan as SubscriptionPlanId] : undefined;
  const name = info?.label || plan || "—";
  if (!cycle) return name;
  return `${name} · ${cycleLabel(cycle)}`;
}

export function cycleLabel(cycle: string | null | undefined): string {
  return cycle === "YILLIK" ? "Yıllık" : "Aylık";
}

export const PLAN_OPTIONS: { value: SubscriptionPlanId; label: string }[] = (Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlanId[])
  .map((id) => ({ value: id, label: SUBSCRIPTION_PLANS[id].label }));

export const CYCLE_OPTIONS: { value: BillingCycleId; label: string }[] = [
  { value: "AYLIK", label: "Aylık" },
  { value: "YILLIK", label: "Yıllık" },
];

export const SERVICE_MODE_META: Record<ServiceMode, { label: string; hint: string; tone: BadgeTone }> = {
  NORMAL: { label: "Normal", hint: "Klinik tüm işlemleri yapabilir.", tone: "success" },
  LIMITED: { label: "Kısıtlı", hint: "Randevu, ödeme, hasta ve personel kaydı açamaz; mevcut kayıtları görebilir.", tone: "warning" },
  READ_ONLY: { label: "Salt okunur", hint: "Hiçbir kayıt ekleyemez veya değiştiremez; yalnız görüntüler.", tone: "warning" },
  SUSPENDED: { label: "Askıda", hint: "Klinik kullanıcıları sisteme giremez.", tone: "critical" },
};

export const INVOICE_STATUS_META: Record<InvoiceViewStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Bekliyor", tone: "warning" },
  OVERDUE: { label: "Gecikti", tone: "critical" },
  PAID: { label: "Ödendi", tone: "success" },
  CANCELLED: { label: "İptal edildi", tone: "neutral" },
};

export const WHATSAPP_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  NOT_CONNECTED: { label: "Bağlı değil", tone: "neutral" },
  CONNECTING: { label: "Bağlanıyor", tone: "info" },
  CONNECTED: { label: "Bağlı", tone: "success" },
  ERROR: { label: "Hata", tone: "critical" },
  DISCONNECTED: { label: "Bağlantı kesildi", tone: "neutral" },
};

export type InstitutionStateInput = {
  isActive: boolean;
  serviceMode?: string | null;
  suspendedUntil?: string | null;
  paymentGraceUntil?: string | null;
  isDemo?: boolean | null;
  demoExpiresAt?: string | null;
};

export type InstitutionState = {
  key: "INACTIVE" | "DEMO_EXPIRED" | "SUSPENDED_UNTIL" | "SUSPENDED" | "READ_ONLY" | "PAYMENT_LOCK" | "LIMITED" | "DEMO" | "NORMAL";
  label: string;
  detail: string;
  tone: BadgeTone;
  /** Klinik bugün bir şekilde engelli mi (listede "Sorunlu" filtresi). */
  blocked: boolean;
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
const fmtDayTime = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Kliniğin bugünkü erişim durumunu, klinik tarafındaki kilitle (requireAuth)
 * AYNI sırayla tek bir etikette toplar: kapatıldı → demo bitti → geçici askı →
 * askıda → salt okunur → ödeme kilidi → kısıtlı → demo → normal. Önceden
 * "Pasif", servis modu, ödeme kilidi ve demo ayrı yerlerde ve ham kodlarla
 * gösteriliyordu; ödeme kilidi hiç gösterilmiyordu.
 */
export function institutionState(input: InstitutionStateInput, now: Date = new Date()): InstitutionState {
  const t = now.getTime();
  const future = (iso?: string | null) => Boolean(iso && new Date(iso).getTime() > t);
  const past = (iso?: string | null) => Boolean(iso && new Date(iso).getTime() <= t);

  if (!input.isActive) {
    return { key: "INACTIVE", label: "Kapalı", detail: "Klinik pasife alındı; kullanıcılar giriş yapamaz.", tone: "critical", blocked: true };
  }
  if (input.isDemo && past(input.demoExpiresAt)) {
    return { key: "DEMO_EXPIRED", label: "Demo bitti", detail: `Demo süresi ${fmtDay(input.demoExpiresAt as string)} tarihinde doldu; klinik giriş yapamaz.`, tone: "critical", blocked: true };
  }
  if (future(input.suspendedUntil)) {
    return { key: "SUSPENDED_UNTIL", label: "Askıda", detail: `${fmtDayTime(input.suspendedUntil as string)} tarihine kadar askıda; tarih geçince kendiliğinden açılır.`, tone: "critical", blocked: true };
  }
  if (input.serviceMode === "SUSPENDED") {
    return { key: "SUSPENDED", label: "Askıda", detail: "Süresiz askıda; siz açana kadar klinik giriş yapamaz.", tone: "critical", blocked: true };
  }
  if (input.serviceMode === "READ_ONLY") {
    return { key: "READ_ONLY", label: "Salt okunur", detail: SERVICE_MODE_META.READ_ONLY.hint, tone: "warning", blocked: true };
  }
  if (past(input.paymentGraceUntil)) {
    return { key: "PAYMENT_LOCK", label: "Ödeme kilidi", detail: `Vadesi ${fmtDay(input.paymentGraceUntil as string)} tarihinde geçen fatura ödenmediği için klinik kayıt ekleyemiyor. Fatura tahsil edilince kilit kendiliğinden kalkar.`, tone: "critical", blocked: true };
  }
  if (input.serviceMode === "LIMITED") {
    return { key: "LIMITED", label: "Kısıtlı", detail: SERVICE_MODE_META.LIMITED.hint, tone: "warning", blocked: true };
  }
  if (input.isDemo) {
    const days = input.demoExpiresAt ? Math.ceil((new Date(input.demoExpiresAt).getTime() - t) / 86_400_000) : null;
    return { key: "DEMO", label: days != null ? `Demo · ${days} gün` : "Demo", detail: days != null ? `Demo ${fmtDay(input.demoExpiresAt as string)} tarihinde bitiyor.` : "Süresiz demo hesabı.", tone: "info", blocked: false };
  }
  return { key: "NORMAL", label: "Normal", detail: "Klinik tüm işlemleri yapabilir.", tone: "success", blocked: false };
}

/** Platform yöneticisinin kendi işlemleri için Türkçe etiketler (klinik /log sözlüğünde yoklar). */
const PLATFORM_ACTION_LABELS: Record<string, string> = {
  SUPERADMIN_INVOICE_CREATE: "Fatura kesildi",
  SUPERADMIN_INVOICE_STATUS_UPDATE: "Fatura durumu değişti",
  SUPERADMIN_INVOICE_REMINDER_SEND: "Fatura hatırlatması gönderildi",
  SUPERADMIN_INVOICE_MARK_OVERDUE: "Gecikmiş faturalar işaretlendi",
  SUPERADMIN_INSTITUTION_CREATE: "Klinik açıldı",
  SUPERADMIN_INSTITUTION_UPDATE: "Klinik bilgileri değişti",
  SUPERADMIN_INSTITUTION_DEACTIVATE: "Klinik pasife alındı",
  SUPERADMIN_INSTITUTION_USER_CREATE: "Klinik kullanıcısı eklendi",
  SUPERADMIN_INSTITUTION_USER_UPDATE: "Klinik kullanıcısı güncellendi",
  SUPERADMIN_INSTITUTION_USER_DEACTIVATE: "Klinik kullanıcısı pasife alındı",
  SUPERADMIN_INSTITUTION_ADS_UPDATE: "Klinik reklam ayarı değişti",
  SUPERADMIN_BRANCH_CREATE: "Şube açıldı",
  SUPERADMIN_BRANCH_UPDATE: "Şube güncellendi",
  SUPERADMIN_DATA_EXPORT: "Klinik verisi indirildi",
  SUPERADMIN_DATA_IMPORT: "Toplu veri aktarıldı",
  SUPERADMIN_ANNOUNCEMENT_CREATE: "Duyuru yayınlandı",
  SUPERADMIN_ANNOUNCEMENT_DELETE: "Duyuru yayından kaldırıldı",
  SUPERADMIN_SUPPORT_ANSWER: "Destek talebi yanıtlandı",
  SUPERADMIN_SUPPORT_DELETE: "Destek talebi silindi",
  SUPERADMIN_SUPPORT_STATUS: "Destek talebi kapatıldı / açıldı",
  SUPERADMIN_AD_CREATE: "Reklam oluşturuldu",
  SUPERADMIN_AD_UPDATE: "Reklam güncellendi",
  SUPERADMIN_AD_DELETE: "Reklam silindi",
  SUPERADMIN_SMS_PACKAGE_CREATE: "SMS paketi oluşturuldu",
  SUPERADMIN_SMS_PACKAGE_UPDATE: "SMS paketi güncellendi",
  SUPERADMIN_SMS_PACKAGE_DELETE: "SMS paketi silindi",
  SUPERADMIN_SMS_PROVIDER_CREATE: "SMS sağlayıcısı eklendi",
  SUPERADMIN_SMS_PROVIDER_UPDATE: "SMS sağlayıcısı güncellendi",
  SUPERADMIN_SMS_PROVIDER_BALANCE_TEST: "SMS sağlayıcı bakiyesi sorgulandı",
  SUPERADMIN_SMS_PROVIDER_TEST_SEND: "Deneme SMS'i gönderildi",
  SUPERADMIN_WHATSAPP_PROVIDER_TEST_SEND: "Deneme WhatsApp mesajı gönderildi",
  SUPERADMIN_SMTP_UPDATE: "E-posta ayarları değişti",
  SUPERADMIN_SMTP_TEST_SEND: "Deneme e-postası gönderildi",
  SUPERADMIN_SMTP_TEST_FAILED: "Deneme e-postası gönderilemedi",
  SUPERADMIN_SMTP_UNLOCK: "E-posta şifresi görüntülendi",
  SUPERADMIN_SMTP_UNLOCK_FAILED: "E-posta şifresi görüntülenemedi",
  SUPERADMIN_ROLE_PERMISSIONS_UPDATE: "Rol yetkileri değişti",
  SUPERADMIN_ROLE_PERMISSIONS_RESET: "Rol yetkileri varsayılana döndü",
  SUPERADMIN_CONSENT_TEMPLATE_UPDATE: "Onam paketi güncellendi",
  SUPERADMIN_CONSENT_TEMPLATE_DELETE: "Eski onam şablonu silindi",
  SUPERADMIN_SITE_CONTENT_UPDATE: "Tanıtım sitesi içeriği değişti",
  SUPERADMIN_AUDIT_EXPORT: "Denetim günlüğü indirildi",
  SUPERADMIN_API_PLAYGROUND_REQUEST: "API deneme isteği",
  SUPERADMIN_CREATE: "Platform yöneticisi eklendi",
  SUPERADMIN_UPDATE: "Platform yöneticisi güncellendi",
  IMPERSONATE_START: "Kliniğe gizli giriş başladı",
  IMPERSONATE_END: "Kliniğe gizli giriş bitti",
  PLATFORM_THEME_UPDATE: "Sistem teması değişti",
  PLATFORM_SMS_PURCHASE: "Platform SMS stoğu eklendi",
  SMS_PACKAGE_SALE: "SMS paketi satıldı",
  SMS_CREDIT_ADJUST: "SMS bakiyesi düzeltildi",
  CELEBRATION_DAY_CREATE: "Kutlama günü eklendi",
  CELEBRATION_DAY_UPDATE: "Kutlama günü güncellendi",
  CELEBRATION_DAY_DELETE: "Kutlama günü silindi",
  CELEBRATION_DAY_TOGGLE: "Kutlama günü açıldı/kapatıldı",
};

export function auditActionLabel(action: string, detail?: string | null): string {
  if (PLATFORM_ACTION_LABELS[action]) return PLATFORM_ACTION_LABELS[action];
  if (action.startsWith("SUPERADMIN_")) {
    // Bilinmeyen platform eylemi: "SUPERADMIN_" önekini at, kalanını klinik
    // sözlüğüyle çevir ("SUPERADMIN_THEME_UPDATE" → "Tema Güncellendi").
    return getAuditActionLabel(action.slice("SUPERADMIN_".length), detail);
  }
  return getAuditActionLabel(action, detail);
}

/** Basit metinden sistem kodu üretir: "Tıp Bayramı" → "TIP_BAYRAMI". */
export function codeFromTitle(title: string): string {
  const map: Record<string, string> = { ç: "C", ğ: "G", ı: "I", i: "I", ö: "O", ş: "S", ü: "U", Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U" };
  return title
    .trim()
    .replace(/[çğıiöşüÇĞİÖŞÜ]/g, (ch) => map[ch] || ch)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}
