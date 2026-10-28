"use client";

import { useEffect, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Disclosure } from "@/components/ui/Disclosure";
import { showToastSafe } from "@/lib/toast-client";
import { moneyInputError } from "@/lib/money-input";
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  optionsWithCurrent,
  stockCategoryLabel,
  type StockItem,
} from "@/components/stock/stock-shared";

type FormState = {
  name: string;
  category: string;
  unit: string;
  minQuantity: string;
  storageLocation: string;
  barcode: string;
  openingQuantity: string;
  openingUnitCost: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  name: "",
  category: "Sarf",
  unit: "adet",
  minQuantity: "5",
  storageLocation: "",
  barcode: "",
  openingQuantity: "",
  openingUnitCost: "",
};

type StockItemFormModalProps = {
  open: boolean;
  /** Verilirse düzenleme, verilmezse yeni ürün. */
  item: StockItem | null;
  onClose: () => void;
  onSaved: (item: StockItem) => void;
};

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim());

/**
 * Ürün (stok kartı) ekleme ve düzenleme için TEK form. Görünen alanlar ad,
 * birim ve minimum; yeni üründe elinizdeki miktar (sayım) isteğe bağlıdır,
 * girilirse birim maliyeti zorunludur (stok değeri doğru çıksın). Kategori,
 * raf ve barkod "Diğer bilgiler"de.
 */
export function StockItemFormModal({ open, item, onClose, onSaved }: StockItemFormModalProps) {
  const isEdit = Boolean(item);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError(null);
    setForm(item ? {
      ...EMPTY_FORM,
      name: item.name,
      category: item.category || "Sarf",
      unit: item.unit || "adet",
      minQuantity: String(item.minQuantity ?? 5),
      storageLocation: item.storageLocation || "",
      barcode: item.barcode || "",
    } : EMPTY_FORM);
  }, [open, item]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const hasOpening = !isEdit && isWholeNumber(form.openingQuantity) && Number(form.openingQuantity) > 0;

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (form.name.trim().length < 2) next.name = "Ürün adını yazın (en az 2 harf).";
    if (!isWholeNumber(form.minQuantity)) next.minQuantity = "Tam sayı girin (ör. 5). Uyarı istemiyorsanız 0 yazın.";
    if (!isEdit && form.openingQuantity.trim()) {
      if (!isWholeNumber(form.openingQuantity)) next.openingQuantity = "Tam sayı girin (ör. 10).";
      else if (Number(form.openingQuantity) > 0) {
        const costError = moneyInputError(form.openingUnitCost, { required: true, allowZero: true });
        if (costError) next.openingUnitCost = form.openingUnitCost.trim() ? costError : "Birim maliyeti girin; bilmiyorsanız son alış fiyatını yazın.";
      }
    }
    return next;
  };

  const submit = async () => {
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setSaving(true);
    setFormError(null);
    const common = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      minQuantity: Number(form.minQuantity) || 0,
      barcode: form.barcode.trim() || null,
      storageLocation: form.storageLocation.trim() || null,
    };
    const openingQuantity = hasOpening ? Number(form.openingQuantity) : 0;
    try {
      const response = await fetch(isEdit && item ? `/api/stock/${item.id}` : "/api/stock", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit
          ? common
          : { ...common, quantity: openingQuantity, unitPrice: openingQuantity > 0 ? form.openingUnitCost : null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.message || "Ürün kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.");
      showToastSafe({
        title: isEdit ? "Ürün güncellendi" : "Ürün eklendi",
        message: isEdit ? common.name : openingQuantity > 0 ? `${common.name} · ${openingQuantity} ${common.unit} stoğa girdi.` : `${common.name} listeye eklendi. Stok, satın alma teslim alınınca artar.`,
        type: "success",
        icon: "box",
      });
      onSaved({ ...(item || {}), ...(body as StockItem) });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const extrasSummary = [
    stockCategoryLabel(form.category),
    form.storageLocation.trim() ? `Raf ${form.storageLocation.trim()}` : "",
    form.barcode.trim() ? "barkod" : "",
  ].filter(Boolean).join(" · ");

  return (
    <FormModal
      open={open}
      onClose={onClose}
      module="box"
      title={isEdit ? "Ürünü düzenle" : "Yeni ürün"}
      onSubmit={() => submit()}
      submitting={saving}
      error={formError}
    >
      <FormField label="Ürün adı" htmlFor="stock-name" required error={errors.name}>
        <Input id="stock-name" value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ör. Anestezi kartuşu" data-autofocus />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Birim" htmlFor="stock-unit">
          <Select id="stock-unit" value={form.unit} onChange={(event) => set("unit", event.target.value)}>
            {optionsWithCurrent(STOCK_UNITS, form.unit).map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </FormField>
        <FormField label="Minimum stok" htmlFor="stock-min" error={errors.minQuantity} hint="Altına düşünce “Kritik” görünür.">
          <Input id="stock-min" type="number" inputMode="numeric" min="0" step="1" value={form.minQuantity} onChange={(event) => set("minQuantity", event.target.value)} />
        </FormField>
      </div>
      {!isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Elimdeki miktar" htmlFor="stock-opening" error={errors.openingQuantity} hint={hasOpening ? undefined : "Boş bırakırsanız stok satın almayla artar."}>
            <Input id="stock-opening" type="number" inputMode="numeric" min="0" step="1" value={form.openingQuantity} onChange={(event) => set("openingQuantity", event.target.value)} placeholder="0" />
          </FormField>
          {hasOpening && (
            <FormField label="Birim maliyet" htmlFor="stock-opening-cost" required error={errors.openingUnitCost}>
              <MoneyInput id="stock-opening-cost" value={form.openingUnitCost} onChange={(value) => set("openingUnitCost", value)} />
            </FormField>
          )}
        </div>
      )}
      <Disclosure title="Diğer bilgiler" summary={extrasSummary || undefined}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kategori" htmlFor="stock-category">
              <Select id="stock-category" value={form.category} onChange={(event) => set("category", event.target.value)}>
                {optionsWithCurrent(STOCK_CATEGORIES, form.category).map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </FormField>
            <FormField label="Raf / konum" htmlFor="stock-location">
              <Input id="stock-location" value={form.storageLocation} onChange={(event) => set("storageLocation", event.target.value)} placeholder="Ör. A-2, depo" />
            </FormField>
          </div>
          <FormField label="Barkod" htmlFor="stock-barcode" hint="Boşsa etikete sistem kodu basılır.">
            <Input id="stock-barcode" value={form.barcode} onChange={(event) => set("barcode", event.target.value)} className="font-mono" />
          </FormField>
        </div>
      </Disclosure>
    </FormModal>
  );
}
