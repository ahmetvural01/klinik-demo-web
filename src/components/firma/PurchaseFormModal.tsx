"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PackageCheck } from "lucide-react";
import { FormModal } from "@/components/ui/FormModal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Checkbox } from "@/components/ui/Checkbox";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency } from "@/lib/format";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
import { PAYMENT_METHODS } from "@/components/firma/FirmaPaymentModal";
import { PurchaseLineEditor } from "@/components/firma/PurchaseLineEditor";
import { matchesSearch, newRequestKey, searchKey, todayKey } from "@/components/stock/stock-shared";
import {
  centsToMoney,
  emptyLine,
  friendlyPurchaseError,
  isBlankLine,
  lineErrorSummary,
  linesToPayload,
  moneyToCents,
  newLineKey,
  purchaseTotalCents,
  validateLines,
  type LineErrors,
  type Purchase,
  type PurchaseFirmaOption,
  type PurchaseLineForm,
  type PurchasePrefill,
  type StockItem,
} from "@/components/firma/purchase-model";

type FormState = {
  tarih: string;
  aciklama: string;
  receiptStatus: Purchase["receiptStatus"];
  paidNow: boolean;
  paymentDate: string;
  paymentMethod: string;
  /** Kullanıcı değiştirmediyse "" — ödenen tutar toplamı izler. */
  paymentAmount: string;
  items: PurchaseLineForm[];
};

type FieldErrors = { firma?: string; tarih?: string; paymentAmount?: string };

export type PurchaseFormSaved = { firmaId: string; purchaseId: string; order: boolean };

type PurchaseFormModalProps = {
  open: boolean;
  /** "create": yeni satın alma / sipariş · "edit": mevcut kaydı düzelt (firma, durum ve ödeme değişmez). */
  mode: "create" | "edit";
  /** Düzenlenecek kayıt (kalemleriyle). */
  purchase?: Purchase | null;
  prefill?: PurchasePrefill | null;
  initialFirmaId?: string;
  /** Firma sayfasından açılınca firma değiştirilemez. */
  lockFirma?: boolean;
  firmas: PurchaseFirmaOption[];
  firmasLoading?: boolean;
  firmasError?: string | null;
  /** Listede olmayan tedarikçiyi formdan çıkmadan ekleyebilir (finance:write). */
  canCreateFirma?: boolean;
  onFirmaCreated?: (firma: PurchaseFirmaOption) => void;
  /**
   * Seçili tedarikçinin teslim alınmamış siparişi varsa yeni alım yerine
   * siparişi teslim almaya geçer (form kapanır). Verilmezse uyarı çıkmaz.
   */
  onOpenPendingOrders?: (firmaId: string, count: number) => void;
  stockItems: StockItem[];
  stockLoading?: boolean;
  onClose: () => void;
  onSaved: (result: PurchaseFormSaved) => void | Promise<void>;
};

const NEW_FIRMA_OPTION = "__yeni_firma__";

const newForm = (prefill?: PurchasePrefill | null): FormState => ({
  tarih: todayKey(),
  aciklama: "",
  receiptStatus: prefill?.receiptStatus || "TESLIM_ALINDI",
  paidNow: false,
  paymentDate: todayKey(),
  paymentMethod: "HAVALE_EFT",
  paymentAmount: "",
  items: prefill?.lines?.length ? prefill.lines.map((line) => emptyLine(line)) : [emptyLine()],
});

const editForm = (purchase: Purchase): FormState => ({
  tarih: purchase.tarih.substring(0, 10),
  aciklama: purchase.aciklama || "",
  receiptStatus: purchase.receiptStatus,
  paidNow: false,
  paymentDate: todayKey(),
  paymentMethod: "HAVALE_EFT",
  paymentAmount: "",
  items: (purchase.items || []).map((item) => ({
    key: newLineKey(),
    id: item.id,
    stockItemId: item.stockItemId,
    productQuery: item.productName,
    category: "Sarf",
    unit: item.unit,
    quantity: String(item.quantity),
    unitPrice: toMoneyValue(item.unitPrice) ?? "",
    locked: Boolean(item.consumed),
  })),
});

/** Kirli form karşılaştırması için satır anahtarları dışındaki içerik. */
const snapshot = (firmaId: string, firmaQuery: string, form: FormState) => JSON.stringify({
  firmaId,
  firmaQuery: firmaQuery.trim(),
  ...form,
  items: form.items.filter((line) => !isBlankLine(line)).map(({ key: _key, ...rest }) => rest),
});

