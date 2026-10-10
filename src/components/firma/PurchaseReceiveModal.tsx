"use client";

import { useEffect, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency } from "@/lib/format";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
import { PAYMENT_METHODS } from "@/components/firma/FirmaPaymentModal";
import { newRequestKey, todayKey } from "@/components/stock/stock-shared";
import { centsToMoney, centsToNumber, moneyToCents, type Purchase } from "@/components/firma/purchase-model";

type LotInput = { purchaseItemId: string; productName: string; quantity: number; unit: string; lotNo: string; expiresAt: string };

type ReceiveForm = {
  receivedAt: string;
  faturaNo: string;
  itemLots: LotInput[];
  paidNow: boolean;
  paymentDate: string;
  paymentMethod: string;
  paymentAmount: string;
};

type PurchaseReceiveModalProps = {
  open: boolean;
  /** Teslim alınacak sipariş (kalemleriyle). */
  purchase: Purchase | null;
  onClose: () => void;
  onSaved: (purchase: Purchase) => void | Promise<void>;
  /** Gelen miktar/fiyat farklıysa siparişi düzenlemeye geçiş. */
  onEditOrder?: (purchase: Purchase) => void;
};

const initialForm = (purchase: Purchase | null): ReceiveForm => ({
  receivedAt: todayKey(),
  faturaNo: purchase?.faturaNo || "",
  itemLots: (purchase?.items || []).map((item) => ({
    purchaseItemId: item.id,
    productName: item.productName,
    quantity: Number(item.quantity),
    unit: item.unit,
    lotNo: item.lotNo || "",
    expiresAt: item.expiresAt?.substring(0, 10) || "",
  })),
  paidNow: false,
  paymentDate: todayKey(),
  paymentMethod: "HAVALE_EFT",
  paymentAmount: "",
});

/**
 * Siparişi teslim al: ürünler stoğa girer, tutar firma borcuna eklenir.
 * Lot ve SKT biliniyorsa satır satır girilir; ödeme yapıldıysa tek onay
 * kutusu. İstek anahtarı hata sonrası korunur — çift teslim yazılmaz.
 */
