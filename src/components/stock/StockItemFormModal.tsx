"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { showToastSafe } from "@/lib/toast-client";
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  optionsWithCurrent,
  shortDate,
  type StockItem,
} from "@/components/stock/stock-shared";

type FormState = {
  name: string;
  category: string;
  unit: string;
  minQuantity: string;
  storageLocation: string;
  barcode: string;
  expiresAt: string;
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
  expiresAt: "",
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
 * Ürün (stok kartı) ekleme ve düzenleme için TEK form. Önceden "Yeni Stok
 * Kartı" → "Yeni Stok Kalemi" → "Stok Kartını Aç" gibi üç farklı ad, iki ayrı
 * form vardı; başlangıç miktarı ₺0 maliyetle stoğa girip ortalama maliyeti
 * bozuyordu ve formun altındaki not "yalnız kart açar" diyerek çelişiyordu.
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
      expiresAt: item.expiresAt ? item.expiresAt.slice(0, 10) : "",
    } : EMPTY_FORM);
  }, [open, item]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (form.name.trim().length < 2) next.name = "Ürün adını yazın (en az 2 harf).";
    if (!isWholeNumber(form.minQuantity)) next.minQuantity = "Tam sayı girin (ör. 5). Uyarı istemiyorsanız 0 yazın.";
    if (!isEdit && form.openingQuantity.trim()) {
      if (!isWholeNumber(form.openingQuantity)) next.openingQuantity = "Tam sayı girin (ör. 10).";
      else if (Number(form.openingQuantity) > 0) {
        const cost = Number(form.openingUnitCost.replace(",", "."));
        if (form.openingUnitCost.trim() === "" || !Number.isFinite(cost) || cost < 0) {
          next.openingUnitCost = "Elinizdeki ürünün birim maliyetini girin; bilmiyorsanız son alış fiyatını yazın.";
        }
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
      expiresAt: form.expiresAt || null,
      storageLocation: form.storageLocation.trim() || null,
      supplier: null,
    };
    const openingQuantity = Number(form.openingQuantity) || 0;
    try {
      const response = await fetch(isEdit && item ? `/api/stock/${item.id}` : "/api/stock", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit
          ? { ...common, unitPrice: null }
          : {
              ...common,
              quantity: openingQuantity,
              unitPrice: openingQuantity > 0 ? Number(form.openingUnitCost.replace(",", ".")) : null,
            }),
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

  const hasLots = Boolean(item?.activeLotCount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      module="box"
      title={isEdit ? "Ürünü düzenle" : "Yeni Ürün"}
      description={isEdit ? undefined : "Ürünü bir kez tanımlayın; alışlar Satın Alma'dan, kullanım \"Stok çıkışı\" ile işlenir."}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void submit()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={formError} />
        <FormField label="Ürün adı" htmlFor="stock-name" required error={errors.name}>
          <Input id="stock-name" value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ör. Anestezi kartuşu" data-autofocus />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Kategori" htmlFor="stock-category">
            <Select id="stock-category" value={form.category} onChange={(event) => set("category", event.target.value)}>
              {optionsWithCurrent(STOCK_CATEGORIES, form.category).map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </FormField>
          <FormField label="Birim" htmlFor="stock-unit" hint="Miktarlar tam sayı tutulur.">
            <Select id="stock-unit" value={form.unit} onChange={(event) => set("unit", event.target.value)}>
              {optionsWithCurrent(STOCK_UNITS, form.unit).map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Minimum stok" htmlFor="stock-min" error={errors.minQuantity} hint="Altına düşünce “Kritik” görünür.">
            <Input id="stock-min" type="number" inputMode="numeric" min="0" step="1" value={form.minQuantity} onChange={(event) => set("minQuantity", event.target.value)} />
          </FormField>
          <FormField label="Raf / konum" htmlFor="stock-location">
            <Input id="stock-location" value={form.storageLocation} onChange={(event) => set("storageLocation", event.target.value)} placeholder="Ör. A-2, depo" />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Barkod (varsa)" htmlFor="stock-barcode" hint="Boş bırakılırsa etikete sistem kodu basılır.">
            <Input id="stock-barcode" value={form.barcode} onChange={(event) => set("barcode", event.target.value)} className="font-mono" />
          </FormField>
          <FormField
            label="Son kullanma tarihi"
            htmlFor="stock-expiry"
            hint={hasLots
              ? `Partilerde en yakın SKT: ${shortDate(item?.nearestExpiry) || "girilmemiş"}. Bu alan yalnız partisi olmayan miktar içindir.`
              : "Satın almada parti SKT'si girilirse o kullanılır."}
          >
            <Input id="stock-expiry" type="date" value={form.expiresAt} onChange={(event) => set("expiresAt", event.target.value)} />
          </FormField>
        </div>
        {!isEdit && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="col-span-2 text-xs leading-5 text-slate-600">
              Elinizde şu an bu üründen varsa sayıp girin; yoksa boş bırakın. Sonraki alışları Satın Alma&apos;dan kaydedin.
            </p>
            <FormField label="Açılış stoku (sayım)" htmlFor="stock-opening" error={errors.openingQuantity}>
              <Input id="stock-opening" type="number" inputMode="numeric" min="0" step="1" value={form.openingQuantity} onChange={(event) => set("openingQuantity", event.target.value)} placeholder="0" />
            </FormField>
            <FormField label="Birim maliyet (₺)" htmlFor="stock-opening-cost" required={Number(form.openingQuantity) > 0} error={errors.openingUnitCost}>
              <Input
                id="stock-opening-cost"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.openingUnitCost}
                onChange={(event) => set("openingUnitCost", event.target.value)}
                disabled={!(Number(form.openingQuantity) > 0)}
                placeholder="0,00"
              />
            </FormField>
          </div>
        )}
      </div>
    </Modal>
  );
}
