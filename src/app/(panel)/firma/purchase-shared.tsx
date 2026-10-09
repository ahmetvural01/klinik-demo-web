"use client";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money, formatDateText } from "@/components/ui/Money";
import { FirmaPaymentModal, PAYMENT_METHODS, paymentMethodLabel, type FirmaPaymentTarget } from "@/components/firma/FirmaPaymentModal";
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  matchesSearch,
  newRequestKey,
  optionsWithCurrent,
  searchKey,
  todayKey,
  type StockItem,
} from "@/components/stock/stock-shared";

export type { StockItem };

export type PurchaseItemRow = {
  id: string; stockItemId: string; productName: string;
  quantity: number; unit: string; unitPrice: number; lineTotal: number;
  lotNo?: string | null; expiresAt?: string | null;
};

export type PurchaseLineSummary = { productName: string; quantity: number; unit: string; stockItemId?: string };

export type Purchase = {
  id: string; firmaId: string; firmaIslemId?: string | null; tarih: string;
  receiptStatus: "SIPARIS_VERILDI" | "TESLIM_ALINDI"; receivedAt?: string | null;
  total?: number;
  faturaNo?: string | null; aciklama?: string | null; kdvOrani: number; status: string;
  firma?: { id: string; name: string };
  firmaIslem?: { tutar: number; dueDate?: string | null };
  paymentSummary?: {
    total: number;
    paidTotal: number;
    remaining: number;
    status: "ODENMEDI" | "KISMI" | "ODENDI";
    payments: { id: string; tarih: string; tutar: number; yontem?: string | null }[];
  };
  _count?: { items: number };
  items?: PurchaseItemRow[];
  /** Liste uç noktasının döndürdüğü kısa kalem özeti. */
  lines?: PurchaseLineSummary[];
};

export type PurchaseLineForm = {
  key: string; id?: string; stockItemId: string; productQuery: string;
  category: string; unit: string; quantity: string; unitPrice: string;
  lotNo: string; expiresAt: string;
  /** Lot / SKT alanları açık mı (değer varsa her zaman açık). */
  showLot?: boolean;
};

type LineErrors = Record<string, { product?: string; quantity?: string; unitPrice?: string }>;

export type PurchaseFirmaOption = { id: string; name: string; bakiye?: number };

export const RECEIPT_STATUS_META: Record<Purchase["receiptStatus"], { label: string; tone: BadgeTone }> = {
  SIPARIS_VERILDI: { label: "Teslimat bekliyor", tone: "warning" },
  TESLIM_ALINDI: { label: "Teslim alındı", tone: "success" },
};

const PAYMENT_STATUS_META: Record<NonNullable<Purchase["paymentSummary"]>["status"], { label: string; tone: BadgeTone }> = {
  ODENMEDI: { label: "Ödenmedi", tone: "neutral" },
  KISMI: { label: "Kısmen ödendi", tone: "warning" },
  ODENDI: { label: "Ödendi", tone: "success" },
};

const KDV_OPTIONS = ["0", "1", "10", "20"];

const round2 = (value: number) => Math.round(value * 100) / 100;
const newLineKey = () => newRequestKey("line");