/**
 * Satın alma / sipariş için TEK form — oluşturma ve düzenleme aynı alanları
 * aynı düzende kullanır. Sık kullanılan alanlar üstte: Durum · Tedarikçi ·
 * Tarih; sonra ürünler; ödeme tek onay kutusu; not isteğe bağlı bölümde.
 * Fiyatlar faturadaki gibi (vergi dahil) girilir. Listede olmayan tedarikçi
 * formdan çıkmadan eklenir. Kaydedilmemiş bilgi varken Esc/✕/Vazgeç onay ister.
 */
export function PurchaseFormModal({
  open, mode, purchase, prefill, initialFirmaId, lockFirma = false,
  firmas, firmasLoading = false, firmasError, canCreateFirma = false, onFirmaCreated, onOpenPendingOrders,
  stockItems, stockLoading = false, onClose, onSaved,
}: PurchaseFormModalProps) {
  const isEdit = mode === "edit";
  const [firmaId, setFirmaId] = useState("");
  const [firmaQuery, setFirmaQuery] = useState("");
  const [form, setForm] = useState<FormState>(() => newForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingFirma, setCreatingFirma] = useState(false);
  const requestKeyRef = useRef("");
  const initialRef = useRef("");
  // Düzenlemede kayıtlı tarih: ileri tarih kuralı yalnız tarih değiştirilince uygulanır.
  const initialTarihRef = useRef("");
  // Stok'tan sipariş (ürün ve son tedarikçi hazır): ilk odak miktarda; tedarikçi listesi kendiliğinden açılmaz.
  const [focusQuantity, setFocusQuantity] = useState(false);

  // Pencere açılınca bir kez kurulur; açıkken liste yenilenmesi yazılanları silmez.
  const setupRef = useRef({ mode, purchase, prefill, initialFirmaId, firmas });
  useEffect(() => { setupRef.current = { mode, purchase, prefill, initialFirmaId, firmas }; });
  useEffect(() => {
    if (!open) return;
    const setup = setupRef.current;
    let nextFirmaId = "";
    let nextQuery = "";
    let nextForm: FormState;
    if (setup.mode === "edit" && setup.purchase) {
      nextFirmaId = setup.purchase.firmaId;
      nextQuery = setup.purchase.firma?.name || "";
      nextForm = editForm(setup.purchase);
    } else {
      const known = setup.initialFirmaId ? setup.firmas.find((firma) => firma.id === setup.initialFirmaId) : null;
      nextFirmaId = setup.initialFirmaId || "";
      nextQuery = known?.name || setup.prefill?.firmaName || "";
      nextForm = newForm(setup.prefill);
    }
    setFirmaId(nextFirmaId);
    setFirmaQuery(nextQuery);
    setForm(nextForm);
    setErrors({});
    setLineErrors({});
    setFormError(null);
    setFocusQuantity(setup.mode !== "edit" && Boolean(nextFirmaId) && Boolean(setup.prefill?.lines?.length));
    requestKeyRef.current = newRequestKey("purchase");
    initialRef.current = snapshot(nextFirmaId, nextQuery, nextForm);
    initialTarihRef.current = setup.mode === "edit" ? nextForm.tarih : "";
  }, [open]);

  // Firma listesi geç gelirse (Stok'tan sipariş), önerilen firma hâlâ seçilebilir mi bakılır.
  useEffect(() => {
    if (!open || isEdit || lockFirma || !firmaId || firmasLoading || firmas.length === 0) return;
    const match = firmas.find((firma) => firma.id === firmaId);
    if (!match) {
      setFirmaId("");
      setErrors((current) => ({ ...current, firma: "Son alış yapılan tedarikçi listede yok (pasif olabilir). Listeden seçin." }));
    } else if (!firmaQuery) {
      setFirmaQuery(match.name);
    }
  }, [open, isEdit, lockFirma, firmaId, firmaQuery, firmas, firmasLoading]);

  const totalCents = purchaseTotalCents(form.items);
  const totalMoney = centsToMoney(totalCents);
  const isOrder = form.receiptStatus === "SIPARIS_VERILDI";
  const showPayment = !isEdit && !isOrder;
  const paymentValue = form.paymentAmount === "" ? totalMoney : form.paymentAmount;
  const dirty = open && snapshot(firmaId, firmaQuery, form) !== initialRef.current;
  const selectedFirma = firmaId ? firmas.find((firma) => firma.id === firmaId) : undefined;
  const pendingOrders = !isEdit && !isOrder && onOpenPendingOrders ? selectedFirma?.bekleyenSiparis || 0 : 0;

  const firmaOptions = useMemo(() => {
    const query = firmaQuery.trim();
    const options = firmas
      .filter((firma) => matchesSearch(firmaQuery, firma.name))
      .slice(0, 30)
      .map((firma) => ({ id: firma.id, label: firma.name, meta: firma.bakiye && firma.bakiye > 0 ? `Kalan borç ${formatCurrency(firma.bakiye)}` : undefined }));
    const exact = firmas.some((firma) => searchKey(firma.name) === searchKey(query));
    if (canCreateFirma && query.length >= 2 && !exact && !firmasLoading && !firmasError) {
      options.push({ id: NEW_FIRMA_OPTION, label: `+ “${query}” adlı yeni tedarikçiyi ekle`, meta: "Adıyla kaydedilir; bilgilerini sonra tamamlayabilirsiniz." });
    }
    return options;
  }, [firmas, firmaQuery, canCreateFirma, firmasLoading, firmasError]);

  const createFirma = async (name: string) => {
    if (creatingFirma) return;
    setCreatingFirma(true);
    setErrors((current) => ({ ...current, firma: undefined }));
    try {
      const response = await fetch("/api/firma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kategori: "TEDARICI" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.message || "Tedarikçi eklenemedi.");
      const created = { id: String(body.id), name: String(body.name || name), bakiye: 0 };
      setFirmaId(created.id);
      setFirmaQuery(created.name);
      onFirmaCreated?.(created);
      showToastSafe({ title: "Tedarikçi eklendi", message: `${created.name} kaydedildi ve seçildi.`, type: "success", icon: "firma" });
    } catch (error) {
      setErrors((current) => ({ ...current, firma: error instanceof Error ? error.message : "Tedarikçi eklenemedi." }));
    } finally {
      setCreatingFirma(false);
    }
  };

  /**
   * Aynı tedarikçiye aynı gün aynı tutarda kayıt varsa sorar: aynı alımı
   * ikinci kez girmek stoğu ve firma borcunu iki kat yapar.
   */
  const confirmDuplicatePurchase = async (targetFirmaId: string, date: string, total: string) => {
    try {
      const response = await fetch(`/api/purchases?firmaId=${encodeURIComponent(targetFirmaId)}&from=${date}&to=${date}`, { cache: "no-store" });
      if (!response.ok) return true;
      const rows: Purchase[] = await response.json().catch(() => []);
      const target = moneyToCents(total);
      const duplicate = (Array.isArray(rows) ? rows : []).find((row) => moneyToCents(row.total ?? 0) === target);
      if (!duplicate) return true;
      return confirmDialog({
        title: "Aynı alım ikinci kez mi giriliyor?",
        message: `${duplicate.firma?.name || firmaQuery.trim() || "Bu tedarikçi"} için bu tarihte ${formatCurrency(Number(duplicate.total || 0))} tutarında bir ${duplicate.receiptStatus === "SIPARIS_VERILDI" ? "sipariş" : "alım"} zaten kayıtlı. İkinci kez girilirse stok ve firma borcu iki kat olur.`,
        confirmText: "Yine de kaydet",
        cancelText: "Vazgeç",
      });
    } catch {
      return true;
    }
  };

  const submit = async () => {
    if (saving) return;
    const items = form.items.length > 1 ? form.items.filter((line) => !isBlankLine(line)) : form.items;
    const nextErrors: FieldErrors = {};
    if (!isEdit && !firmaId) nextErrors.firma = firmaQuery.trim() ? "Listeden tedarikçi seçin ya da yeni tedarikçi olarak ekleyin." : "Tedarikçi seçin.";
    if (!form.tarih) nextErrors.tarih = "Tarih seçin.";
    // Alım/sipariş tarihi ileri bir gün olamaz (teslim ve ödeme tarihleriyle aynı kural).
    // Düzenlemede eski kaydın tarihine dokunulmadıysa kural uygulanmaz (önceden ileri
    // tarihli eski kayıt, tarih değişmese de kaydedilemiyordu).
    else if (form.tarih > todayKey() && !(isEdit && form.tarih === initialTarihRef.current)) nextErrors.tarih = "Tarih bugünden sonra olamaz.";
    if (showPayment && form.paidNow) {
      const amountError = moneyInputError(paymentValue, { required: true, max: totalMoney });
      if (amountError) nextErrors.paymentAmount = amountError;
    }
    const nextLineErrors = validateLines(items);
    setErrors(nextErrors);
    setLineErrors(nextLineErrors);
    const summary = lineErrorSummary(form.items, nextLineErrors);
    if (Object.values(nextErrors).some(Boolean) || summary) {
      setFormError(summary || "Eksik alanları tamamlayın.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      let savedId = purchase?.id || "";
      if (isEdit && purchase) {
        const response = await fetch(`/api/purchases/${purchase.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tarih: form.tarih,
            aciklama: form.aciklama.trim() || null,
            items: linesToPayload(items).map((line, index) => ({ ...line, id: items[index].id || null })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(friendlyPurchaseError(data.error || data.message, "Satın alma güncellenemedi."));
        showToastSafe({ title: isOrder ? "Sipariş güncellendi" : "Satın alma güncellendi", message: isOrder ? "Teslim alınınca yeni miktar ve fiyatlar işlenir." : "Stok ve firma borcu farka göre düzeltildi.", type: "success", icon: "firma" });
      } else {
        if (!(await confirmDuplicatePurchase(firmaId, form.tarih, totalMoney))) return;
        const paid = showPayment && form.paidNow;
        const response = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current || newRequestKey("purchase") },
          body: JSON.stringify({
            firmaId,
            tarih: form.tarih,
            receiptStatus: form.receiptStatus,
            aciklama: form.aciklama.trim() || null,
            paidNow: paid,
            paymentDate: paid ? form.paymentDate : null,
            paymentMethod: paid ? form.paymentMethod : null,
            paymentAmount: paid ? toMoneyValue(paymentValue) : null,
            items: linesToPayload(items),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(friendlyPurchaseError(data.error || data.message, "Satın alma kaydedilemedi. Bilgileri kontrol edip tekrar deneyin."));
        savedId = String(data.id || "");
        requestKeyRef.current = "";
        showToastSafe({
          title: isOrder ? "Sipariş kaydedildi" : "Satın alma kaydedildi",
          message: isOrder
            ? "Ürünler teslim alınınca stoğa ve firma borcuna işlenir."
            : paid
              ? "Ürünler stoğa girdi; borç ve ödeme Muhasebe'ye işlendi."
              : "Ürünler stoğa girdi; tutar firma borcuna eklendi.",
          type: "success",
          icon: "firma",
        });
      }
      initialRef.current = snapshot(firmaId, firmaQuery, form);
      onClose();
      await onSaved({ firmaId, purchaseId: savedId, order: isOrder });
    } catch (error) {
      // İstek anahtarı korunur: yeniden "Kaydet" aynı satın almayı ikinci kez yazmaz.
      setFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const openPendingOrders = async () => {
    if (!onOpenPendingOrders || !firmaId) return;
    if (dirty && !(await confirmDialog({
      title: "Yeni alım bırakılsın mı?",
      message: "Bu formda yazdıklarınız kaydedilmez; bekleyen sipariş teslim alma için açılır.",
      confirmText: "Siparişe geç",
      cancelText: "Vazgeç",
    }))) return;
    onOpenPendingOrders(firmaId, pendingOrders);
  };

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const firmaName = purchase?.firma?.name || firmaQuery;

  const title = isEdit
    ? `${isOrder ? "Siparişi" : "Satın almayı"} düzenle`
    : isOrder ? "Yeni sipariş" : "Yeni satın alma";
  const description = isEdit
    ? `${firmaName} · ${isOrder ? "Teslim alınana kadar stok ve borç değişmez." : "Değişiklikler stoğa ve firma borcuna fark kadar yansır."}`
    : undefined;

  return (
    // Kirli formda Esc / × / Vazgeç onayı ortak pencereden (isDirty) gelir.
    <FormModal
      open={open}
      onClose={onClose}
      module="firma"
      size="xl"
      title={title}
      description={description}
      onSubmit={() => submit()}
      submitting={saving}
      error={formError}
      isDirty={dirty}
    >
      {!isEdit && (
        <ChoiceCards<Purchase["receiptStatus"]>
          label="Durum"
          variant="pills"
          value={form.receiptStatus}
          onChange={(value) => updateForm({ receiptStatus: value, paidNow: value === "SIPARIS_VERILDI" ? false : form.paidNow })}
          hint={isOrder ? "Stok ve borç ürünler teslim alınınca oluşur; ürün “Siparişte” görünür." : "Ürünler şimdi stoğa girer, tutar firma borcuna eklenir."}
          options={[
            { value: "TESLIM_ALINDI", label: "Teslim alındı" },
            { value: "SIPARIS_VERILDI", label: "Sipariş verildi" },
          ]}
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
        {isEdit || lockFirma ? (
          <div>
            <p className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">Tedarikçi</p>
            <p className="flex h-10 items-center truncate text-sm font-semibold text-slate-900">{firmaName || "—"}</p>
          </div>
        ) : (
          <FormField label="Tedarikçi" htmlFor="purchase-firma" required error={errors.firma}>
            <SearchSelect
              id="purchase-firma"
              query={firmaQuery}
              onQueryChange={(value) => { setFirmaQuery(value); setFirmaId(""); setErrors((current) => ({ ...current, firma: undefined })); }}
              options={firmaOptions}
              loading={(firmasLoading && firmas.length === 0) || creatingFirma}
              error={firmasError && firmas.length === 0 ? `${firmasError} Sayfayı yenileyip tekrar deneyin.` : undefined}
              onSelect={(option) => {
                if (option.id === NEW_FIRMA_OPTION) { void createFirma(firmaQuery.trim()); return; }
                setFirmaId(option.id);
                setFirmaQuery(option.label);
                setErrors((current) => ({ ...current, firma: undefined }));
              }}
              placeholder="Tedarikçi adı yazın"
              emptyText="Bu adla tedarikçi yok"
              className="ui-control"
            />
          </FormField>
        )}
        <FormField label={isOrder ? "Sipariş tarihi" : "Alım tarihi"} htmlFor="purchase-date" required error={errors.tarih}>
          <Input id="purchase-date" type="date" max={todayKey()} value={form.tarih} onChange={(event) => { updateForm({ tarih: event.target.value }); setErrors((current) => ({ ...current, tarih: undefined })); }} />
        </FormField>
      </div>

      {pendingOrders > 0 && (
        // Sipariş verilmiş ürün yeni alım olarak girilirse, sipariş sonra teslim
        // alındığında stok ve borç iki kat olur.
        <Callout
          tone="warning"
          compact
          inline
          action={(
            <Button size="sm" variant="ghost" icon={PackageCheck} onClick={() => void openPendingOrders()}>
              {pendingOrders === 1 ? "Siparişi teslim al" : "Siparişlere git"}
            </Button>
          )}
        >
          Bu tedarikçide teslim alınmamış sipariş var; ürünler o siparişle geldiyse siparişi teslim alın.
        </Callout>
      )}

      <PurchaseLineEditor
        items={form.items}
        firmaId={firmaId}
        errors={lineErrors}
        onClearError={(key, field) => setLineErrors((current) => (current[key]?.[field] ? { ...current, [key]: { ...current[key], [field]: undefined } } : current))}
        setItems={(updater) => setForm((current) => ({ ...current, items: updater(current.items) }))}
        stockItems={stockItems}
        stockLoading={stockLoading}
        autoFocusFirstQuantity={focusQuantity}
      />

      {showPayment && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <Checkbox
            label="Ödemesi yapıldı"
            description={form.paidNow ? undefined : "İşaretlemezseniz tutar firma borcu olarak kalır."}
            checked={form.paidNow}
            onChange={(checked) => { updateForm({ paidNow: checked }); setErrors((current) => ({ ...current, paymentAmount: undefined })); }}
          />
          {form.paidNow && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Tutar" htmlFor="purchase-pay-amount" required error={errors.paymentAmount} hint={form.paymentAmount === "" ? "Toplamın tamamı; kısmi ödemede değiştirin." : undefined}>
                <MoneyInput
                  id="purchase-pay-amount"
                  value={paymentValue}
                  onChange={(value) => { updateForm({ paymentAmount: value }); setErrors((current) => ({ ...current, paymentAmount: undefined })); }}
                />
              </FormField>
              <FormField label="Yöntem" htmlFor="purchase-pay-method" required>
                <Select id="purchase-pay-method" value={form.paymentMethod} onChange={(event) => updateForm({ paymentMethod: event.target.value })}>
                  {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Ödeme tarihi" htmlFor="purchase-pay-date">
                <Input id="purchase-pay-date" type="date" max={todayKey()} value={form.paymentDate} onChange={(event) => updateForm({ paymentDate: event.target.value })} />
              </FormField>
            </div>
          )}
        </div>
      )}

      <Disclosure title="Not" summary={form.aciklama.trim() ? form.aciklama.trim().slice(0, 60) : "isteğe bağlı"} defaultOpen={isEdit && Boolean(form.aciklama)}>
        <FormField label="Açıklama" htmlFor="purchase-note">
          <Input id="purchase-note" value={form.aciklama} onChange={(event) => updateForm({ aciklama: event.target.value })} placeholder="Ör. Ekim kampanyası, irsaliye sonra gelecek" />
        </FormField>
      </Disclosure>
    </FormModal>
  );
}
