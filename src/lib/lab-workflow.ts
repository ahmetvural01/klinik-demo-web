// Laboratuvar iş akışının TEK kaynağı: iş türleri, adım şablonları, not
// içindeki gizli işaretler, durum adları ve "bu iş şu an nerede, sıradaki
// adım ne" hesabı. Önceden aynı şablon ve yardımcılar Laboratuvar sayfasında,
// iş detay panelinde ve hasta dosyasında ayrı ayrı (ve farklı içerikle)
// yazılmıştı: detay paneli bazı iş türlerinin şablonunu bilmediği için yeni
// açılmış bir Veneer işine "Süreç tamamlandı" diyebiliyordu; aynı iş bir
// ekranda "Klinikte", diğerinde "Laboratuvarda" görünüyordu. İstemci ve
// sunucu (API) aynı yardımcıları kullanır.

export type WorkflowStep = { send: string; request: string };

export type LabTripLike = {
  id?: string;
  order?: number;
  description: string;
  sentAt: string;
  expectedAt?: string | null;
  receivedAt?: string | null;
  sentNote?: string | null;
  receivedNote?: string | null;
};

export type LabInvoiceLike = { amount: number };

export type LabOrderLike = {
  labType: string;
  notes?: string | null;
  status: string;
  trips: LabTripLike[];
  invoices: LabInvoiceLike[];
};

// ── Ekran metinleri ────────────────────────────────────────────────────────
// Aynı eylem her ekranda aynı adla geçsin (önceden "Geliş Kaydet" /
// "Laboratuvardan Geldi" / "Gelişi Kaydet" gibi dört farklı ad vardı).
export const LAB_LABELS = {
  newOrder: "Yeni lab işi",
  send: "Laboratuvara gönder",
  receive: "Laboratuvardan geldi",
  complete: "Hastaya takıldı",
  addInvoice: "Lab faturası ekle",
  editInvoice: "Faturayı düzenle",
  cancelInvoice: "Faturayı iptal et",
  editStep: "Adımı düzenle",
  editOrder: "Bilgileri düzenle",
  cancelOrder: "İşi iptal et",
  rework: "Yeniden yapım başlat",
  reworkBadge: "Yeniden yapım (ücretsiz)",
  doctor: "Hekim",
  lab: "Laboratuvar",
  /** Laboratuvar firmalarının tanımlandığı ekranın sol menüdeki adı. */
  firmScreen: "Satın Alma",
} as const;

export const LAB_CATEGORIES: { group: string; items: string[] }[] = [
  {
    group: "Sabit restorasyon",
    items: ["Zirkonyum", "E-max", "Metal Destekli Porselen", "Full Metal", "Kuron Tamir"],
  },
  { group: "Veneer", items: ["Veneer (Laminat)"] },
  {
    group: "Protez",
    items: [
      "Tam Protez",
      "Hareketli Kısmi Protez",
      "Hareketli Kısmi Protez (Metal Kroşe)",
      "Protez Tamir",
      "İmplant Üstü Hareketli Protez",
      "İmmediyat Protez",
    ],
  },
  { group: "İmplant üstü", items: ["İmplant Üstü Sabit Restorasyon"] },
  {
    group: "Aparey ve plak",
    items: ["Gece Plağı", "Kas Gevşetici Splint (Michigan)", "Şeffaf Plak (Aligner)", "Braket Reteyner", "Bruksizm Plağı"],
  },
  { group: "Diğer", items: ["Beyazlatma Atel", "Zirkon Alt Yapı", "Braket", "Diğer"] },
];

export const LAB_TYPE_OPTIONS = LAB_CATEGORIES.flatMap((category) => category.items);

