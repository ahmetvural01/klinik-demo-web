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
 * Hastanın bilgilendirme SMS'i iznini tek satırda anlatır (Özet'teki "Hasta
 * bilgileri" kartının "SMS izni" satırı). Personelin bilmesi gereken yalnız:
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

  // Rozet durumu söyler; altındaki kısa satır yalnız rozetin söylemediğini
  // (ne zaman, neden, sonucu) yazar. Önceden rozetin altında aynı durumu
  // tekrar eden uzun kırmızı cümle vardı ("İzin SMS'i gitmedi" + "İzin SMS'i
  // gönderilemedi (…): …").
  const sentence = (() => {
    if (sendFailed) return [preference?.lastRequestError?.replace(/[.\s]+$/, ""), when(preference?.lastRequestAttemptAt)].filter(Boolean).join(" · ");
    if (status === "ENABLED") return preference?.firstConsentAt ? `Onay: ${when(preference.firstConsentAt)}` : "";
    if (status === "DISABLED") return `Bilgilendirme SMS'i gönderilmez${preference?.lastRejectionAt ? ` · ${when(preference.lastRejectionAt)}` : ""}.`;
    if (status === "EXPIRED") return "Hasta yanıtlamadı; bilgilendirme SMS'i gönderilmez.";
    if (preference?.lastRequestSentAt) {
      const failedNote = lastAttemptFailed
        ? ` Son deneme başarısız${preference.lastRequestAttemptAt ? ` (${when(preference.lastRequestAttemptAt)})` : ""}: ${preference.lastRequestError}`
        : "";
      return `Bağlantı gönderildi: ${when(preference.lastRequestSentAt)}. Onay gelene kadar bilgilendirme SMS'i gönderilmez.${failedNote}`;
    }
    return "Onay gelene kadar bilgilendirme SMS'i gönderilmez.";
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

  const resent = Boolean(preference?.lastRequestSentAt || latestToken);

  // "Hasta bilgileri" listesinin bir satırı gibi: solda ad, sağda rozet, kısa
  // satır ve çerçevesiz eylem (ayrı "İletişim" alt başlığı ve kutulu düğme yok).
  return (
    <dl className="grid grid-cols-[minmax(96px,34%)_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-xs font-semibold leading-5 text-slate-500">SMS izni</dt>
      <dd className="min-w-0 space-y-1">
        <Badge tone={view.tone}>{view.label}</Badge>
        {sentence && <p className="text-xs leading-5 text-slate-600">{sentence}</p>}
        {canResend && status !== "ENABLED" && (
          <Button
            variant="ghost"
            size="sm"
            icon={Send}
            className="-ml-3"
            loading={sending}
            aria-label={resent ? "Onay bağlantısını tekrar gönder" : undefined}
            onClick={() => void resend()}
          >
            {resent ? "Tekrar gönder" : "Onay bağlantısı gönder"}
          </Button>
        )}
      </dd>
    </dl>
  );
}
