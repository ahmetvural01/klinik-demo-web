"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Checkbox } from "@/components/ui/Checkbox";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency } from "@/lib/format";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
import { formatDateText } from "@/components/ui/Money";
import { PAYMENT_METHODS } from "@/components/firma/FirmaPaymentModal";
import { PurchaseLineEditor } from "@/components/firma/PurchaseLineEditor";
import { matchesSearch, newRequestKey, searchKey, todayKey } from "@/components/stock/stock-shared";
import {
  KDV_OPTIONS,
  centsToMoney,
  emptyLine,
  friendlyPurchaseError,
  isBlankLine,
  lineErrorSummary,
  linesToPayload,
  newLineKey,
  purchaseTotalCents,
  readRememberedKdv,
  rememberKdv,
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
  faturaNo: string;
  aciklama: string;
  kdvOrani: string;
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
  stockItems: StockItem[];
  stockLoading?: boolean;
  onClose: () => void;
  onSaved: (result: PurchaseFormSaved) => void | Promise<void>;
};

const NEW_FIRMA_OPTION = "__yeni_firma__";

const newForm = (prefill?: PurchasePrefill | null): FormState => ({
  tarih: todayKey(),
  faturaNo: "",
  aciklama: "",
  kdvOrani: "0",
  receiptStatus: prefill?.receiptStatus || "TESLIM_ALINDI",
  paidNow: false,
  paymentDate: todayKey(),
  paymentMethod: "HAVALE_EFT",
  paymentAmount: "",
  items: prefill?.lines?.length ? prefill.lines.map((line) => emptyLine(line)) : [emptyLine()],
});

const editForm = (purchase: Purchase): FormState => ({
  tarih: purchase.tarih.substring(0, 10),
  faturaNo: purchase.faturaNo || "",
  aciklama: purchase.aciklama || "",
  kdvOrani: String(purchase.kdvOrani ?? 0),
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
    lotNo: item.lotNo || "",
    expiresAt: item.expiresAt?.substring(0, 10) || "",
    locked: Boolean(item.consumed),
  })),
});

/** Kirli form karşılaştırması için satır anahtarları dışındaki içerik. */
const snapshot = (firmaId: string, firmaQuery: string, form: FormState) => JSON.stringify({
  firmaId,
  firmaQuery: firmaQuery.trim(),
  ...form,
  items: form.items.filter((line) => !isBlankLine(line)).map(({ key: _key, showLot: _showLot, ...rest }) => rest),
});

/**
 * Satın alma / sipariş için TEK form — oluşturma ve düzenleme aynı alanları
 * aynı düzende kullanır (önceden iki ayrı, farklı düzenli kopya vardı).
 * Sık kullanılan alanlar üstte: Firma · Tarih · Durum; fatura bilgileri
 * siparişte katlanır; not isteğe bağlı bölümde; ödeme tek onay kutusu.
 * Listede olmayan tedarikçi formdan çıkmadan eklenir. Kaydedilmemiş bilgi
 * varken Esc/✕/Vazgeç onay ister (önceden 20 adımlık form sorgusuz siliniyordu).
 */