export const emptyLine = (patch: Partial<PurchaseLineForm> = {}): PurchaseLineForm => ({
  key: newLineKey(),
  stockItemId: "",
  productQuery: "",
  category: "Sarf",
  unit: "adet",
  quantity: "",
  unitPrice: "",
  lotNo: "",
  expiresAt: "",
  ...patch,
});
const lineTotal = (line: PurchaseLineForm) => (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
const purchaseTotal = (items: PurchaseLineForm[]) => round2(items.reduce((sum, line) => sum + lineTotal(line), 0));

/** "Anestezi kartuşu ×10, Eldiven ×2 +1 kalem" */
export function summarizeLines(lines: PurchaseLineSummary[] | undefined, max = 2): string {
  if (!lines || lines.length === 0) return "";
  const head = lines.slice(0, max).map((line) => `${line.productName} ×${line.quantity}`).join(", ");
  return lines.length > max ? `${head} +${lines.length - max} kalem` : head;
}

/** Sunucunun teknik satın alma hatalarını kullanıcının anlayacağı cümleye çevirir. */
function friendlyPurchaseError(message: string | null | undefined, fallback: string): string {
  const text = (message || "").trim();
  if (!text) return fallback;
  if (text.includes("ters stok hareketi")) {
    return "Bu satın almadaki ürünlerin bir kısmı kullanıldığı için miktar değiştirilemiyor. Farkı Stok sayfasında ürünü açıp “Stok hareketi” ile giriş veya çıkış olarak kaydedin.";
  }
  if (text.includes("Expected integer")) return "Miktarlar tam sayı olmalı (ör. 1, 2, 3).";
  return text;
}

function validateLines(items: PurchaseLineForm[]): LineErrors {
  const errors: LineErrors = {};
  items.forEach((line) => {
    const lineError: LineErrors[string] = {};
    if (!line.stockItemId && !line.productQuery.trim()) lineError.product = "Ürün seçin veya yeni ürün adı yazın.";
    if (!/^\d+$/.test(line.quantity.trim()) || Number(line.quantity) <= 0) lineError.quantity = "Tam sayı girin.";
    if (line.unitPrice.trim() === "" || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) lineError.unitPrice = "Fiyat girin.";
    if (lineError.product || lineError.quantity || lineError.unitPrice) errors[line.key] = lineError;
  });
  return errors;
}

function lineErrorSummary(items: PurchaseLineForm[], errors: LineErrors): string | null {
  const rows = items.map((line, index) => (errors[line.key] ? index + 1 : 0)).filter(Boolean);
  if (rows.length === 0) return null;
  return `Ürün satırlarını tamamlayın: ${rows.map((row) => `${row}. satır`).join(", ")}.`;
}

export function PurchaseLineEditor({ items, setItems, stockItems, firmaId, errors, onClearError }: {
  items: PurchaseLineForm[];
  setItems: (updater: (items: PurchaseLineForm[]) => PurchaseLineForm[]) => void;
  stockItems: StockItem[];
  /** Seçili firma: ürün seçilince aynı firmadan son alış fiyatı önerilir. */
  firmaId?: string;
  errors: LineErrors;
  onClearError: (key: string, field: "product" | "quantity" | "unitPrice") => void;
}) {
  const updateLine = (key: string, patch: Partial<PurchaseLineForm>) => setItems((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) => setItems((prev) => prev.filter((line) => line.key !== key));
  const addLine = () => setItems((prev) => [...prev, emptyLine()]);

  const selectStockItem = (line: PurchaseLineForm, item: StockItem) => {
    const samePrice = item.lastPurchase?.unitPrice && item.lastPurchase.supplierId && item.lastPurchase.supplierId === firmaId;
    updateLine(line.key, {
      stockItemId: item.id,
      productQuery: item.name,
      unit: item.unit || "adet",
      ...(line.unitPrice === "" && samePrice ? { unitPrice: String(item.lastPurchase?.unitPrice) } : {}),
    });
    onClearError(line.key, "product");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="ui-form-label text-xs font-bold text-slate-800">Ürünler</p>
        <Button variant="ghost" size="sm" icon={Plus} onClick={addLine}>Satır ekle</Button>
      </div>
      {items.map((line, index) => {
        const lineError = errors[line.key] || {};
        const isNew = !line.stockItemId && Boolean(line.productQuery.trim());
        const lotOpen = line.showLot || Boolean(line.lotNo || line.expiresAt);
        const options = stockItems
          .filter((item) => matchesSearch(line.productQuery, item.name, item.barcode))
          .slice(0, 30)
          .map((item) => ({
            id: item.id,
            label: item.name,
            meta: [
              `Stokta ${item.quantity} ${item.unit}`,
              item.lastPurchase?.unitPrice ? `Son alış ${formatCurrency(Number(item.lastPurchase.unitPrice))}${item.lastPurchase.supplier ? ` (${item.lastPurchase.supplier})` : ""}` : "",
            ].filter(Boolean).join(" · "),
          }));
        return (
          <div key={line.key} className={`rounded-lg border p-3 ${Object.keys(lineError).length ? "border-red-200 bg-red-50/30" : "border-slate-200"}`}>
            <div className="grid grid-cols-6 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_88px_120px_110px_36px]">
              <div className="col-span-6 sm:col-span-1">
                <FormField label={`${index + 1}. Ürün`} htmlFor={`${line.key}-product`} required error={lineError.product}>
                  <SearchSelect
                    id={`${line.key}-product`}
                    query={line.productQuery}
                    onQueryChange={(value) => {
                      // Aynı ad (harf farkı gözetmeden) yazılırsa mevcut karta bağlanır;
                      // önceden "İmplant" ile "implant" ikinci bir kart açıyordu.
                      const exact = stockItems.find((item) => searchKey(item.name) === searchKey(value));
                      updateLine(line.key, exact
                        ? { productQuery: value, stockItemId: exact.id, unit: exact.unit || "adet" }
                        : { productQuery: value, stockItemId: "" });
                      onClearError(line.key, "product");
                    }}
                    options={options}
                    onSelect={(option) => {
                      const item = stockItems.find((stockItem) => stockItem.id === option.id);
                      if (item) selectStockItem(line, item);
                    }}
                    placeholder="Ürün adı yazın"
                    emptyText="Listede yok — kaydedince yeni ürün olarak eklenir"
                    className="ui-control"
                  />
                </FormField>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <FormField label="Miktar" htmlFor={`${line.key}-quantity`} required error={lineError.quantity}>
                  <Input
                    id={`${line.key}-quantity`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(event) => { updateLine(line.key, { quantity: event.target.value }); onClearError(line.key, "quantity"); }}
                  />
                </FormField>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <FormField label="Birim fiyat (₺)" htmlFor={`${line.key}-price`} required error={lineError.unitPrice}>
                  <Input
                    id={`${line.key}-price`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => { updateLine(line.key, { unitPrice: event.target.value }); onClearError(line.key, "unitPrice"); }}
                  />
                </FormField>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">Tutar</p>
                <p className="flex h-10 items-center justify-end text-sm font-bold tabular-nums text-slate-900">{formatCurrency(lineTotal(line))}</p>
              </div>
              <div className="col-span-6 flex justify-end sm:col-span-1 sm:pt-6">
                <IconButton icon={Trash2} title="Satırı sil" tone="danger" size="sm" onClick={() => removeLine(line.key)} disabled={items.length === 1} />
              </div>
            </div>
            {line.stockItemId ? (
              <p className="mt-1.5 text-xs text-slate-500">Birim: {line.unit}</p>
            ) : isNew ? (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-primary/[0.04] p-2 sm:max-w-md">
                <p className="col-span-2 text-xs font-semibold text-primary">Yeni ürün olarak eklenecek</p>
                <FormField label="Kategori" htmlFor={`${line.key}-category`}>
                  <Select id={`${line.key}-category`} size="sm" value={line.category} onChange={(event) => updateLine(line.key, { category: event.target.value })}>
                    {optionsWithCurrent(STOCK_CATEGORIES, line.category).map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </FormField>
                <FormField label="Birim" htmlFor={`${line.key}-unit`}>
                  <Select id={`${line.key}-unit`} size="sm" value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })}>
                    {optionsWithCurrent(STOCK_UNITS, line.unit).map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </FormField>
              </div>
            ) : null}
            {lotOpen ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
                <FormField label="Lot no" htmlFor={`${line.key}-lot`}>
                  <Input id={`${line.key}-lot`} size="sm" value={line.lotNo} onChange={(event) => updateLine(line.key, { lotNo: event.target.value })} placeholder="Üretici lot no" />
                </FormField>
                <FormField label="Son kullanma" htmlFor={`${line.key}-expiry`}>
                  <Input id={`${line.key}-expiry`} size="sm" type="date" value={line.expiresAt} onChange={(event) => updateLine(line.key, { expiresAt: event.target.value })} />
                </FormField>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => updateLine(line.key, { showLot: true })}
                className="mt-1.5 text-xs font-semibold text-primary hover:underline"
              >
                + Lot / son kullanma tarihi ekle
              </button>
            )}
          </div>
        );
      })}
      <div className="flex justify-end border-t border-slate-100 pt-2">
        <p className="text-sm text-slate-600">
          Toplam (KDV dahil): <span className="font-bold tabular-nums text-slate-900">{formatCurrency(purchaseTotal(items))}</span>
        </p>
      </div>
    </div>
  );
}

