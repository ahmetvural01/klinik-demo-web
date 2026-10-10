"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ClipboardCheck, ExternalLink, NotebookPen, Pencil, Plus, Printer, Stethoscope, XCircle } from "lucide-react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { Section } from "@/components/ui/Section";
import { Switch } from "@/components/ui/Switch";
import { formatDateText } from "@/components/ui/Money";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { OdontogramSelector, type ToothMarker } from "@/components/ToothChart";
import { cachedGet } from "@/lib/client-cache";
import { clientMutation, runRecordBatch } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
import { TDB_2026_CORE_PRICE_CATALOG } from "@/lib/dental-treatment-catalog";
import { EXAM_STATUS_DIAGNOSIS, EXAM_STATUS_DONE, examStatusKind } from "@/lib/examination-status";
import { usePatientFile } from "./PatientFileContext";
import { ExamEditModal } from "./ExamEditModal";
import { PrintSelectModal } from "./PrintSelectModal";
import { printTreatmentReport } from "./print";
import {
  isChargeableExam,
  isPendingExam,
  money,
  multiplyMoney,
  roundMoney,
  sharedName,
  toNumber,
  type Exam,
} from "./patient-file-shared";

type PriceItem = { id: string; code?: string; treatment: string; amount: number | string };
type Area = "teeth" | "upper" | "lower" | "all" | "none";

const AREA_OPTIONS: { value: Area; label: string }[] = [
  { value: "teeth", label: "Dişler" },
  { value: "upper", label: "Üst çene" },
  { value: "lower", label: "Alt çene" },
  { value: "all", label: "Tüm ağız" },
  { value: "none", label: "Genel (diş yok)" },
];
const AREA_LABEL: Record<Exclude<Area, "teeth" | "none">, string> = { upper: "Üst çene", lower: "Alt çene", all: "Tüm ağız" };

const PLAN_STATUS: Record<string, { label: string; tone: "info" | "success" | "neutral" | "warning" }> = {
  PLANLANDI: { label: "Planlandı", tone: "neutral" },
  DEVAM_EDIYOR: { label: "Devam ediyor", tone: "info" },
  TAMAMLANDI: { label: "Tamamlandı", tone: "success" },
  IPTAL: { label: "İptal", tone: "neutral" },
};

const sortByDateDesc = (a: Exam, b: Exam) => new Date(b.diagnosedAt).getTime() - new Date(a.diagnosedAt).getTime();
const toothOf = (key: string) => key.slice(key.indexOf(":") + 1) || undefined;

/**
 * Tedavi sekmesi. Hekimin akışı yukarıdan aşağı tek yönde: diş(ler)i seç →
 * tedaviyi fiyat listesinden seç (tutar kendiliğinden gelir) → "Yapılacaklara
 * ekle" ya da "Yapıldı olarak kaydet". Altında yapılacak ve yapılan
 * tedaviler, en altta (katlanır) tedavi planları.
 *
 * Adlar: borca yansımamış kayıt "yapılacak tedavi" (önceden "muayene listesi"),
 * borca yansıyan "yapılan tedavi". Veritabanı değerleri değişmedi.
 */
