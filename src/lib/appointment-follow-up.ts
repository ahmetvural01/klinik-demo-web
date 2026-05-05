export type FollowUpKey = "YOK" | "GEC_GELDI" | "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "KENDISI_IPTAL";
export type AppointmentTreatmentKey =
  | "IMPLANT"
  | "DETERTRAJ"
  | "METAL_PROVA"
  | "DENTIN_PROVA"
  | "DISLI_PROVA"
  | "BITIM"
  | "SIMANTASYON"
  | "MUAYENE"
  | "KONTROL"
  | "DIKIS_ALIM"
  | "OLCU"
  | "DIJITAL_TARAMA"
  | "DOLGU"
  | "KANAL"
  | "DIGER";

export const FOLLOW_UP_OPTIONS: Array<{ value: FollowUpKey; label: string; needsAction: boolean; badge: string }> = [
  { value: "YOK", label: "Takip yok", needsAction: false, badge: "bg-slate-100 text-slate-600" },
  { value: "GEC_GELDI", label: "Hasta geç geldi", needsAction: false, badge: "bg-amber-100 text-amber-700" },
  { value: "GERI_ARA", label: "Tekrar aranacak", needsAction: true, badge: "bg-rose-100 text-rose-700" },
  { value: "ULASILAMADI", label: "Arandı, ulaşılamadı", needsAction: true, badge: "bg-red-100 text-red-700" },
  { value: "DONUS_BEKLENIYOR", label: "Hasta dönüş yapacak", needsAction: true, badge: "bg-violet-100 text-violet-700" },
  { value: "KENDISI_IPTAL", label: "Kendisi iptal etti", needsAction: false, badge: "bg-gray-200 text-gray-700" },
];

export const APPOINTMENT_TREATMENT_OPTIONS: Array<{
  value: AppointmentTreatmentKey;
  label: string;
  color: string;
  badge: string;
}> = [
  { value: "IMPLANT", label: "Implant", color: "#1d4ed8", badge: "bg-blue-100 text-blue-800" },
  { value: "DETERTRAJ", label: "Detertraj", color: "#0f766e", badge: "bg-teal-100 text-teal-800" },
  { value: "METAL_PROVA", label: "Metal Prova", color: "#475569", badge: "bg-slate-200 text-slate-800" },
  { value: "DENTIN_PROVA", label: "Dentin Prova", color: "#7c3aed", badge: "bg-violet-100 text-violet-800" },
  { value: "DISLI_PROVA", label: "Disli Prova", color: "#9333ea", badge: "bg-purple-100 text-purple-800" },
  { value: "BITIM", label: "Bitim", color: "#059669", badge: "bg-emerald-100 text-emerald-800" },
  { value: "SIMANTASYON", label: "Simantasyon", color: "#0891b2", badge: "bg-cyan-100 text-cyan-800" },
  { value: "MUAYENE", label: "Muayene", color: "#2563eb", badge: "bg-blue-100 text-blue-800" },
  { value: "KONTROL", label: "Kontrol", color: "#d97706", badge: "bg-amber-100 text-amber-800" },
  { value: "DIKIS_ALIM", label: "Dikis Alim", color: "#be123c", badge: "bg-rose-100 text-rose-800" },
  { value: "OLCU", label: "Olcu", color: "#0ea5e9", badge: "bg-sky-100 text-sky-800" },
  { value: "DIJITAL_TARAMA", label: "Dijital Tarama", color: "#0284c7", badge: "bg-sky-100 text-sky-800" },
  { value: "DOLGU", label: "Dolgu", color: "#16a34a", badge: "bg-green-100 text-green-800" },
  { value: "KANAL", label: "Kanal", color: "#dc2626", badge: "bg-red-100 text-red-800" },
  { value: "DIGER", label: "Diger", color: "#334155", badge: "bg-slate-100 text-slate-700" },
];

const VALID_TREATMENT_VALUES = new Set(APPOINTMENT_TREATMENT_OPTIONS.map((item) => item.value));

export function parseAppointmentNote(note?: string | null): { followUp: FollowUpKey; detail: string; treatment: AppointmentTreatmentKey } {
  const raw = (note || "").trim();
  if (!raw) return { followUp: "YOK", detail: "", treatment: "MUAYENE" };

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const treatmentLine = lines.find((line) => line.toLowerCase().startsWith("tedavi:"));
  const followLine = lines.find((line) => line.toLowerCase().startsWith("takip durumu:"));
  const noteLine = lines.find((line) => line.toLowerCase().startsWith("not:"));

  const treatmentValue = treatmentLine?.split(":").slice(1).join(":").trim() as AppointmentTreatmentKey;
  const followValue = (followLine?.split(":").slice(1).join(":").trim() || "") as FollowUpKey;
  const detail = noteLine
    ? noteLine.split(":").slice(1).join(":").trim()
    : (!followLine && !treatmentLine ? raw : lines.filter((line) => line !== followLine && line !== treatmentLine).join(" "));

  const validFollow = FOLLOW_UP_OPTIONS.some((item) => item.value === followValue) ? followValue : "YOK";
  const validTreatment = VALID_TREATMENT_VALUES.has(treatmentValue) ? treatmentValue : "MUAYENE";
  return { followUp: validFollow, detail, treatment: validTreatment };
}

export function buildAppointmentNote(followUp: FollowUpKey, detail: string, treatment?: AppointmentTreatmentKey): string {
  const lines: string[] = [];
  if (treatment) lines.push(`Tedavi: ${treatment}`);
  if (followUp !== "YOK") lines.push(`Takip durumu: ${followUp}`);
  if (detail.trim()) lines.push(`Not: ${detail.trim()}`);
  return lines.join("\n");
}

export function getFollowUpMeta(key: FollowUpKey) {
  return FOLLOW_UP_OPTIONS.find((item) => item.value === key) || FOLLOW_UP_OPTIONS[0];
}

export function getTreatmentMeta(key: AppointmentTreatmentKey) {
  return APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.value === key) || APPOINTMENT_TREATMENT_OPTIONS[7];
}

export function appointmentNeedsFollowUp(status: string, note?: string | null): boolean {
  const parsed = parseAppointmentNote(note);
  return status === "GELMEDI" || getFollowUpMeta(parsed.followUp).needsAction;
}