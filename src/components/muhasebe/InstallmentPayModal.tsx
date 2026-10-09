"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";
import { METHOD_LABELS, money, newRequestKey, parseAmount, requiresPos, shortDate } from "@/components/muhasebe/muhasebe-utils";
import type { Installment } from "@/components/muhasebe/installment-types";

type PosDevice = { id: string; name: string; isActive: boolean };

type Props = {
  target: { planId: string; patientName: string; installment: Installment } | null;
  onClose: () => void;
  onPaid: () => void;
};

/**
 * Tek taksidin tahsilatı. Kayıt aynı zamanda Gelir ve gider listesine tahsilat olarak düşer.
 * Not: `target` her açılışta form sıfırlanır; çağıran taraf nesneyi useMemo ile sabit tutmalı.
 */
export function InstallmentPayModal({ target, onClose, onPaid }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("NAKIT");
  const [posId, setPosId] = useState("");
  const [note, setNote] = useState("");
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; pos?: string }>({});
  const requestKeyRef = useRef("");
  const savingRef = useRef(false);

  useEffect(() => {
    if (!target) return;
    setAmount(String(Number(target.installment.kalan || 0)));
    setMethod("NAKIT");
    setPosId("");
    setNote("");
    setError("");
    setFieldErrors({});
    requestKeyRef.current = newRequestKey("taksit");
    fetch("/api/pos-devices", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((devices: PosDevice[]) => setPosDevices((Array.isArray(devices) ? devices : []).filter((device) => device.isActive)))
      .catch(() => setPosDevices([]));
  }, [target]);

  const kalan = Number(target?.installment.kalan || 0);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!target || savingRef.current) return;
    const value = parseAmount(amount);
    const errors: typeof fieldErrors = {};
    if (!Number.isFinite(value) || value <= 0) errors.amount = "Geçerli bir tutar yazın.";
    else if (value > kalan + 0.01) errors.amount = `Bu taksitte en fazla ${money(kalan)} alınabilir.`;
    if (requiresPos(method) && !posId) errors.pos = "Kart / mail order tahsilatında POS seçin.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/taksit-plani/${target.planId}/taksitler/${target.installment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({ tutar: value, yontem: method, posId: requiresPos(method) ? posId : null, note: note.trim() || null }),
      }).catch(() => null);
      if (!response) {
        setError("Bağlantı kesildi. Bilgiler korundu; tekrar Kaydet'e basabilirsiniz, tahsilat iki kez oluşmaz.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error || body?.message || "Tahsilat kaydedilemedi.");
        return;
      }
      showToastSafe({ message: `${target.patientName} — ${target.installment.siraNo}. taksit için ${money(value)} tahsil edildi.`, type: "success", icon: "finance", duration: 4500 });
      onPaid();
      onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={() => { if (!savingRef.current) onClose(); }}
      title={target ? `${target.patientName} — ${target.installment.siraNo}. taksit` : "Taksit tahsilatı"}
      description={target ? `Vade ${shortDate(target.installment.vadeDate)} · Taksit ${money(target.installment.tutar)} · Kalan ${money(kalan)}` : undefined}
      size="md"
      module="finance"
      isDirty={Boolean(target) && (method !== "NAKIT" || posId !== "" || note.trim() !== "" || amount !== String(kalan))}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button type="submit" form="installment-pay-form" loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <form id="installment-pay-form" onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <FormErrorBanner message={error} />
        <FormField label="Alınan tutar (₺)" required htmlFor="pay-amount" error={fieldErrors.amount} hint={kalan > 0 ? `Kısmi ödeme alınabilir; kalan bu taksitte açık kalır.` : undefined}>
          <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </FormField>
        <FormField label="Ödeme yöntemi" htmlFor="pay-method">
          <Select id="pay-method" value={method} onChange={(event) => { setMethod(event.target.value); setPosId(""); }}>
            {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </FormField>
        {requiresPos(method) && (
          <FormField label="POS cihazı" required htmlFor="pay-pos" error={fieldErrors.pos}>
            <Select id="pay-pos" value={posId} onChange={(event) => setPosId(event.target.value)}>
              <option value="">POS seçin</option>
              {posDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Not" htmlFor="pay-note">
          <Input id="pay-note" value={note} maxLength={500} placeholder="İsteğe bağlı" onChange={(event) => setNote(event.target.value)} />
        </FormField>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
