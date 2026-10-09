"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Switch } from "@/components/ui/Switch";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import { addInstallmentPeriod } from "@/lib/installment-schedule";
import { formatDateText } from "@/components/ui/Money";
import { usePatientFile } from "./PatientFileContext";
import { errorMessageOf, money, newIdempotencyKey, parseMoneyInput, PAYMENT_METHOD_LABELS, roundMoney } from "./patient-file-shared";

const PERIOD_OPTIONS = [
  { value: "HAFTALIK", label: "Haftada bir" },
  { value: "IKIHALFTALIK", label: "İki haftada bir" },
  { value: "AYLIK", label: "Ayda bir" },
  { value: "IKIAYLIK", label: "İki ayda bir" },
  { value: "UCAYLIK", label: "Üç ayda bir" },
  { value: "ALTIAYLIK", label: "Altı ayda bir" },
  { value: "YILLIK", label: "Yılda bir" },
];

type Method = "NAKIT" | "KREDI_KARTI" | "HAVALE_EFT" | "MAIL_ORDER" | "DIGER";
const METHOD_OPTIONS = (["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"] as Method[]).map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));
const needsPos = (method: string) => method === "KREDI_KARTI" || method === "MAIL_ORDER";

type Row = { date: string; amount: string };
type FormState = {
  total: string;
  downPayment: string;
  collectDownPayment: boolean;
  downMethod: Method;
  downPosId: string;
  count: string;
  period: string;
  startDate: string;
  doctorId: string;
  notes: string;
};

function nextMonthKey() {
  const today = new Date(`${turkeyDateKey()}T00:00:00.000Z`);
  return turkeyDateKey(addInstallmentPeriod(today, "AYLIK", 1));
}

