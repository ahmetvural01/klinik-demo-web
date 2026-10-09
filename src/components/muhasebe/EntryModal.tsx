"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";
import { showToastSafe } from "@/lib/toast-client";
import {
  DOCTOR_PAYOUT_METHODS,
  KDV_OPTIONS,
  METHOD_LABELS,
  money,
  monthName,
  newRequestKey,
  parseAmount,
  requiresPos,
  todayKey,
} from "@/components/muhasebe/muhasebe-utils";
import { ExpenseTypesModal, type ExpenseCategory } from "@/components/muhasebe/ExpenseTypesModal";
import { turkeyLocalDateTimeToUtc } from "@/lib/tz";

export type EntryKind = "gelir" | "gider" | "firma" | "hakedis";

/** Formu belirli bir bağlamla açmak için (ör. Alacaklar'dan hasta seçili, Hakediş'ten dönem seçili). */
export type EntryRequest = {
  kind: EntryKind;
  patient?: PickedPatient | null;
  doctorId?: string;
  payout?: { doctorId: string; year: number; month: number; kalan: number };
};

type PosDevice = { id: string; name: string; isActive: boolean };
type Firma = { id: string; name: string; bakiye: number };
type PayoutPeriod = { year: number; month: number; kalan: number };
type PatientBalance = {
  bakiye: number;
  doctors: { id: string; fullName: string }[];
  lastDoctorId: string | null;
  plan: { kalan: number; nextDueDate: string | null; nextDueAmount: number; overdueCount: number; doctorId: string | null } | null;
};

type Props = {
  request: EntryRequest | null;
  onClose: () => void;
  onSaved: (kind: EntryKind) => void;
  canWritePayments: boolean;
  canWriteFinance: boolean;
  canReadFinance: boolean;
};

const KIND_TITLE: Record<EntryKind, string> = {
  gelir: "Tahsilat al",
  gider: "Gider ekle",
  firma: "Firma ödemesi",
  hakedis: "Hakediş ödemesi",
};
const KIND_HINT: Record<EntryKind, string> = {
  gelir: "Hastadan alınan ödeme. Hastanın borcundan düşülür ve seçilen doktorun hakedişine sayılır.",
  gider: "Kira, fatura, maaş, sarf gibi klinik giderleri.",
  firma: "Tedarikçiye yapılan ödeme. Firmanın en eski açık borcundan başlayarak düşülür.",
  hakedis: "Doktora yapılan hakediş ödemesi. Seçilen ayın kalan hakedişinden düşülür.",
};

type Errors = Partial<Record<"patient" | "doctor" | "amount" | "method" | "pos" | "date" | "category" | "firma" | "period", string>>;

const methodOptions = (methods: readonly string[]) => methods.map((key) => <option key={key} value={key}>{METHOD_LABELS[key]}</option>);
const ALL_METHODS = Object.keys(METHOD_LABELS);

/** Tarih bugünse saat sunucuda "şimdi" olarak damgalanır; geçmiş günse o günün öğleni (hasta dosyasındaki tahsilatla aynı kural). */
function paymentTimestamp(dateKey: string) {
  if (!dateKey || dateKey === todayKey()) return undefined;
  return turkeyLocalDateTimeToUtc(dateKey, "12:00").toISOString();
}

