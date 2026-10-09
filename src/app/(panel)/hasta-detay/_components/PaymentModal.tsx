"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { usePatientFile } from "./PatientFileContext";
import { errorMessageOf, money, newIdempotencyKey, parseMoneyInput, PAYMENT_METHOD_LABELS, type Pay } from "./patient-file-shared";

type PosDevice = { id: string; name: string; isActive: boolean };
type Method = "NAKIT" | "KREDI_KARTI" | "HAVALE_EFT" | "MAIL_ORDER" | "DIGER";

const METHOD_OPTIONS: { value: Method; label: string }[] = (["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"] as Method[])
  .map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

const needsPos = (method: string) => method === "KREDI_KARTI" || method === "MAIL_ORDER";

type FormState = { amount: string; method: Method; posId: string; doctorId: string; description: string; date: string };

/**
 * Hastadan tahsilat alma / tahsilatı düzeltme penceresi. Hasta dosyasının her
 * yerinden (üstteki "İşlem ekle", Özet'teki "Tahsilat bekliyor", Tahsilat
 * sekmesi) aynı pencere açılır.
 */
export function PaymentModal({ open, payment, onClose }: { open: boolean; payment: Pay | null; onClose: () => void }) {
  const { patientId, data, reload, doctors, recentDoctorId, treatingDoctorNames, balance, can } = usePatientFile();
  const isEdit = Boolean(payment);
  const [form, setForm] = useState<FormState>({ amount: "", method: "NAKIT", posId: "", doctorId: "", description: "", date: turkeyDateKey() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [posDevices, setPosDevices] = useState<PosDevice[] | null>(null);
  const [posError, setPosError] = useState("");
  const requestKeyRef = useRef("");
  const snapshotRef = useRef("");
  // Varsayılan hekim yalnız açılışta okunur; pencere açıkken hasta verisi
  // yenilense de kullanıcının seçimi sıfırlanmamalı.
  const recentDoctorRef = useRef(recentDoctorId);
  recentDoctorRef.current = recentDoctorId;

  // Pencere her açıldığında form temiz (veya düzenlenen tahsilatla) başlar.
  useEffect(() => {
    if (!open) return;
    const initial: FormState = payment
      ? {
          amount: String(Number(payment.amount)),
          method: (payment.method as Method) || "NAKIT",
          posId: payment.posId || "",
          doctorId: payment.doctorId || "",
          description: payment.description || "",
          date: turkeyDateKey(new Date(payment.createdAt)),
        }
      : { amount: "", method: "NAKIT", posId: "", doctorId: recentDoctorRef.current, description: "", date: turkeyDateKey() };
    setForm(initial);
    snapshotRef.current = JSON.stringify(initial);
    setErrors({});
    setError("");
    requestKeyRef.current = "";
  }, [open, payment]);

  // POS listesi yalnız pencere açıldığında, bir kez okunur.
  useEffect(() => {
    if (!open || posDevices) return;
    let active = true;
    fetch("/api/pos-devices", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessageOf(body, "POS cihazları yüklenemedi."));
        return Array.isArray(body) ? (body as PosDevice[]) : [];
      })
      .then((list) => { if (active) { setPosDevices(list.filter((device) => device.isActive)); setPosError(""); } })
      .catch((loadError) => { if (active) setPosError(loadError instanceof Error ? loadError.message : "POS cihazları yüklenemedi."); });
    return () => { active = false; };
  }, [open, posDevices]);

  // Tek POS cihazı varsa kart seçilince otomatik seçilir (gereksiz bir adım).
  useEffect(() => {
    if (!needsPos(form.method) || form.posId || !posDevices || posDevices.length !== 1) return;
    setForm((current) => ({ ...current, posId: posDevices[0].id }));
  }, [form.method, form.posId, posDevices]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const dirty = open && JSON.stringify(form) !== snapshotRef.current;
  const selectedDoctorName = doctors.find((doctor) => doctor.id === form.doctorId)?.fullName || "";
  const doctorMismatch = Boolean(form.doctorId && treatingDoctorNames.length > 0 && selectedDoctorName && !treatingDoctorNames.includes(selectedDoctorName));
  const debt = balance.totalDebt;
  const amountValue = parseMoneyInput(form.amount);
  const overpay = !isEdit && Number.isFinite(amountValue) && debt > 0 && amountValue > debt + 0.004;

  const posHint = useMemo(() => {
    if (!needsPos(form.method)) return undefined;
    if (posError) return posError;
    if (posDevices && posDevices.length === 0) return "Kayıtlı POS cihazı yok.";
    return "Kartın çekildiği POS cihazı — gün sonu kasa raporunda bu adla görünür.";
  }, [form.method, posDevices, posError]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!Number.isFinite(amountValue) || amountValue <= 0) next.amount = "Tahsil edilen tutarı yazın (ör. 1.500 veya 1500,50).";
    if (!form.doctorId) next.doctorId = "Tahsilatın hangi hekimin tedavisi için alındığını seçin.";
    if (needsPos(form.method) && !form.posId) next.posId = "Kart / mail order tahsilatında POS cihazı seçilmeli.";
    if (isEdit && !form.date) next.date = "Tarih seçin.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    setError("");
    try {
      let body: Record<string, unknown> = {};
      if (payment) {
        const response = await fetch(`/api/payments/${payment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: form.method,
            amount: amountValue,
            description: form.description.trim(),
            doctorId: form.doctorId,
            posId: needsPos(form.method) ? form.posId : null,
            createdAt: turkeyLocalDateTimeToUtc(form.date, "12:00").toISOString(),
          }),
        });
        body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessageOf(body, "Tahsilat güncellenemedi."));
      } else {
        if (!requestKeyRef.current) requestKeyRef.current = newIdempotencyKey("payment");
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
          body: JSON.stringify({
            patientId,
            method: form.method,
            amount: amountValue,
            description: form.description.trim(),
            doctorId: form.doctorId,
            ...(needsPos(form.method) && form.posId ? { posId: form.posId } : {}),
          }),
        });
        body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessageOf(body, "Tahsilat kaydedilemedi."));
      }
      // Sunucu tahsilatı açık taksitlere ve aynı günkü randevuya kendisi
      // işler; kullanıcı bunu görmezse "taksit neden ödendi oldu" diye şaşırır.
      const taksitCount = Number((body.taksitInfo as { updatedCount?: number } | undefined)?.updatedCount || 0);
      const completedAppointments = Number(body.autoCompletedAppointments || 0);
      const extras = [
        taksitCount > 0 ? `${taksitCount} taksit ödendi olarak işlendi` : "",
        completedAppointments > 0 ? "bugünkü randevusu Tamamlandı yapıldı" : "",
      ].filter(Boolean).join(", ");
      showToastSafe({
        type: "success",
        icon: "finance",
        message: `${money(amountValue)} ${payment ? "tahsilat güncellendi" : "tahsilat kaydedildi"}${extras ? ` · ${extras}` : ""}.`,
      });
      requestKeyRef.current = "";
      onClose();
      void reload(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tahsilat kaydedilemedi.");
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
      title={isEdit ? "Tahsilatı düzelt" : "Tahsilat al"}
      description={isEdit ? `${data.fullName} · kayıtlı tahsilat düzeltilir.` : `${data.fullName} · kalan borç ${debt > 0 ? money(debt) : "yok"}`}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <FormErrorBanner message={error} />
        <FormField
          label="Tutar (₺)"
          htmlFor="hd-pay-amount"
          required
          error={errors.amount}
          hint={overpay ? `Kalan borçtan ${money(amountValue - debt)} fazla — fazlası hastanın avansı olarak kalır.` : undefined}
        >
          <Input
            id="hd-pay-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={form.amount}
            onChange={(event) => set("amount", event.target.value)}
            className="text-lg font-bold"
            data-autofocus
          />
        </FormField>
        {!isEdit && debt > 0 && (
          <div className="-mt-2">
            <Button variant="ghost" size="sm" onClick={() => set("amount", String(debt))}>
              Kalan borcun tamamı: {money(debt)}
            </Button>
          </div>
        )}

        <ChoiceCards
          label="Ödeme yöntemi"
          variant="pills"
          options={METHOD_OPTIONS}
          value={form.method}
          onChange={(value) => { set("method", value); if (!needsPos(value)) set("posId", ""); }}
        />

        {needsPos(form.method) && (
          <FormField label="POS cihazı" htmlFor="hd-pay-pos" required error={errors.posId} hint={errors.posId ? undefined : posHint}>
            <Select id="hd-pay-pos" value={form.posId} onChange={(event) => set("posId", event.target.value)} disabled={!posDevices}>
              <option value="">{posDevices ? "POS cihazı seçin" : "Yükleniyor…"}</option>
              {(posDevices || []).map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </Select>
          </FormField>
        )}
        {needsPos(form.method) && posDevices && posDevices.length === 0 && can("settings:write") && (
          <p className="-mt-2 text-xs text-slate-500">
            POS cihazını <Link href="/ayar?tab=pos" className="font-semibold text-primary underline">Ayarlar › POS cihazları</Link> bölümünden ekleyin.
          </p>
        )}

        <FormField
          label="Hekim"
          htmlFor="hd-pay-doctor"
          required
          error={errors.doctorId}
          hint={doctorMismatch
            ? "Bu hekim hastayı tedavi edenler arasında değil — hakediş bu hekime yazılır, kontrol edin."
            : treatingDoctorNames.length > 0 ? `Hastayı tedavi eden: ${treatingDoctorNames.join(", ")}` : "Tahsilat hekim hakedişine bu hekim adına yazılır."}
        >
          <DoctorSelect id="hd-pay-doctor" value={form.doctorId} doctors={doctors} onChange={(id) => set("doctorId", id)} />
        </FormField>

        {isEdit && (
          <FormField label="Tahsilat tarihi" htmlFor="hd-pay-date" required error={errors.date}>
            <Input id="hd-pay-date" type="date" max={turkeyDateKey()} value={form.date} onChange={(event) => set("date", event.target.value)} />
          </FormField>
        )}

        <FormField label="Açıklama" htmlFor="hd-pay-desc" hint="İsteğe bağlı — ör. hangi tedavi için alındığı.">
          <Input id="hd-pay-desc" maxLength={300} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Örn. dolgu ödemesi" />
        </FormField>
      </form>
    </Modal>
  );
}
