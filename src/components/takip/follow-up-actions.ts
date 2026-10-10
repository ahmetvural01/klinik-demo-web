import type { ApiFollowUp, ApiFollowUpType, FollowItem } from "./follow-up-model";

// Hasta aramaları yazma istekleri tek yerde: listedeki tek tık eylemler
// ("Ulaşılamadı", "Aramayı kapat") ile arama penceresi aynı yolu kullanır.
// Görüşme ve sonucu TEK istekte yazılır (events POST + outcome; HL-02, HL-14).

export type OutcomeKey = "ULASILAMADI" | "GERI_ARA" | "DONUS_BEKLENIYOR" | "RANDEVU" | "ISTEMIYOR" | "TAMAM";

export type Outcome = { key: OutcomeKey; label: string; close: boolean; days?: number; type?: ApiFollowUpType };

/** Görüşmenin sonucu: açık kalanlar sonraki arama gününü kendiliğinden önerir; kapatanlar aramayı bitirir. */
export const OUTCOMES: Outcome[] = [
  { key: "ULASILAMADI", label: "Ulaşılamadı", close: false, days: 2, type: "ULASILAMADI" },
  { key: "GERI_ARA", label: "Tekrar aranacak", close: false, days: 1, type: "GERI_ARA" },
  { key: "DONUS_BEKLENIYOR", label: "Hasta dönüş yapacak", close: false, days: 3, type: "DONUS_BEKLENIYOR" },
  { key: "RANDEVU", label: "Randevu verildi", close: true },
  { key: "ISTEMIYOR", label: "İstemiyor / vazgeçti", close: true },
  { key: "TAMAM", label: "Görüşüldü, iş bitti", close: true },
];

export function outcomeByKey(key: OutcomeKey) {
  return OUTCOMES.find((outcome) => outcome.key === key)!;
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function messageOf(data: Record<string, unknown>, fallback: string) {
  return typeof data.message === "string" && data.message ? data.message : fallback;
}

export async function createFollowUp(body: {
  patientId: string;
  appointmentId?: string;
  doctorId?: string;
  type: ApiFollowUpType;
  priority: number;
  note?: string;
  nextActionAt?: string;
}): Promise<ApiFollowUp> {
  const response = await fetch("/api/patient-follow-ups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readBody(response);
  if (!response.ok) throw new Error(messageOf(data, "Arama listeye eklenemedi."));
  return data as unknown as ApiFollowUp;
}

export async function updateFollowUp(
  followUpId: string,
  body: { type?: ApiFollowUpType; priority?: number; note?: string; nextActionAt?: string | null; status?: "ACIK" | "KAPALI" },
): Promise<ApiFollowUp> {
  const response = await fetch(`/api/patient-follow-ups/${followUpId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readBody(response);
  if (!response.ok) throw new Error(messageOf(data, "Arama güncellenemedi."));
  return data as unknown as ApiFollowUp;
}

/** Yanlış açılmış ya da artık gerekmeyen aramayı iptal eder (yumuşak kapanış; geçmiş korunur). */
export async function cancelFollowUp(followUpId: string): Promise<ApiFollowUp | null> {
  const response = await fetch(`/api/patient-follow-ups/${followUpId}`, { method: "DELETE" });
  const data = await readBody(response);
  if (!response.ok) throw new Error(messageOf(data, "Arama iptal edilemedi."));
  return (data.followUp as ApiFollowUp | undefined) || null;
}

type RecordOutcomeInput = {
  outcome: Outcome;
  /** Kullanıcının notu ("hasta ne dedi"). */
  note?: string;
  /** Açık kalan sonuçta sonraki arama (ISO). */
  nextActionAt?: string | null;
  /** Görüşme zamanı (ISO); varsayılan şimdi. */
  occurredAt?: string;
  channel?: string;
  /** Kapanış notuna eklenecek bağlam (ör. randevu tarihi); kullanıcının notu korunur. */
  prefix?: string;
};

type RecordOutcomeOptions = {
  /** Aynı pencerede ikinci denemede yeni kayıt açılmasın diye önceki denemenin açtığı arama. */
  existingFollowUpId?: string;
  /** Randevudan türeyen satır için kalıcı kayıt açıldığında (görüşme yazılamasa da liste güncellensin). */
  onCreated?: (followUp: ApiFollowUp) => void;
};

/**
 * Görüşmeyi ve sonucunu tek istekte kaydeder. Randevudan türeyen satırda önce
 * kalıcı arama kaydı açılır (API randevunun doktorunu kendisi atar). Özel
 * nedenli (DIGER) ve lab aramalarında sonuç aramanın türünü değiştirmez (HL-V01).
 */
export async function recordOutcome(item: FollowItem, input: RecordOutcomeInput, options: RecordOutcomeOptions = {}): Promise<ApiFollowUp | null> {
  const { outcome } = input;
  if (!outcome.close && !input.nextActionAt) throw new Error("Sonraki arama gününü seçin.");
  let followUpId = item.followUpId || options.existingFollowUpId;
  if (!followUpId) {
    const created = await createFollowUp({
      patientId: item.patientId,
      appointmentId: item.appointmentId,
      doctorId: item.doctorId,
      type: outcome.type || "GERI_ARA",
      priority: item.priority,
      note: item.noteText || undefined,
    });
    followUpId = created.id;
    options.onCreated?.(created);
  }
  const text = (input.note || "").trim();
  const body = [input.prefix?.trim(), text].filter(Boolean).join(": ");
  const summary = body ? `${outcome.label}: ${body}` : outcome.label;
  const keepsType = item.type === "DIGER" || Boolean(item.labContext);
  const response = await fetch(`/api/patient-follow-ups/${followUpId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      occurredAt: input.occurredAt || new Date().toISOString(),
      channel: input.channel || "Telefon",
      summary: summary.length > 300 ? `${summary.slice(0, 297)}…` : summary,
      detail: summary.length > 300 ? body : undefined,
      outcome: {
        type: keepsType ? undefined : outcome.type,
        nextActionAt: outcome.close ? null : input.nextActionAt,
        close: outcome.close,
        resolutionNote: outcome.close ? summary.slice(0, 2000) : undefined,
      },
    }),
  });
  const data = await readBody(response);
  if (!response.ok) throw new Error(messageOf(data, "Görüşme kaydedilemedi."));
  return (data.followUp as ApiFollowUp | null | undefined) || null;
}
