import type { ModuleKey } from "@/components/ui/ModuleIcon";

/**
 * İşlem türü → bağlamsal rozet eşlemesi. `showToastSafe({ icon })`'a
 * literal `ModuleKey` string'i yazmak yerine buradaki semantik adı
 * kullanmak, hangi eylemin hangi rozeti aldığını tek yerden tutarlı
 * tutar. Bazı türler kaçınılmaz olarak aynı modül rozetini paylaşır
 * (ör. installment-paid ve payment-completed ikisi de "finance") —
 * bu durumlarda ayrım toast başlığı/metniyle sağlanır, rozetle değil;
 * yeni bir ikon ailesi icat etmek yerine mevcut, lisanslı Fluent Emoji
 * setinin sınırları dahilinde en yakın anlamlı eşleme seçildi.
 */
export const STATUS_ACTION_ICON: Record<string, ModuleKey> = {
  "patient-created": "users",
  "patient-updated": "users",
  "appointment-created": "calendar",
  "appointment-rescheduled": "calendar",
  "appointment-cancelled": "calendar",
  "payment-completed": "finance",
  "expense-created": "finance",
  "installment-plan-created": "finance",
  "installment-paid": "finance",
  "stock-in": "box",
  "stock-out": "box",
  "stock-critical": "box",
  "lab-created": "flask",
  "lab-sent": "flask",
  "lab-received": "flask",
  "lab-completed": "flask",
  "prescription-created": "clipboard",
  "task-completed": "clipboard",
  "sms-sent": "sms",
  "sms-failed": "sms",
  "whatsapp-connected": "sms",
  "whatsapp-failed": "sms",
  "document-uploaded": "clipboard",
  "institution-created": "institutions",
  "institution-suspended": "institutions",
  "institution-reactivated": "institutions",
  "invoice-created": "finance",
  "invoice-paid": "finance",
  "permissions-saved": "settings",
  "announcement-published": "log",
  "smtp-tested": "settings",
};

export type StatusActionKey = keyof typeof STATUS_ACTION_ICON;
