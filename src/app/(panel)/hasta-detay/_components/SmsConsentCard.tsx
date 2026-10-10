"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateText } from "@/components/ui/Money";
import { SMS_CONSENT, type ConsentStatus } from "@/components/sms/communication-labels";
import { showToastSafe } from "@/lib/toast-client";
import { errorMessageOf, type SmsConsentTokenLite, type SmsPreference } from "./patient-file-shared";

const when = (value?: string | null) => (value ? formatDateText(value, "datetime") : "");

/**
 * İletişim sayfası ve Hastalar listesiyle AYNI türetme kuralı (sunucuda
 * api/sms/_lib/consent-status.ts#deriveSmsConsent; o modül veritabanına
 * bağlı olduğu için burada istemci kopyası): izin SMS'i hiç gidemediyse
 * SEND_FAILED, son bağlantı kullanılmadan süresi dolduysa EXPIRED. Önceden
 * aynı hasta İletişim'de "İzin SMS'i gitmedi", burada "Gönderilemedi" /
 * "Onay bekleniyor" görünüyordu (canlı test H2).
 */
function deriveConsent(preference: SmsPreference | null, latestToken: SmsConsentTokenLite | null, now: number): ConsentStatus {
  if (!preference) return "NONE";
  if (preference.status === "ENABLED" || preference.status === "DISABLED" || preference.status === "EXPIRED") return preference.status;
  if (preference.status !== "PENDING") return "NONE";
  if (!preference.lastRequestSentAt && preference.lastRequestError) return "SEND_FAILED";
  if (latestToken && !latestToken.usedAt && new Date(latestToken.expiresAt).getTime() < now) return "EXPIRED";
  return "PENDING";
}

/**
 * Hastanın bilgilendirme SMS'i iznini tek cümleyle anlatır (Özet'teki "Hasta
 * bilgileri" kartının İletişim bölümü). Personelin bilmesi gereken yalnız:
 * hasta izin verdi mi, vermediyse ne yapılabilir. Durum adları İletişim'deki
 * tek sözlükten (components/sms/communication-labels SMS_CONSENT).
 */
export function SmsConsentCard({
  patientId,
  preference,
  latestToken,
  canResend,
  onChanged,
}: {
  patientId: string;
  preference: SmsPreference | null;
  latestToken: SmsConsentTokenLite | null;
  canResend: boolean;
  onChanged: () => void;
}) {
  const [sending, setSending] = useState(false);
  const status = deriveConsent(preference, latestToken, Date.now());
  const view = SMS_CONSENT[status];
  const sendFailed = status === "SEND_FAILED";
  // Daha önce gitmiş bağlantının ardından yapılan yeniden gönderim başarısız
  // olduysa durum "Onay bekliyor" kalır; hata cümlede ayrıca söylenir.
  const lastAttemptFailed = status === "PENDING" && Boolean(preference?.lastRequestError);

  const sentence = (() => {
    if (sendFailed) return `İzin SMS'i gönderilemedi${preference?.lastRequestAttemptAt ? ` (${when(preference.lastRequestAttemptAt)})` : ""}: ${preference?.lastRequestError}`;
    if (status === "ENABLED") return `Hasta bilgilendirme SMS'i almayı onayladı${preference?.firstConsentAt ? ` (${when(preference.firstConsentAt)})` : ""}.`;
    if (status === "DISABLED") return `Hasta SMS almak istemediğini bildirdi${preference?.lastRejectionAt ? ` (${when(preference.lastRejectionAt)})` : ""}. Bilgilendirme SMS'i gönderilmez.`;
    if (status === "EXPIRED") return "Onay bağlantısının süresi doldu; hasta yanıtlamadı. Bilgilendirme SMS'i gönderilmez.";
    if (preference?.lastRequestSentAt) {
      const failedNote = lastAttemptFailed
        ? ` Son gönderim denemesi başarısız${preference.lastRequestAttemptAt ? ` (${when(preference.lastRequestAttemptAt)})` : ""}: ${preference.lastRequestError}`
        : "";
      return `Onay bağlantısı gönderildi (${when(preference.lastRequestSentAt)}); hasta henüz yanıtlamadı. Onay gelene kadar bilgilendirme SMS'i gönderilmez.${failedNote}`;
    }
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
    <div className="space-y-2">
      {/* "SMS izni" etiketi yalnız rozet adı konuyu söylemiyorsa yazılır
          ("SMS izni · SMS izni var" tekrarı olmasın; "Onay bekliyor" bağlamsız kalmasın). */}
      <div className="flex items-center justify-between gap-3">
        {!/SMS/.test(view.label) && <span className="text-xs font-semibold text-slate-500">SMS izni</span>}
        <Badge tone={view.tone}>{view.label}</Badge>
      </div>
      <p className={`text-sm leading-6 ${sendFailed ? "text-red-700" : "text-slate-700"}`}>{sentence}</p>
      {canResend && status !== "ENABLED" && (
        <Button variant="secondary" size="sm" icon={Send} loading={sending} onClick={() => void resend()}>
          {preference?.lastRequestSentAt || latestToken ? "Onay bağlantısını tekrar gönder" : "Onay bağlantısı gönder"}
        </Button>
      )}
    </div>
  );
}