export function PurchaseReceiveModal({ open, purchase, onClose, onSaved, onEditOrder }: PurchaseReceiveModalProps) {
  const [form, setForm] = useState<ReceiveForm>(() => initialForm(null));
  const [formError, setFormError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const requestKeyRef = useRef("");
  const initialRef = useRef("");
  const purchaseRef = useRef(purchase);
  useEffect(() => { purchaseRef.current = purchase; });

  const purchaseId = purchase?.id || "";
  useEffect(() => {
    if (!open || !purchaseId) return;
    const next = initialForm(purchaseRef.current);
    setForm(next);
    setFormError(null);
    setAmountError(undefined);
    requestKeyRef.current = newRequestKey("receive");
    initialRef.current = JSON.stringify(next);
  }, [open, purchaseId]);

  const totalCents = (purchase?.items || []).reduce((sum, item) => sum + moneyToCents(item.lineTotal), BigInt(0));
  const totalMoney = centsToMoney(totalCents);
  const paymentValue = form.paymentAmount === "" ? totalMoney : form.paymentAmount;
  const dirty = open && JSON.stringify(form) !== initialRef.current;

  const updateLot = (id: string, patch: Partial<LotInput>) => setForm((current) => ({
    ...current,
    itemLots: current.itemLots.map((line) => (line.purchaseItemId === id ? { ...line, ...patch } : line)),
  }));

  const submit = async () => {
    if (!purchase || saving) return;
    if (!form.receivedAt) { setFormError("Teslim tarihini seçin."); return; }
    if (form.paidNow) {
      const error = moneyInputError(paymentValue, { required: true, max: totalMoney });
      if (error) { setAmountError(error); return; }
    }
    setAmountError(undefined);
    setFormError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current || newRequestKey("receive") },
        body: JSON.stringify({
          receivedAt: form.receivedAt,
          faturaNo: form.faturaNo.trim() || null,
          itemLots: form.itemLots.map((item) => ({
            purchaseItemId: item.purchaseItemId,
            lotNo: item.lotNo.trim() || null,
            expiresAt: item.expiresAt || null,
          })),
          paidNow: form.paidNow,
          paymentDate: form.paidNow ? form.paymentDate : null,
          paymentMethod: form.paidNow ? form.paymentMethod : null,
          paymentAmount: form.paidNow ? toMoneyValue(paymentValue) : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sipariş teslim alınamadı.");
      requestKeyRef.current = "";
      initialRef.current = JSON.stringify(form);
      showToastSafe({
        title: "Sipariş teslim alındı",
        message: form.paidNow ? "Ürünler stoğa girdi; borç ve ödeme Muhasebe'ye işlendi." : "Ürünler stoğa girdi; tutar firma borcuna eklendi.",
        type: "success",
        icon: "firma",
      });
      onClose();
      await onSaved(purchase);
    } catch (error) {
      // İstek anahtarı korunur: yeniden "Kaydet" çift teslim yazmaz.
      setFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    // Kirli formda kapatma onayı ortak pencereden (isDirty) gelir; önceden yerel onay da çıkıyordu.
    <FormModal
      open={open && Boolean(purchase)}
      onClose={onClose}
      module="firma"
      title="Siparişi teslim al"
      description={purchase ? `${purchase.firma?.name || ""} · ${(purchase.items || []).length} kalem · ${formatCurrency(centsToNumber(totalCents))}` : undefined}
      size="lg"
      onSubmit={() => submit()}
      submitting={saving}
      error={formError}
      isDirty={dirty}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Teslim tarihi" htmlFor="receive-date" required>
          <Input id="receive-date" type="date" max={todayKey()} value={form.receivedAt} onChange={(event) => setForm((current) => ({ ...current, receivedAt: event.target.value }))} />
        </FormField>
        <FormField label="Fatura no" htmlFor="receive-invoice">
          <Input id="receive-invoice" value={form.faturaNo} onChange={(event) => setForm((current) => ({ ...current, faturaNo: event.target.value }))} />
        </FormField>
      </div>
      <div className="space-y-2">
        <p className="ui-form-label text-xs font-bold text-slate-800">Lot ve son kullanma <span className="font-normal text-slate-500">(biliniyorsa)</span></p>
        {form.itemLots.map((item) => (
          <div key={item.purchaseItemId} className="grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-[minmax(0,1fr)_150px_160px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{item.productName}</p>
              <p className="text-xs text-slate-500">{item.quantity} {item.unit}</p>
            </div>
            <Input
              size="sm"
              aria-label={`${item.productName} lot no`}
              placeholder="Lot no"
              value={item.lotNo}
              onChange={(event) => updateLot(item.purchaseItemId, { lotNo: event.target.value })}
            />
            <Input
              size="sm"
              type="date"
              aria-label={`${item.productName} son kullanma tarihi`}
              value={item.expiresAt}
              onChange={(event) => updateLot(item.purchaseItemId, { expiresAt: event.target.value })}
            />
          </div>
        ))}
        {purchase && onEditOrder && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            Gelen miktar ya da fiyat farklıysa önce siparişi düzeltin.
            <Button variant="ghost" size="sm" onClick={() => onEditOrder(purchase)} className="!h-7 !px-1.5">Siparişi düzenle</Button>
          </p>
        )}
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <Checkbox
          label="Ödemesi yapıldı"
          description={form.paidNow ? undefined : "İşaretlemezseniz tutar firma borcu olarak kalır."}
          checked={form.paidNow}
          onChange={(checked) => { setForm((current) => ({ ...current, paidNow: checked })); setAmountError(undefined); }}
        />
        {form.paidNow && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Tutar" htmlFor="receive-pay-amount" required error={amountError} hint={form.paymentAmount === "" ? "Sipariş toplamının tamamı." : undefined}>
              <MoneyInput id="receive-pay-amount" value={paymentValue} onChange={(value) => { setForm((current) => ({ ...current, paymentAmount: value })); setAmountError(undefined); }} />
            </FormField>
            <FormField label="Yöntem" htmlFor="receive-pay-method" required>
              <Select id="receive-pay-method" value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Ödeme tarihi" htmlFor="receive-pay-date">
              <Input id="receive-pay-date" type="date" max={todayKey()} value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} />
            </FormField>
          </div>
        )}
      </div>
    </FormModal>
  );
}
