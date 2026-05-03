export type FollowUpKey = "YOK" | "GEC_GELDI" | "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "KENDISI_IPTAL";

export const FOLLOW_UP_OPTIONS: Array<{ value: FollowUpKey; label: string; needsAction: boolean; badge: string }> = [
  { value: "YOK", label: "Takip yok", needsAction: false, badge: "bg-slate-100 text-slate-600" },
  { value: "GEC_GELDI", label: "Hasta geç geldi", needsAction: false, badge: "bg-amber-100 text-amber-700" },
  { value: "GERI_ARA", label: "Tekrar aranacak", needsAction: true, badge: "bg-rose-100 text-rose-700" },
  { value: "ULASILAMADI", label: "Arandı, ulaşılamadı", needsAction: true, badge: "bg-red-100 text-red-700" },
  { value: "DONUS_BEKLENIYOR", label: "Hasta dönüş yapacak", needsAction: true, badge: "bg-violet-100 text-violet-700" },
  { value: "KENDISI_IPTAL", label: "Kendisi iptal etti", needsAction: false, badge: "bg-gray-200 text-gray-700" },
];

export function parseAppointmentNote(note?: string | null): { followUp: FollowUpKey; detail: string } {
  const raw = (note || "").trim();
  if (!raw) return { followUp: "YOK", detail: "" };

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const followLine = lines.find((line) => line.toLowerCase().startsWith("takip durumu:"));
  const noteLine = lines.find((line) => line.toLowerCase().startsWith("not:"));

  const followValue = (followLine?.split(":").slice(1).join(":").trim() || "") as FollowUpKey;
  const detail = noteLine
    ? noteLine.split(":").slice(1).join(":").trim()
    : (!followLine ? raw : lines.filter((line) => line !== followLine).join(" "));

  const validFollow = FOLLOW_UP_OPTIONS.some((item) => item.value === followValue) ? followValue : "YOK";
  return { followUp: validFollow, detail };
}

export function buildAppointmentNote(followUp: FollowUpKey, detail: string): string {
  const lines: string[] = [];
  if (followUp !== "YOK") lines.push(`Takip durumu: ${followUp}`);
  if (detail.trim()) lines.push(`Not: ${detail.trim()}`);
  return lines.join("\n");
}

export function getFollowUpMeta(key: FollowUpKey) {
  return FOLLOW_UP_OPTIONS.find((item) => item.value === key) || FOLLOW_UP_OPTIONS[0];
}

export function appointmentNeedsFollowUp(status: string, note?: string | null): boolean {
  const parsed = parseAppointmentNote(note);
  return status === "GELMEDI" || getFollowUpMeta(parsed.followUp).needsAction;
}