const ZIRKONYUM_STEPS: WorkflowStep[] = [
  { send: "Ölçü", request: "Zirkonyum Alt Yapı" },
  { send: "Zirkonyum Alt Yapı", request: "Dentin Prova" },
  { send: "Dentin Prova", request: "Glazeli Bitim" },
];
const EMAX_STEPS: WorkflowStep[] = [
  { send: "Ölçü", request: "E-max Prova" },
  { send: "E-max Prova", request: "Glazeli Bitim" },
];
const METAL_PORSELEN_STEPS: WorkflowStep[] = [
  { send: "Ölçü", request: "Metal Alt Yapı Prova" },
  { send: "Metal Alt Yapı Prova", request: "Dentin Prova" },
  { send: "Dentin Prova", request: "Glazeli Bitim" },
];
const FULL_METAL_STEPS: WorkflowStep[] = [
  { send: "Ölçü", request: "Metal Prova" },
  { send: "Metal Prova", request: "Final Bitim" },
];
const IMPLANT_SABIT_STEPS: WorkflowStep[] = [
  { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
  { send: "Altyapı Prova", request: "Dentin Prova" },
  { send: "Dentin Prova", request: "Glazeli Bitim" },
];

/** İş türüne göre önerilen "gönderilen → laboratuvardan beklenen" adımları. Eski kayıt adları da tanınır. */
export const WORKFLOW_TEMPLATES: Record<string, WorkflowStep[]> = {
  Zirkonyum: ZIRKONYUM_STEPS,
  "E-max": EMAX_STEPS,
  "Metal Destekli Porselen": METAL_PORSELEN_STEPS,
  "Full Metal": FULL_METAL_STEPS,
  "Kuron Tamir": [{ send: "Kırık/Hasarlı Kronkopru", request: "Onarılmış Kronkopru" }],
  "Veneer (Laminat)": [
    { send: "Ölçü", request: "Wax-up / Mock-up Prova" },
    { send: "Mock-up Onayı", request: "Laminat Prova" },
    { send: "Laminat Prova", request: "Glazeli Bitim" },
  ],
  "Zirkon Veneer": ZIRKONYUM_STEPS,
  "Tam Protez": [
    { send: "Primer Ölçü", request: "Bireysel Kaşık" },
    { send: "Fonksiyonel Ölçü", request: "Mum Prova" },
    { send: "Mum Prova", request: "Akrilik Prova" },
    { send: "Akrilik Prova", request: "Tam Protez Bitim" },
  ],
  "Hareketli Kısmi Protez": [
    { send: "Ölçü", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Hareketli Kısmi Protez (Metal Kroşe)": [
    { send: "Ölçü", request: "Kroşe Altyapı Prova" },
    { send: "Kroşe Altyapı Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Protez Tamir": [{ send: "Kırık Protez", request: "Tamir Edilmiş Protez" }],
  "İmplant Üstü Sabit Restorasyon": IMPLANT_SABIT_STEPS,
  "İmplant Üstü Hareketli Protez": [
    { send: "Ölçü + Bar Ölçüsü", request: "Bar Prova" },
    { send: "Bar Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Gece Plağı": [{ send: "Ölçü", request: "Gece Plağı" }],
  "Kas Gevşetici Splint (Michigan)": [
    { send: "Ölçü", request: "Michigan Splint" },
    { send: "Splint Prova", request: "Oklüzal Ayarlama" },
  ],
  "Şeffaf Plak (Aligner)": [{ send: "Dijital Tarama / Ölçü", request: "Aligner Seti" }],
  "Braket Reteyner": [{ send: "Ölçü", request: "Reteyner" }],
  "Bruksizm Plağı": [{ send: "Ölçü", request: "Bruksizm Plağı" }],
  "Beyazlatma Atel": [{ send: "Ölçü", request: "Beyazlatma Atel" }],
  // Eski kayıtlarda kullanılan iş türü adları
  "Zirkon Kronkopru": ZIRKONYUM_STEPS,
  "E-max Kronkopru": EMAX_STEPS,
  "Metal Destekli Porselen Kronkopru": METAL_PORSELEN_STEPS,
  "Full Metal Kronkopru": FULL_METAL_STEPS,
  "İmplant Kronkopru (Tekli)": IMPLANT_SABIT_STEPS,
  "İmplant Köprü": IMPLANT_SABIT_STEPS,
};

export const SPOON_REQUEST_OPTIONS = ["Açık Kaşık", "Kişisel Kaşık"] as const;

/**
 * Beklenen dönüş tarihi girilmemiş eski gönderimlerde "Gecikiyor" eşiği (gün).
 * Yeni gönderimlerde varsayılan beklenen dönüş = gönderim + bu kadar gün;
 * kullanıcı tarihi değiştirebilir.
 */
export const LAB_LATE_DAYS = 4;

// Not alanlarına gömülü, ekranda gösterilmemesi gereken sistem işaretleri.
export const PROVA_FOLLOW_UP_MARKER = "RANDEVU_PROVA_GEREKLI";
export const RECEIVED_ITEM_MARKER = "LAB_GELEN_IS:";
export const RPT_RESET_MARKER = "RPT_RESET_START";
/** API'nin yeniden yapım (RPT) açılışında iş notuna eklediği satırın başı. */
export const REWORK_NOTE_PREFIX = "[RPT] RPT yeniden açıldı";
/** API'nin iptalde iş notuna eklediği satırın başı. */
export const CANCEL_NOTE_PREFIX = "[İPTAL]";

export type ImpressionMethod = "" | "KLASIK_OLCU" | "DIJITAL_TARAMA";

export const IMPRESSION_METHOD_LABEL: Record<Exclude<ImpressionMethod, "">, string> = {
  KLASIK_OLCU: "Klasik ölçü",
  DIJITAL_TARAMA: "Dijital tarama",
};

/** "Ölçü → Metal Alt Yapı" → { sentItem, requestedItem }; eski serbest metin aynen sentItem olur. */
export function parseDesc(description: string): { sentItem: string; requestedItem: string } {
  const idx = description.indexOf(" → ");
  if (idx === -1) return { sentItem: description, requestedItem: "" };
  return { sentItem: description.slice(0, idx), requestedItem: description.slice(idx + 3) };
}

export function buildDescription(sentItem: string, requestedItem: string) {
  const sent = sentItem.trim();
  const requested = requestedItem.trim();
  return requested ? `${sent} → ${requested}` : sent;
}

export function normalizeWorkflowText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/\(final\)/g, "")
    .replace(/son duzeltme\s*\/\s*glaze/g, "glaze")
    // "Glaze" ile "Glazeli Bitim" aynı adım sayılır.
    .replace(/glazeli bitim/g, "glaze")
    .replace(/zirkon\s+alt\s*yapi/g, "zirkonyum alt yapi")
    .replace(/zirkon\s+altyapi/g, "zirkonyum alt yapi")
    .replace(/(acik|kisisel)\s+kasik\s+ile\s+olcu/g, "olcu")
    .replace(/(acik|kisisel)\s+kasik\s+olcu/g, "olcu")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSameWorkflowValue(left: string, right: string) {
  return normalizeWorkflowText(left) === normalizeWorkflowText(right);
}

export function isSpoonRequestItem(value: string) {
  return SPOON_REQUEST_OPTIONS.some((item) => isSameWorkflowValue(item, value));
}

export function isMeasurementStep(sentItem: string) {
  return /(ölçü|olcu|tarama|scan)/i.test(sentItem);
}

export function getReceivedItemFromNote(note?: string | null, fallback = "") {
  const match = (note || "").match(/LAB_GELEN_IS:([^|]+)/);
  return (match?.[1] || fallback || "").trim();
}

/** Şablonda kaçıncı adımda olunduğunu, gönderim geçmişine bakarak bulur. */
export function getNextTemplateStepIndex(labType: string, trips: LabTripLike[]) {
  const template = WORKFLOW_TEMPLATES[labType] ?? [];
  if (template.length === 0) return 0;

  let cursor = 0;
  for (const trip of trips) {
    if (cursor >= template.length) break;
    const { sentItem, requestedItem } = parseDesc(trip.description);
    if (isSpoonRequestItem(requestedItem || "")) continue;
    const expected = template[cursor];
    const isMatch = isSameWorkflowValue(sentItem, expected.send) && isSameWorkflowValue(requestedItem || "", expected.request || "");
    if (isMatch) {
      const receivedItem = getReceivedItemFromNote(trip.receivedNote, requestedItem || "");
      if (trip.receivedAt && requestedItem && !isSameWorkflowValue(receivedItem, requestedItem)) break;
      cursor += 1;
    }
  }
  return cursor;
}

export function canRequestSpoonForStep(labType: string, sentItem: string, requestedItem = "", trips: LabTripLike[] = []) {
  if (!isMeasurementStep(sentItem)) return false;
  if (isSpoonRequestItem(requestedItem)) return true;
  const template = WORKFLOW_TEMPLATES[labType] ?? [];
  const stepIndex = getNextTemplateStepIndex(labType, trips);
  const suggestedRequest = template[stepIndex]?.request || template[0]?.request || "";
  if (isSpoonRequestItem(suggestedRequest)) return true;
  return /protez|implant üstü hareketli/i.test(labType);
}

/** Yeni gönderim formu için önerilen değerler (şablonda sıradaki adım). */
export function suggestNextTrip(labType: string, trips: LabTripLike[]) {
  const template = WORKFLOW_TEMPLATES[labType] ?? [];
  const cycleTrips = getCurrentCycleTrips(trips);
  const stepIndex = getNextTemplateStepIndex(labType, cycleTrips);
  const suggestion = template[stepIndex] ?? null;
  // Laboratuvar daha önce kaşık gönderdiyse ilk ölçü o kaşıkla alınır.
  const receivedSpoonItem = [...cycleTrips]
    .reverse()
    .filter((trip) => Boolean(trip.receivedAt))
    .map((trip) => parseDesc(trip.description).requestedItem)
    .find((requestedItem) => isSpoonRequestItem(requestedItem || ""));
  const sendValue = suggestion && stepIndex === 0 && receivedSpoonItem ? `${receivedSpoonItem} ile Ölçü` : suggestion?.send || "";
  return { template, stepIndex, suggestion, sendValue, requestValue: suggestion?.request || "" };
}

export function parseMeasurementFromSentNote(note?: string | null): { method: ImpressionMethod; cleanNote: string } {
  const raw = (note || "").trim();
  if (!raw) return { method: "", cleanNote: "" };
  const methodMatch = raw.match(/Ölçü\s*Yöntemi:\s*(Dijital Tarama|Klasik Ölçü)/i);
  const methodText = methodMatch?.[1]?.toLocaleLowerCase("tr-TR") || "";
  const method: ImpressionMethod = methodText === "dijital tarama" ? "DIJITAL_TARAMA" : methodText === "klasik ölçü" ? "KLASIK_OLCU" : "";
  const cleanNote = raw
    .replace(/\s*\|?\s*Ölçü\s*Yöntemi:\s*(Dijital Tarama|Klasik Ölçü)\s*\|?\s*/i, " ")
    .replace(/^\|+|\|+$/g, "")
    .trim();
  return { method, cleanNote };
}

export function hasRptMarker(note?: string | null) {
  return Boolean(note && note.includes(RPT_RESET_MARKER));
}

/**
 * Gönderim notunu düzenleme formuna hazırlar: yöntem ayrı alana, yeniden
 * yapım işareti gizli tutulur (kullanıcı silemez), kalan metin düzenlenir.
 */
export function splitSentNote(note?: string | null) {
  const raw = note || "";
  const rptMarker = hasRptMarker(raw);
  const withoutMarker = raw.replace(new RegExp(`\\s*\\|?\\s*${RPT_RESET_MARKER}\\s*\\|?\\s*`, "g"), " ").trim();
  const { method, cleanNote } = parseMeasurementFromSentNote(withoutMarker);
  return { method, note: cleanNote, rptMarker };
}

/** Gönderim notunu kaydederken yöntem ve (varsa) yeniden yapım işareti korunur. */
export function buildSentNote(baseNote: string, method: ImpressionMethod, sentItem: string, keepRptMarker = false) {
  const methodPart = method && isMeasurementStep(sentItem)
    ? `Ölçü Yöntemi: ${method === "DIJITAL_TARAMA" ? "Dijital Tarama" : "Klasik Ölçü"}`
    : "";
  return [keepRptMarker ? RPT_RESET_MARKER : "", methodPart, baseNote.trim()].filter(Boolean).join(" | ") || null;
}

/** Gönderim notundaki kod işaretlerini ayıklar: ekranda yalnız insanın yazdığı not görünür. */
export function cleanSentNote(note?: string | null) {
  const { note: userNote } = splitSentNote(note);
  return userNote
    .replace(/RPT yeniden açıldı \(([^)]*)\):\s*/g, "Yeniden yapım nedeni: ")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
}

export function sentMethodLabel(note?: string | null) {
  const { method } = parseMeasurementFromSentNote(note);
  return method ? IMPRESSION_METHOD_LABEL[method] : "";
}

export function needsProvaAppointment(note?: string | null) {
  return Boolean(note && note.includes(PROVA_FOLLOW_UP_MARKER));
}

export function cleanReceivedNote(note?: string | null) {
  return (note || "")
    .replace(`${PROVA_FOLLOW_UP_MARKER} | `, "")
    .replace(PROVA_FOLLOW_UP_MARKER, "")
    .replace(new RegExp(`\\s*\\|?\\s*${RECEIVED_ITEM_MARKER}[^|]*\\|?\\s*`, "g"), " ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .trim();
}

export function buildReceivedNote(baseNote: string, receivedItem: string, needsAppointment: boolean) {
  return [
    needsAppointment ? PROVA_FOLLOW_UP_MARKER : "",
    receivedItem.trim() ? `${RECEIVED_ITEM_MARKER}${receivedItem.trim()}` : "",
    baseNote.trim(),
  ].filter(Boolean).join(" | ") || null;
}

/**
 * Yeniden yapım (RPT, ücretsiz) işi mi? Yalnız sistemin yazdığı işarete
 * bakılır. Önceden notta herhangi bir yerde "RPT" kelimesi geçen normal bir
 * iş de ücretsiz sayılıyor; faturalanamıyor ve tamamlanamıyordu.
 */
export function isReworkNotes(notes?: string | null) {
  return (notes || "").split("\n").some((line) => line.trim().startsWith(REWORK_NOTE_PREFIX));
}

export function isReworkOrder(order: { notes?: string | null; trips?: LabTripLike[] }) {
  return isReworkNotes(order.notes) || Boolean(order.trips?.some((trip) => hasRptMarker(trip.sentNote)));
}

/** İş notunu kullanıcı notu ve sistem satırları (yeniden yapım/iptal kayıtları) olarak ayırır. */
export function splitOrderNotes(notes?: string | null) {
  const lines = (notes || "").split("\n");
  const userLines: string[] = [];
  const systemLines: string[] = [];
  const reworkReasons: { at: string; reason: string }[] = [];
  const cancelReasons: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(REWORK_NOTE_PREFIX)) {
      systemLines.push(trimmed);
      const match = trimmed.match(/\(([^)]*)\):\s*(.*)$/);
      reworkReasons.push({ at: match?.[1] || "", reason: match?.[2] || "" });
    } else if (trimmed.startsWith(CANCEL_NOTE_PREFIX)) {
      systemLines.push(trimmed);
      cancelReasons.push(trimmed.slice(CANCEL_NOTE_PREFIX.length).replace(/^\s*\([^)]*\):?\s*/, "").trim());
    } else {
      userLines.push(line);
    }
  }
  return { userNotes: userLines.join("\n").trim(), systemLines, reworkReasons, cancelReasons };
}

/** Kullanıcının düzenlediği notu, değiştirilemeyen sistem satırlarıyla birleştirir. */
export function mergeOrderNotes(userNotes: string, existingNotes?: string | null) {
  const { systemLines } = splitOrderNotes(existingNotes);
  return [userNotes.trim(), ...systemLines].filter(Boolean).join("\n") || null;
}

/** Yeniden yapım ile yeniden açılan işlerde yalnız son döngünün adımları gösterilir. */
export function getCurrentCycleTrips<T extends LabTripLike>(trips: T[]): T[] {
  const sorted = [...trips].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() || (a.order ?? 0) - (b.order ?? 0));
  let startIndex = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (hasRptMarker(sorted[i].sentNote)) startIndex = i;
  }
  return sorted.slice(startIndex);
}

