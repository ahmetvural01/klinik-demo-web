"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// İletişim sayfasının ortak verileri: üst durum (api/sms/status), mesaj
// metinleri (api/sms/templates) ve özel gün kataloğu (api/celebration-days).
// Sayfa bunları BİR kez yükler ve sekmelere verir; önceden Mesaj gönder ve
// Otomatik mesajlar aynı metinleri ayrı ayrı çekiyordu. Sekmeler
// /api/settings'i okumaz: BANKO gibi ayar okuma yetkisi olmayan roller de
// klinik adını, krediyi, bağlantıyı ve otomatik mesajların gerçek durumunu görür.

export type PaymentSchedule = {
  /** Vadeden kaç gün önce (büyükten küçüğe). Boş = vadesi yaklaşan hatırlatma kapalı. */
  daysBefore: number[];
  onDueDate: boolean;
  overdueEnabled: boolean;
  overdueEveryDays: number;
};

export type AutomationState = {
  paymentReminders: boolean;
  birthday: boolean;
  appointmentChange: boolean;
  appointmentCancel: boolean;
  paymentSchedule: PaymentSchedule;
  /** Randevu formunda bilgilendirme kutusu yeni randevularda seçili gelsin. */
  smsDefaultInfo: boolean;
  /** Randevu formunda hatırlatma kutusu yeni randevularda seçili gelsin. */
  smsDefaultReminder: boolean;
};

export type CommunicationStatus = {
  clinic: {
    /** Randevu, ödeme, doğum günü ve elle/toplu mesajlarda görünen ad. */
    displayName: string;
    displayPhone: string;
    /** İzin SMS'i ve otomatik özel gün mesajlarında kullanılan kurum adı. */
    legalName: string;
    legalPhone: string;
    reviewLink: string;
  };
  branch: { name: string; multiple: boolean };
  sms: { enabled: boolean; balance: number; lowBalanceThreshold: number } | null;
  whatsapp: { connected: boolean; phone?: string | null } | null;
  automations: AutomationState;
  defaultChannel: "SMS" | "WHATSAPP";
  whatsappSmsFallback: boolean;
  consentLink: { ready: boolean; address: string };
};

// Şemadaki varsayılanlarla aynı (prisma Setting).
const DEFAULT_AUTOMATIONS: AutomationState = {
  paymentReminders: false,
  birthday: false,
  appointmentChange: true,
  appointmentCancel: true,
  paymentSchedule: { daysBefore: [3], onDueDate: true, overdueEnabled: true, overdueEveryDays: 3 },
  smsDefaultInfo: true,
  smsDefaultReminder: false,
};

function messageOf(data: unknown, fallback: string) {
  const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function parseStatus(data: unknown): CommunicationStatus | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Partial<CommunicationStatus>;
  if (!value.clinic || !value.branch || !value.automations || !value.consentLink) return null;
  const automations = value.automations as Partial<AutomationState>;
  return {
    ...(value as CommunicationStatus),
    automations: {
      ...DEFAULT_AUTOMATIONS,
      ...automations,
      paymentSchedule: { ...DEFAULT_AUTOMATIONS.paymentSchedule, ...(automations.paymentSchedule || {}) },
    },
  };
}

export function useCommunicationStatus() {
  const [status, setStatus] = useState<CommunicationStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/sms/status", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      const parsed = response.ok ? parseStatus(data) : null;
      if (!parsed) throw new Error(messageOf(data, "İletişim durumu yüklenemedi."));
      setStatus(parsed);
      setError("");
    } catch (loadError) {
      // Eldeki durum korunur: geçici bir hatada kredi "0", SMS "kapalı" gibi
      // yanlış bir tablo çizilmez; yalnız hata bildirilir.
      setError(loadError instanceof Error ? loadError.message : "İletişim durumu yüklenemedi.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  /** Kaydedilen bir ayarı sunucuya yeniden sormadan ekrana yansıtır. */
  const patch = useCallback((updater: (current: CommunicationStatus) => CommunicationStatus) => {
    setStatus((current) => (current ? updater(current) : current));
  }, []);

  return { status, loaded, error, reload, patch };
}

/** Kurumun kayıtlı (kliniğe özel ya da sistem) mesaj metni — api/sms/templates. */
export type MessageTemplate = {
  code: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
  whatsappContent: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string;
  isActive: boolean;
  isCustom: boolean;
  hasDefault: boolean;
  defaultTitle?: string;
  defaultContent?: string;
  updatedAt: string;
};

export type MessageTemplatesState = ReturnType<typeof useMessageTemplates>;

/**
 * Mesaj metinleri. `enabled` false iken istek atılmaz (metin gerekmeyen
 * sekmede bekletmesin). Kaydet/sil sonrası liste hemen yerelde güncellenir
 * (`upsert`/`remove`); sunucudan tazeleme arkadan gelir ve eldeki liste
 * yenileme sırasında boşaltılmaz.
 */
export function useMessageTemplates(enabled = true) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requested = useRef(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/sms/templates", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(data, "Mesaj metinleri yüklenemedi."));
      const list = data && typeof data === "object" && Array.isArray((data as { templates?: unknown }).templates)
        ? (data as { templates: MessageTemplate[] }).templates
        : [];
      setTemplates(list);
      setLoaded(true);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Mesaj metinleri yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    void reload();
  }, [enabled, reload]);

  const upsert = useCallback((template: MessageTemplate) => {
    setTemplates((list) => {
      const index = list.findIndex((item) => item.code === template.code);
      if (index < 0) return [...list, template];
      const next = [...list];
      next[index] = template;
      return next;
    });
  }, []);

  const remove = useCallback((code: string) => {
    setTemplates((list) => list.filter((item) => item.code !== code));
  }, []);

  return { templates, loaded, loading: !loaded && (busy || (enabled && !error)), error, reload, upsert, remove };
}

/** Özel gün kataloğu (api/celebration-days). Sayılar yalnız `withCounts` ile gelir. */
export type CelebrationDay = {
  code: string;
  title: string;
  targetProfessions: string[];
  messageTemplate: string;
  whatsappMessageTemplate: string | null;
  enabled: boolean;
  nextDate: string | null;
  /** consented: bugünkü kanal ayarıyla mesajın gidebileceği hasta (bu şubede). */
  audience?: { total: number; consented: number };
  sentThisYear?: number;
};

export function useCelebrationDays(enabled = true, withCounts = false) {
  const [days, setDays] = useState<CelebrationDay[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requested = useRef(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/celebration-days${withCounts ? "" : "?counts=0"}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(data, "Özel günler yüklenemedi."));
      const list = data && typeof data === "object" && Array.isArray((data as { days?: unknown }).days)
        ? (data as { days: CelebrationDay[] }).days
        : [];
      setDays(list);
      setLoaded(true);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Özel günler yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [withCounts]);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    void reload();
  }, [enabled, reload]);

  const setDayEnabled = useCallback((code: string, on: boolean) => {
    setDays((list) => list.map((day) => (day.code === code ? { ...day, enabled: on } : day)));
  }, []);

  return { days, loaded, loading: !loaded && (busy || (enabled && !error)), error, reload, setDayEnabled };
}
