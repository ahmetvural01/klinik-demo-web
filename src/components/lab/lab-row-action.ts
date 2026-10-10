import { LAB_LABELS, type LabOrderSummary } from "@/lib/lab-workflow";

export type LabRowActionKind = "send" | "receive" | "complete" | "awaitComplete";

export type LabRowAction = {
  kind: LabRowActionKind;
  label: string;
};

/**
 * Bir lab işinin SIRADAKİ adımı — listedeki tek düğme ve ayrıntıdaki birincil
 * düğme aynı kuraldan gelir (Laboratuvar sayfası ve hasta dosyası). Önceden
 * kural iki ekranda kopyaydı ve "Hastaya takıldı" yetkisi (lab:complete)
 * olmayan kullanıcıya son adımı gelmiş iş için yanlışlıkla "Laboratuvara
 * gönder" öneriliyordu; artık "Hekim takacak" bilgisi döner (düğme değil).
 */
export function getLabRowAction(
  summary: Pick<LabOrderSummary, "stage" | "pendingTrip" | "templateFinished" | "nextStep">,
  { canWrite, canComplete }: { canWrite: boolean; canComplete: boolean },
): LabRowAction | null {
  switch (summary.stage) {
    case "new":
      return canWrite ? { kind: "send", label: LAB_LABELS.send } : null;
    case "atLab":
    case "late":
      return canWrite && summary.pendingTrip ? { kind: "receive", label: LAB_LABELS.receive } : null;
    case "clinic": {
      const finished = summary.templateFinished || !summary.nextStep;
      if (finished) {
        if (canComplete) return { kind: "complete", label: LAB_LABELS.complete };
        return canWrite ? { kind: "awaitComplete", label: "Hekim takacak" } : null;
      }
      if (canWrite) return { kind: "send", label: LAB_LABELS.send };
      return canComplete ? { kind: "complete", label: LAB_LABELS.complete } : null;
    }
    default:
      return null;
  }
}