export function PurchaseFormModal({
  open, mode, purchase, prefill, initialFirmaId, lockFirma = false,
  firmas, firmasLoading = false, firmasError, canCreateFirma = false, onFirmaCreated,
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
  const [kdvTouched, setKdvTouched] = useState(false);
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
      const rememberedKdv = nextFirmaId ? readRememberedKdv(nextFirmaId) : null;
      if (rememberedKdv) nextForm = { ...nextForm, kdvOrani: rememberedKdv };
    }
    setFirmaId(nextFirmaId);
    setFirmaQuery(nextQuery);
    setForm(nextForm);
    setErrors({});
    setLineErrors({});
    setFormError(null);
    setKdvTouched(false);
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

  const applyRememberedKdv = (id: string) => {
    if (kdvTouched || isEdit) return;
    const remembered = readRememberedKdv(id);
    if (remembered) setForm((current) => ({ ...current, kdvOrani: remembered }));
  };

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

  /** Aynı firmaya aynı fatura no daha önce girildiyse kullanıcıya sorar. */
  const confirmDuplicateInvoice = async (targetFirmaId: string, faturaNo: string, excludeId?: string) => {
    const invoice = faturaNo.trim();
    if (!invoice) return true;
    try {
      const response = await fetch(`/api/purchases?firmaId=${encodeURIComponent(targetFirmaId)}&q=${encodeURIComponent(invoice)}`, { cache: "no-store" });
      if (!response.ok) return true;
      const rows: Purchase[] = await response.json().catch(() => []);
      const duplicate = (Array.isArray(rows) ? rows : []).find((row) => row.id !== excludeId && searchKey(row.faturaNo) === searchKey(invoice));
      if (!duplicate) return true;
      return confirmDialog({
        title: "Bu fatura daha önce girilmiş olabilir",
        message: `${duplicate.faturaNo} numaralı fatura ${formatDateText(duplicate.tarih)} tarihinde ${formatCurrency(Number(duplicate.total || 0))} olarak kayıtlı. Aynı faturayı ikinci kez girerseniz stok ve firma borcu iki kat olur. Yine de kaydedilsin mi?`,
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
    // Fatura/sipariş tarihi ileri bir gün olamaz (teslim ve ödeme tarihleriyle aynı kural).
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
      // Düzenlemede fatura no değişmediyse mükerrer kontrolü gerekmez (ek istek atılmaz).
      const invoiceChanged = !isEdit || form.faturaNo.trim() !== (purchase?.faturaNo || "").trim();
      if (invoiceChanged && !(await confirmDuplicateInvoice(firmaId, form.faturaNo, isEdit ? purchase?.id : undefined))) return;
      let savedId = purchase?.id || "";
      if (isEdit && purchase) {
        const response = await fetch(`/api/purchases/${purchase.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tarih: form.tarih,
            faturaNo: form.faturaNo.trim() || null,
            aciklama: form.aciklama.trim() || null,
            kdvOrani: Number(form.kdvOrani),
            items: linesToPayload(items).map((line, index) => ({ ...line, id: items[index].id || null })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(friendlyPurchaseError(data.error || data.message, "Satın alma güncellenemedi."));
        showToastSafe({ title: isOrder ? "Sipariş güncellendi" : "Satın alma güncellendi", message: isOrder ? "Teslim alınınca yeni miktar ve fiyatlar işlenir." : "Stok ve firma borcu farka göre düzeltildi.", type: "success", icon: "firma" });
      } else {
        const paid = showPayment && form.paidNow;
        const response = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current || newRequestKey("purchase") },
          body: JSON.stringify({
            firmaId,
            tarih: form.tarih,
            receiptStatus: form.receiptStatus,
            faturaNo: form.faturaNo.trim() || null,
            aciklama: form.aciklama.trim() || null,
            kdvOrani: Number(form.kdvOrani),
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
        rememberKdv(firmaId, form.kdvOrani);
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

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const firmaName = purchase?.firma?.name || firmaQuery;

  const invoiceFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
      <FormField label="Fatura no" htmlFor="purchase-invoice">
        <Input id="purchase-invoice" value={form.faturaNo} onChange={(event) => updateForm({ faturaNo: event.target.value })} />
      </FormField>
      <ChoiceCards<string>
        label="KDV oranı"
        variant="pills"
        value={form.kdvOrani}
        onChange={(value) => { setKdvTouched(true); updateForm({ kdvOrani: value }); }}
        hint="Fiyatları KDV dahil girin; oran Raporlar'daki KDV özetinde kullanılır."
        options={[...new Set([...KDV_OPTIONS, form.kdvOrani])].map((value) => ({ value, label: `%${value}` }))}
      />
    </div>
  );

  const title = isEdit
    ? `${isOrder ? "Siparişi" : "Satın almayı"} düzenle`
    : isOrder ? "Yeni sipariş" : "Yeni satın alma";
  const description = isEdit
    ? `${firmaName} · ${isOrder ? "Teslim alınana kadar stok ve borç değişmez." : "Değişiklikler stoğa ve firma borcuna fark kadar yansır."}`
    : undefined;

  return (
    // Kirli formda Esc / × / Vazgeç onayı ortak pencereden (isDirty) gelir; önceden yerel onay da çıkıyordu.
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
                applyRememberedKdv(option.id);
              }}
              placeholder="Tedarikçi adı yazın"
              emptyText="Bu adla tedarikçi yok"
              className="ui-control"
            />
          </FormField>
        )}
        <FormField label={isOrder ? "Sipariş tarihi" : "Fatura / teslim tarihi"} htmlFor="purchase-date" required error={errors.tarih}>
          <Input id="purchase-date" type="date" max={todayKey()} value={form.tarih} onChange={(event) => { updateForm({ tarih: event.target.value }); setErrors((current) => ({ ...current, tarih: undefined })); }} />
        </FormField>
      </div>

      {isOrder && !isEdit ? (
        <Disclosure title="Fatura bilgileri" summary="teslim alırken de girilebilir" defaultOpen={Boolean(form.faturaNo)}>
          {invoiceFields}
        </Disclosure>
      ) : invoiceFields}

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
