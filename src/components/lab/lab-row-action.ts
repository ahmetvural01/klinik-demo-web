import {
  LAB_LABELS,
  expectedReturnAt,
  formatShortLabDate,
  getReceivedItemFromNote,
  parseDesc,
  type LabOrderSummary,
} from "@/lib/lab-workflow";

/**
 * Listedeki durum rozetinin ALTINDAKİ tek kısa satır: "sıradaki adım · tarih"
 * (sadelik K4). Rozetin zaten söylediği kelime tekrar edilmez: "Gecikiyor"
 * rozetinin altında "bekleniyor" yazmaz, "Gönderilmedi" / "İptal edildi"
 * rozetinin altı boş kalır. Uzun cümlenin tamamı (kaçıncı gün dahil)
 * `stageDetail` ile ipucunda ve iş ayrıntısında durur.
 *
 * İki parça döner: `what` (iş adımı — dar ekranda kesilebilir) ve `when`
 * (tarih — hiç kesilmez; satırın asıl karar verdiren kısmı).
 */
export function labStatusLine(
  summary: Pick<LabOrderSummary, "stage" | "pendingTrip" | "lastReceivedTrip" | "lastActivityAt">,
): { what: string; when: string } | null {
  switch (summary.stage) {
    case "late":
    case "atLab": {
      if (!summary.pendingTrip) return null;
      const { sentItem, requestedItem } = parseDesc(summary.pendingTrip.description);
      const due = formatShortLabDate(expectedReturnAt(summary.pendingTrip));
      return { what: (requestedItem || sentItem).trim(), when: summary.stage === "late" ? `dönüş ${due} idi` : `dönüş ${due}` };
    }
    case "clinic": {
      if (!summary.lastReceivedTrip) return null;
      const parts = parseDesc(summary.lastReceivedTrip.description);
      const received = getReceivedItemFromNote(summary.lastReceivedTrip.receivedNote, parts.requestedItem || parts.sentItem);
      return { what: received ? `${received} geldi` : "Geldi", when: formatShortLabDate(summary.lastReceivedTrip.receivedAt) };
    }
    case "done":
      return summary.lastActivityAt ? { what: "", when: `Son işlem ${formatShortLabDate(summary.lastActivityAt)}` } : null;
    default:
      return null;
  }
}

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
