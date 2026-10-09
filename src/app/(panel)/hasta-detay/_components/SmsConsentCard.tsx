"use client";

import { useState, type ComponentType } from "react";
import { Send } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateText } from "@/components/ui/Money";
import { showToastSafe } from "@/lib/toast-client";
import { errorMessageOf, type SmsConsentTokenLite, type SmsPreference } from "./patient-file-shared";

const STATUS_LABEL: Record<SmsPreference["status"], string> = {
  PENDING: "Onay bekleniyor",
  ENABLED: "Onay verdi",
  DISABLED: "İstemiyor",
  EXPIRED: "Bağlantının süresi doldu",
};

const STATUS_TONE: Record<SmsPreference["status"], BadgeTone> = {
  PENDING: "warning",
  ENABLED: "success",
  DISABLED: "neutral",
  EXPIRED: "critical",
};

const when = (value?: string | null) => (value ? formatDateText(value, "datetime") : "");

/**
 * Hastanın bilgilendirme SMS'i iznini tek cümleyle anlatır. Önceden "Token
 * durumu", "Bağlantı: İlk SMS" gibi teknik satırlar gösteriliyordu; personelin
 * bilmesi gereken yalnız: hasta izin verdi mi, vermediyse ne yapılabilir.
 */
export function SmsConsentCard({
  patientId,
  preference,
  latestToken,
  canResend,
  onChanged,
  icon: Icon,
}: {
  patientId: string;
  preference: SmsPreference | null;
  latestToken: SmsConsentTokenLite | null;
  canResend: boolean;
  onChanged: () => void;
  icon: ComponentType<{ className?: string }>;
}) {
  const [sending, setSending] = useState(false);
  const now = Date.now();
  // EXPIRED veritabanında tutulmaz: hasta yanıt vermeden son bağlantının
  // süresi dolduysa burada türetilir (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §1.4).
  const status: SmsPreference["status"] =
    preference?.status === "PENDING" && latestToken && !latestToken.usedAt && new Date(latestToken.expiresAt).getTime() < now
      ? "EXPIRED"
      : preference?.status || "PENDING";
  // Gönderilememiş bir onay SMS'i "hastaya ulaştı, cevap bekleniyor" gibi
  // görünmesin — lastRequestError yalnız son deneme başarısızsa doludur.
  const sendFailed = status === "PENDING" && Boolean(preference?.lastRequestError);

  const sentence = (() => {
    if (sendFailed) return `Onay SMS'i gönderilemedi${preference?.lastRequestAttemptAt ? ` (${when(preference.lastRequestAttemptAt)})` : ""}: ${preference?.lastRequestError}`;
    if (status === "ENABLED") return `Hasta bilgilendirme SMS'i almayı onayladı${preference?.firstConsentAt ? ` (${when(preference.firstConsentAt)})` : ""}.`;
    if (status === "DISABLED") return `Hasta SMS almak istemediğini bildirdi${preference?.lastRejectionAt ? ` (${when(preference.lastRejectionAt)})` : ""}. Bilgilendirme SMS'i gönderilmez.`;
    if (status === "EXPIRED") return "Onay bağlantısının süresi doldu; hasta yanıtlamadı. Bilgilendirme SMS'i gönderilmez.";
    if (preference?.lastRequestSentAt) return `Onay bağlantısı gönderildi (${when(preference.lastRequestSentAt)}); hasta henüz yanıtlamadı. Onay gelene kadar bilgilendirme SMS'i gönderilmez.`;
    return "Hastadan henüz SMS onayı istenmedi. Onay gelene kadar bilgilendirme SMS'i gönderilmez.";
  })();

  const resend = async () => {
    setSending(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/sms-consent/resend`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Onay bağlantısı gönderilemedi."));
      showToastSafe({ type: "success", message: "Onay bağlantısı hastaya SMS ile gönderildi." });
      onChanged();
    } catch (sendError) {
      showToastSafe({ type: "error", message: sendError instanceof Error ? sendError.message : "Onay bağlantısı gönderilemedi." });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="ui-surface p-4 sm:p-5" aria-label="SMS izni">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
          SMS izni
        </h2>
        <Badge tone={sendFailed ? "critical" : STATUS_TONE[status]}>{sendFailed ? "Gönderilemedi" : STATUS_LABEL[status]}</Badge>
      </div>
      <p className={`text-sm leading-6 ${sendFailed ? "text-red-700" : "text-slate-600"}`}>{sentence}</p>
      {canResend && status !== "ENABLED" && (
        <Button variant="secondary" size="sm" icon={Send} className="mt-3" loading={sending} onClick={() => void resend()}>
          {preference?.lastRequestSentAt || latestToken ? "Onay bağlantısını tekrar gönder" : "Onay bağlantısı gönder"}
        </Button>
      )}
    </section>
  );
}
