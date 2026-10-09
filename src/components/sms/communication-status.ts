"use client";

import { useCallback, useEffect, useState } from "react";

// İletişim sayfasının üst durum satırı ve sekmelerin ortak bilgisi
// (api/sms/status). Sekmeler /api/settings'i okumaz: BANKO gibi ayar okuma
// yetkisi olmayan roller de klinik adını, krediyi ve bağlantı durumunu görür.

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
  automations: { paymentReminders: boolean; birthday: boolean };
  defaultChannel: "SMS" | "WHATSAPP";
  whatsappSmsFallback: boolean;
  consentLink: { ready: boolean; address: string };
};

function parseStatus(data: unknown): CommunicationStatus | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Partial<CommunicationStatus>;
  if (!value.clinic || !value.branch || !value.automations || !value.consentLink) return null;
  return value as CommunicationStatus;
}

export function useCommunicationStatus() {
  const [status, setStatus] = useState<CommunicationStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/sms/status", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      setStatus(response.ok ? parseStatus(data) : null);
    } catch {
      setStatus(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { status, loaded, reload };
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

export function useMessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sms/templates", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Mesaj metinleri yüklenemedi.");
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (loadError) {
      setTemplates([]);
      setError(loadError instanceof Error ? loadError.message : "Mesaj metinleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { templates, loading, error, reload };
}