/** Kalan tutarı eşit taksitlere böler; kuruş küsuratı son taksite eklenir. */
function buildSchedule(remaining: number, count: number, period: string, startDate: string): Row[] {
  if (!Number.isFinite(remaining) || remaining <= 0 || !Number.isInteger(count) || count < 1 || count > 60 || !startDate) return [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  const per = roundMoney(remaining / count);
  return Array.from({ length: count }, (_, index) => {
    const isLast = index === count - 1;
    const amount = isLast ? roundMoney(remaining - per * (count - 1)) : per;
    return { date: turkeyDateKey(addInstallmentPeriod(start, period, index)), amount: amount.toFixed(2) };
  });
}

/**
 * Taksit planı — tek sayfa: tutar, peşinat, taksit sayısı ve takvim aynı
 * yerde; takvim yazdıkça güncellenir. Önceden üç adımlı sihirbazdı, varsayılan
 * tutar indirimli toplamla doluyordu (önceki tahsilatlar düşülmediği için
 * "mevcut borcu aşamaz" hatası veriyordu), hekim olarak giriş yapan kişi
 * gönderildiği için banko/muhasebe plan oluşturamıyordu ve peşinat hiçbir
 * yerde tahsilat olarak görünmüyordu.
 */
export function InstallmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { patientId, data, reload, doctors, recentDoctorId, balance, can } = usePatientFile();
  const debt = Math.max(balance.totalDebt, 0);
  const [form, setForm] = useState<FormState>(() => ({
    total: "", downPayment: "", collectDownPayment: true, downMethod: "NAKIT", downPosId: "",
    count: "3", period: "AYLIK", startDate: nextMonthKey(), doctorId: "", notes: "",
  }));
  const [rows, setRows] = useState<Row[]>([]);
  const [manualRows, setManualRows] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [posDevices, setPosDevices] = useState<{ id: string; name: string; isActive: boolean }[] | null>(null);
  const requestKeyRef = useRef("");
  const snapshotRef = useRef("");
  const debtRef = useRef(debt);
  debtRef.current = debt;
  const recentDoctorRef = useRef(recentDoctorId);
  recentDoctorRef.current = recentDoctorId;

  useEffect(() => {
    if (!open) return;
    const initial: FormState = {
      total: debtRef.current > 0 ? debtRef.current.toFixed(2) : "",
      downPayment: "",
      collectDownPayment: true,
      downMethod: "NAKIT",
      downPosId: "",
      count: "3",
      period: "AYLIK",
      startDate: nextMonthKey(),
      doctorId: recentDoctorRef.current,
      notes: "",
    };
    setForm(initial);
    snapshotRef.current = JSON.stringify(initial);
    setManualRows(false);
    setErrors({});
    setError("");
    requestKeyRef.current = "";
  }, [open]);

  const total = parseMoneyInput(form.total);
  const down = form.downPayment.trim() ? parseMoneyInput(form.downPayment) : 0;
  const remaining = Number.isFinite(total) && Number.isFinite(down) ? roundMoney(total - down) : NaN;
  const count = Number(form.count);
  const canCollect = can("payments:write");
  const collectingDown = down > 0 && form.collectDownPayment && canCollect;

  // Takvim, kullanıcı satırları elle değiştirmediği sürece yazdıkça yenilenir.
  useEffect(() => {
    if (!open || manualRows) return;
    setRows(buildSchedule(remaining, count, form.period, form.startDate));
  }, [open, manualRows, remaining, count, form.period, form.startDate]);

  useEffect(() => {
    if (!open || !collectingDown || !needsPos(form.downMethod) || posDevices) return;
    let active = true;
    fetch("/api/pos-devices", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => { if (active) setPosDevices(Array.isArray(list) ? list.filter((device: { isActive: boolean }) => device.isActive) : []); })
      .catch(() => { if (active) setPosDevices([]); });
    return () => { active = false; };
  }, [open, collectingDown, form.downMethod, posDevices]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const rowsTotal = roundMoney(rows.reduce((sum, row) => sum + (parseMoneyInput(row.amount) || 0), 0));
  const rowsMismatch = rows.length > 0 && Number.isFinite(remaining) && Math.abs(rowsTotal - remaining) > 0.01;
  const dirty = open && JSON.stringify(form) !== snapshotRef.current;

  const summary = useMemo(() => {
    if (!Number.isFinite(remaining) || remaining <= 0 || rows.length === 0) return "";
    const first = rows[0];
    return `${rows.length} taksit · ilk taksit ${formatDateText(`${first.date}T12:00:00.000Z`)} · ${money(parseMoneyInput(first.amount))}`;
  }, [remaining, rows]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!Number.isFinite(total) || total <= 0) next.total = "Taksitlendirilecek tutarı yazın.";
    else if (total > debt + 0.005) next.total = `Kalan borç ${money(debt)}; plan bundan büyük olamaz.`;
    if (!Number.isFinite(down) || down < 0) next.downPayment = "Geçerli bir peşinat yazın.";
    else if (Number.isFinite(total) && down >= total) next.downPayment = "Peşinat, plan tutarından küçük olmalı.";
    if (!Number.isInteger(count) || count < 1 || count > 60) next.count = "1 ile 60 arasında bir taksit sayısı yazın.";
    if (!form.startDate) next.startDate = "İlk taksit tarihini seçin.";
    if (!form.doctorId) next.doctorId = "Planın hangi hekimin tedavisi için yapıldığını seçin.";
    if (collectingDown && needsPos(form.downMethod) && !form.downPosId) next.downPosId = "Kartla alınan peşinat için POS seçin.";
    if (rows.some((row) => !row.date || !(parseMoneyInput(row.amount) > 0))) next.rows = "Her taksitin tarihi ve 0'dan büyük tutarı olmalı.";
    else if (rows.some((row, index) => index > 0 && row.date < rows[index - 1].date)) next.rows = "Taksit tarihleri sırayla ilerlemeli.";
    else if (rowsMismatch) next.rows = `Taksitlerin toplamı ${money(rowsTotal)}; peşinat sonrası kalan ${money(remaining)} olmalı.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    setError("");
    try {
      if (!requestKeyRef.current) requestKeyRef.current = newIdempotencyKey("taksit");
      const response = await fetch("/api/taksit-plani", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId,
          doctorId: form.doctorId,
          baslik: `${rows.length} taksitli ödeme planı`,
          toplamBorc: total,
          pesnat: down,
          taksitSayisi: rows.length,
          period: form.period,
          startDate: rows[0]?.date || form.startDate,
          notes: form.notes.trim() || undefined,
          taksitler: rows.map((row, index) => ({ siraNo: index + 1, date: row.date, amount: parseMoneyInput(row.amount) })),
          ...(collectingDown ? { pesinatTahsilat: { yontem: form.downMethod, posId: needsPos(form.downMethod) ? form.downPosId : null } } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessageOf(body, "Taksit planı oluşturulamadı."));
      showToastSafe({
        type: "success",
        icon: "finance",
        message: collectingDown ? `Taksit planı oluşturuldu, ${money(down)} peşinat tahsil edildi.` : "Taksit planı oluşturuldu.",
      });
      requestKeyRef.current = "";
      onClose();
      void reload(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Taksit planı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      isDirty={dirty}
      module="finance"
      title="Taksit planı"
      description={`${data.fullName} · kalan borç ${money(debt)}`}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <FormErrorBanner message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Taksitlendirilecek tutar (₺)" htmlFor="hd-ins-total" required error={errors.total} hint={`En fazla kalan borç kadar: ${money(debt)}`}>
            <Input id="hd-ins-total" inputMode="decimal" value={form.total} onChange={(event) => set("total", event.target.value)} data-autofocus />
          </FormField>
          <FormField label="Peşinat (₺)" htmlFor="hd-ins-down" error={errors.downPayment} hint="İsteğe bağlı. Bugün alınan kısım.">
            <Input id="hd-ins-down" inputMode="decimal" placeholder="0" value={form.downPayment} onChange={(event) => set("downPayment", event.target.value)} />
          </FormField>
        </div>

        {down > 0 && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <Switch
              checked={form.collectDownPayment && canCollect}
              disabled={!canCollect}
              onChange={(checked) => set("collectDownPayment", checked)}
              label="Peşinatı şimdi tahsilat olarak kaydet"
              description={canCollect
                ? "Açıkken peşinat kasaya ve hastanın tahsilatlarına işlenir, borç düşer. Peşinatı daha önce tahsilat olarak girdiyseniz kapatın."
                : "Tahsilat yetkiniz olmadığı için peşinat yalnız planda not edilir; tahsilatı yetkili kişi girmelidir."}
            />
            {collectingDown && (
              <>
                <ChoiceCards label="Peşinat nasıl ödendi?" variant="pills" options={METHOD_OPTIONS} value={form.downMethod} onChange={(value) => { set("downMethod", value); if (!needsPos(value)) set("downPosId", ""); }} />
                {needsPos(form.downMethod) && (
                  <FormField label="POS cihazı" htmlFor="hd-ins-pos" required error={errors.downPosId}>
                    <Select id="hd-ins-pos" value={form.downPosId} onChange={(event) => set("downPosId", event.target.value)}>
                      <option value="">{posDevices ? (posDevices.length ? "POS cihazı seçin" : "Kayıtlı POS cihazı yok") : "Yükleniyor…"}</option>
                      {(posDevices || []).map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                    </Select>
                  </FormField>
                )}
              </>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Taksit sayısı" htmlFor="hd-ins-count" required error={errors.count}>
            <Input id="hd-ins-count" type="number" min={1} max={60} value={form.count} onChange={(event) => { set("count", event.target.value); setManualRows(false); }} />
          </FormField>
          <FormField label="Ne sıklıkla?" htmlFor="hd-ins-period" required>
            <Select id="hd-ins-period" value={form.period} onChange={(event) => { set("period", event.target.value); setManualRows(false); }}>
              {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </FormField>
          <FormField label="İlk taksit tarihi" htmlFor="hd-ins-start" required error={errors.startDate}>
            <Input id="hd-ins-start" type="date" value={form.startDate} onChange={(event) => { set("startDate", event.target.value); setManualRows(false); }} />
          </FormField>
        </div>

        <FormField label="Hekim" htmlFor="hd-ins-doctor" required error={errors.doctorId} hint="Plan ve peşinat bu hekimin tedavisi için kaydedilir.">
          <DoctorSelect id="hd-ins-doctor" value={form.doctorId} doctors={doctors} onChange={(id) => set("doctorId", id)} />
        </FormField>

        <section aria-label="Taksit takvimi" className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-bold text-slate-800">Taksit takvimi</p>
              <p className="text-xs text-slate-500">{summary || "Tutar ve taksit sayısını yazın; takvim burada oluşur."}</p>
            </div>
            {manualRows && (
              <Button variant="ghost" size="sm" onClick={() => setManualRows(false)}>Eşit böl</Button>
            )}
          </div>
          {rows.length > 0 && (
            <ol className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {rows.map((row, index) => (
                <li key={index} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-500">{index + 1}.</span>
                  <Input
                    size="sm"
                    type="date"
                    aria-label={`${index + 1}. taksit tarihi`}
                    value={row.date}
                    onChange={(event) => { setManualRows(true); setRows((current) => current.map((item, i) => (i === index ? { ...item, date: event.target.value } : item))); }}
                  />
                  <Input
                    size="sm"
                    inputMode="decimal"
                    aria-label={`${index + 1}. taksit tutarı`}
                    value={row.amount}
                    onChange={(event) => { setManualRows(true); setRows((current) => current.map((item, i) => (i === index ? { ...item, amount: event.target.value } : item))); }}
                    className="text-right tabular-nums"
                  />
                </li>
              ))}
            </ol>
          )}
          {rows.length > 0 && (
            <p className={`flex flex-wrap justify-between gap-2 border-t px-3 py-2 text-xs font-semibold ${rowsMismatch ? "border-red-100 bg-red-50 text-red-700" : "border-slate-100 text-slate-600"}`}>
              <span>Taksitler toplamı: {money(rowsTotal)}</span>
              <span>{rowsMismatch ? `Olması gereken: ${money(remaining)}` : "Peşinat sonrası kalanla eşit"}</span>
            </p>
          )}
          {errors.rows && <p role="alert" className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{errors.rows}</p>}
        </section>

        <FormField label="Not" htmlFor="hd-ins-notes" hint="İsteğe bağlı.">
          <Textarea id="hd-ins-notes" rows={2} maxLength={2000} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </FormField>
      </form>
    </Modal>
  );
}
