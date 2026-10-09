"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ClipboardCheck, Pencil, Printer, Stethoscope, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Tabs } from "@/components/ui/Tabs";
import { formatDateText } from "@/components/ui/Money";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { OdontogramSelector } from "@/components/ToothChart";
import { cachedGet } from "@/lib/client-cache";
import { clientMutation, runRecordBatch } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { TDB_2026_CORE_PRICE_CATALOG } from "@/lib/dental-treatment-catalog";
import { EXAM_STATUS_DIAGNOSIS, EXAM_STATUS_DONE } from "@/lib/examination-status";
import { usePatientFile } from "./PatientFileContext";
import { ExamEditModal } from "./ExamEditModal";
import { PrintSelectModal } from "./PrintSelectModal";
import { printTreatmentReport } from "./print";
import {
  isChargeableExam,
  isPendingExam,
  money,
  parseMoneyInput,
  roundMoney,
  toNumber,
  type Exam,
} from "./patient-file-shared";

type PriceItem = { id: string; code?: string; treatment: string; amount: number };
type PriceSource = "standard" | "custom";
type Area = "teeth" | "upper" | "lower" | "all" | "none";

const AREA_OPTIONS: { value: Area; label: string }[] = [
  { value: "teeth", label: "Dişe göre" },
  { value: "upper", label: "Üst çene" },
  { value: "lower", label: "Alt çene" },
  { value: "all", label: "Tüm ağız" },
  { value: "none", label: "Diş yok (genel)" },
];
const AREA_LABEL: Record<Exclude<Area, "teeth" | "none">, string> = { upper: "Üst çene", lower: "Alt çene", all: "Tüm ağız" };

const PLAN_STATUS: Record<string, { label: string; tone: "info" | "success" | "neutral" | "warning" }> = {
  PLANLANDI: { label: "Planlandı", tone: "neutral" },
  DEVAM_EDIYOR: { label: "Devam ediyor", tone: "info" },
  TAMAMLANDI: { label: "Tamamlandı", tone: "success" },
  IPTAL: { label: "İptal", tone: "neutral" },
};

