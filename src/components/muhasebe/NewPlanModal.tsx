"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";
import { showToastSafe } from "@/lib/toast-client";
import { addInstallmentPeriod } from "@/lib/installment-schedule";
import { isValidDateKey } from "@/lib/tz";
import {
  METHOD_LABELS,
  PERIODS,
  money,
  newRequestKey,
  parseAmount,
  requiresPos,
  shortDate,
  todayKey,
} from "@/components/muhasebe/muhasebe-utils";

type PosDevice = { id: string; name: string; isActive: boolean };
type PatientBalance = { bakiye: number; planKalan: number; doctorId: string | null };
type PesinatMode = "simdi" | "once";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (patientName: string) => void;
  initialPatient?: PickedPatient | null;
  canWritePayments: boolean;
  canReadFinance: boolean;
};

type Errors = Partial<Record<"patient" | "doctor" | "total" | "pesinat" | "count" | "start" | "pos", string>>;

const EMPTY = { baslik: "", total: "", pesinat: "", count: "6", period: "AYLIK", start: "", notes: "" };

/**
 * Yeni taksit planı. Hasta dosyasındaki plan sihirbazıyla aynı kurallar:
 * plan tutarı hastanın açık borcunu aşamaz (borç biliniyorsa), hekim hastanın
 * tedavi hekiminden önerilir. Peşinat bugün alınıyorsa aynı işlemde tahsilat
 * kaydı açılır; böylece kasa, liste ve hasta bakiyesi peşinatı görür.
 */