type PurchaseFormState = {
  tarih: string;
  faturaNo: string;
  aciklama: string;
  kdvOrani: string;
  receiptStatus: Purchase["receiptStatus"];
  paidNow: boolean;
  paymentDate: string;
  paymentMethod: string;
  paymentAmount: string;
  items: PurchaseLineForm[];
};

export type PurchasePrefill = {
  receiptStatus?: Purchase["receiptStatus"];
  lines?: Partial<PurchaseLineForm>[];
};

const newPurchaseForm = (prefill?: PurchasePrefill): PurchaseFormState => ({
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

type ReceiveFormState = {
  receivedAt: string;
  faturaNo: string;
  itemLots: { purchaseItemId: string; productName: string; quantity: number; unit: string; lotNo: string; expiresAt: string }[];
  paidNow: boolean;
  paymentDate: string;
  paymentMethod: string;
  paymentAmount: string;
};

/**
 * Satın alma ekleme/detay/teslim/düzenleme pencerelerinin durumu ve API
 * çağrıları — Satın Alma listesi, firma detayı ve Stok ("Sipariş ver") aynı
 * yerden kullanır. Ödeme, firma ekranlarındaki ortak "Ödeme yap" penceresiyle
 * (aynı uç nokta + istek anahtarı) yapılır.
 */
export function usePurchaseModals({
  stockItems, firmas, onChanged, currentFirmaId, canWrite = true,
}: {
  stockItems: StockItem[];
  firmas: PurchaseFirmaOption[];
  onChanged: (firmaId: string) => void | Promise<void>;
  currentFirmaId?: string;
  canWrite?: boolean;
}) {
  // ── Yeni satın alma ─────────────────────────────────────────────────────
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseFirmaId, setPurchaseFirmaId] = useState("");
  const [purchaseFirmaQuery, setPurchaseFirmaQuery] = useState("");
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => newPurchaseForm());
  const [purchaseErrors, setPurchaseErrors] = useState<{ firma?: string; tarih?: string; paymentAmount?: string }>({});
  const [purchaseLineErrors, setPurchaseLineErrors] = useState<LineErrors>({});
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const purchaseRequestKeyRef = useRef("");

  // ── Detay ───────────────────────────────────────────────────────────────
  const [showPurchaseDetail, setShowPurchaseDetail] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [purchaseDetailLoading, setPurchaseDetailLoading] = useState(false);
  const [purchaseDetailError, setPurchaseDetailError] = useState<string | null>(null);
  const detailIdRef = useRef("");

  // ── Teslim alma ─────────────────────────────────────────────────────────
  const [showReceivePurchase, setShowReceivePurchase] = useState(false);
  const [receivingPurchase, setReceivingPurchase] = useState<Purchase | null>(null);
  const [isReceivingPurchase, setIsReceivingPurchase] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveAmountError, setReceiveAmountError] = useState<string | undefined>();
  const receiveRequestKeyRef = useRef("");
  const [receiveForm, setReceiveForm] = useState<ReceiveFormState>({
    receivedAt: todayKey(), faturaNo: "", itemLots: [], paidNow: false, paymentDate: todayKey(), paymentMethod: "HAVALE_EFT", paymentAmount: "",
  });

  // ── Düzenleme ───────────────────────────────────────────────────────────
  const [showEditPurchase, setShowEditPurchase] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState({ tarih: "", faturaNo: "", aciklama: "", kdvOrani: "0", items: [] as PurchaseLineForm[] });
  const [editLineErrors, setEditLineErrors] = useState<LineErrors>({});
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [isSubmittingPurchaseEdit, setIsSubmittingPurchaseEdit] = useState(false);

  // ── Ödeme ───────────────────────────────────────────────────────────────
  const [paymentTarget, setPaymentTarget] = useState<{ firma: FirmaPaymentTarget; suggestedAmount?: number; reference?: string; purchaseId?: string } | null>(null);

  const clearLineError = (setter: (updater: (current: LineErrors) => LineErrors) => void) => (key: string, field: "product" | "quantity" | "unitPrice") => {
    setter((current) => {
      if (!current[key]?.[field]) return current;
      return { ...current, [key]: { ...current[key], [field]: undefined } };
    });
  };

  const closeAddPurchase = () => {
    setShowAddPurchase(false);
    purchaseRequestKeyRef.current = "";
  };

  const openAddPurchase = (firmaId?: string, prefill?: PurchasePrefill) => {
    if (!canWrite) return;
    const targetFirma = firmaId ? firmas.find((firma) => firma.id === firmaId) : null;
    setPurchaseFirmaId(targetFirma?.id || "");
    setPurchaseFirmaQuery(targetFirma?.name || "");
    setPurchaseForm(newPurchaseForm(prefill));
    setPurchaseErrors({});
    setPurchaseLineErrors({});
    setPurchaseFormError(null);
    purchaseRequestKeyRef.current = newLineKey();
    setShowAddPurchase(true);
  };

  /** Aynı firmaya aynı fatura no daha önce girildiyse kullanıcıya sorar. */
  const confirmDuplicateInvoice = async (firmaId: string, faturaNo: string, excludeId?: string) => {
    const invoice = faturaNo.trim();
    if (!invoice) return true;
    try {
      const response = await fetch(`/api/purchases?firmaId=${encodeURIComponent(firmaId)}&q=${encodeURIComponent(invoice)}`, { cache: "no-store" });
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

  const submitPurchase = async () => {
    if (isSubmittingPurchase) return;
    const items = purchaseForm.items;
    const total = purchaseTotal(items);
    const nextErrors: typeof purchaseErrors = {};
    if (!purchaseFirmaId) nextErrors.firma = "Listeden firma seçin.";
    if (!purchaseForm.tarih) nextErrors.tarih = "Tarih seçin.";
    const lineErrors = validateLines(items);
    let paidAmount = 0;
    if (purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow) {
      paidAmount = purchaseForm.paymentAmount === "" ? total : Number(purchaseForm.paymentAmount);
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) nextErrors.paymentAmount = "Ödenen tutarı girin.";
      else if (paidAmount > total) nextErrors.paymentAmount = `Ödeme toplamı (${formatCurrency(total)}) aşamaz.`;
    }
    setPurchaseErrors(nextErrors);
    setPurchaseLineErrors(lineErrors);
    const summary = lineErrorSummary(items, lineErrors);
    if (Object.values(nextErrors).some(Boolean) || summary) {
      setPurchaseFormError(summary || "Eksik alanları tamamlayın.");
      return;
    }
    setPurchaseFormError(null);
    setIsSubmittingPurchase(true);
    try {
      if (!(await confirmDuplicateInvoice(purchaseFirmaId, purchaseForm.faturaNo))) return;
      const requestKey = purchaseRequestKeyRef.current || newLineKey();
      purchaseRequestKeyRef.current = requestKey;
      const paid = purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow;
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          firmaId: purchaseFirmaId,
          tarih: purchaseForm.tarih,
          receiptStatus: purchaseForm.receiptStatus,
          faturaNo: purchaseForm.faturaNo.trim() || null,
          aciklama: purchaseForm.aciklama.trim() || null,
          kdvOrani: Number(purchaseForm.kdvOrani),
          paidNow: paid,
          paymentDate: paid ? purchaseForm.paymentDate : null,
          paymentMethod: paid ? purchaseForm.paymentMethod : null,
          paymentAmount: paid ? paidAmount : null,
          items: items.map((line) => ({
            stockItemId: line.stockItemId || null,
            newProductName: line.stockItemId ? null : line.productQuery.trim(),
            category: line.category,
            unit: line.unit,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            lotNo: line.lotNo.trim() || null,
            expiresAt: line.expiresAt || null,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(friendlyPurchaseError(data.error || data.message, "Satın alma kaydedilemedi. Bilgileri kontrol edip tekrar deneyin."));
      purchaseRequestKeyRef.current = "";
      const savedFirmaId = purchaseFirmaId;
      const order = purchaseForm.receiptStatus === "SIPARIS_VERILDI";
      closeAddPurchase();
      showToastSafe({
        title: order ? "Sipariş kaydedildi" : "Satın alma kaydedildi",
        message: order
          ? "Ürünler teslim alınınca stoğa ve firma borcuna işlenecek. Bekleyen siparişler Satın Alma ekranında."
          : paid
            ? "Ürünler stoğa girdi; borç ve ödeme Muhasebe'ye işlendi."
            : "Ürünler stoğa girdi; tutar firma borcuna eklendi.",
        type: "success",
        icon: "firma",
      });
      await onChanged(savedFirmaId);
    } catch (error) {
      // İstek anahtarı korunur: yeniden "Kaydet" aynı satın almayı ikinci kez yazmaz.
      setPurchaseFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  const loadPurchaseDetail = async (purchaseId: string) => {
    detailIdRef.current = purchaseId;
    setPurchaseDetailLoading(true);
    setPurchaseDetailError(null);
    try {
      const response = await fetch(`/api/purchases/${purchaseId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Satın alma yüklenemedi.");
      if (detailIdRef.current === purchaseId) setViewingPurchase(data as Purchase);
    } catch (error) {
      if (detailIdRef.current === purchaseId) setPurchaseDetailError(error instanceof Error ? error.message : "Bağlantı kurulamadı.");
    } finally {
      if (detailIdRef.current === purchaseId) setPurchaseDetailLoading(false);
    }
  };

  const openPurchaseDetail = async (purchaseId: string) => {
    setViewingPurchase(null);
    setShowPurchaseDetail(true);
    await loadPurchaseDetail(purchaseId);
  };

  const openReceivePurchase = async (purchaseOrId: Purchase | string) => {
    if (!canWrite) return;
    let purchase: Purchase | null = typeof purchaseOrId === "string" ? null : purchaseOrId;
    if (!purchase || !purchase.items) {
      const id = typeof purchaseOrId === "string" ? purchaseOrId : purchaseOrId.id;
      try {
        const response = await fetch(`/api/purchases/${id}`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "Sipariş yüklenemedi.");
        purchase = data as Purchase;
      } catch (error) {
        showToastSafe({ title: "Sipariş açılamadı", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
        return;
      }
    }
    const total = (purchase.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    setReceivingPurchase(purchase);
    setReceiveForm({
      receivedAt: todayKey(),
      faturaNo: purchase.faturaNo || "",
      itemLots: (purchase.items || []).map((item) => ({
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
      paymentAmount: String(round2(total)),
    });
    setReceiveError(null);
    setReceiveAmountError(undefined);
    receiveRequestKeyRef.current = newLineKey();
    setShowReceivePurchase(true);
  };

  const closeReceivePurchase = () => {
    setShowReceivePurchase(false);
    setReceivingPurchase(null);
    receiveRequestKeyRef.current = "";
  };

  const submitReceivePurchase = async () => {
    if (!receivingPurchase || isReceivingPurchase) return;
    const total = round2((receivingPurchase.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
    const amount = receiveForm.paymentAmount === "" ? total : Number(receiveForm.paymentAmount);
    if (!receiveForm.receivedAt) { setReceiveError("Teslim tarihini seçin."); return; }
    if (receiveForm.paidNow && (!Number.isFinite(amount) || amount <= 0 || amount > total)) {
      setReceiveAmountError(`Tutar 0'dan büyük olmalı ve sipariş toplamını (${formatCurrency(total)}) aşamaz.`);
      return;
    }
    setReceiveAmountError(undefined);
    setReceiveError(null);
    setIsReceivingPurchase(true);
    const requestKey = receiveRequestKeyRef.current || newLineKey();
    receiveRequestKeyRef.current = requestKey;
    try {
      const response = await fetch(`/api/purchases/${receivingPurchase.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          receivedAt: receiveForm.receivedAt,
          faturaNo: receiveForm.faturaNo.trim() || null,
          itemLots: receiveForm.itemLots.map((item) => ({
            purchaseItemId: item.purchaseItemId,
            lotNo: item.lotNo.trim() || null,
            expiresAt: item.expiresAt || null,
          })),
          paidNow: receiveForm.paidNow,
          paymentDate: receiveForm.paidNow ? receiveForm.paymentDate : null,
          paymentMethod: receiveForm.paidNow ? receiveForm.paymentMethod : null,
          paymentAmount: receiveForm.paidNow ? amount : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sipariş teslim alınamadı.");
      const purchaseId = receivingPurchase.id;
      const firmaId = receivingPurchase.firmaId;
      const paid = receiveForm.paidNow;
      closeReceivePurchase();
      showToastSafe({
        title: "Sipariş teslim alındı",
        message: paid ? "Ürünler stoğa girdi; borç ve ödeme Muhasebe'ye işlendi." : "Ürünler stoğa girdi; tutar firma borcuna eklendi.",
        type: "success",
        icon: "firma",
      });
      await onChanged(firmaId);
      if (showPurchaseDetail) await loadPurchaseDetail(purchaseId);
    } catch (error) {
      setReceiveError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setIsReceivingPurchase(false);
    }
  };

  const openPurchaseEdit = async (purchaseId: string) => {
    if (!canWrite) return;
    let purchase: Purchase;
    try {
      const response = await fetch(`/api/purchases/${purchaseId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Satın alma yüklenemedi.");
      purchase = data as Purchase;
    } catch (error) {
      showToastSafe({ title: "Satın alma açılamadı", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
      return;
    }
    setEditingPurchaseId(purchaseId);
    setEditPurchaseForm({
      tarih: purchase.tarih.substring(0, 10),
      faturaNo: purchase.faturaNo || "",
      aciklama: purchase.aciklama || "",
      kdvOrani: String(purchase.kdvOrani ?? 0),
      items: (purchase.items || []).map((item) => ({
        key: newLineKey(),
        id: item.id,
        stockItemId: item.stockItemId,
        productQuery: item.productName,
        category: "Sarf",
        unit: item.unit,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        lotNo: item.lotNo || "",
        expiresAt: item.expiresAt?.substring(0, 10) || "",
      })),
    });
    setEditLineErrors({});
    setEditFormError(null);
    setShowEditPurchase(true);
  };

  const closeEditPurchase = () => {
    setShowEditPurchase(false);
    setEditingPurchaseId(null);
  };

  const submitPurchaseEdit = async () => {
    if (!editingPurchaseId || isSubmittingPurchaseEdit) return;
    const items = editPurchaseForm.items;
    const lineErrors = validateLines(items);
    setEditLineErrors(lineErrors);
    const summary = lineErrorSummary(items, lineErrors);
    if (!editPurchaseForm.tarih) { setEditFormError("Tarih seçin."); return; }
    if (summary) { setEditFormError(summary); return; }
    setEditFormError(null);
    setIsSubmittingPurchaseEdit(true);
    try {
      const response = await fetch(`/api/purchases/${editingPurchaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tarih: editPurchaseForm.tarih,
          faturaNo: editPurchaseForm.faturaNo.trim() || null,
          aciklama: editPurchaseForm.aciklama.trim() || null,
          kdvOrani: Number(editPurchaseForm.kdvOrani),
          items: items.map((line) => ({
            id: line.id || null,
            stockItemId: line.stockItemId || null,
            newProductName: line.stockItemId ? null : line.productQuery.trim(),
            category: line.category,
            unit: line.unit,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            lotNo: line.lotNo.trim() || null,
            expiresAt: line.expiresAt || null,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(friendlyPurchaseError(data.error || data.message, "Satın alma güncellenemedi."));
      const purchaseId = editingPurchaseId;
      closeEditPurchase();
      showToastSafe({ title: "Satın alma güncellendi", message: "Stok ve firma borcu farka göre düzeltildi.", type: "success", icon: "firma" });
      await onChanged(currentFirmaId || data.firmaId || "");
      if (showPurchaseDetail) await loadPurchaseDetail(purchaseId);
    } catch (error) {
      setEditFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setIsSubmittingPurchaseEdit(false);
    }
  };

  const cancelPurchase = async (purchase: Pick<Purchase, "id" | "firmaId" | "receiptStatus">) => {
    if (!canWrite) return;
    const isOrder = purchase.receiptStatus === "SIPARIS_VERILDI";
    const confirmed = await confirmDialog({
      title: isOrder ? "Sipariş iptal edilsin mi?" : "Satın alma iptal edilsin mi?",
      message: isOrder
        ? "Sipariş kapanır. Stok ve firma borcu zaten oluşmamıştı."
        : "Stoğa giren ürünler stoktan düşülür, firma borcu silinir. Bu satın almayla birlikte girilen ödeme varsa o da iptal edilir. Ürünler kullanıldıysa iptal yapılamaz.",
      danger: true,
      confirmText: isOrder ? "Siparişi iptal et" : "Satın almayı iptal et",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/cancel`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Satın alma iptal edilemedi.");
      showToastSafe({ title: "İptal edildi", message: data.message || "Satın alma iptal edildi.", type: "success" });
      setShowPurchaseDetail(false);
      await onChanged(purchase.firmaId);
    } catch (error) {
      showToastSafe({ title: "İptal edilemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  /** Firma için ödeme penceresi (firma bakiyesi sunucudan okunur). */
  const openFirmaPayment = async (firmaId: string, options?: { suggestedAmount?: number; reference?: string; purchaseId?: string }) => {
    if (!canWrite) return;
    try {
      const response = await fetch(`/api/firma/${firmaId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Firma bilgisi yüklenemedi.");
      if (Number(data.bakiye || 0) <= 0) {
        showToastSafe({ title: "Açık borç yok", message: `${data.name} için ödenecek kalan borç görünmüyor.`, type: "info" });
        return;
      }
      setPaymentTarget({ firma: { id: data.id, name: data.name, bakiye: Number(data.bakiye || 0) }, ...options });
    } catch (error) {
      showToastSafe({ title: "Ödeme açılamadı", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  const receivingTotal = round2((receivingPurchase?.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const viewing = viewingPurchase;
  const viewingRemaining = viewing?.paymentSummary?.remaining ?? 0;
  const viewingActive = viewing?.status === "AKTIF";
  const viewingDelivered = viewing?.receiptStatus === "TESLIM_ALINDI";

  const itemColumns: ListTableColumn<PurchaseItemRow>[] = [
    {
      key: "urun",
      header: "Ürün",
      render: (item) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{item.productName}</p>
          {(item.lotNo || item.expiresAt) && (
            <p className="text-xs text-slate-500">
              {item.lotNo ? `Lot ${item.lotNo}` : "Lot yok"}{item.expiresAt ? ` · SKT ${formatDateText(item.expiresAt)}` : ""}
            </p>
          )}
        </div>
      ),
    },
    { key: "miktar", header: "Miktar", align: "right", render: (item) => <span className="whitespace-nowrap tabular-nums">{item.quantity} {item.unit}</span> },
    { key: "birim", header: "Birim fiyat", align: "right", render: (item) => <Money value={Number(item.unitPrice)} /> },
    { key: "tutar", header: "Tutar", align: "right", render: (item) => <Money value={Number(item.lineTotal)} className="font-semibold" /> },
  ];

  const kdvField = (value: string, onChange: (value: string) => void, id: string) => (
    <FormField label="Faturadaki KDV oranı" htmlFor={id} hint="Bilgi içindir; tutarlara eklenmez. Birim fiyatları faturadaki KDV dahil fiyatla girin.">
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {optionsWithCurrent(KDV_OPTIONS, value).map((option) => <option key={option} value={option}>%{option}</option>)}
      </Select>
    </FormField>
  );

  const paymentFields = (state: { paidNow: boolean; paymentDate: string; paymentMethod: string; paymentAmount: string }, update: (patch: Partial<typeof state>) => void, prefix: string, amountError?: string) => (
    state.paidNow ? (
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Ödeme tarihi" htmlFor={`${prefix}-pay-date`}>
          <Input id={`${prefix}-pay-date`} type="date" max={todayKey()} value={state.paymentDate} onChange={(event) => update({ paymentDate: event.target.value })} />
        </FormField>
        <FormField label="Ödeme yöntemi" htmlFor={`${prefix}-pay-method`} required>
          <Select id={`${prefix}-pay-method`} value={state.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })}>
            {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Ödenen tutar (₺)" htmlFor={`${prefix}-pay-amount`} required error={amountError}>
          <Input id={`${prefix}-pay-amount`} type="number" inputMode="decimal" min="0" step="0.01" value={state.paymentAmount} onChange={(event) => update({ paymentAmount: event.target.value })} />
        </FormField>
      </div>
    ) : null
  );

  const modals = (
    <>
      {/* Yeni satın alma / sipariş */}
      <Modal
        open={showAddPurchase}
        onClose={closeAddPurchase}
        module="firma"
        title={purchaseForm.receiptStatus === "SIPARIS_VERILDI" ? "Yeni Sipariş" : "Yeni Satın Alma"}
        size="xl"
        footer={(
          <>
            <Button variant="secondary" onClick={closeAddPurchase} disabled={isSubmittingPurchase}>Vazgeç</Button>
            <Button onClick={() => void submitPurchase()} loading={isSubmittingPurchase}>Kaydet</Button>
          </>
        )}
      >
        {showAddPurchase && (
          <div className="space-y-4">
            <FormErrorBanner message={purchaseFormError} />
            <ChoiceCards<Purchase["receiptStatus"]>
              label="Ürünler geldi mi?"
              value={purchaseForm.receiptStatus}
              onChange={(value) => setPurchaseForm((form) => ({ ...form, receiptStatus: value, paidNow: value === "SIPARIS_VERILDI" ? false : form.paidNow }))}
              options={[
                { value: "TESLIM_ALINDI", label: "Teslim alındı", description: "Ürünler şimdi stoğa girer, tutar firma borcuna eklenir." },
                { value: "SIPARIS_VERILDI", label: "Yalnız sipariş verildi", description: "Stok ve borç teslim alınınca oluşur. Yeni ürün 0 adetle eklenir ve “Siparişte” görünür." },
              ]}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Firma" htmlFor="purchase-firma" required error={purchaseErrors.firma}>
                <SearchSelect
                  id="purchase-firma"
                  query={purchaseFirmaQuery}
                  disabled={Boolean(currentFirmaId && purchaseFirmaId === currentFirmaId)}
                  onQueryChange={(value) => { setPurchaseFirmaQuery(value); setPurchaseFirmaId(""); setPurchaseErrors((current) => ({ ...current, firma: undefined })); }}
                  options={firmas
                    .filter((firma) => matchesSearch(purchaseFirmaQuery, firma.name))
                    .slice(0, 30)
                    .map((firma) => ({ id: firma.id, label: firma.name, meta: firma.bakiye && firma.bakiye > 0 ? `Kalan borç ${formatCurrency(firma.bakiye)}` : undefined }))}
                  onSelect={(option) => { setPurchaseFirmaId(option.id); setPurchaseFirmaQuery(option.label); setPurchaseErrors((current) => ({ ...current, firma: undefined })); }}
                  placeholder="Firma adı yazın"
                  emptyText="Firma bulunamadı — önce Satın Alma ekranından “Yeni Firma” ile ekleyin"
                  className="ui-control"
                />
              </FormField>
              <FormField label={purchaseForm.receiptStatus === "SIPARIS_VERILDI" ? "Sipariş tarihi" : "Fatura / teslim tarihi"} htmlFor="purchase-date" required error={purchaseErrors.tarih}>
                <Input id="purchase-date" type="date" value={purchaseForm.tarih} onChange={(event) => setPurchaseForm((form) => ({ ...form, tarih: event.target.value }))} />
              </FormField>
              <FormField label="Fatura no" htmlFor="purchase-invoice" hint={purchaseForm.receiptStatus === "SIPARIS_VERILDI" ? "Henüz yoksa teslim alırken girebilirsiniz." : undefined}>
                <Input id="purchase-invoice" value={purchaseForm.faturaNo} onChange={(event) => setPurchaseForm((form) => ({ ...form, faturaNo: event.target.value }))} />
              </FormField>
              {kdvField(purchaseForm.kdvOrani, (value) => setPurchaseForm((form) => ({ ...form, kdvOrani: value })), "purchase-kdv")}
              <div className="sm:col-span-2">
                <FormField label="Açıklama" htmlFor="purchase-note">
                  <Input id="purchase-note" value={purchaseForm.aciklama} onChange={(event) => setPurchaseForm((form) => ({ ...form, aciklama: event.target.value }))} />
                </FormField>
              </div>
            </div>

            <PurchaseLineEditor
              items={purchaseForm.items}
              firmaId={purchaseFirmaId}
              errors={purchaseLineErrors}
              onClearError={clearLineError(setPurchaseLineErrors)}
              setItems={(updater) => setPurchaseForm((form) => {
                const previousTotal = purchaseTotal(form.items);
                const nextItems = updater(form.items);
                const nextTotal = purchaseTotal(nextItems);
                const syncPayment = form.paidNow && (form.paymentAmount === "" || Number(form.paymentAmount) === previousTotal);
                return { ...form, items: nextItems, paymentAmount: syncPayment ? String(nextTotal) : form.paymentAmount };
              })}
              stockItems={stockItems}
            />

            {purchaseForm.receiptStatus === "TESLIM_ALINDI" && (
              <div className="rounded-lg border border-slate-200 p-3">
                <ChoiceCards<"no" | "yes">
                  label="Ödeme"
                  variant="pills"
                  value={purchaseForm.paidNow ? "yes" : "no"}
                  onChange={(value) => setPurchaseForm((form) => ({
                    ...form,
                    paidNow: value === "yes",
                    paymentAmount: value === "yes" ? (form.paymentAmount || String(purchaseTotal(form.items))) : form.paymentAmount,
                  }))}
                  options={[
                    { value: "no", label: "Ödenmedi (borç olarak kalsın)" },
                    { value: "yes", label: "Şimdi ödendi" },
                  ]}
                />
                {paymentFields(purchaseForm, (patch) => { setPurchaseForm((form) => ({ ...form, ...patch })); setPurchaseErrors((current) => ({ ...current, paymentAmount: undefined })); }, "purchase", purchaseErrors.paymentAmount)}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Satın alma detayı */}
      <Modal
        open={showPurchaseDetail}
        onClose={() => setShowPurchaseDetail(false)}
        module="firma"
        trackFormChanges={false}
        title={viewing ? `Satın alma · ${viewing.firma?.name || ""}` : "Satın alma"}
        description={viewing ? [
          formatDateText(viewing.tarih),
          viewing.faturaNo ? `Fatura ${viewing.faturaNo}` : "Fatura no yok",
          `KDV %${viewing.kdvOrani} (fiyatlara dahil)`,
        ].join(" · ") : undefined}
        size="lg"
        footer={viewing && !purchaseDetailLoading ? (
          <>
            {canWrite && viewingActive && (
              <Button variant="ghost" className="mr-auto !text-red-700 hover:!bg-red-50" onClick={() => void cancelPurchase(viewing)}>
                {viewingDelivered ? "Satın almayı iptal et" : "Siparişi iptal et"}
              </Button>
            )}
            {canWrite && viewingActive && (
              <Button variant="secondary" onClick={() => { setShowPurchaseDetail(false); void openPurchaseEdit(viewing.id); }}>Düzenle</Button>
            )}
            {canWrite && viewingActive && !viewingDelivered ? (
              <Button onClick={() => void openReceivePurchase(viewing)}>Teslim al</Button>
            ) : canWrite && viewingActive && viewingRemaining > 0 ? (
              <Button onClick={() => void openFirmaPayment(viewing.firmaId, { suggestedAmount: viewingRemaining, reference: viewing.faturaNo ? `Fatura ${viewing.faturaNo} ödemesi` : "Satın alma ödemesi", purchaseId: viewing.id })}>
                Ödeme yap
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setShowPurchaseDetail(false)}>Kapat</Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={() => setShowPurchaseDetail(false)}>Kapat</Button>
        )}
      >
        {purchaseDetailLoading && !viewing ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : purchaseDetailError && !viewing ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {purchaseDetailError}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void loadPurchaseDetail(detailIdRef.current)}>Yeniden dene</button>
          </div>
        ) : viewing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {viewingActive ? (
                <Badge tone={RECEIPT_STATUS_META[viewing.receiptStatus].tone} size="md">
                  {RECEIPT_STATUS_META[viewing.receiptStatus].label}{viewing.receivedAt ? ` · ${formatDateText(viewing.receivedAt)}` : ""}
                </Badge>
              ) : (
                <Badge tone="critical" size="md">İptal edildi</Badge>
              )}
              {viewingActive && viewingDelivered && viewing.paymentSummary && (
                <Badge tone={PAYMENT_STATUS_META[viewing.paymentSummary.status].tone} size="md">{PAYMENT_STATUS_META[viewing.paymentSummary.status].label}</Badge>
              )}
            </div>
            {viewingActive && !viewingDelivered && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Ürünler gelince <strong>Teslim al</strong> ile onaylayın; stok ve firma borcu o zaman oluşur.
              </p>
            )}
            {viewing.aciklama && <p className="text-sm text-slate-600">{viewing.aciklama}</p>}
            <ListTable<PurchaseItemRow>
              columns={itemColumns}
              rows={viewing.items || []}
              rowKey={(item) => item.id}
              emptyText="Kalem yok"
              mobileCard={(item) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.quantity} {item.unit} × {formatCurrency(Number(item.unitPrice))}{item.lotNo ? ` · Lot ${item.lotNo}` : ""}</p>
                  </div>
                  <Money value={Number(item.lineTotal)} className="shrink-0 font-semibold" />
                </div>
              )}
            />
            {viewing.paymentSummary && (
              <dl className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <dt className="text-xs text-slate-500">Toplam</dt>
                  <dd className="mt-0.5 font-bold"><Money value={viewing.paymentSummary.total} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Ödenen</dt>
                  <dd className="mt-0.5 font-bold"><Money value={viewing.paymentSummary.paidTotal} tone="positive" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{viewingDelivered ? "Kalan borç" : "Sipariş tutarı"}</dt>
                  <dd className="mt-0.5 font-bold">{viewingDelivered ? <Money value={viewing.paymentSummary.remaining} /> : <Money value={viewing.paymentSummary.total} />}</dd>
                </div>
              </dl>
            )}
            {viewing.paymentSummary && viewing.paymentSummary.payments.length > 0 && (
              <div>
                <p className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">Ödemeler</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {viewing.paymentSummary.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-slate-600"><DateText value={payment.tarih} />{payment.yontem ? ` · ${paymentMethodLabel(payment.yontem)}` : ""}</span>
                      <Money value={payment.tutar} tone="positive" className="font-semibold" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {viewingDelivered && viewingRemaining > 0 && (
              <p className="text-xs text-slate-500">Ödemeler firmanın en eski açık borcundan başlayarak düşülür.</p>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Siparişi teslim al */}
      <Modal
        open={showReceivePurchase && Boolean(receivingPurchase)}
        onClose={closeReceivePurchase}
        module="firma"
        title="Siparişi teslim al"
        description={receivingPurchase ? `${receivingPurchase.firma?.name || ""} · ${(receivingPurchase.items || []).length} kalem · ${formatCurrency(receivingTotal)}` : undefined}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeReceivePurchase} disabled={isReceivingPurchase}>Vazgeç</Button>
            <Button onClick={() => void submitReceivePurchase()} loading={isReceivingPurchase}>Kaydet</Button>
          </>
        )}
      >
        {showReceivePurchase && receivingPurchase && (
          <div className="space-y-4">
            <FormErrorBanner message={receiveError} />
            <p className="text-sm text-slate-600">
              Kaydedince ürünler stoğa girer ve {formatCurrency(receivingTotal)} firma borcuna eklenir. Gelen miktar veya fiyat siparişten farklıysa önce siparişi “Düzenle” ile düzeltin.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Teslim tarihi" htmlFor="receive-date" required>
                <Input id="receive-date" type="date" max={todayKey()} value={receiveForm.receivedAt} onChange={(event) => setReceiveForm((form) => ({ ...form, receivedAt: event.target.value }))} />
              </FormField>
              <FormField label="Fatura no" htmlFor="receive-invoice">
                <Input id="receive-invoice" value={receiveForm.faturaNo} onChange={(event) => setReceiveForm((form) => ({ ...form, faturaNo: event.target.value }))} />
              </FormField>
            </div>
            <div className="space-y-2">
              <div>
                <p className="ui-form-label text-xs font-bold text-slate-800">Parti bilgileri</p>
                <p className="mt-0.5 text-xs text-slate-500">Biliniyorsa lot ve son kullanma tarihini girin; stok çıkışı en yakın tarihten başlar.</p>
              </div>
              {receiveForm.itemLots.map((item) => (
                <div key={item.purchaseItemId} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-end">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.quantity} {item.unit}</p>
                  </div>
                  <FormField label="Lot no" htmlFor={`receive-lot-${item.purchaseItemId}`}>
                    <Input
                      id={`receive-lot-${item.purchaseItemId}`}
                      size="sm"
                      value={item.lotNo}
                      onChange={(event) => setReceiveForm((form) => ({ ...form, itemLots: form.itemLots.map((line) => (line.purchaseItemId === item.purchaseItemId ? { ...line, lotNo: event.target.value } : line)) }))}
                    />
                  </FormField>
                  <FormField label="Son kullanma" htmlFor={`receive-expiry-${item.purchaseItemId}`}>
                    <Input
                      id={`receive-expiry-${item.purchaseItemId}`}
                      size="sm"
                      type="date"
                      value={item.expiresAt}
                      onChange={(event) => setReceiveForm((form) => ({ ...form, itemLots: form.itemLots.map((line) => (line.purchaseItemId === item.purchaseItemId ? { ...line, expiresAt: event.target.value } : line)) }))}
                    />
                  </FormField>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <ChoiceCards<"no" | "yes">
                label="Ödeme"
                variant="pills"
                value={receiveForm.paidNow ? "yes" : "no"}
                onChange={(value) => setReceiveForm((form) => ({ ...form, paidNow: value === "yes" }))}
                options={[
                  { value: "no", label: "Ödenmedi (borç olarak kalsın)" },
                  { value: "yes", label: "Şimdi ödendi" },
                ]}
              />
              {paymentFields(receiveForm, (patch) => { setReceiveForm((form) => ({ ...form, ...patch })); setReceiveAmountError(undefined); }, "receive", receiveAmountError)}
            </div>
          </div>
        )}
      </Modal>

      {/* Satın almayı düzenle */}
      <Modal
        open={showEditPurchase}
        onClose={closeEditPurchase}
        module="firma"
        title="Satın almayı düzenle"
        description="Miktar, fiyat ve ürün değişiklikleri stoğa ve firma borcuna fark kadar yansır."
        size="xl"
        footer={(
          <>
            <Button variant="secondary" onClick={closeEditPurchase} disabled={isSubmittingPurchaseEdit}>Vazgeç</Button>
            <Button onClick={() => void submitPurchaseEdit()} loading={isSubmittingPurchaseEdit}>Kaydet</Button>
          </>
        )}
      >
        {showEditPurchase && (
          <div className="space-y-4">
            <FormErrorBanner message={editFormError} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Tarih" htmlFor="purchase-edit-date" required>
                <Input id="purchase-edit-date" type="date" value={editPurchaseForm.tarih} onChange={(event) => setEditPurchaseForm((form) => ({ ...form, tarih: event.target.value }))} />
              </FormField>
              <FormField label="Fatura no" htmlFor="purchase-edit-invoice">
                <Input id="purchase-edit-invoice" value={editPurchaseForm.faturaNo} onChange={(event) => setEditPurchaseForm((form) => ({ ...form, faturaNo: event.target.value }))} />
              </FormField>
              {kdvField(editPurchaseForm.kdvOrani, (value) => setEditPurchaseForm((form) => ({ ...form, kdvOrani: value })), "purchase-edit-kdv")}
              <FormField label="Açıklama" htmlFor="purchase-edit-note">
                <Input id="purchase-edit-note" value={editPurchaseForm.aciklama} onChange={(event) => setEditPurchaseForm((form) => ({ ...form, aciklama: event.target.value }))} />
              </FormField>
            </div>
            <PurchaseLineEditor
              items={editPurchaseForm.items}
              errors={editLineErrors}
              onClearError={clearLineError(setEditLineErrors)}
              setItems={(updater) => setEditPurchaseForm((form) => ({ ...form, items: updater(form.items) }))}
              stockItems={stockItems}
            />
          </div>
        )}
      </Modal>

      <FirmaPaymentModal
        open={Boolean(paymentTarget)}
        firma={paymentTarget?.firma || null}
        suggestedAmount={paymentTarget?.suggestedAmount}
        reference={paymentTarget?.reference}
        onClose={() => setPaymentTarget(null)}
        onSaved={async () => {
          const target = paymentTarget;
          await onChanged(target?.firma.id || "");
          if (target?.purchaseId && showPurchaseDetail) await loadPurchaseDetail(target.purchaseId);
        }}
      />
    </>
  );

  return { openAddPurchase, openPurchaseDetail, openPurchaseEdit, openReceivePurchase, openFirmaPayment, cancelPurchase, modals };
}