export function TreatmentTab() {
  const {
    data,
    patientId,
    reload,
    can,
    doctors,
    currentUserId,
    recentDoctorId,
    treatmentPlans,
    treatmentPlansLoaded,
    loadTreatmentPlans,
    getLetterhead,
    hidePatientPhone,
    intent,
    clearIntent,
    lockDoctorToSelf,
  } = usePatientFile();
  const canWrite = can("examinations:write");
  const canDelete = can("examinations:delete");
  // Doktor yalnız kendi adına kayıt açar ve yalnız kendi kaydını değiştirir
  // (sunucu kuralı); başka hekimin satırında düzenleme/iptal düğmesi çıkmaz.
  const canModify = (exam: Exam) => !lockDoctorToSelf || exam.doctorId === currentUserId;
  const ownDoctorName = doctors.find((doctor) => doctor.id === currentUserId)?.fullName || "";
  const canReadPlans = can("treatment:read");
  const canPlan = can("treatment:write");

  // ── Ekleme formu ─────────────────────────────────────────────────────────
  const [priceList, setPriceList] = useState<PriceItem[]>([]);
  const [priceSource, setPriceSource] = useState<"standard" | "custom">("standard");
  const [priceError, setPriceError] = useState("");
  const [doctorChoice, setDoctorChoice] = useState<string | null>(null);
  const [treatmentQuery, setTreatmentQuery] = useState("");
  const [treatment, setTreatment] = useState<PriceItem | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [area, setArea] = useState<Area>("teeth");
  const [dentition, setDentition] = useState<"adult" | "child">("adult");
  const [teeth, setTeeth] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [adding, setAdding] = useState<"pending" | "done" | null>(null);

  // ── Listeler ────────────────────────────────────────────────────────────
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // Tedavi planları yalnız bu sekme açılınca okunur.
  useEffect(() => { if (canReadPlans) loadTreatmentPlans(); }, [canReadPlans, loadTreatmentPlans]);

  // "İşlem ekle > Tedavi ekle": tedavi arama kutusuna odaklan.
  useEffect(() => {
    if (intent !== "treatment") return;
    clearIntent();
    const input = document.getElementById("hd-exam-treatment");
    input?.scrollIntoView({ block: "center" });
    input?.focus();
  }, [intent, clearIntent]);

  // Varsayılan hekim: giriş yapan kişi hekimse kendisi, değilse hastayı en son
  // tedavi eden hekim, klinikte tek hekim varsa o. Önceden giriş yapan kişi
  // (asistan/banko olsa bile) gönderiliyor, kayıt "Doktor kapsam dışında"
  // hatasıyla reddediliyordu.
  const defaultDoctorId = useMemo(() => {
    if (lockDoctorToSelf) return currentUserId;
    if (doctors.some((doctor) => doctor.id === currentUserId)) return currentUserId;
    if (recentDoctorId && doctors.some((doctor) => doctor.id === recentDoctorId)) return recentDoctorId;
    return doctors.length === 1 ? doctors[0].id : "";
  }, [doctors, currentUserId, recentDoctorId, lockDoctorToSelf]);
  const doctorId = lockDoctorToSelf ? currentUserId : doctorChoice ?? defaultDoctorId;

  // Önerilen fiyat kliniğin etkin listesinden gelir (Ayarlar'daki seçim);
  // ikisi de 1 dk bellekte tutulur, sekmeye her dönüşte yeniden istenmez.
  // Önceden önce TDB listesi çekiliyor, ayar gelince klinik listesi ikinci
  // kez çekiliyordu; arada yanlış listenin fiyatı seçilebiliyordu.
  useEffect(() => {
    if (!canWrite) return;
    let active = true;
    (async () => {
      const setting = await cachedGet<{ activePriceList?: string } | null>("/api/prices/active-list", 60_000).catch(() => null);
      const type = setting?.activePriceList === "custom" ? "custom" : "standard";
      try {
        const list = await cachedGet<PriceItem[]>(`/api/prices?type=${type}`, 60_000, { throwOnError: true });
        if (!active) return;
        setPriceList(Array.isArray(list) ? list : []);
        setPriceSource(type);
        setPriceError("");
      } catch {
        if (!active) return;
        setPriceList([]);
        setPriceSource(type);
        setPriceError(type === "custom"
          ? "Kliniğin fiyat listesi okunamadı; öneriler TDB 2026 tarifesinden geliyor. Tutarı kontrol edin."
          : "Kliniğin fiyatları okunamadı; öneriler TDB 2026 tarifesinden geliyor.");
      }
    })();
    return () => { active = false; };
  }, [canWrite]);

  // TDB kataloğu + kliniğin listesi birleşir: listede eksik kalem olsa da
  // tedavi seçilebilir; aynı kalemde kliniğin fiyatı geçerlidir.
  const treatmentPool = useMemo(() => {
    const map = new Map<string, PriceItem>();
    const key = (item: PriceItem) => `${item.code || ""}::${item.treatment.toLocaleLowerCase("tr-TR")}`;
    for (const item of TDB_2026_CORE_PRICE_CATALOG) map.set(key(item), item);
    for (const item of priceList) map.set(key(item), item);
    return Array.from(map.values()).sort((a, b) => a.treatment.localeCompare(b.treatment, "tr"));
  }, [priceList]);

  const treatmentOptions = useMemo(() => {
    const query = treatmentQuery.trim().toLocaleLowerCase("tr-TR");
    // Adı yazılanla başlayan tedaviler önce, sonra kelime başı eşleşenler, en son
    // geçenler gelir ("dolgu" yazınca alfabetik "Açık Apeksli… (Dolgu Hariç)" başa çıkıyordu).
    const rank = (item: PriceItem) => {
      const name = item.treatment.toLocaleLowerCase("tr-TR");
      if (name.startsWith(query) || String(item.code || "").toLocaleLowerCase("tr-TR") === query) return 0;
      if (name.includes(`${query} hariç`)) return 3;
      return name.split(/[\s(-]+/).some((word) => word.startsWith(query)) ? 1 : 2;
    };
    // Eşit puanda TDB kod sırası (2-27 "Kanal Tedavisi - Tek Kanal", 2-34
    // "Kanal Dolgusu Sökümü"nden önce): asıl tedavi alfabetik sırada aşağıda
    // kalıyordu. Kodsuz (kliniğe özel) kalemler kodlulardan sonra, ad sırasıyla.
    const codeParts = (item: PriceItem) => {
      const match = /^(\d+)-(\d+)$/.exec(String(item.code || "").trim());
      return match ? [Number(match[1]), Number(match[2])] : null;
    };
    const byCode = (a: PriceItem, b: PriceItem) => {
      const left = codeParts(a);
      const right = codeParts(b);
      if (left && right) return left[0] - right[0] || left[1] - right[1];
      if (left) return -1;
      if (right) return 1;
      return 0;
    };
    return treatmentPool
      .filter((item) => !query || item.treatment.toLocaleLowerCase("tr-TR").includes(query) || String(item.code || "").toLocaleLowerCase("tr-TR").includes(query))
      .sort((a, b) => (query ? rank(a) - rank(b) || byCode(a, b) : 0))
      .slice(0, 60)
      .map((item) => ({ id: item.id, label: item.treatment, meta: `${item.code ? `${item.code} · ` : ""}${money(item.amount)}` }));
  }, [treatmentPool, treatmentQuery]);

  const pending = useMemo(() => data.examinations.filter(isPendingExam).sort(sortByDateDesc), [data.examinations]);
  const done = useMemo(() => data.examinations.filter(isChargeableExam).sort(sortByDateDesc), [data.examinations]);
  const pendingTotal = roundMoney(pending.reduce((sum, exam) => sum + toNumber(exam.amount), 0));
  // Listenin toplamı listedeki satırlardan: bakiye sunucudan gelen rolde bakiye
  // yüklenene kadar "Toplam ₺0" görünmesin.
  const doneTotal = roundMoney(done.reduce((sum, exam) => sum + toNumber(exam.amount), 0));

  // Şemada hangi dişte iş olduğu: yapılacak (öncelikli) ya da yapılmış tedavi.
  const markers = useMemo(() => {
    const map: Record<string, ToothMarker> = {};
    for (const exam of done) if (exam.toothNo && /^\d{2}$/.test(exam.toothNo)) map[exam.toothNo] = "done";
    for (const exam of pending) if (exam.toothNo && /^\d{2}$/.test(exam.toothNo)) map[exam.toothNo] = "pending";
    return map;
  }, [done, pending]);

  // Seçili satırlardan listede artık olmayanları (aktarılan/silinen) temizle.
  useEffect(() => {
    setSelectedPending((current) => current.filter((id) => pending.some((exam) => exam.id === id)));
  }, [pending]);

  const targets: (string | undefined)[] = area === "teeth"
    ? [...teeth].sort((a, b) => Number(a) - Number(b))
    : area === "none" ? [undefined] : [AREA_LABEL[area]];
  const amountError = moneyInputError(amount, { required: true, allowZero: true });
  const totalText = targets.length > 0 && !amountError ? money(multiplyMoney(amount, targets.length)) : "";

  const clearError = (key: string) => setFormErrors((current) => (current[key] ? { ...current, [key]: "" } : current));

  const addRecords = async (mode: "pending" | "done") => {
    if (adding) return;
    const errors: Record<string, string> = {};
    if (!doctorId) errors.doctor = "Hekimi seçin.";
    const treatmentName = (treatment?.treatment || treatmentQuery).trim();
    if (treatmentName.length < 2) errors.treatment = "Listeden tedaviyi seçin.";
    if (amountError) errors.amount = amountError === "Tutarı girin." ? "Tutarı yazın (ücretsizse 0)." : amountError;
    if (targets.length === 0) errors.teeth = "Şemadan en az bir diş seçin ya da çene / genel seçin.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAdding(mode);
    setFormError("");
    let firstError = "";
    try {
      const diagnosedAt = new Date().toISOString();
      const result = await runRecordBatch(targets.map((tooth, index) => `${index}:${tooth || ""}`), async (key) => {
        try {
          await clientMutation("/api/examinations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId,
              doctorId,
              treatmentName,
              toothNo: toothOf(key),
              amount,
              status: mode === "done" ? EXAM_STATUS_DONE : EXAM_STATUS_DIAGNOSIS,
              diagnosedAt,
              note: note.trim() || undefined,
            }),
          }, "Kayıt eklenemedi.");
        } catch (error) {
          if (!firstError && error instanceof Error) firstError = error.message;
          throw error;
        }
      });
      if (result.failed.length > 0) {
        // Kaydedilen dişler seçimden düşer: "tekrar dene" yalnız eklenemeyenleri
        // yazar. Önceden başarılı dişler seçimde kalıyor, ikinci denemede aynı
        // dişler iki kez kaydediliyordu ("Yapıldı" modunda çift borç).
        const savedTeeth = new Set(result.succeeded.map(toothOf).filter(Boolean));
        if (area === "teeth") setTeeth((current) => current.filter((tooth) => !savedTeeth.has(tooth)));
        const failedTeeth = result.failed.map(toothOf).filter((tooth): tooth is string => Boolean(tooth) && area === "teeth");
        setFormError(result.succeeded.length > 0
          ? `${result.succeeded.length} kayıt eklendi; ${result.failed.length} kayıt eklenemedi${failedTeeth.length ? ` (diş ${failedTeeth.join(", ")})` : ""}. Seçimde yalnız eklenemeyenler kaldı — tekrar deneyin.${firstError ? ` Neden: ${firstError}` : ""}`
          : firstError || "Kayıt eklenemedi.");
      } else {
        const where = mode === "done" ? "yapılan tedavilere" : "yapılacak tedavilere";
        showToastSafe({ type: "success", icon: "tedavi", message: `${treatmentName}: ${result.succeeded.length} kayıt ${where} eklendi.` });
        setTeeth([]);
        setNote("");
        setNoteOpen(false);
      }
      if (result.succeeded.length > 0) void reload(true);
    } catch (addError) {
      setFormError(addError instanceof Error ? addError.message : "Kayıt eklenemedi.");
    } finally {
      setAdding(null);
    }
  };

  const markDone = async (ids: string[]) => {
    if (busy || ids.length === 0) return;
    if (ids.length > 1 && !(await confirmDialog({ message: `${ids.length} tedavi yapıldı olarak işaretlensin mi? Tutarları hastanın borcuna eklenir.`, confirmText: "Yapıldı olarak işaretle" }))) return;
    setBusy(true);
    try {
      const result = await runRecordBatch(ids, async (id) => {
        const exam = data.examinations.find((item) => item.id === id);
        if (!exam) throw new Error("Kayıt bulunamadı.");
        await clientMutation(`/api/examinations/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // Tedavinin yapıldığı gün bugündür: hakediş ve rapor bu tarihe göre
          // hesaplanır (yanlışsa satırdaki Düzenle ile değiştirilebilir).
          body: JSON.stringify({ status: EXAM_STATUS_DONE, doctorId: exam.doctorId || doctorId, diagnosedAt: new Date().toISOString() }),
        }, "Kayıt güncellenemedi.");
      });
      if (result.failed.length > 0) {
        showToastSafe({ type: "error", message: `${result.succeeded.length} tedavi yapıldı olarak işaretlendi; ${result.failed.length} tedavi işaretlenemedi.` });
        // Yalnız işaretlenemeyenler seçili kalır.
        setSelectedPending(result.failed);
      } else {
        showToastSafe({ type: "success", icon: "tedavi", message: ids.length === 1 ? "Tedavi yapıldı olarak işaretlendi; tutarı borca eklendi." : `${ids.length} tedavi yapıldı olarak işaretlendi.` });
        setSelectedPending([]);
      }
      if (result.succeeded.length > 0) void reload(true);
    } finally {
      setBusy(false);
    }
  };

  const cancelRecords = async (ids: string[], kind: "pending" | "done") => {
    if (busy || ids.length === 0) return;
    // Tek kayıtta hangi tedavinin (diş, tutar) etkileneceği yazılır; önceden yalnız "Kayıt" diyordu.
    const single = ids.length === 1 ? data.examinations.find((exam) => exam.id === ids[0]) : null;
    const what = single ? `“${single.treatmentName}”${single.toothNo ? ` (diş ${single.toothNo})` : ""} · ${money(single.amount)}` : `${ids.length} tedavi`;
    const message = kind === "done"
      ? `${what} iptal edilsin mi? Tutarı hastanın borcundan düşülür; kayıt işlem geçmişinde saklanır.`
      : `${what} yapılacaklardan çıkarılsın mı? Kayıt işlem geçmişinde saklanır.`;
    if (!(await confirmDialog({ message, danger: true, confirmText: kind === "done" ? "Tedaviyi iptal et" : "Listeden çıkar" }))) return;
    setBusy(true);
    try {
      const result = await runRecordBatch(ids, async (id) => {
        await clientMutation(`/api/examinations/${id}`, { method: "DELETE" }, "Kayıt iptal edilemedi.");
      });
      if (result.failed.length > 0) {
        showToastSafe({ type: "error", message: `${result.succeeded.length} kayıt kaldırıldı; ${result.failed.length} kayıt kaldırılamadı.` });
        if (kind === "pending") setSelectedPending(result.failed);
      } else {
        showToastSafe({ type: "success", message: kind === "done" ? "Tedavi iptal edildi." : "Yapılacaklardan çıkarıldı." });
        if (kind === "pending") setSelectedPending([]);
      }
      if (result.succeeded.length > 0) void reload(true);
    } finally {
      setBusy(false);
    }
  };

  const treatmentCell = (exam: Exam) => (
    <div className="min-w-0">
      <p className="font-medium text-slate-800">
        {exam.treatmentName}
        {examStatusKind(exam.status) === "in_progress" && <Badge tone="info" className="ml-1.5 align-[1px]">Devam ediyor</Badge>}
      </p>
      {exam.note && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500" title={exam.note}>{exam.note}</p>}
    </div>
  );

  // Satırda tek görünür eylem ("Yapıldı"); düzenleme ve iptal çerçevesiz
  // "…" menüsünde. Önceden her satırda üç kutulu ikon (✓ ✎ ⊗) vardı.
  const rowMenu = (exam: Exam, kind: "pending" | "done") => (
    <ActionMenu
      label={`${exam.treatmentName} için diğer işlemler`}
      items={[
        { key: "edit", label: "Düzenle", icon: Pencil, disabled: busy, onSelect: () => setEditing(exam) },
        ...(canDelete ? [{
          key: "cancel",
          label: kind === "pending" ? "Yapılacaklardan çıkar" : "Tedaviyi iptal et",
          icon: XCircle,
          danger: true,
          disabled: busy,
          onSelect: () => void cancelRecords([exam.id], kind),
        }] : []),
      ]}
    />
  );

  const pendingActions = (exam: Exam) => (!canModify(exam) ? null : (
    <div className="flex items-center justify-end gap-1">
      {/* Telefonda yalnız ✓ (ad ekran okuyucuda kalır): satır eylemleri ayrı sıra oluşturmasın. */}
      <Button size="sm" variant="secondary" icon={Check} aria-label="Yapıldı olarak işaretle" title="Yapıldı olarak işaretle" disabled={busy} onClick={() => void markDone([exam.id])}>
        <span className="max-sm:sr-only">Yapıldı</span>
      </Button>
      {rowMenu(exam, "pending")}
    </div>
  ));

  const doneActions = (exam: Exam) => (!canModify(exam) ? null : (
    <div className="flex justify-end">{rowMenu(exam, "done")}</div>
  ));

  // Bütün satırlar aynı hekimdeyse hekim adı başlık altında bir kez yazılır.
  const pendingDoctor = sharedName(pending, (exam) => exam.doctor?.fullName);
  const doneDoctor = sharedName(done, (exam) => exam.doctor?.fullName);

  const baseColumns = (sameDoctor: string | null, amountHint?: string): ListTableColumn<Exam>[] => [
    { key: "date", header: "Tarih", render: (exam) => <span className="whitespace-nowrap">{formatDateText(exam.diagnosedAt)}</span> },
    { key: "treatment", header: "Tedavi", render: treatmentCell },
    // Boş değer (genel tedavi, hekimsiz kayıt) boş kalır; "—" yazılmaz.
    { key: "tooth", header: "Diş", render: (exam) => exam.toothNo || null },
    ...(sameDoctor ? [] : [{ key: "doctor", header: "Hekim", render: (exam: Exam) => exam.doctor?.fullName || null }]),
    { key: "amount", header: "Tutar", align: "right", headerHint: amountHint, render: (exam) => <span className="tabular-nums">{money(exam.amount)}</span> },
  ];

  const listSubtitle = (count: number, total: number, sameDoctor: string | null) => (
    count > 0 ? [`Toplam ${money(total)}`, sameDoctor ? `Hekim: ${sameDoctor}` : ""].filter(Boolean).join(" · ") : undefined
  );

  // Telefon kartı: solda ad + kısa satır, sağda tutar ve eylemler (alt alta
  // ayrı eylem sırası yok).
  const examCard = (exam: Exam, actions: ReactNode, sameDoctor: string | null) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          {exam.treatmentName}
          {examStatusKind(exam.status) === "in_progress" && <Badge tone="info" className="ml-1.5 align-[1px]">Devam ediyor</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {/* "Üst çene / Tüm ağız" kayıtlarında "Diş" öneki yazılmaz. */}
          {[exam.toothNo ? (/^\d/.test(exam.toothNo) ? `Diş ${exam.toothNo}` : exam.toothNo) : "", formatDateText(exam.diagnosedAt), sameDoctor ? "" : exam.doctor?.fullName].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums text-slate-800">{money(exam.amount)}</span>
        {canWrite && actions}
      </div>
    </div>
  );

  // Tedavi planı sayfası ?patientId= ile listeyi bu hastaya süzer; yeni plan
  // formu yalnız ?yeni=1 ile açılır (önceden "Planları yönet" de yeni plan formu açıyordu).
  const planListHref = `/tedavi-plani?patientId=${encodeURIComponent(patientId)}&patientName=${encodeURIComponent(data.fullName)}`;
  const newPlanHref = `${planListHref}&yeni=1`;

  const selectionText = area !== "teeth"
    ? null
    : teeth.length > 0
      ? (
        <span className="flex flex-wrap items-center gap-2">
          <span>Seçili: <b className="text-slate-800">{[...teeth].sort((a, b) => Number(a) - Number(b)).join(", ")}</b></span>
          <Button variant="ghost" size="sm" onClick={() => setTeeth([])}>Seçimi temizle</Button>
        </span>
      )
      : <span className={formErrors.teeth ? "font-medium text-red-700" : ""}>{formErrors.teeth || "Dişe dokunarak seçin; tekrar dokunmak seçimi kaldırır."}</span>;

  return (
    <div className="space-y-4">
      {canWrite && (
        <Section title="Tedavi ekle" icon={Stethoscope}>
          <div className="space-y-4">
            <FormErrorBanner message={formError} />
            {/* Tek çip sırası (nereye); daimi/süt seçimi şemanın altında tek anahtar.
                Önceden iki ayrı çip sırası ve şema için iki kat çerçeve vardı. */}
            <ChoiceCards
              label="Nereye"
              labelHidden
              variant="pills"
              options={AREA_OPTIONS}
              value={area}
              onChange={(value) => { setArea(value); clearError("teeth"); }}
            />
            {area === "teeth" && (
              <div className="space-y-2">
                <OdontogramSelector
                  selected={teeth}
                  dentition={dentition}
                  markers={markers}
                  showLegend
                  frame={false}
                  legendExtra={(
                    <Switch
                      label="Süt dişleri"
                      checked={dentition === "child"}
                      onChange={(child) => { setDentition(child ? "child" : "adult"); setTeeth([]); }}
                      className="!items-center !gap-2 [&_label]:text-xs"
                    />
                  )}
                  onToggle={(num) => {
                    setTeeth((current) => (current.includes(num) ? current.filter((item) => item !== num) : [...current, num]));
                    clearError("teeth");
                  }}
                />
                <div className="text-xs text-slate-600">{selectionText}</div>
              </div>
            )}

            {priceError && <Callout tone="warning" compact>{priceError}</Callout>}

            <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
              <FormField label="Tedavi" htmlFor="hd-exam-treatment" required error={formErrors.treatment}>
                <SearchSelect
                  id="hd-exam-treatment"
                  className="ui-control"
                  query={treatmentQuery}
                  onQueryChange={(value) => {
                    setTreatmentQuery(value);
                    if (treatment && value !== treatment.treatment) setTreatment(null);
                  }}
                  options={treatmentOptions}
                  onSelect={(option) => {
                    const item = treatmentPool.find((entry) => entry.id === option.id) || null;
                    setTreatment(item);
                    setTreatmentQuery(option.label);
                    // Fiyat listeden kendiliğinden gelir; hekim değiştirebilir.
                    if (item) setAmount(toMoneyValue(item.amount) ?? "");
                    setFormErrors((current) => ({ ...current, treatment: "", amount: "" }));
                  }}
                  placeholder={priceSource === "custom" ? "Klinik listesinde ara: ad veya kod" : "Tedavi adı veya kodu"}
                  emptyText="Tedavi bulunamadı"
                />
              </FormField>
              <FormField label="Tutar (diş başına)" htmlFor="hd-exam-amount" required error={formErrors.amount}>
                <MoneyInput id="hd-exam-amount" value={amount} onChange={(value) => { setAmount(value); clearError("amount"); }} />
              </FormField>
              <FormField label="Hekim" htmlFor="hd-exam-doctor" required error={formErrors.doctor} hint={lockDoctorToSelf ? "Tedavi kaydını yalnız kendi adınıza açabilirsiniz." : undefined}>
                {lockDoctorToSelf
                  ? <Input id="hd-exam-doctor" readOnly value={ownDoctorName || "Kendi adınıza"} />
                  : <DoctorSelect id="hd-exam-doctor" value={doctorId} doctors={doctors} onChange={(id) => { setDoctorChoice(id); clearError("doctor"); }} />}
              </FormField>
            </div>

            {/* Klinik not çerçeveli katlanır kutu yerine tek satırlık bağlantı;
                açılınca alan formun içinde (kart içinde ikinci kutu yok). */}
            {noteOpen && (
              <FormField label="Klinik not" htmlFor="hd-exam-note" hint="İsteğe bağlı">
                <Textarea id="hd-exam-note" rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ön teşhis, planlama veya uygulama notu" />
              </FormField>
            )}

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {!noteOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={NotebookPen}
                    className="-ml-3"
                    onClick={() => {
                      setNoteOpen(true);
                      // Düğme alanla yer değiştirir; odak yazılacak alana geçer.
                      window.requestAnimationFrame(() => document.getElementById("hd-exam-note")?.focus());
                    }}
                  >
                    Klinik not ekle
                  </Button>
                )}
                {/* Toplam yalnız hesaplanınca yazar (boş bilgi cümlesi yok); bölge hep yerinde. */}
                <p className="text-sm text-slate-600" aria-live="polite">
                  {totalText ? <>{targets.length} kayıt{targets.length > 1 ? <> × {money(amount)}</> : null} = <b className="text-slate-900">{totalText}</b></> : null}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" icon={ClipboardCheck} loading={adding === "done"} disabled={Boolean(adding)} onClick={() => void addRecords("done")}>Yapıldı olarak kaydet</Button>
                <Button icon={Plus} loading={adding === "pending"} disabled={Boolean(adding)} onClick={() => void addRecords("pending")}>Yapılacaklara ekle</Button>
              </div>
            </div>
          </div>
        </Section>
      )}

      <ListTable
        title="Yapılacak tedaviler"
        subtitle={listSubtitle(pending.length, pendingTotal, pendingDoctor)}
        header={canWrite ? (
          <BulkActionBar
            count={selectedPending.length}
            itemLabel="tedavi"
            onClear={() => setSelectedPending([])}
            actions={(
              <>
                <Button size="sm" variant="secondary" icon={Check} loading={busy} onClick={() => void markDone(selectedPending)}>Yapıldı olarak işaretle</Button>
                {canDelete && <Button size="sm" variant="danger-ghost" disabled={busy} onClick={() => void cancelRecords(selectedPending, "pending")}>Listeden çıkar</Button>}
              </>
            )}
          />
        ) : undefined}
        columns={[
          ...baseColumns(pendingDoctor, "Yapılacak tedavinin tutarı, “Yapıldı” işaretlenince hastanın borcuna eklenir."),
          ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: pendingActions }] : []),
        ]}
        rows={pending}
        rowKey={(exam) => exam.id}
        selection={canWrite ? { selectedIds: selectedPending, onChange: setSelectedPending, isSelectable: canModify } : undefined}
        getRowAriaLabel={(exam) => `${exam.treatmentName}${exam.toothNo ? ` diş ${exam.toothNo}` : ""}`}
        emptyIcon={Stethoscope}
        emptyText="Yapılacak tedavi yok"
        emptyDescription={canWrite ? "Muayenede bulunan tedavileri yukarıdan “Yapılacaklara ekle” ile kaydedin; yapılınca tutarı borca eklenir." : undefined}
        mobileCard={(exam) => examCard(exam, pendingActions(exam), pendingDoctor)}
      />

      <ListTable
        title="Yapılan tedaviler"
        subtitle={listSubtitle(done.length, doneTotal, doneDoctor)}
        actions={done.length > 0 ? <Button size="sm" variant="secondary" icon={Printer} onClick={() => setPrintOpen(true)}>Tedavi raporu</Button> : undefined}
        columns={[...baseColumns(doneDoctor), ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: doneActions }] : [])]}
        rows={done}
        rowKey={(exam) => exam.id}
        emptyIcon={ClipboardCheck}
        emptyText="Yapılan tedavi yok"
        mobileCard={(exam) => examCard(exam, doneActions(exam), doneDoctor)}
      />

      {canReadPlans && (canPlan || treatmentPlans.length > 0) && (
        <Disclosure
          className="bg-[rgb(var(--app-surface))]"
          title="Tedavi planları (teklif)"
          summary={treatmentPlansLoaded ? (treatmentPlans.length > 0 ? `${treatmentPlans.length} plan · borca yansımaz` : "Plan yok") : undefined}
        >
          <div className="space-y-3">
            {treatmentPlans.length > 0 ? (
              <ul className="-mx-3.5 divide-y divide-slate-100">
                {treatmentPlans.map((plan) => {
                  const status = PLAN_STATUS[plan.status] || { label: plan.status, tone: "neutral" as const };
                  return (
                    <li key={plan.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-sm">
                      {/* Plan sayfası ?planId= ile doğrudan bu planı açar. */}
                      <Link href={`${planListHref}&planId=${encodeURIComponent(plan.id)}`} className="min-w-0 flex-1 font-medium text-slate-800 hover:text-primary hover:underline">{plan.title}</Link>
                      <span className="text-xs text-slate-500">{plan.steps.length} adım</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {plan.totalCost != null && <span className="font-semibold tabular-nums text-slate-700">{money(plan.totalCost)}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : treatmentPlansLoaded ? (
              <p className="text-sm text-slate-500">Bu hasta için tedavi planı yok.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {treatmentPlans.length > 0 && <Button size="sm" variant="secondary" icon={ExternalLink} href={planListHref}>Planları aç</Button>}
              {canPlan && <Button size="sm" variant="ghost" icon={Plus} href={newPlanHref}>Yeni plan</Button>}
            </div>
          </div>
        </Disclosure>
      )}

      {editing && <ExamEditModal exam={editing} onClose={() => setEditing(null)} />}

      <PrintSelectModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Tedavi raporu"
        description="Belgeye yazılacak tedavileri seçin."
        itemLabel="tedavi"
        priceToggle
        rows={done.map((exam) => ({ id: exam.id, date: formatDateText(exam.diagnosedAt), label: exam.treatmentName, meta: exam.toothNo ? `Diş ${exam.toothNo}` : undefined, amount: money(exam.amount) }))}
        onPrint={(ids, showPrices) => {
          void getLetterhead().then((clinic) => printTreatmentReport(
            { data, clinic, hidePhone: hidePatientPhone },
            done.filter((exam) => ids.includes(exam.id)).sort((a, b) => new Date(a.diagnosedAt).getTime() - new Date(b.diagnosedAt).getTime()),
            showPrices,
          ));
        }}
      />
    </div>
  );
}