export function daysSince(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/** Gönderimin beklenen dönüş tarihi: girilmişse o, değilse gönderim + LAB_LATE_DAYS gün. */
export function expectedReturnAt(trip: Pick<LabTripLike, "sentAt" | "expectedAt">) {
  if (trip.expectedAt) return new Date(trip.expectedAt);
  const sent = new Date(trip.sentAt);
  return new Date(sent.getTime() + LAB_LATE_DAYS * 86400000);
}

export function isTripLate(trip: Pick<LabTripLike, "sentAt" | "expectedAt" | "receivedAt">, now = new Date()) {
  if (trip.receivedAt) return false;
  const expected = expectedReturnAt(trip);
  // Gün sonuna kadar beklenir: dönüş günü geçince gecikmiş sayılır.
  const endOfExpectedDay = new Date(expected.getFullYear(), expected.getMonth(), expected.getDate(), 23, 59, 59);
  return now.getTime() > endOfExpectedDay.getTime();
}

export type LabStage = "new" | "atLab" | "late" | "clinic" | "done" | "cancelled";

export const LAB_STAGE_LABEL: Record<LabStage, string> = {
  new: "Gönderilmedi",
  atLab: "Laboratuvarda",
  late: "Gecikiyor",
  clinic: "Klinikte",
  done: "Hastaya takıldı",
  cancelled: "İptal edildi",
};

export const LAB_STAGE_TONE: Record<LabStage, "neutral" | "warning" | "critical" | "info" | "success"> = {
  new: "neutral",
  atLab: "warning",
  late: "critical",
  clinic: "info",
  done: "success",
  cancelled: "neutral",
};

export function getOrderSummary<T extends LabTripLike>(order: Omit<LabOrderLike, "trips"> & { trips: T[] }) {
  const sortedTrips = getCurrentCycleTrips(order.trips);
  const pendingTrips = sortedTrips.filter((trip) => !trip.receivedAt);
  // En eski bekleyen gönderim: "kaç gündür laboratuvarda" sorusunun cevabı.
  const pendingTrip = pendingTrips[0] ?? null;
  const doneCount = sortedTrips.filter((trip) => trip.receivedAt).length;
  const cancelled = order.status === "IPTAL";
  const isDone = order.status === "HASTAYA_TAKILDI" && pendingTrips.length === 0;
  const pendingDays = pendingTrip ? daysSince(pendingTrip.sentAt) : 0;
  const late = pendingTrips.some((trip) => isTripLate(trip));
  const totalAmount = order.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const template = WORKFLOW_TEMPLATES[order.labType] ?? [];
  const stepIndex = getNextTemplateStepIndex(order.labType, sortedTrips);
  const nextStep = template[stepIndex] ?? null;
  const lastTrip = sortedTrips[sortedTrips.length - 1] ?? null;
  const lastReceivedTrip = [...sortedTrips].reverse().find((trip) => trip.receivedAt) ?? null;
  const lastActivityAt = lastTrip ? lastTrip.receivedAt || lastTrip.sentAt : null;
  const rework = isReworkOrder(order);
  const stage: LabStage = cancelled
    ? "cancelled"
    : isDone
      ? "done"
      : pendingTrip
        ? late ? "late" : "atLab"
        : sortedTrips.length > 0 ? "clinic" : "new";
  return {
    sortedTrips,
    pendingTrips,
    pendingTrip,
    lastReceivedTrip,
    doneCount,
    totalCount: Math.max(template.length, sortedTrips.length),
    templateLength: template.length,
    stepIndex,
    /** Şablondaki bütün adımlar laboratuvardan döndü mü (son prova/bitim geldi)? */
    templateFinished: template.length > 0 && stepIndex >= template.length,
    isDone,
    cancelled,
    pendingDays,
    late,
    totalAmount,
    nextStep,
    lastTrip,
    lastActivityAt,
    rework,
    stage,
    /** "Hastaya takıldı" için fatura gerekir; yeniden yapım işleri ücretsizdir. */
    needsInvoiceToComplete: !rework && order.invoices.length === 0,
    /** Bekleyen gönderim yokken iş kapatılabilir (iptal/tamam değilse). */
    canComplete: !cancelled && !isDone && pendingTrips.length === 0 && sortedTrips.length > 0,
    canSend: !cancelled && !isDone && pendingTrips.length === 0,
  };
}

export type LabOrderSummary = ReturnType<typeof getOrderSummary>;

/** Ana sayfa, menü rozeti ve Laboratuvar sayfası aynı sayıları göstersin diye tek sayım. */
export function summarizeLabOrders(orders: LabOrderLike[]) {
  const counts = { open: 0, notSent: 0, atLab: 0, late: 0, clinic: 0, done: 0 };
  for (const order of orders) {
    const { stage } = getOrderSummary(order);
    if (stage === "cancelled") continue;
    if (stage === "done") {
      counts.done += 1;
      continue;
    }
    counts.open += 1;
    if (stage === "new") counts.notSent += 1;
    if (stage === "atLab" || stage === "late") counts.atLab += 1;
    if (stage === "late") counts.late += 1;
    if (stage === "clinic") counts.clinic += 1;
  }
  return counts;
}

/** Açık (bitmemiş, iptal edilmemiş) lab işi mi? */
export function isOpenLabOrder(order: { status: string }) {
  return order.status !== "HASTAYA_TAKILDI" && order.status !== "IPTAL";
}

export function formatLabDate(iso?: string | Date | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortLabDate(iso?: string | Date | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("tr-TR", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

export const LAB_CURRENCY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function teethList(teeth?: string | null) {
  return (teeth || "").split(",").map((value) => value.trim()).filter(Boolean);
}

/** Durum satırı: "Dentin Prova bekleniyor · 6. gün" / "Zirkonyum Alt Yapı geldi · 3 Eki" gibi tek cümle. */
export function stageDetail(summary: LabOrderSummary) {
  if (summary.stage === "cancelled") return "İş iptal edildi";
  if (summary.stage === "done") return summary.lastActivityAt ? `Son işlem ${formatShortLabDate(summary.lastActivityAt)}` : "";
  if (summary.pendingTrip) {
    const { sentItem, requestedItem } = parseDesc(summary.pendingTrip.description);
    const what = requestedItem || sentItem;
    const day = summary.pendingDays + 1;
    const expected = expectedReturnAt(summary.pendingTrip);
    return summary.late
      ? `${what} bekleniyor · dönüş ${formatShortLabDate(expected)} idi`
      : `${what} bekleniyor · ${day}. gün · dönüş ${formatShortLabDate(expected)}`;
  }
  if (summary.lastReceivedTrip) {
    const parts = parseDesc(summary.lastReceivedTrip.description);
    const received = getReceivedItemFromNote(summary.lastReceivedTrip.receivedNote, parts.requestedItem || parts.sentItem);
    return `${received} geldi · ${formatShortLabDate(summary.lastReceivedTrip.receivedAt)}`;
  }
  return "Henüz laboratuvara gönderilmedi";
}
