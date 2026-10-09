import { Badge } from "@/components/ui/Badge";
import { DISPATCH_STATUS, shortReason, smsConsentOf, type DispatchStatus } from "@/components/sms/communication-labels";

/** Hastanın SMS izni — her ekranda aynı ad ve renk. */
export function SmsConsentBadge({ status }: { status: string | null | undefined }) {
  const consent = smsConsentOf(status);
  return <Badge tone={consent.tone}>{consent.label}</Badge>;
}

/** Hastanın WhatsApp izni (yalnız WhatsApp açık kliniklerde gösterilir). */
export function WhatsappConsentBadge({ granted }: { granted: boolean }) {
  return <Badge tone={granted ? "success" : "neutral"}>{granted ? "WhatsApp izni var" : "WhatsApp izni yok"}</Badge>;
}

/** Gönderim sonucu; "Gönderilmedi" ise kısa nedeniyle birlikte. */
export function DispatchStatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  const presentation = DISPATCH_STATUS[(status in DISPATCH_STATUS ? status : "QUEUED") as DispatchStatus];
  const why = status === "SUPPRESSED" || status === "FAILED" || status === "QUEUED" ? shortReason(reason) : null;
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-0.5">
      <Badge tone={presentation.tone}>{presentation.label}</Badge>
      {why && <span className="text-xs text-slate-500">{why}</span>}
    </span>
  );
}