export function EntryModal({ request, onClose, onSaved, canWritePayments, canWriteFinance, canReadFinance }: Props) {
  const open = Boolean(request);
  const [kind, setKind] = useState<EntryKind>("gelir");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const requestKeyRef = useRef("");

  // Ortak alanlar (tür değişse de kullanıcının yazdığı korunur)
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");

  // Tahsilat
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [method, setMethod] = useState("NAKIT");
  const [posId, setPosId] = useState("");
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);
  const [balance, setBalance] = useState<PatientBalance | null>(null);

  // Gider
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [expenseMethod, setExpenseMethod] = useState("NAKIT");
  const [kdv, setKdv] = useState("0");
  const [faturaNo, setFaturaNo] = useState("");
  const [typesOpen, setTypesOpen] = useState(false);

  // Firma ödemesi
  const [firmas, setFirmas] = useState<Firma[]>([]);
  const [firmasLoaded, setFirmasLoaded] = useState(false);
  const [firmaId, setFirmaId] = useState("");
  const [firmaMethod, setFirmaMethod] = useState("HAVALE_EFT");

  // Hakediş ödemesi
  const [payoutDoctorId, setPayoutDoctorId] = useState("");
  const [period, setPeriod] = useState("");
  const [periods, setPeriods] = useState<PayoutPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState("NAKIT");

  const loadCategories = useCallback(async () => {
    const response = await fetch("/api/gider-kategorileri", { cache: "no-store" }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => []) : [];
    const list: ExpenseCategory[] = Array.isArray(data) ? data : [];
    setCategories(list);
    return list;
  }, []);

  // Form her açılışta temiz ve istenen bağlamla başlar.
  useEffect(() => {
    if (!request) return;
    const initialKind: EntryKind = request.kind === "gelir" && !canWritePayments ? "gider" : request.kind;
    setKind(initialKind);
    setSaving(false);
    setServerError("");
    setErrors({});
    requestKeyRef.current = newRequestKey("entry");
    setAmount(request.payout ? String(request.payout.kalan) : "");
    setDate(todayKey());
    setNote("");
    setPatient(request.patient || null);
    setDoctorId(request.doctorId || "");
    setMethod("NAKIT");
    setPosId("");
    setBalance(null);
    setCategoryId("");
    setCategoryText("");
    setExpenseMethod("NAKIT");
    setKdv("0");
    setFaturaNo("");
    setFirmaId("");
    setFirmaMethod("HAVALE_EFT");
    setPayoutDoctorId(request.payout?.doctorId || "");
    setPeriod(request.payout ? `${request.payout.year}-${String(request.payout.month).padStart(2, "0")}` : "");
    setPayoutMethod("NAKIT");
  }, [request, canWritePayments]);

  // Tür değişince yeni işlem anahtarı: bir türde başarısız kalan deneme diğerine taşınmasın.
  useEffect(() => {
    requestKeyRef.current = newRequestKey(kind);
    setErrors({});
    setServerError("");
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    if (kind === "gelir" && posDevices.length === 0) {
      fetch("/api/pos-devices", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : []))
        .then((devices: PosDevice[]) => setPosDevices((Array.isArray(devices) ? devices : []).filter((device) => device.isActive)))
        .catch(() => setPosDevices([]));
    }
    if (kind === "gider" && categories.length === 0) void loadCategories();
    if (kind === "firma" && !firmasLoaded && canReadFinance) {
      fetch("/api/firma", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : []))
        .then((list: Firma[]) => setFirmas(Array.isArray(list) ? list : []))
        .catch(() => setFirmas([]))
        .finally(() => setFirmasLoaded(true));
    }
  }, [open, kind, posDevices.length, categories.length, firmasLoaded, canReadFinance, loadCategories]);

  // Seçilen hastanın güncel borcu ve hekimi: tutarı ve hekimi tahmin etmeyi kolaylaştırır.
  useEffect(() => {
    if (!open || kind !== "gelir" || !patient || !canReadFinance) { setBalance(null); return; }
    let active = true;
    fetch(`/api/muhasebe/alacaklar?patientId=${encodeURIComponent(patient.id)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        const row = Array.isArray(data?.rows) ? data.rows[0] : null;
        if (!row) { setBalance(null); return; }
        const next: PatientBalance = {
          bakiye: Number(row.bakiye) || 0,
          doctors: Array.isArray(row.doctors) ? row.doctors : [],
          lastDoctorId: row.lastDoctorId || null,
          plan: row.plan && Number(row.plan.kalan) > 0 ? {
            kalan: Number(row.plan.kalan) || 0,
            nextDueDate: row.plan.nextDueDate || null,
            nextDueAmount: Number(row.plan.nextDueAmount) || 0,
            overdueCount: Number(row.plan.overdueCount) || 0,
            doctorId: row.plan.doctorId || null,
          } : null,
        };
        setBalance(next);
        // Doktor önerisi: açık taksit planının doktoru (tahsilat taksitten ancak bu doktorla düşer),
        // yoksa son tedaviyi yapan doktor.
        setDoctorId((current) => current || next.plan?.doctorId || next.lastDoctorId || (next.doctors.length === 1 ? next.doctors[0].id : ""));
      })
      .catch(() => { if (active) setBalance(null); });
    return () => { active = false; };
  }, [open, kind, patient, canReadFinance]);

  // Hakediş: yalnız biten ve borcu kalan aylar ödenebilir.
  useEffect(() => {
    if (!open || kind !== "hakedis" || !payoutDoctorId) { setPeriods([]); return; }
    let active = true;
    setPeriodsLoading(true);
    fetch(`/api/hakedis?doctorId=${encodeURIComponent(payoutDoctorId)}&months=12`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        const current = todayKey().slice(0, 7);
        const list: PayoutPeriod[] = (Array.isArray(data?.months) ? data.months : [])
          .filter((row: PayoutPeriod) => `${row.year}-${String(row.month).padStart(2, "0")}` !== current && row.kalan > 0.5);
        setPeriods(list);
      })
      .catch(() => { if (active) setPeriods([]); })
      .finally(() => { if (active) setPeriodsLoading(false); });
    return () => { active = false; };
  }, [open, kind, payoutDoctorId]);

  const selectedPeriod = periods.find((item) => `${item.year}-${String(item.month).padStart(2, "0")}` === period);
  const selectedFirma = firmas.find((item) => item.id === firmaId);
  const payoutCategory = categories.find((item) => item.isDoctorPayout && item.isActive);
  const expenseOptions = useMemo(() => {
    const q = categoryText.trim().toLocaleLowerCase("tr");
    return categories
      .filter((item) => item.isActive && !item.isDoctorPayout && (!q || item.name.toLocaleLowerCase("tr").includes(q)))
      .slice(0, 40)
      .map((item) => ({ id: item.id, label: item.name }));
  }, [categories, categoryText]);

  const kindItems = [
    { key: "gelir" as const, label: "Tahsilat", disabled: !canWritePayments },
    { key: "gider" as const, label: "Gider", disabled: !canWriteFinance },
    { key: "firma" as const, label: "Firma ödemesi", disabled: !canWriteFinance || !canReadFinance },
    { key: "hakedis" as const, label: "Hakediş ödemesi", disabled: !canWriteFinance },
  ];

  const clearError = (key: keyof Errors) => setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));

  function validate(): { ok: boolean; value: number } {
    const next: Errors = {};
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value <= 0) next.amount = "Geçerli bir tutar yazın.";
    if (!date) next.date = "Tarih seçin.";
    else if (date > todayKey()) next.date = "İleri bir tarih seçilemez.";
    if (kind === "gelir") {
      if (!patient) next.patient = "Hastayı seçin.";
      if (!doctorId) next.doctor = "Tahsilatın sayılacağı doktoru seçin.";
      if (requiresPos(method) && !posId) next.pos = "Kart / mail order tahsilatında POS seçin.";
    }
    if (kind === "gider" && !categoryId) {
      const typed = categoryText.trim().toLocaleLowerCase("tr");
      if (!typed) next.category = "Gider türünü seçin veya yazın.";
      else if (categories.some((item) => item.isDoctorPayout && item.name.toLocaleLowerCase("tr") === typed)) {
        next.category = "Doktora yapılan ödeme için üstteki Hakediş ödemesi sekmesini kullanın.";
      }
    }
    if (kind === "firma") {
      if (!firmaId) next.firma = "Ödeme yapılan firmayı seçin.";
      else if (selectedFirma && !next.amount && value > selectedFirma.bakiye + 0.01) next.amount = `Firmaya borcunuz ${money(selectedFirma.bakiye)}; daha fazlası ödenemez.`;
    }
    if (kind === "hakedis") {
      if (!payoutDoctorId) next.doctor = "Doktoru seçin.";
      if (!period) next.period = "Hangi ayın hakedişi ödendiğini seçin.";
      else if (selectedPeriod && !next.amount && value > selectedPeriod.kalan + 0.01) next.amount = `Bu ay için en fazla ${money(selectedPeriod.kalan)} ödenebilir.`;
    }
    setErrors(next);
    return { ok: Object.keys(next).length === 0, value };
  }

  async function resolveExpenseCategory(): Promise<{ id: string | null; name: string }> {
    if (categoryId) {
      const picked = categories.find((item) => item.id === categoryId);
      return { id: categoryId, name: picked?.name || categoryText.trim() };
    }
    const name = categoryText.trim();
    const existing = categories.find((item) => !item.isDoctorPayout && item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    if (existing) return { id: existing.id, name: existing.name };
    // Listede olmayan tür yazıldıysa, formun söz verdiği gibi kalıcı tür olarak eklenir (raporlarda aynı adla gruplanır).
    const created = await fetch("/api/gider-kategorileri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (created?.ok) {
      const category = await created.json().catch(() => null);
      void loadCategories();
      if (category?.id) return { id: category.id, name: category.name || name };
    }
    const list = await loadCategories();
    const again = list.find((item) => item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    return { id: again && !again.isDoctorPayout ? again.id : null, name };
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (saving) return;
    const { ok, value } = validate();
    if (!ok) return;
    setSaving(true);
    setServerError("");
    try {
      let response: Response | null = null;
      let successMessage = "Kaydedildi";
      const headers = { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current };
      if (kind === "gelir" && patient) {
        response = await fetch("/api/payments", {
          method: "POST",
          headers,
          body: JSON.stringify({
            patientId: patient.id,
            doctorId,
            method,
            amount: value,
            description: note.trim() || null,
            ...(requiresPos(method) && posId ? { posId } : {}),
            ...(paymentTimestamp(date) ? { createdAt: paymentTimestamp(date) } : {}),
          }),
        }).catch(() => null);
        if (response?.ok) {
          const data = await response.clone().json().catch(() => null);
          const extras = [
            data?.taksitInfo?.updatedCount ? `${data.taksitInfo.updatedCount} taksit bu ödemeyle kapatıldı` : "",
            data?.autoCompletedAppointments ? "bugünkü randevusu tamamlandı olarak işaretlendi" : "",
          ].filter(Boolean);
          successMessage = `${patient.fullName} için ${money(value)} tahsilat kaydedildi${extras.length ? ` (${extras.join(", ")})` : ""}.`;
        }
      } else if (kind === "gider") {
        const category = await resolveExpenseCategory();
        response = await fetch("/api/gider", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tarih: date,
            categoryId: category.id,
            category: category.name,
            description: note.trim() || null,
            tutar: value,
            yontem: expenseMethod,
            faturaNo: faturaNo.trim() || null,
            kdvOrani: Number(kdv),
          }),
        }).catch(() => null);
        successMessage = `${category.name} gideri kaydedildi (${money(value)}).`;
      } else if (kind === "hakedis") {
        const [periodYear, periodMonth] = period.split("-").map(Number);
        response = await fetch("/api/gider", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tarih: date,
            categoryId: payoutCategory?.id || null,
            category: payoutCategory?.name || "Doktor Hakedişi",
            description: note.trim() || null,
            tutar: value,
            yontem: payoutMethod,
            doctorId: payoutDoctorId,
            periodYear,
            periodMonth,
          }),
        }).catch(() => null);
        successMessage = `${monthName(periodYear, periodMonth)} hakediş ödemesi kaydedildi (${money(value)}).`;
      } else if (kind === "firma") {
        response = await fetch(`/api/firma/${encodeURIComponent(firmaId)}/islemler`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            tarih: date,
            islemTipi: "ODEME",
            tutar: value,
            yontem: firmaMethod,
            faturaNo: faturaNo.trim() || null,
            kdvOrani: 0,
            aciklama: note.trim() || "Muhasebeden firma ödemesi",
          }),
        }).catch(() => null);
        successMessage = `${selectedFirma?.name || "Firma"} ödemesi kaydedildi (${money(value)}).`;
      }

      if (!response) {
        setServerError("Bağlantı kurulamadı. Girdiğiniz bilgiler korundu; tekrar Kaydet'e basabilirsiniz, kayıt iki kez oluşmaz.");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setServerError(data?.message || data?.error || "Kayıt yapılamadı. Bilgileri kontrol edip tekrar deneyin.");
        return;
      }
      showToastSafe({ message: successMessage, type: "success", icon: kind === "hakedis" ? "hakediş" : kind === "firma" ? "firma" : "finance", duration: 4500 });
      onSaved(kind);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const title = KIND_TITLE[kind];
  // Kullanıcının yazdığı bir şey varsa pencere kapatılırken onay sorulur; otomatik
  // doldurulan alanlar (bugünün tarihi, önerilen doktor, hakediş tutarı) sayılmaz.
  const dirty = open && Boolean(
    (amount && !(kind === "hakedis" && request?.payout && amount === String(request.payout.kalan)))
      || note.trim() || faturaNo.trim() || categoryText.trim() || firmaId
      || (patient && patient.id !== request?.patient?.id)
      || date !== todayKey(),
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        isDirty={dirty}
        title={title}
        description={KIND_HINT[kind]}
        size="lg"
        module={kind === "hakedis" ? "hakediş" : kind === "firma" ? "firma" : "finance"}
        footer={(
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button type="submit" form="muhasebe-entry-form" loading={saving}>Kaydet</Button>
          </>
        )}
      >
        <form id="muhasebe-entry-form" onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
          <Tabs ariaLabel="Kayıt türü" size="sm" items={kindItems} value={kind} onChange={setKind} />
          <FormErrorBanner message={serverError} />

          {kind === "gelir" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {/* htmlFor zorunlu: seçili hasta kartındaki "Değiştir" düğmesi etiketin ilk denetimi sayılıp
                    karta tıklayınca seçimi sıfırlamasın. */}
                <FormField label="Hasta" required htmlFor="entry-patient" error={errors.patient} hint={balance ? undefined : "Ad, TC veya telefonla arayın."}>
                  <PatientPicker
                    id="entry-patient"
                    value={patient}
                    onChange={(next) => { setPatient(next); clearError("patient"); }}
                    aria-label="Hasta"
                  />
                </FormField>
                {patient && balance && (
                  <div className="mt-1.5 space-y-1 text-xs text-slate-600">
                    <p className="flex flex-wrap items-center gap-x-2">
                      {balance.bakiye > 0.5 ? (
                        <>
                          <span>Kalan borcu: <b className="tabular-nums text-slate-900">{money(balance.bakiye)}</b></span>
                          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setAmount(String(Math.round(balance.bakiye * 100) / 100)); clearError("amount"); }}>
                            Tamamını yaz
                          </button>
                        </>
                      ) : (
                        <span>Bu hastanın açık borcu görünmüyor; ödeme ön ödeme olarak kaydedilir.</span>
                      )}
                    </p>
                    {balance.plan && (
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className={balance.plan.overdueCount > 0 ? "font-semibold text-red-700" : ""}>
                          Taksit planı: sıradaki {money(balance.plan.nextDueAmount)}
                          {balance.plan.nextDueDate ? ` (${new Date(balance.plan.nextDueDate).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })})` : ""}
                          {balance.plan.overdueCount > 0 ? ` · ${balance.plan.overdueCount} taksit gecikti` : ""}
                        </span>
                        {balance.plan.nextDueAmount > 0 && (
                          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setAmount(String(balance.plan?.nextDueAmount ?? "")); clearError("amount"); }}>
                            Taksit tutarını yaz
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <FormField label="Tutar (₺)" required htmlFor="entry-amount" error={errors.amount}>
                <Input id="entry-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="0,00" onChange={(event) => { setAmount(event.target.value); clearError("amount"); }} />
              </FormField>
              <FormField label="Ödeme yöntemi" required htmlFor="entry-method">
                <Select id="entry-method" value={method} onChange={(event) => { setMethod(event.target.value); setPosId(""); clearError("pos"); }}>
                  {methodOptions(ALL_METHODS)}
                </Select>
              </FormField>
              {requiresPos(method) && (
                <FormField label="POS cihazı" required htmlFor="entry-pos" error={errors.pos} hint={posDevices.length === 0 ? "Tanımlı POS yok; Ayarlar > POS cihazları bölümünden ekleyin." : undefined}>
                  <Select id="entry-pos" value={posId} onChange={(event) => { setPosId(event.target.value); clearError("pos"); }}>
                    <option value="">POS seçin</option>
                    {posDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                  </Select>
                </FormField>
              )}
              <FormField
                label="Doktor"
                required
                htmlFor="entry-doctor"
                error={errors.doctor}
                hint={balance?.plan?.doctorId && doctorId && doctorId !== balance.plan.doctorId
                  ? "Dikkat: taksit planının doktoru farklı; bu tahsilat taksitlerden düşülmez, yalnız genel borçtan düşer."
                  : "Tahsilat bu doktorun hakedişine sayılır."}
              >
                <FinanceDoctorSelect id="entry-doctor" value={doctorId} onChange={(id) => { setDoctorId(id); clearError("doctor"); }} aria-label="Doktor" />
              </FormField>
              <FormField label="Tarih" required htmlFor="entry-date" error={errors.date}>
                <Input id="entry-date" type="date" max={todayKey()} value={date} onChange={(event) => { setDate(event.target.value); clearError("date"); }} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Açıklama" htmlFor="entry-note">
                  <Input id="entry-note" value={note} maxLength={500} placeholder="Örn. implant 2. seans" onChange={(event) => setNote(event.target.value)} />
                </FormField>
              </div>
            </div>
          )}

          {kind === "gider" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Gider türü" required htmlFor="entry-category" error={errors.category} hint="Listede yoksa yazdığınız ad yeni gider türü olarak eklenir. Doktor ödemesi için Hakediş ödemesi sekmesini kullanın.">
                  <SearchSelect
                    id="entry-category"
                    aria-label="Gider türü"
                    query={categoryText}
                    onQueryChange={(value) => { setCategoryText(value); setCategoryId(""); clearError("category"); }}
                    options={expenseOptions}
                    onSelect={(option) => { setCategoryText(option.label); setCategoryId(option.id); clearError("category"); }}
                    placeholder="Örn. Kira, Elektrik, Sarf malzeme"
                    emptyText={categoryText.trim() ? `"${categoryText.trim()}" yeni gider türü olarak eklenecek` : "Kayıtlı gider türü yok"}
                    className="ui-control"
                  />
                </FormField>
                <button type="button" onClick={() => setTypesOpen(true)} className="mt-1.5 text-xs font-semibold text-primary hover:underline">
                  Gider türlerini düzenle
                </button>
              </div>
              <FormField label="Tutar (₺)" required htmlFor="entry-amount" error={errors.amount}>
                <Input id="entry-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="0,00" onChange={(event) => { setAmount(event.target.value); clearError("amount"); }} />
              </FormField>
              <FormField label="Ödeme yöntemi" htmlFor="entry-expense-method">
                <Select id="entry-expense-method" value={expenseMethod} onChange={(event) => setExpenseMethod(event.target.value)}>
                  {methodOptions(ALL_METHODS)}
                </Select>
              </FormField>
              <FormField label="Tarih" required htmlFor="entry-date" error={errors.date}>
                <Input id="entry-date" type="date" max={todayKey()} value={date} onChange={(event) => { setDate(event.target.value); clearError("date"); }} />
              </FormField>
              <FormField label="KDV" htmlFor="entry-kdv">
                <Select id="entry-kdv" value={kdv} onChange={(event) => setKdv(event.target.value)}>
                  {KDV_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Fatura no" htmlFor="entry-fatura">
                <Input id="entry-fatura" value={faturaNo} maxLength={100} onChange={(event) => setFaturaNo(event.target.value)} />
              </FormField>
              <FormField label="Açıklama" htmlFor="entry-note">
                <Input id="entry-note" value={note} maxLength={1000} placeholder="Örn. Ekim ayı kirası" onChange={(event) => setNote(event.target.value)} />
              </FormField>
            </div>
          )}

          {kind === "firma" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField
                  label="Firma"
                  required
                  htmlFor="entry-firma"
                  error={errors.firma}
                  hint={selectedFirma ? `Firmaya güncel borcunuz: ${money(selectedFirma.bakiye)}` : undefined}
                >
                  <Select id="entry-firma" value={firmaId} onChange={(event) => { setFirmaId(event.target.value); clearError("firma"); }}>
                    <option value="">{firmasLoaded ? "Firma seçin" : "Firmalar yükleniyor…"}</option>
                    {firmas.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}{item.bakiye > 0.005 ? ` — borç ${money(item.bakiye)}` : " — borç yok"}</option>
                    ))}
                  </Select>
                </FormField>
                {firmasLoaded && firmas.length === 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Kayıtlı firma yok. <Link href="/firma" className="font-semibold text-primary hover:underline">Firmalar ekranından ekleyin</Link>.
                  </p>
                )}
              </div>
              <FormField label="Tutar (₺)" required htmlFor="entry-amount" error={errors.amount}>
                <Input id="entry-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="0,00" onChange={(event) => { setAmount(event.target.value); clearError("amount"); }} />
              </FormField>
              <FormField label="Ödeme yöntemi" htmlFor="entry-firma-method">
                <Select id="entry-firma-method" value={firmaMethod} onChange={(event) => setFirmaMethod(event.target.value)}>
                  {methodOptions(ALL_METHODS)}
                </Select>
              </FormField>
              <FormField label="Tarih" required htmlFor="entry-date" error={errors.date}>
                <Input id="entry-date" type="date" max={todayKey()} value={date} onChange={(event) => { setDate(event.target.value); clearError("date"); }} />
              </FormField>
              <FormField label="Fatura / dekont no" htmlFor="entry-fatura">
                <Input id="entry-fatura" value={faturaNo} maxLength={100} onChange={(event) => setFaturaNo(event.target.value)} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Açıklama" htmlFor="entry-note">
                  <Input id="entry-note" value={note} maxLength={500} placeholder="Örn. Eylül faturası ödemesi" onChange={(event) => setNote(event.target.value)} />
                </FormField>
              </div>
            </div>
          )}

          {kind === "hakedis" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Doktor" required htmlFor="entry-payout-doctor" error={errors.doctor}>
                <FinanceDoctorSelect
                  id="entry-payout-doctor"
                  value={payoutDoctorId}
                  onChange={(id) => { setPayoutDoctorId(id); setPeriod(""); setAmount(""); clearError("doctor"); }}
                  aria-label="Doktor"
                />
              </FormField>
              <FormField
                label="Hakediş ayı"
                required
                htmlFor="entry-period"
                error={errors.period}
                hint={payoutDoctorId && !periodsLoading && periods.length === 0 ? "Bu doktora ödenecek hakediş yok (içinde bulunulan ay ödenemez)." : undefined}
              >
                <Select
                  id="entry-period"
                  value={period}
                  disabled={!payoutDoctorId || periodsLoading}
                  onChange={(event) => {
                    const next = event.target.value;
                    const found = periods.find((item) => `${item.year}-${String(item.month).padStart(2, "0")}` === next);
                    setPeriod(next);
                    if (found) setAmount(String(found.kalan));
                    clearError("period");
                    clearError("amount");
                  }}
                >
                  <option value="">{periodsLoading ? "Yükleniyor…" : payoutDoctorId ? "Ay seçin" : "Önce doktoru seçin"}</option>
                  {periods.map((item) => (
                    <option key={`${item.year}-${item.month}`} value={`${item.year}-${String(item.month).padStart(2, "0")}`}>
                      {monthName(item.year, item.month)} — kalan {money(item.kalan)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Tutar (₺)" required htmlFor="entry-amount" error={errors.amount} hint={selectedPeriod ? `En fazla ${money(selectedPeriod.kalan)}` : undefined}>
                <Input id="entry-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="0,00" onChange={(event) => { setAmount(event.target.value); clearError("amount"); }} />
              </FormField>
              <FormField label="Ödeme yöntemi" htmlFor="entry-payout-method" hint="Hakediş yalnız nakit veya havale/EFT ile ödenir.">
                <Select id="entry-payout-method" value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)}>
                  {methodOptions(DOCTOR_PAYOUT_METHODS)}
                </Select>
              </FormField>
              <FormField label="Ödeme tarihi" required htmlFor="entry-date" error={errors.date}>
                <Input id="entry-date" type="date" max={todayKey()} value={date} onChange={(event) => { setDate(event.target.value); clearError("date"); }} />
              </FormField>
              <FormField label="Açıklama" htmlFor="entry-note">
                <Input id="entry-note" value={note} maxLength={1000} placeholder="Örn. Eylül hakedişi" onChange={(event) => setNote(event.target.value)} />
              </FormField>
            </div>
          )}
          {/* Enter tuşu ile gönderim için görünmez düğme (alt bilgi düğmeleri form dışında render edilir). */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      <ExpenseTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} categories={categories} onChanged={loadCategories} />
    </>
  );
}