export function NewPlanModal({ open, onClose, onCreated, initialPatient, canWritePayments, canReadFinance }: Props) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [pesinatMode, setPesinatMode] = useState<PesinatMode>("simdi");
  const [method, setMethod] = useState("NAKIT");
  const [posId, setPosId] = useState("");
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);
  const [balance, setBalance] = useState<PatientBalance | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestKeyRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setPatient(initialPatient || null);
    setDoctorId("");
    setForm({ ...EMPTY, start: todayKey() });
    setPesinatMode("simdi");
    setMethod("NAKIT");
    setPosId("");
    setBalance(null);
    setErrors({});
    setServerError("");
    requestKeyRef.current = newRequestKey("plan");
  }, [open, initialPatient]);

  useEffect(() => {
    if (!open || !canWritePayments) return;
    fetch("/api/pos-devices", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((devices: PosDevice[]) => setPosDevices((Array.isArray(devices) ? devices : []).filter((device) => device.isActive)))
      .catch(() => setPosDevices([]));
  }, [open, canWritePayments]);

  // Hastanın güncel borcu: plan tutarını önerir ve sınırlar.
  useEffect(() => {
    if (!open || !patient || !canReadFinance) { setBalance(null); return; }
    let active = true;
    fetch(`/api/muhasebe/alacaklar?patientId=${encodeURIComponent(patient.id)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        const row = Array.isArray(data?.rows) ? data.rows[0] : null;
        if (!row) { setBalance(null); return; }
        const next: PatientBalance = {
          bakiye: Math.round((Number(row.bakiye) || 0) * 100) / 100,
          planKalan: Number(row.plan?.kalan) || 0,
          doctorId: row.plan?.doctorId || row.lastDoctorId || null,
        };
        setBalance(next);
        setDoctorId((current) => current || next.doctorId || "");
        if (next.bakiye > 0.5) setForm((current) => (current.total ? current : { ...current, total: String(next.bakiye) }));
      })
      .catch(() => { if (active) setBalance(null); });
    return () => { active = false; };
  }, [open, patient, canReadFinance]);

  const set = (key: keyof typeof EMPTY, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    const errorKey: Record<string, keyof Errors> = { total: "total", pesinat: "pesinat", count: "count", start: "start" };
    if (errorKey[key]) setErrors((current) => ({ ...current, [errorKey[key]]: undefined }));
  };

  const totalValue = parseAmount(form.total);
  const pesinatValue = form.pesinat.trim() ? parseAmount(form.pesinat) : 0;
  const countValue = Number(form.count);
  const collectPesinat = canWritePayments && pesinatMode === "simdi" && pesinatValue > 0;

  const preview = useMemo(() => {
    if (!Number.isFinite(totalValue) || totalValue <= 0 || !Number.isFinite(pesinatValue) || pesinatValue < 0 || pesinatValue >= totalValue) return null;
    if (!Number.isInteger(countValue) || countValue < 1 || countValue > 100 || !isValidDateKey(form.start)) return null;
    const remaining = Math.round((totalValue - pesinatValue) * 100) / 100;
    const each = Math.round((remaining / countValue) * 100) / 100;
    const start = new Date(`${form.start}T00:00:00.000Z`);
    const last = addInstallmentPeriod(start, form.period, countValue - 1);
    return { remaining, each, first: start.toISOString(), last: last.toISOString() };
  }, [countValue, form.period, form.start, pesinatValue, totalValue]);

  const dirty = open && Boolean(
    (patient && patient.id !== initialPatient?.id) || doctorId || form.baslik.trim() || form.total || form.pesinat || form.notes.trim()
      || form.count !== EMPTY.count || form.period !== EMPTY.period || (form.start && form.start !== todayKey()),
  );

  function validate() {
    const next: Errors = {};
    if (!patient) next.patient = "Hastayı seçin.";
    if (!doctorId) next.doctor = "Planın doktorunu seçin.";
    if (!Number.isFinite(totalValue) || totalValue <= 0 || totalValue > 99_999_999.99) next.total = "Geçerli bir toplam borç yazın.";
    else if (balance && balance.bakiye >= 0 && totalValue > balance.bakiye + 0.005) {
      next.total = `Taksitlendirilecek tutar hastanın mevcut borcunu (${money(balance.bakiye)}) aşamaz.`;
    }
    if (!Number.isFinite(pesinatValue) || pesinatValue < 0) next.pesinat = "Peşinat 0 ya da pozitif olmalı.";
    else if (!next.total && pesinatValue >= totalValue) next.pesinat = "Peşinat toplam borçtan küçük olmalı.";
    if (!Number.isInteger(countValue) || countValue < 1 || countValue > 100) next.count = "Taksit sayısı 1–100 arasında bir tam sayı olmalı";
    if (!isValidDateKey(form.start)) next.start = "İlk taksit tarihini seçin.";
    if (collectPesinat && requiresPos(method) && !posId) next.pos = "Kart / mail order ile alınan peşinat için POS seçin.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (savingRef.current || !validate() || !patient) return;
    savingRef.current = true;
    setSaving(true);
    setServerError("");
    try {
      const response = await fetch("/api/taksit-plani", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId,
          baslik: form.baslik.trim() || null,
          toplamBorc: totalValue,
          pesnat: pesinatValue,
          taksitSayisi: countValue,
          period: form.period,
          startDate: form.start,
          notes: form.notes.trim() || null,
          ...(collectPesinat ? { pesinatTahsilat: { yontem: method, posId: requiresPos(method) ? posId : null } } : {}),
        }),
      }).catch(() => null);
      if (!response) {
        setServerError("Bağlantı kurulamadı. Bilgileriniz korundu; tekrar \"Plan oluştur\"a basabilirsiniz.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setServerError(body?.error || body?.message || "Taksit planı oluşturulamadı.");
        return;
      }
      showToastSafe({
        message: `${patient.fullName} için ${countValue} taksitli plan oluşturuldu${collectPesinat ? `; ${money(pesinatValue)} peşinat tahsilat olarak kaydedildi` : ""}.`,
        type: "success",
        icon: "finance",
        duration: 5000,
      });
      onCreated(patient.fullName);
      onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!savingRef.current) onClose(); }}
      isDirty={dirty}
      title="Yeni taksit planı"
      description="Hastanın borcunu taksitlere böler. Taksit tahsil edildikçe hastanın borcundan düşer."
      size="lg"
      module="finance"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button type="submit" form="new-plan-form" loading={saving}>Plan oluştur</Button>
        </>
      )}
    >
      <form id="new-plan-form" onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <FormErrorBanner message={serverError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Hasta" required htmlFor="plan-patient" error={errors.patient}>
              <PatientPicker
                id="plan-patient"
                value={patient}
                onChange={(next) => { setPatient(next); setBalance(null); setErrors((current) => ({ ...current, patient: undefined, total: undefined })); }}
                locked={Boolean(initialPatient)}
                aria-label="Hasta"
              />
            </FormField>
            {patient && balance && (
              <p className="mt-1.5 text-xs text-slate-600">
                Mevcut borcu <b className="tabular-nums text-slate-900">{money(Math.max(0, balance.bakiye))}</b>
                {balance.planKalan > 0.5 && <> · açık taksit planında kalan {money(balance.planKalan)}</>}
              </p>
            )}
          </div>
          <FormField label="Doktor" required htmlFor="plan-doctor" error={errors.doctor} hint="Taksit tahsilatları bu doktorun hakedişine sayılır.">
            <FinanceDoctorSelect id="plan-doctor" value={doctorId} onChange={(id) => { setDoctorId(id); setErrors((current) => ({ ...current, doctor: undefined })); }} aria-label="Doktor" />
          </FormField>
          <FormField label="Plan adı" htmlFor="plan-title" hint="İsteğe bağlı">
            <Input id="plan-title" value={form.baslik} maxLength={180} placeholder="Örn. İmplant tedavisi" onChange={(event) => set("baslik", event.target.value)} />
          </FormField>
          <FormField label="Toplam borç (₺)" required htmlFor="plan-total" error={errors.total}>
            <Input id="plan-total" aria-label="Toplam Borç (₺)" inputMode="decimal" autoComplete="off" value={form.total} placeholder="0,00" onChange={(event) => set("total", event.target.value)} />
          </FormField>
          <FormField label="Peşinat (₺)" htmlFor="plan-pesinat" error={errors.pesinat} hint="Yoksa boş bırakın.">
            <Input id="plan-pesinat" aria-label="Peşinat (₺)" inputMode="decimal" autoComplete="off" value={form.pesinat} placeholder="0,00" onChange={(event) => set("pesinat", event.target.value)} />
          </FormField>
          {pesinatValue > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              {canWritePayments ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Peşinat ödemesi" htmlFor="plan-pesinat-mode">
                    <Select id="plan-pesinat-mode" value={pesinatMode} onChange={(event) => setPesinatMode(event.target.value as PesinatMode)}>
                      <option value="simdi">Şimdi alınıyor — tahsilat olarak kaydet</option>
                      <option value="once">Daha önce tahsilat olarak girildi</option>
                    </Select>
                  </FormField>
                  {pesinatMode === "simdi" && (
                    <FormField label="Ödeme yöntemi" htmlFor="plan-pesinat-method">
                      <Select id="plan-pesinat-method" value={method} onChange={(event) => { setMethod(event.target.value); setPosId(""); setErrors((current) => ({ ...current, pos: undefined })); }}>
                        {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </Select>
                    </FormField>
                  )}
                  {pesinatMode === "simdi" && requiresPos(method) && (
                    <FormField label="POS cihazı" required htmlFor="plan-pesinat-pos" error={errors.pos}>
                      <Select id="plan-pesinat-pos" value={posId} onChange={(event) => { setPosId(event.target.value); setErrors((current) => ({ ...current, pos: undefined })); }}>
                        <option value="">POS seçin</option>
                        {posDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                      </Select>
                    </FormField>
                  )}
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    {pesinatMode === "simdi"
                      ? "Peşinat, planla birlikte tahsilat olarak kaydedilir ve hastanın borcundan düşer."
                      : "Peşinat için ayrıca tahsilat kaydı açılmaz; daha önce girdiğiniz tahsilat geçerli kalır."}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600">Peşinatı tahsil ettiğinizde ayrıca Tahsilat olarak kaydedin; plan yalnız kalan tutarı taksitlere böler.</p>
              )}
            </div>
          )}
          <FormField label="Taksit sayısı" required htmlFor="plan-count" error={errors.count}>
            <Input id="plan-count" aria-label="Taksit Sayısı" type="number" min={1} max={100} step={1} value={form.count} onChange={(event) => set("count", event.target.value)} />
          </FormField>
          <FormField label="Ödeme sıklığı" htmlFor="plan-period">
            <Select id="plan-period" value={form.period} onChange={(event) => set("period", event.target.value)}>
              {Object.entries(PERIODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </FormField>
          <FormField label="İlk taksit tarihi" required htmlFor="plan-start" error={errors.start}>
            <Input id="plan-start" type="date" value={form.start} onChange={(event) => set("start", event.target.value)} />
          </FormField>
          <FormField label="Not" htmlFor="plan-notes" hint="İsteğe bağlı">
            <Textarea id="plan-notes" rows={2} value={form.notes} maxLength={2000} onChange={(event) => set("notes", event.target.value)} />
          </FormField>
        </div>
        {preview && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-700" aria-live="polite">
            <b className="text-slate-900">{countValue} taksit × {money(preview.each)}</b>
            {" "}({PERIODS[form.period]?.toLocaleLowerCase("tr")}) · taksitlendirilen {money(preview.remaining)}
            <span className="block text-xs text-slate-500">
              İlk taksit {shortDate(preview.first)}{countValue > 1 ? ` · son taksit ${shortDate(preview.last)}` : ""}
              {pesinatValue > 0 ? ` · peşinat ${money(pesinatValue)}` : ""}
            </span>
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
