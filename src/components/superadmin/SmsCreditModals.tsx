"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { count, money, shortDate } from "./sa-format";

type SmsPackage = { id: string; name: string; smsCount: number; price: number | string; isActive: boolean };
type Clinic = { id: string; name: string; smsBalance: number };

function usePlatformStock(open: boolean) {
  const [stock, setStock] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/superadmin/sms-wallet", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setStock(typeof data?.wallet?.availableBalance === "number" ? data.wallet.availableBalance : null);
      })
      .catch(() => {
        if (!cancelled) setStock(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  return stock;
}

/**
 * Kliniğe SMS paketi satışı: platform stoğundan düşer, klinik bakiyesine
 * ekler, SMS işlemlerine satır yazar ve vadeli fatura keser (mevcut
 * /api/superadmin/sms-sales akışı). Önceden bu akışın ekranı yoktu; tek yol
 * faturasız "kredi ekle" kutusuydu (verilen SMS'in parası takip edilmiyordu).
 */
export function SmsSaleModal({ clinic, onClose, onDone }: { clinic: Clinic | null; onClose: () => void; onDone: () => void }) {
  const open = Boolean(clinic);
  const [packages, setPackages] = useState<SmsPackage[]>([]);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [packageId, setPackageId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dueDays, setDueDays] = useState("7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stock = usePlatformStock(open);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    setError(null);
    setQuantity("1");
    setDueDays("7");
    setPackagesError(null);
    fetch("/api/superadmin/sms-packages", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) throw new Error(data?.message || "SMS paketleri alınamadı.");
        const active = (data as SmsPackage[]).filter((item) => item.isActive);
        setPackages(active);
        setPackageId((current) => current && active.some((item) => item.id === current) ? current : active[0]?.id || "");
      })
      .catch((failure) => setPackagesError(failure instanceof Error ? failure.message : "SMS paketleri alınamadı."));
  }, [open]);

  const selected = packages.find((item) => item.id === packageId) || null;
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const days = Math.max(0, Math.trunc(Number(dueDays) || 0));
  const smsToAdd = selected ? selected.smsCount * qty : 0;
  const total = selected ? Number(selected.price) * qty : 0;
  const dueDate = useMemo(() => {
    const due = new Date();
    due.setDate(due.getDate() + (days || 0));
    return shortDate(due);
  }, [days]);
  const stockShort = stock != null && smsToAdd > stock;

  const save = async () => {
    if (!clinic) return;
    if (!selected) return setError("Paket seçin.");
    if (qty < 1) return setError("Adet en az 1 olmalı.");
    if (days < 1 || days > 3650) return setError("Vade 1-3650 gün arasında olmalı.");
    setSaving(true);
    setError(null);
    try {
      await clientMutation(
        "/api/superadmin/sms-sales",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institutionId: clinic.id, smsPackageId: selected.id, quantity: qty, dueDays: days }) },
        "SMS satışı kaydedilemedi.",
      );
      showToastSafe({ type: "success", message: `${clinic.name} kliniğine ${count(smsToAdd)} SMS eklendi ve ${money(total)} tutarında fatura kesildi.`, icon: "sms" });
      onClose();
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "SMS satışı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SMS paketi sat"
      description={clinic ? `${clinic.name} · şu anki bakiye ${count(clinic.smsBalance)} SMS` : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={saving} disabled={!selected || stockShort} onClick={() => void save()}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorBanner message={error || packagesError} />
        <FormField label="Paket" htmlFor="sms-sale-package" required hint={packages.length === 0 && !packagesError ? "Aktif paket yok — SMS Yönetimi › Paketler'den ekleyin" : undefined}>
          <Select id="sms-sale-package" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
            {packages.length === 0 && <option value="">Paket yok</option>}
            {packages.map((item) => (
              <option key={item.id} value={item.id}>{item.name} — {count(item.smsCount)} SMS · {money(item.price)}</option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Adet" htmlFor="sms-sale-qty" required>
            <Input id="sms-sale-qty" type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </FormField>
          <FormField label="Ödeme vadesi (gün)" htmlFor="sms-sale-due" required hint={dueDate ? `Son ödeme: ${dueDate}` : undefined}>
            <Input id="sms-sale-due" type="number" inputMode="numeric" min="1" max="3650" step="1" value={dueDays} onChange={(event) => setDueDays(event.target.value)} />
          </FormField>
        </div>
        <dl className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <dt className="text-slate-500">Kliniğe eklenecek</dt>
          <dd className="text-right font-bold text-slate-900">{count(smsToAdd)} SMS</dd>
          <dt className="text-slate-500">Kesilecek fatura</dt>
          <dd className="text-right font-bold text-slate-900">{money(total)}</dd>
          <dt className="text-slate-500">Platform stoğu</dt>
          <dd className={`text-right font-semibold ${stockShort ? "text-red-600" : "text-slate-700"}`}>{stock == null ? "—" : `${count(stock)} SMS`}</dd>
        </dl>
        {stockShort && <p className="text-xs font-semibold text-red-600">Platform stoğu yetersiz. Önce SMS Yönetimi › Stok&apos;tan stok ekleyin.</p>}
      </div>
    </Modal>
  );
}

/**
 * Faturasız bakiye düzeltmesi (hatalı tanım, iade vb.). Neden zorunludur ve
 * Denetim Günlüğü'ne yazılır. Satış için SmsSaleModal kullanılır.
 */
export function SmsAdjustModal({ clinic, onClose, onDone }: { clinic: Clinic | null; onClose: () => void; onDone: () => void }) {
  const open = Boolean(clinic);
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stock = usePlatformStock(open);

  useEffect(() => {
    if (!open) return;
    setDirection("add");
    setAmount("");
    setReason("");
    setError(null);
  }, [open]);

  const value = Math.trunc(Number(amount) || 0);

  const save = async () => {
    if (!clinic) return;
    if (value < 1) return setError("Geçerli bir miktar girin.");
    if (reason.trim().length < 3) return setError("Düzeltme nedenini yazın.");
    setSaving(true);
    setError(null);
    try {
      const signed = direction === "add" ? value : -value;
      await clientMutation(
        `/api/superadmin/institutions/${clinic.id}/sms-credit`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: signed, reason: reason.trim() }) },
        "SMS bakiyesi düzeltilemedi.",
      );
      showToastSafe({ type: "success", message: `${clinic.name} SMS bakiyesi ${direction === "add" ? "artırıldı" : "azaltıldı"} (${direction === "add" ? "+" : "-"}${count(value)}).`, icon: "sms" });
      onClose();
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "SMS bakiyesi düzeltilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SMS bakiyesini düzelt"
      description={clinic ? `${clinic.name} · şu anki bakiye ${count(clinic.smsBalance)} SMS` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <p className="text-xs leading-5 text-slate-500">
          Faturasız düzeltmedir. Satış için &quot;Paket sat&quot;ı kullanın. Ekleme platform stoğundan düşülür{stock != null ? ` (stok: ${count(stock)})` : ""}; azaltma stoğa geri eklenir.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="İşlem" htmlFor="sms-adjust-direction">
            <Select id="sms-adjust-direction" value={direction} onChange={(event) => setDirection(event.target.value as "add" | "remove")}>
              <option value="add">Ekle</option>
              <option value="remove">Azalt</option>
            </Select>
          </FormField>
          <FormField label="Miktar (SMS)" htmlFor="sms-adjust-amount" required>
            <Input id="sms-adjust-amount" type="number" inputMode="numeric" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FormField>
        </div>
        <FormField label="Neden" htmlFor="sms-adjust-reason" required hint="Denetim Günlüğü'ne yazılır">
          <Textarea id="sms-adjust-reason" rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ör. Yanlış tanımlanan krediyi geri alma" />
        </FormField>
      </div>
    </Modal>
  );
}