const sortByDateDesc = (a: Exam, b: Exam) => new Date(b.diagnosedAt).getTime() - new Date(a.diagnosedAt).getTime();

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
    clinicName,
    hidePatientPhone,
    balance,
  } = usePatientFile();
  const canWrite = can("examinations:write");
  const canDelete = can("examinations:delete");

  // ── Ekleme formu ─────────────────────────────────────────────────────────
  const [priceSource, setPriceSource] = useState<PriceSource>("standard");
  const [priceList, setPriceList] = useState<PriceItem[]>([]);
  const [doctorChoice, setDoctorChoice] = useState<string | null>(null);
  const [treatmentQuery, setTreatmentQuery] = useState("");
  const [treatment, setTreatment] = useState<PriceItem | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
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

  // Varsayılan hekim: giriş yapan kişi hekimse kendisi, değilse hastayı en son
  // tedavi eden hekim, klinikte tek hekim varsa o. Önceden giriş yapan kişi
  // (asistan/banko olsa bile) gönderiliyor, kayıt "Doktor kapsam dışında"
  // hatasıyla reddediliyordu.
  const defaultDoctorId = useMemo(() => {
    if (doctors.some((doctor) => doctor.id === currentUserId)) return currentUserId;
    if (recentDoctorId && doctors.some((doctor) => doctor.id === recentDoctorId)) return recentDoctorId;
    return doctors.length === 1 ? doctors[0].id : "";
  }, [doctors, currentUserId, recentDoctorId]);
  const doctorId = doctorChoice ?? defaultDoctorId;

  useEffect(() => {
    let active = true;
    cachedGet<{ activePriceList?: string } | null>("/api/settings", 60_000)
      .then((settings) => { if (active && (settings?.activePriceList === "custom" || settings?.activePriceList === "standard")) setPriceSource(settings.activePriceList); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!canWrite) return;
    let active = true;
    fetch(`/api/prices?type=${priceSource}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => { if (active) setPriceList(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setPriceList([]); });
    return () => { active = false; };
  }, [priceSource, canWrite]);

  // TDB kataloğu + klinik listesi birleşir: listede eksik kalem olsa da tedavi seçilebilir.
  const treatmentPool = useMemo(() => {
    const map = new Map<string, PriceItem>();
    const key = (item: PriceItem) => `${item.code || ""}::${item.treatment.toLocaleLowerCase("tr-TR")}`;
    for (const item of TDB_2026_CORE_PRICE_CATALOG) map.set(key(item), item);
    for (const item of priceList) map.set(key(item), item);
    return Array.from(map.values()).sort((a, b) => a.treatment.localeCompare(b.treatment, "tr"));
  }, [priceList]);

  const treatmentOptions = useMemo(() => {
    const query = treatmentQuery.trim().toLocaleLowerCase("tr-TR");
    return treatmentPool
      .filter((item) => !query || item.treatment.toLocaleLowerCase("tr-TR").includes(query) || String(item.code || "").toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 60)
      .map((item) => ({ id: item.id, label: item.treatment, meta: `${item.code ? `${item.code} · ` : ""}${money(item.amount)}` }));
  }, [treatmentPool, treatmentQuery]);

  const pending = useMemo(() => data.examinations.filter(isPendingExam).sort(sortByDateDesc), [data.examinations]);
  const done = useMemo(() => data.examinations.filter(isChargeableExam).sort(sortByDateDesc), [data.examinations]);
  const pendingTotal = roundMoney(pending.reduce((sum, exam) => sum + toNumber(exam.amount), 0));

  // Seçili satırlardan listede artık olmayanları (aktarılan/silinen) temizle.
  useEffect(() => {
    setSelectedPending((current) => current.filter((id) => pending.some((exam) => exam.id === id)));
  }, [pending]);

  const recordTargets = (): (string | undefined)[] => {
    if (area === "teeth") return teeth.length > 0 ? [...teeth].sort((a, b) => Number(a) - Number(b)) : [];
    if (area === "none") return [undefined];
    return [AREA_LABEL[area]];
  };
  const targets = recordTargets();
  const unitAmount = parseMoneyInput(amount);

  const resetForm = () => {
    setTeeth([]);
    setNote("");
  };

  const addRecords = async (mode: "pending" | "done") => {
    if (adding) return;
    const errors: Record<string, string> = {};
    if (!doctorId) errors.doctor = "Hekimi seçin.";
    const treatmentName = (treatment?.treatment || treatmentQuery).trim();
    if (treatmentName.length < 2) errors.treatment = "Listeden tedaviyi seçin.";
    if (!Number.isFinite(unitAmount) || unitAmount < 0) errors.amount = "Tutarı yazın (ücretsizse 0).";
    if (targets.length === 0) errors.teeth = "Şemadan en az bir diş seçin ya da yukarıdan çene / genel seçin.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAdding(mode);
    setFormError("");
    try {
      const diagnosedAt = new Date().toISOString();
      const result = await runRecordBatch(targets.map((tooth, index) => `${index}:${tooth || ""}`), async (key) => {
        const tooth = key.slice(key.indexOf(":") + 1) || undefined;
        await clientMutation("/api/examinations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            doctorId,
            treatmentName,
            toothNo: tooth,
            amount: unitAmount,
            status: mode === "done" ? EXAM_STATUS_DONE : EXAM_STATUS_DIAGNOSIS,
            diagnosedAt,
            note: note.trim() || undefined,
          }),
        }, "Kayıt eklenemedi.");
      });
      if (result.failed.length > 0) {
        setFormError(`${result.succeeded.length} kayıt eklendi, ${result.failed.length} kayıt eklenemedi. Tekrar deneyin.`);
      } else {
        const where = mode === "done" ? "yapılan tedavilere" : "muayene listesine";
        showToastSafe({ type: "success", icon: "tedavi", message: `${treatmentName}: ${result.succeeded.length} kayıt ${where} eklendi.` });
        resetForm();
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
    if (ids.length > 1 && !(await confirmDialog({ message: `${ids.length} kayıt yapıldı olarak işaretlensin mi? Tutarları hastanın borcuna eklenir.`, confirmText: "Yapıldı olarak işaretle" }))) return;
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
        showToastSafe({ type: "error", message: `${result.succeeded.length} kayıt aktarıldı; ${result.failed.length} kayıt aktarılamadı.` });
      } else {
        showToastSafe({ type: "success", icon: "tedavi", message: ids.length === 1 ? "Tedavi yapıldı olarak işaretlendi; tutarı borca eklendi." : `${ids.length} tedavi yapıldı olarak işaretlendi.` });
      }
      if (result.succeeded.length > 0) void reload(true);
    } finally {
      setBusy(false);
    }
  };

  const cancelRecords = async (ids: string[], kind: "pending" | "done") => {
    if (busy || ids.length === 0) return;
    const message = kind === "done"
      ? "Yapılan tedavi kaydı iptal edilsin mi? Tutarı hastanın borcundan düşülür; kayıt işlem geçmişinde saklanır."
      : `${ids.length > 1 ? `${ids.length} kayıt` : "Kayıt"} muayene listesinden çıkarılsın mı? İşlem geçmişinde saklanır.`;
    if (!(await confirmDialog({ message, danger: true, confirmText: kind === "done" ? "Tedaviyi iptal et" : "Listeden çıkar" }))) return;
    setBusy(true);
    try {
      const result = await runRecordBatch(ids, async (id) => {
        await clientMutation(`/api/examinations/${id}`, { method: "DELETE" }, "Kayıt iptal edilemedi.");
      });
      if (result.failed.length > 0) {
        showToastSafe({ type: "error", message: `${result.succeeded.length} kayıt kaldırıldı; ${result.failed.length} kayıt kaldırılamadı.` });
      } else {
        showToastSafe({ type: "success", message: kind === "done" ? "Tedavi iptal edildi." : "Listeden çıkarıldı." });
      }
      if (result.succeeded.length > 0) void reload(true);
    } finally {
      setBusy(false);
    }
  };

  const treatmentCell = (exam: Exam) => (
    <div className="min-w-0">
      <p className="font-medium text-slate-800">{exam.treatmentName}</p>
      {exam.note && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500" title={exam.note}>{exam.note}</p>}
    </div>
  );

  const pendingActions = (exam: Exam) => (
    <div className="flex justify-end gap-1.5">
      <IconButton icon={Check} title="Yapıldı olarak işaretle" tone="primary" size="sm" disabled={busy} onClick={() => void markDone([exam.id])} />
      <IconButton icon={Pencil} title="Düzenle" size="sm" disabled={busy} onClick={() => setEditing(exam)} />
      {canDelete && <IconButton icon={XCircle} title="Listeden çıkar" tone="danger" size="sm" disabled={busy} onClick={() => void cancelRecords([exam.id], "pending")} />}
    </div>
  );

  const doneActions = (exam: Exam) => (
    <div className="flex justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" disabled={busy} onClick={() => setEditing(exam)} />
      {canDelete && <IconButton icon={XCircle} title="Tedaviyi iptal et" tone="danger" size="sm" disabled={busy} onClick={() => void cancelRecords([exam.id], "done")} />}
    </div>
  );

  const baseColumns: ListTableColumn<Exam>[] = [
    { key: "date", header: "Tarih", render: (exam) => <span className="whitespace-nowrap">{formatDateText(exam.diagnosedAt)}</span> },
    { key: "treatment", header: "Tedavi", render: treatmentCell },
    { key: "tooth", header: "Diş", render: (exam) => exam.toothNo || <EmptyValue /> },
    { key: "doctor", header: "Hekim", render: (exam) => exam.doctor?.fullName || <EmptyValue /> },
    { key: "amount", header: "Tutar", align: "right", render: (exam) => <span className="tabular-nums">{money(exam.amount)}</span> },
  ];

  const examCard = (exam: Exam, actions: ReactNode) => (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{exam.treatmentName}{exam.toothNo ? <span className="font-normal text-slate-500"> · Diş {exam.toothNo}</span> : null}</p>
          <p className="text-xs text-slate-500">{[formatDateText(exam.diagnosedAt), exam.doctor?.fullName].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{money(exam.amount)}</span>
      </div>
      {canWrite && <div className="flex justify-end">{actions}</div>}
    </div>
  );

  const treatmentPlanHref = `/tedavi-plani?patientId=${patientId}&patientName=${encodeURIComponent(data.fullName)}`;
  const canPlan = can("treatment:write");

  return (
    <div className="space-y-4">
      {(treatmentPlans.length > 0 || canPlan) && (
        <section className="ui-surface p-4" aria-label="Tedavi planları">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Tedavi planları</h2>
              <p className="text-xs text-slate-500">
                {treatmentPlans.length > 0
                  ? "Plan tutarları borca yansımaz; tedavi yapıldıkça aşağıdan kaydedilir."
                  : "Uzun süren tedaviler için hastaya plan ve fiyat teklifi hazırlayın."}
              </p>
            </div>
            <Button variant="secondary" size="sm" href={treatmentPlanHref}>{treatmentPlans.length > 0 ? (canPlan ? "Planları yönet" : "Planları gör") : "Yeni plan"}</Button>
          </div>
          {treatmentPlans.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {treatmentPlans.map((plan) => {
                const status = PLAN_STATUS[plan.status] || { label: plan.status, tone: "neutral" as const };
                return (
                  <li key={plan.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <Link href={treatmentPlanHref} className="min-w-0 flex-1 font-medium text-slate-800 hover:text-primary">{plan.title}</Link>
                    <span className="text-xs text-slate-500">{plan.steps.length} adım</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {plan.totalCost != null && <span className="font-semibold tabular-nums text-slate-700">{money(plan.totalCost)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {canWrite ? (
        <section className="ui-surface space-y-4 p-4 sm:p-5" aria-label="Muayene veya tedavi ekle">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Muayene / tedavi ekle</h2>
              <p className="mt-0.5 text-sm text-slate-500">Tedaviyi seçin, dişleri işaretleyin. Her diş için ayrı kayıt açılır.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Fiyat listesi
              <Select size="sm" value={priceSource} onChange={(event) => setPriceSource(event.target.value as PriceSource)} aria-label="Fiyat listesi" className="w-auto">
                <option value="standard">TDB 2026 tarifesi</option>
                <option value="custom">Klinik fiyat listesi</option>
              </Select>
            </label>
          </div>
          <FormErrorBanner message={formError} />

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)]">
            <FormField label="Hekim" htmlFor="hd-exam-doctor" required error={formErrors.doctor}>
              <DoctorSelect id="hd-exam-doctor" value={doctorId} doctors={doctors} onChange={(id) => { setDoctorChoice(id); setFormErrors((current) => ({ ...current, doctor: "" })); }} />
            </FormField>
            <FormField label="Tedavi" htmlFor="hd-exam-treatment" required error={formErrors.treatment}>
              <SearchSelect
                id="hd-exam-treatment"
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
                  if (item) setAmount(String(item.amount));
                  setFormErrors((current) => ({ ...current, treatment: "", amount: "" }));
                }}
                placeholder="Tedavi adı veya kodu yazın"
                emptyText="Tedavi bulunamadı"
              />
            </FormField>
            <FormField label="Tutar (₺, diş başına)" htmlFor="hd-exam-amount" required error={formErrors.amount}>
              <Input id="hd-exam-amount" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setFormErrors((current) => ({ ...current, amount: "" })); }} placeholder="0" />
            </FormField>
          </div>

          <div className="space-y-3">
            <ChoiceCards label="Nereye?" variant="pills" options={AREA_OPTIONS} value={area} onChange={(value) => { setArea(value); setFormErrors((current) => ({ ...current, teeth: "" })); }} />
            {area === "teeth" && (
              <div className="space-y-2">
                <Tabs
                  ariaLabel="Diş şeması"
                  size="sm"
                  items={[{ key: "adult", label: "Daimi dişler" }, { key: "child", label: "Süt dişleri" }]}
                  value={dentition}
                  onChange={(value) => { setDentition(value); setTeeth([]); }}
                />
                <OdontogramSelector
                  selected={teeth}
                  dentition={dentition}
                  onToggle={(num) => {
                    setTeeth((current) => (current.includes(num) ? current.filter((item) => item !== num) : [...current, num]));
                    setFormErrors((current) => ({ ...current, teeth: "" }));
                  }}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  {teeth.length > 0 ? (
                    <>
                      <span>Seçili: <b className="text-slate-800">{[...teeth].sort((a, b) => Number(a) - Number(b)).join(", ")}</b></span>
                      <Button variant="ghost" size="sm" onClick={() => setTeeth([])}>Seçimi temizle</Button>
                    </>
                  ) : (
                    <span className={formErrors.teeth ? "font-medium text-red-700" : ""}>{formErrors.teeth || "Şemada dişe dokunarak seçin; tekrar dokunmak seçimi kaldırır."}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <FormField label="Klinik not" htmlFor="hd-exam-note" hint="İsteğe bağlı — ön teşhis, planlama veya uygulama notu.">
            <Textarea id="hd-exam-note" rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {targets.length > 0 && Number.isFinite(unitAmount)
                ? <>{targets.length} kayıt{targets.length > 1 ? <> × {money(unitAmount)}</> : null} = <b className="text-slate-900">{money(unitAmount * targets.length)}</b></>
                : "Tedavi ve diş seçince toplam burada görünür."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" icon={ClipboardCheck} loading={adding === "done"} disabled={Boolean(adding)} onClick={() => void addRecords("done")}>Yapıldı olarak kaydet</Button>
              <Button icon={Stethoscope} loading={adding === "pending"} disabled={Boolean(adding)} onClick={() => void addRecords("pending")}>Muayene listesine ekle</Button>
            </div>
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Muayene ve tedavi kaydını hekim girer. Aşağıdaki kayıtları görüntüleyebilirsiniz.
        </p>
      )}

      <ListTable
        header={(
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Muayene listesi · yapılmayı bekleyen</h2>
              <p className="text-xs text-slate-500">
                {pending.length > 0 ? `${pending.length} kayıt · ${money(pendingTotal)} — yapılınca “Yapıldı” işaretleyin, tutar borca eklenir.` : "Bekleyen kayıt yok."}
              </p>
            </div>
            {canWrite && selectedPending.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={Check} loading={busy} onClick={() => void markDone(selectedPending)}>Yapıldı olarak işaretle ({selectedPending.length})</Button>
                {canDelete && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void cancelRecords(selectedPending, "pending")}>Listeden çıkar</Button>}
              </div>
            )}
          </div>
        )}
        columns={[...baseColumns, ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: pendingActions }] : [])]}
        rows={pending}
        rowKey={(exam) => exam.id}
        selection={canWrite ? { selectedIds: selectedPending, onChange: setSelectedPending } : undefined}
        getRowAriaLabel={(exam) => `${exam.treatmentName}${exam.toothNo ? ` diş ${exam.toothNo}` : ""}`}
        emptyIcon={Stethoscope}
        emptyText="Yapılmayı bekleyen muayene kaydı yok"
        mobileCard={(exam) => examCard(exam, pendingActions(exam))}
      />

      <ListTable
        header={(
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Yapılan tedaviler</h2>
              <p className="text-xs text-slate-500">
                {done.length > 0
                  ? <>Toplam {money(balance.totalCharged)}{balance.discountRate > 0 ? <> · %{balance.discountRate} indirimle {money(balance.discountedTotal)}</> : null}</>
                  : "Henüz yapılan tedavi yok."}
              </p>
            </div>
            {done.length > 0 && <Button size="sm" variant="secondary" icon={Printer} onClick={() => setPrintOpen(true)}>Tedavi raporu</Button>}
          </div>
        )}
        columns={[...baseColumns, ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: doneActions }] : [])]}
        rows={done}
        rowKey={(exam) => exam.id}
        emptyIcon={ClipboardCheck}
        emptyText="Yapılan tedavi kaydı yok"
        mobileCard={(exam) => examCard(exam, doneActions(exam))}
      />

      <ExamEditModal exam={editing} onClose={() => setEditing(null)} />

      <PrintSelectModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Tedavi raporu"
        description="Belgeye yazılacak tedavileri seçin."
        itemLabel="tedavi"
        priceToggle
        rows={done.map((exam) => ({ id: exam.id, date: formatDateText(exam.diagnosedAt), label: exam.treatmentName, meta: exam.toothNo ? `Diş ${exam.toothNo}` : undefined, amount: money(exam.amount) }))}
        onPrint={(ids, showPrices) => printTreatmentReport(
          { data, clinicName, hidePhone: hidePatientPhone },
          done.filter((exam) => ids.includes(exam.id)).sort((a, b) => new Date(a.diagnosedAt).getTime() - new Date(b.diagnosedAt).getTime()),
          showPrices,
        )}
      />
    </div>
  );
}

