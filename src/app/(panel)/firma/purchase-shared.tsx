"use client";
import { useRef, useState } from "react";
import { confirmDialog } from "@/lib/confirm-client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export type StockItem = { id: string; name: string; quantity: number; unit: string };

export type PurchaseItemRow = {
  id: string; stockItemId: string; productName: string;
  quantity: number; unit: string; unitPrice: number; lineTotal: number;
  lotNo?: string | null; expiresAt?: string | null;
};

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
};

export type PurchaseLineForm = {
  key: string; id?: string; stockItemId: string; productQuery: string;
  category: string; unit: string; quantity: string; unitPrice: string;
  lotNo: string; expiresAt: string;
};

export const fmt = (n: number) =>
  "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);
export const fmtDate = (d: string) => new Date(d).toLocaleDateString("tr-TR");
export const formLabel = "mb-1.5 block text-sm font-semibold text-slate-700";
export const formInput = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100";
const PAYMENT_METHODS = [
  { value: "NAKIT", label: "Nakit" },
  { value: "KREDI_KARTI", label: "Kredi Kartı" },
  { value: "HAVALE_EFT", label: "Havale/EFT" },
  { value: "MAIL_ORDER", label: "Mail Order" },
  { value: "DIGER", label: "Diğer" },
];

const newLineKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
export const emptyLine = (): PurchaseLineForm => ({
  key: newLineKey(),
  stockItemId: "",
  productQuery: "",
  category: "Sarf",
  unit: "adet",
  quantity: "",
  unitPrice: "",
  lotNo: "",
  expiresAt: "",
});
const purchaseTotal = (items: PurchaseLineForm[]) => items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
const normalizeSearch = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");

export function SearchSelect({
  query, onQueryChange, options, onSelect, placeholder, className, emptyText,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  options: { id: string; label: string }[];
  onSelect: (option: { id: string; label: string }) => void;
  placeholder?: string;
  className?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => { onQueryChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">{emptyText || "Sonuç bulunamadı"}</p>
          ) : (
            options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelect(opt); setOpen(false); }}
                className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function PurchaseLineEditor({ items, setItems, stockItems }: {
  items: PurchaseLineForm[];
  setItems: (updater: (items: PurchaseLineForm[]) => PurchaseLineForm[]) => void;
  stockItems: StockItem[];
}) {
  const updateLine = (key: string, patch: Partial<PurchaseLineForm>) => setItems(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  const removeLine = (key: string) => setItems(prev => prev.filter(l => l.key !== key));
  const addLine = () => setItems(prev => [...prev, emptyLine()]);
  const lineTotal = (l: PurchaseLineForm) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-slate-700">Ürünler</label>
        <button type="button" onClick={addLine}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">+ Satır Ekle</button>
      </div>
      {items.map(line => (
        <div key={line.key} className="grid grid-cols-12 gap-2 items-start rounded-xl border border-slate-100 p-3">
          <div className="relative col-span-12 sm:col-span-4">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Ürün *</label>
            <SearchSelect
              query={line.productQuery}
              onQueryChange={v => {
                const exact = stockItems.find(s => normalizeSearch(s.name) === normalizeSearch(v));
                updateLine(line.key, exact
                  ? { productQuery: v, stockItemId: exact.id, unit: exact.unit || "adet" }
                  : { productQuery: v, stockItemId: "" });
              }}
              options={stockItems
                .filter(s => s.name.toLowerCase().includes(line.productQuery.toLowerCase()))
                .map(s => ({ id: s.id, label: `${s.name} (${s.quantity} ${s.unit})` }))}
              onSelect={opt => {
                const item = stockItems.find(s => s.id === opt.id);
                updateLine(line.key, { stockItemId: opt.id, productQuery: item?.name || opt.label, unit: item?.unit || "adet" });
              }}
              placeholder="Ürün adı yazın veya yeni ürün girin"
              emptyText="Bulunamadı — yeni ürün olarak eklenecek"
              className={formInput}
            />
            {!line.stockItemId && line.productQuery.trim() && (
              <p className="mt-1 text-xs font-medium text-primary">Yeni ürün olarak oluşturulacak</p>
            )}
          </div>
          {!line.stockItemId && line.productQuery.trim() && (
            <div className="col-span-6 sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Kategori</label>
              <input value={line.category} onChange={e => updateLine(line.key, { category: e.target.value })} className={formInput} />
            </div>
          )}
          <div className="col-span-4 sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Birim</label>
            <input value={line.unit} onChange={e => updateLine(line.key, { unit: e.target.value })} disabled={!!line.stockItemId} className={formInput} />
          </div>
          <div className="col-span-4 sm:col-span-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Miktar *</label>
            <input type="number" min="1" value={line.quantity} onChange={e => updateLine(line.key, { quantity: e.target.value })} className={formInput} />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Birim Fiyat (₺) *</label>
            <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e => updateLine(line.key, { unitPrice: e.target.value })} className={formInput} />
          </div>
          <div className="col-span-8 flex items-end justify-end pb-2 sm:col-span-1">
            <p className="text-sm font-bold text-slate-800">{fmt(lineTotal(line))}</p>
          </div>
          <div className="col-span-4 flex items-end justify-end sm:col-span-1">
            <button type="button" onClick={() => removeLine(line.key)} disabled={items.length === 1}
              className="rounded-lg border border-red-200 px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">Sil</button>
          </div>
          <div className="col-span-6 sm:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Parti / Lot No</label>
            <input
              value={line.lotNo}
              onChange={e => updateLine(line.key, { lotNo: e.target.value })}
              placeholder="Varsa üretici lot numarası"
              className={formInput}
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Son Kullanma Tarihi</label>
            <input
              type="date"
              value={line.expiresAt}
              onChange={e => updateLine(line.key, { expiresAt: e.target.value })}
              className={formInput}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-end border-t border-slate-100 pt-2">
        <p className="text-sm font-black text-slate-900">Genel Toplam: {fmt(items.reduce((s, l) => s + lineTotal(l), 0))}</p>
      </div>
    </div>
  );
}

/**
 * Satın alma ekleme/detay/düzeltme modallarının durumunu ve API çağrılarını
 * yönetir — hem firma listesi hem firma detay sayfası bu tek yerden kullanır.
 */
export function usePurchaseModals({
  stockItems, firmas, showToast, onChanged, currentFirmaId,
}: {
  stockItems: StockItem[];
  firmas: { id: string; name: string }[];
  showToast: (type: "success" | "error" | "info", text: string) => void;
  onChanged: (firmaId: string) => void | Promise<void>;
  currentFirmaId?: string;
}) {
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseFirmaId, setPurchaseFirmaId] = useState("");
  const [purchaseFirmaQuery, setPurchaseFirmaQuery] = useState("");
  const [purchaseForm, setPurchaseForm] = useState({
    tarih: new Date().toISOString().split("T")[0], faturaNo: "", aciklama: "", kdvOrani: "0",
    receiptStatus: "TESLIM_ALINDI" as "SIPARIS_VERILDI" | "TESLIM_ALINDI",
    paidNow: false, paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "NAKIT", paymentAmount: "",
    items: [emptyLine()] as PurchaseLineForm[],
  });
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const purchaseRequestKeyRef = useRef("");

  const [showPurchaseDetail, setShowPurchaseDetail] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [purchaseDetailLoading, setPurchaseDetailLoading] = useState(false);
  const [showReceivePurchase, setShowReceivePurchase] = useState(false);
  const [receivingPurchase, setReceivingPurchase] = useState<Purchase | null>(null);
  const [isReceivingPurchase, setIsReceivingPurchase] = useState(false);
  const receiveRequestKeyRef = useRef("");
  const [receiveForm, setReceiveForm] = useState({
    receivedAt: new Date().toISOString().split("T")[0],
    itemLots: [] as { purchaseItemId: string; productName: string; lotNo: string; expiresAt: string }[],
    paidNow: false,
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "NAKIT",
    paymentAmount: "",
  });

  const [showEditPurchase, setShowEditPurchase] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    tarih: "", faturaNo: "", aciklama: "", kdvOrani: "0",
    items: [] as PurchaseLineForm[],
  });
  const [isSubmittingPurchaseEdit, setIsSubmittingPurchaseEdit] = useState(false);

  const openAddPurchase = (firmaId?: string) => {
    const targetFirma = firmaId ? firmas.find(f => f.id === firmaId) : null;
    setPurchaseFirmaId(firmaId || "");
    setPurchaseFirmaQuery(targetFirma?.name || "");
    const today = new Date().toISOString().split("T")[0];
    setPurchaseForm({
      tarih: today,
      faturaNo: "",
      aciklama: "",
      kdvOrani: "0",
      receiptStatus: "TESLIM_ALINDI",
      paidNow: false,
      paymentDate: today,
      paymentMethod: "NAKIT",
      paymentAmount: "",
      items: [emptyLine()],
    });
    purchaseRequestKeyRef.current = newLineKey();
    setShowAddPurchase(true);
  };

  const submitPurchase = async () => {
    if (!purchaseFirmaId) { showToast("error", "Firma seçimi zorunlu"); return; }
    const items = purchaseForm.items;
    if (items.length === 0) { showToast("error", "En az bir satır ekleyin"); return; }
    for (const line of items) {
      if (!line.stockItemId && !line.productQuery.trim()) { showToast("error", "Her satırda bir ürün seçin veya yeni ürün adı girin"); return; }
      if (!line.quantity || Number(line.quantity) <= 0) { showToast("error", "Her satırda geçerli bir miktar girin"); return; }
      if (line.unitPrice === "" || Number(line.unitPrice) < 0) { showToast("error", "Her satırda geçerli bir birim fiyat girin"); return; }
    }
    const total = purchaseTotal(items);
    if (purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow) {
      const paidAmount = purchaseForm.paymentAmount === "" ? total : Number(purchaseForm.paymentAmount);
      if (!purchaseForm.paymentMethod) { showToast("error", "Ödeme yapıldıysa ödeme yöntemi seçin"); return; }
      if (!paidAmount || paidAmount <= 0) { showToast("error", "Geçerli bir ödeme tutarı girin"); return; }
      if (paidAmount > total) { showToast("error", "Ödeme tutarı satın alma toplamını aşamaz"); return; }
    }
    if (isSubmittingPurchase) return;
    setIsSubmittingPurchase(true);
    const requestKey = purchaseRequestKeyRef.current || newLineKey();
    purchaseRequestKeyRef.current = requestKey;
    const r = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
      body: JSON.stringify({
        firmaId: purchaseFirmaId, tarih: purchaseForm.tarih,
        receiptStatus: purchaseForm.receiptStatus,
        faturaNo: purchaseForm.faturaNo || null, aciklama: purchaseForm.aciklama || null,
        kdvOrani: Number(purchaseForm.kdvOrani),
        paidNow: purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow,
        paymentDate: purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow ? purchaseForm.paymentDate : null,
        paymentMethod: purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow ? purchaseForm.paymentMethod : null,
        paymentAmount: purchaseForm.receiptStatus === "TESLIM_ALINDI" && purchaseForm.paidNow ? (purchaseForm.paymentAmount === "" ? total : Number(purchaseForm.paymentAmount)) : null,
        items: items.map(line => ({
          stockItemId: line.stockItemId || null,
          newProductName: line.stockItemId ? null : line.productQuery.trim(),
          category: line.category, unit: line.unit,
          quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
          lotNo: line.lotNo || null,
          expiresAt: line.expiresAt || null,
        })),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      purchaseRequestKeyRef.current = "";
      setShowAddPurchase(false);
      showToast(
        "success",
        purchaseForm.receiptStatus === "SIPARIS_VERILDI"
          ? "Sipariş kaydedildi; teslim alınana kadar stok ve firma bakiyesi değişmedi"
          : purchaseForm.paidNow
            ? "Teslim alınan ürünler stoğa, borç ve ödeme muhasebeye işlendi"
            : "Teslim alınan ürünler stoğa ve firma borcuna işlendi",
      );
      await onChanged(purchaseFirmaId);
    } else {
      showToast("error", data.error || "Satın alma kaydedilemedi");
    }
    setIsSubmittingPurchase(false);
  };

  const openPurchaseDetail = async (purchaseId: string) => {
    setShowPurchaseDetail(true);
    setPurchaseDetailLoading(true);
    setViewingPurchase(null);
    const r = await fetch(`/api/purchases/${purchaseId}`, { cache: "no-store" });
    if (r.ok) setViewingPurchase(await r.json());
    else showToast("error", "Satın alma detayı yüklenemedi");
    setPurchaseDetailLoading(false);
  };

  const openReceivePurchase = (purchase: Purchase) => {
    const today = new Date().toISOString().split("T")[0];
    const total = (purchase.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    setReceivingPurchase(purchase);
    setReceiveForm({
      receivedAt: today,
      itemLots: (purchase.items || []).map(item => ({
        purchaseItemId: item.id,
        productName: item.productName,
        lotNo: item.lotNo || "",
        expiresAt: item.expiresAt?.substring(0, 10) || "",
      })),
      paidNow: false,
      paymentDate: today,
      paymentMethod: "NAKIT",
      paymentAmount: String(total),
    });
    receiveRequestKeyRef.current = newLineKey();
    setShowReceivePurchase(true);
  };

  const submitReceivePurchase = async () => {
    if (!receivingPurchase || isReceivingPurchase) return;
    const total = (receivingPurchase.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const amount = receiveForm.paymentAmount === "" ? total : Number(receiveForm.paymentAmount);
    if (!receiveForm.receivedAt) { showToast("error", "Teslim tarihi zorunlu"); return; }
    if (receiveForm.paidNow) {
      if (!receiveForm.paymentMethod) { showToast("error", "Ödeme yöntemi zorunlu"); return; }
      if (!amount || amount <= 0 || amount > total) {
        showToast("error", "Ödeme tutarı 0'dan büyük ve sipariş toplamından küçük olmalı");
        return;
      }
    }

    setIsReceivingPurchase(true);
    const requestKey = receiveRequestKeyRef.current || newLineKey();
    receiveRequestKeyRef.current = requestKey;
    try {
      const response = await fetch(`/api/purchases/${receivingPurchase.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          receivedAt: receiveForm.receivedAt,
          itemLots: receiveForm.itemLots.map(item => ({
            purchaseItemId: item.purchaseItemId,
            lotNo: item.lotNo || null,
            expiresAt: item.expiresAt || null,
          })),
          paidNow: receiveForm.paidNow,
          paymentDate: receiveForm.paidNow ? receiveForm.paymentDate : null,
          paymentMethod: receiveForm.paidNow ? receiveForm.paymentMethod : null,
          paymentAmount: receiveForm.paidNow ? amount : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sipariş teslim alınamadı");
      setShowReceivePurchase(false);
      setReceivingPurchase(null);
      receiveRequestKeyRef.current = "";
      setViewingPurchase(payload as Purchase);
      showToast(
        "success",
        receiveForm.paidNow
          ? "Sipariş teslim alındı; stok, firma borcu ve ödeme gideri işlendi"
          : "Sipariş teslim alındı; stok ve firma borcu işlendi",
      );
      await onChanged(receivingPurchase.firmaId);
      await openPurchaseDetail(receivingPurchase.id);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Sipariş teslim alınamadı");
    } finally {
      setIsReceivingPurchase(false);
    }
  };

  const openPurchaseEdit = async (purchaseId: string) => {
    const r = await fetch(`/api/purchases/${purchaseId}`, { cache: "no-store" });
    if (!r.ok) { showToast("error", "Satın alma yüklenemedi"); return; }
    const p: Purchase = await r.json();
    setEditingPurchaseId(purchaseId);
    setEditPurchaseForm({
      tarih: p.tarih.substring(0, 10), faturaNo: p.faturaNo || "", aciklama: p.aciklama || "", kdvOrani: String(p.kdvOrani),
      items: (p.items || []).map(it => ({
        key: newLineKey(), id: it.id, stockItemId: it.stockItemId, productQuery: it.productName,
        category: "Sarf", unit: it.unit, quantity: String(it.quantity), unitPrice: String(it.unitPrice),
        lotNo: it.lotNo || "", expiresAt: it.expiresAt?.substring(0, 10) || "",
      })),
    });
    setShowEditPurchase(true);
  };

  const submitPurchaseEdit = async () => {
    if (!editingPurchaseId) return;
    const items = editPurchaseForm.items;
    if (items.length === 0) { showToast("error", "En az bir satır olmalı"); return; }
    for (const line of items) {
      if (!line.stockItemId && !line.productQuery.trim()) { showToast("error", "Her satırda bir ürün seçin veya yeni ürün adı girin"); return; }
      if (!line.quantity || Number(line.quantity) <= 0) { showToast("error", "Her satırda geçerli bir miktar girin"); return; }
      if (line.unitPrice === "" || Number(line.unitPrice) < 0) { showToast("error", "Her satırda geçerli bir birim fiyat girin"); return; }
    }
    if (isSubmittingPurchaseEdit) return;
    setIsSubmittingPurchaseEdit(true);
    const r = await fetch(`/api/purchases/${editingPurchaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tarih: editPurchaseForm.tarih, faturaNo: editPurchaseForm.faturaNo || null,
        aciklama: editPurchaseForm.aciklama || null, kdvOrani: Number(editPurchaseForm.kdvOrani),
        items: items.map(line => ({
          id: line.id || null,
          stockItemId: line.stockItemId || null,
          newProductName: line.stockItemId ? null : line.productQuery.trim(),
          category: line.category, unit: line.unit,
          quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
          lotNo: line.lotNo || null,
          expiresAt: line.expiresAt || null,
        })),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      setShowEditPurchase(false);
      showToast("success", "Satın alma düzeltildi, stok ve firma bakiyesi güncellendi");
      await onChanged(currentFirmaId || data.firmaId || "");
    } else {
      showToast("error", data.error || "Satın alma düzeltilemedi");
    }
    setIsSubmittingPurchaseEdit(false);
  };

  const cancelPurchase = async (purchaseId: string, firmaId: string) => {
    if (!(await confirmDialog({ message: "Bu satın almayı iptal etmek istediğinizden emin misiniz? Stok ve firma bakiyesi geri alınacak.", danger: true, confirmText: "İptal Et" }))) return;
    const r = await fetch(`/api/purchases/${purchaseId}/cancel`, { method: "POST" });
    const data = await r.json().catch(() => ({}));
    showToast(r.ok ? "success" : "error", data.message || data.error || (r.ok ? "Satın alma iptal edildi" : "Satın alma iptal edilemedi"));
    await onChanged(firmaId);
  };

  const modals = (
    <>
      {/* Modal: Satın Alma Ekle (çok kalemli) */}
      <Modal
        open={showAddPurchase}
        onClose={() => setShowAddPurchase(false)}
        module="firma"
        title="Satın Alma Kaydı"
        description="Sipariş ile teslimatı ayırın; stok ve firma borcu yalnızca ürünler kliniğe ulaştığında oluşur."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddPurchase(false)}>Vazgeç</Button>
            <Button variant="primary" onClick={submitPurchase} loading={isSubmittingPurchase}>
              {purchaseForm.receiptStatus === "SIPARIS_VERILDI" ? "Siparişi Kaydet" : "Satın Almayı Kaydet"}
            </Button>
          </>
        }
      >
        {showAddPurchase && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setPurchaseForm(f => ({ ...f, receiptStatus: "TESLIM_ALINDI" }))}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                    purchaseForm.receiptStatus === "TESLIM_ALINDI"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Ürünler Teslim Alındı
                </button>
                <button
                  type="button"
                  onClick={() => setPurchaseForm(f => ({ ...f, receiptStatus: "SIPARIS_VERILDI", paidNow: false }))}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                    purchaseForm.receiptStatus === "SIPARIS_VERILDI"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Sadece Sipariş Verildi
                </button>
              </div>
              <p className="px-3 pb-2 pt-1.5 text-xs text-slate-500">
                {purchaseForm.receiptStatus === "TESLIM_ALINDI"
                  ? "Kayıtla birlikte stok girişi ve firma borcu oluşur."
                  : "Ürünler stokta görünmez, firma borcu ve gider oluşmaz. Teslimatta tek adımla işlenir."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="relative">
                <label className={formLabel}>Firma *</label>
                {currentFirmaId && purchaseFirmaId === currentFirmaId ? (
                  <input value={purchaseFirmaQuery} disabled className={formInput} />
                ) : (
                  <SearchSelect
                    query={purchaseFirmaQuery}
                    onQueryChange={v => { setPurchaseFirmaQuery(v); setPurchaseFirmaId(""); }}
                    options={firmas.filter(f => f.name.toLowerCase().includes(purchaseFirmaQuery.toLowerCase())).map(f => ({ id: f.id, label: f.name }))}
                    onSelect={opt => { setPurchaseFirmaId(opt.id); setPurchaseFirmaQuery(opt.label); }}
                    placeholder="Firma adı yazın"
                    emptyText="Firma bulunamadı"
                    className={formInput}
                  />
                )}
              </div>
              <div>
                <label className={formLabel}>Tarih *</label>
                <input type="date" value={purchaseForm.tarih} onChange={e => setPurchaseForm(f => ({ ...f, tarih: e.target.value }))} className={formInput} />
              </div>
              <div>
                <label className={formLabel}>Fatura No</label>
                <input value={purchaseForm.faturaNo} onChange={e => setPurchaseForm(f => ({ ...f, faturaNo: e.target.value }))} className={formInput} />
              </div>
              <div>
                <label className={formLabel}>KDV Oranı (%)</label>
                <select value={purchaseForm.kdvOrani} onChange={e => setPurchaseForm(f => ({ ...f, kdvOrani: e.target.value }))} className={formInput}>
                  <option value="0">%0</option><option value="10">%10</option><option value="20">%20</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel}>Açıklama</label>
                <input value={purchaseForm.aciklama} onChange={e => setPurchaseForm(f => ({ ...f, aciklama: e.target.value }))} className={formInput} />
              </div>
            </div>

            <PurchaseLineEditor
              items={purchaseForm.items}
              setItems={updater => setPurchaseForm(f => {
                const previousTotal = purchaseTotal(f.items);
                const nextItems = updater(f.items);
                const nextTotal = purchaseTotal(nextItems);
                const shouldSyncPayment = f.paidNow && (f.paymentAmount === "" || Number(f.paymentAmount) === previousTotal);
                return { ...f, items: nextItems, paymentAmount: shouldSyncPayment ? String(nextTotal) : f.paymentAmount };
              })}
              stockItems={stockItems}
            />

            {purchaseForm.receiptStatus === "TESLIM_ALINDI" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900">Ödeme Durumu</h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ödenmedi ise yalnızca firma borcu oluşur. Ödendi seçilirse ödeme gider kaydı aynı anda oluşturulur.
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setPurchaseForm(f => ({ ...f, paidNow: false }))}
                    className={`rounded-lg px-3 py-2 text-xs font-black transition ${!purchaseForm.paidNow ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    Ödenmedi
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchaseForm(f => ({ ...f, paidNow: true, paymentAmount: f.paymentAmount || String(purchaseTotal(f.items)) }))}
                    className={`rounded-lg px-3 py-2 text-xs font-black transition ${purchaseForm.paidNow ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    Ödendi
                  </button>
                </div>
              </div>

              {purchaseForm.paidNow && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Ödeme Tarihi</label>
                    <input type="date" value={purchaseForm.paymentDate} onChange={e => setPurchaseForm(f => ({ ...f, paymentDate: e.target.value }))} className={formInput} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Ödeme Yöntemi *</label>
                    <select value={purchaseForm.paymentMethod} onChange={e => setPurchaseForm(f => ({ ...f, paymentMethod: e.target.value }))} className={formInput}>
                      {PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Ödenen Tutar *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchaseForm.paymentAmount}
                      onChange={e => setPurchaseForm(f => ({ ...f, paymentAmount: e.target.value }))}
                      className={formInput}
                    />
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Satın Alma Detayı */}
      <Modal
        open={showPurchaseDetail}
        onClose={() => setShowPurchaseDetail(false)}
        module="firma"
        title={viewingPurchase ? `Satın Alma Detayı — ${viewingPurchase.firma?.name || ""}` : "Satın Alma Detayı"}
        size="lg"
        footer={viewingPurchase && !purchaseDetailLoading ? (
          <>
            {viewingPurchase.status === "AKTIF" && (
              <>
                <Button variant="secondary" onClick={() => { setShowPurchaseDetail(false); void openPurchaseEdit(viewingPurchase.id); }}>
                  Düzenle
                </Button>
                <Button variant="danger" onClick={() => { setShowPurchaseDetail(false); void cancelPurchase(viewingPurchase.id, viewingPurchase.firmaId); }}>
                  İptal
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setShowPurchaseDetail(false)}>Kapat</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setShowPurchaseDetail(false)}>Kapat</Button>
        )}
      >
        {showPurchaseDetail && (
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            {purchaseDetailLoading ? (
              <div className="py-10 text-center text-sm text-slate-500">Yükleniyor…</div>
            ) : !viewingPurchase ? (
              <div className="py-10 text-center text-sm text-slate-500">Detay yüklenemedi</div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  {fmtDate(viewingPurchase.tarih)}{viewingPurchase.faturaNo ? ` · Fatura: ${viewingPurchase.faturaNo}` : ""}
                  {viewingPurchase.status !== "AKTIF" ? " · İPTAL EDİLDİ" : ""}
                </p>
                {viewingPurchase.aciklama && <p className="text-sm italic text-slate-500">{viewingPurchase.aciklama}</p>}
                {viewingPurchase.receiptStatus === "SIPARIS_VERILDI" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-amber-900">Teslimat bekleniyor</p>
                      <p className="mt-0.5 text-xs text-amber-700">Stok ve firma borcu henüz oluşmadı.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openReceivePurchase(viewingPurchase)}
                      className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700"
                    >
                      Teslim Al
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800">
                    Teslim alındı{viewingPurchase.receivedAt ? ` · ${fmtDate(viewingPurchase.receivedAt)}` : ""}
                  </div>
                )}
                {viewingPurchase.paymentSummary && (
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                    <div className="rounded-lg bg-white px-3 py-2">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Belge Toplamı</p>
                      <p className="mt-0.5 text-sm font-black text-slate-900">{fmt(viewingPurchase.paymentSummary.total)}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Ödenen</p>
                      <p className="mt-0.5 text-sm font-black text-emerald-700">{fmt(viewingPurchase.paymentSummary.paidTotal)}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Kalan</p>
                      <p className="mt-0.5 text-sm font-black text-amber-700">{fmt(viewingPurchase.paymentSummary.remaining)}</p>
                    </div>
                  </div>
                )}
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left">Ürün</th>
                        <th className="px-3 py-2 text-right">Miktar</th>
                        <th className="px-3 py-2 text-left">Birim</th>
                        <th className="px-3 py-2 text-right">Birim Fiyat</th>
                        <th className="px-3 py-2 text-right">Tutar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(viewingPurchase.items || []).map(it => (
                        <tr key={it.id}>
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            {it.productName}
                            {(it.lotNo || it.expiresAt) && (
                              <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                                {it.lotNo ? `Lot: ${it.lotNo}` : "Lot belirtilmedi"}
                                {it.expiresAt ? ` · SKT: ${fmtDate(it.expiresAt)}` : ""}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{it.quantity}</td>
                          <td className="px-3 py-2">{it.unit}</td>
                          <td className="px-3 py-2 text-right">{fmt(Number(it.unitPrice))}</td>
                          <td className="px-3 py-2 text-right font-bold">{fmt(Number(it.lineTotal))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <p className="text-lg font-black text-slate-900">
                    Toplam: {fmt(Number(
                      viewingPurchase.firmaIslem?.tutar
                      || (viewingPurchase.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
                    ))}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Siparişi Teslim Al */}
      <Modal
        open={showReceivePurchase && Boolean(receivingPurchase)}
        onClose={() => setShowReceivePurchase(false)}
        module="firma"
        title="Siparişi Teslim Al"
        description={receivingPurchase ? `${receivingPurchase.firma?.name} · ${(receivingPurchase.items || []).length} kalem · ${fmt((receivingPurchase.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0))}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowReceivePurchase(false)}>Vazgeç</Button>
            <Button variant="primary" onClick={submitReceivePurchase} loading={isReceivingPurchase}>Teslimatı Onayla</Button>
          </>
        }
      >
        {showReceivePurchase && receivingPurchase && (
          <div className="space-y-4">
            <div className="ui-surface-info rounded-xl px-4 py-3 text-sm text-primary-strong">
              Onaylandığında ürünler stoğa girer ve toplam tutar firma borcuna eklenir.
            </div>

            <div>
              <label className={formLabel}>Teslim Tarihi *</label>
              <input
                type="date"
                value={receiveForm.receivedAt}
                onChange={event => setReceiveForm(form => ({ ...form, receivedAt: event.target.value }))}
                className={formInput}
              />
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-sm font-black text-slate-900">Parti Bilgileri</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Lot ve son kullanma tarihi bilinen ürünlerde girin; stok çıkışı en yakın tarihten başlar.
                </p>
              </div>
              {receiveForm.itemLots.map(item => (
                <div
                  key={item.purchaseItemId}
                  className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_150px]"
                >
                  <p className="self-center truncate text-sm font-bold text-slate-800">{item.productName}</p>
                  <input
                    value={item.lotNo}
                    onChange={event => setReceiveForm(form => ({
                      ...form,
                      itemLots: form.itemLots.map(line => line.purchaseItemId === item.purchaseItemId
                        ? { ...line, lotNo: event.target.value }
                        : line),
                    }))}
                    placeholder="Lot no"
                    className={formInput}
                  />
                  <input
                    type="date"
                    value={item.expiresAt}
                    onChange={event => setReceiveForm(form => ({
                      ...form,
                      itemLots: form.itemLots.map(line => line.purchaseItemId === item.purchaseItemId
                        ? { ...line, expiresAt: event.target.value }
                        : line),
                    }))}
                    aria-label={`${item.productName} son kullanma tarihi`}
                    className={formInput}
                  />
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">Ödeme</p>
                  <p className="mt-0.5 text-xs text-slate-500">Ödeme yapılmadıysa yalnızca firma borcu oluşur.</p>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setReceiveForm(form => ({ ...form, paidNow: false }))}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold ${!receiveForm.paidNow ? "bg-slate-900 text-white" : "text-slate-600"}`}
                  >
                    Ödenmedi
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiveForm(form => ({ ...form, paidNow: true }))}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold ${receiveForm.paidNow ? "bg-emerald-600 text-white" : "text-slate-600"}`}
                  >
                    Ödendi
                  </button>
                </div>
              </div>
              {receiveForm.paidNow && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Ödeme Tarihi</label>
                    <input type="date" value={receiveForm.paymentDate} onChange={event => setReceiveForm(form => ({ ...form, paymentDate: event.target.value }))} className={formInput} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Yöntem *</label>
                    <select value={receiveForm.paymentMethod} onChange={event => setReceiveForm(form => ({ ...form, paymentMethod: event.target.value }))} className={formInput}>
                      {PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Tutar *</label>
                    <input type="number" min="0" step="0.01" value={receiveForm.paymentAmount} onChange={event => setReceiveForm(form => ({ ...form, paymentAmount: event.target.value }))} className={formInput} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Satın Almayı Düzelt */}
      <Modal
        open={showEditPurchase}
        onClose={() => setShowEditPurchase(false)}
        module="firma"
        title="Satın Almayı Düzelt"
        description="Miktar/fiyat/ürün değişiklikleri stok ve firma bakiyesine otomatik yansır."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditPurchase(false)}>Vazgeç</Button>
            <Button variant="primary" onClick={submitPurchaseEdit} loading={isSubmittingPurchaseEdit}>Düzeltmeyi Kaydet</Button>
          </>
        }
      >
        {showEditPurchase && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabel}>Tarih *</label>
                <input type="date" value={editPurchaseForm.tarih} onChange={e => setEditPurchaseForm(f => ({ ...f, tarih: e.target.value }))} className={formInput} />
              </div>
              <div>
                <label className={formLabel}>Fatura No</label>
                <input value={editPurchaseForm.faturaNo} onChange={e => setEditPurchaseForm(f => ({ ...f, faturaNo: e.target.value }))} className={formInput} />
              </div>
              <div>
                <label className={formLabel}>KDV Oranı (%)</label>
                <select value={editPurchaseForm.kdvOrani} onChange={e => setEditPurchaseForm(f => ({ ...f, kdvOrani: e.target.value }))} className={formInput}>
                  <option value="0">%0</option><option value="10">%10</option><option value="20">%20</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel}>Açıklama</label>
                <input value={editPurchaseForm.aciklama} onChange={e => setEditPurchaseForm(f => ({ ...f, aciklama: e.target.value }))} className={formInput} />
              </div>
            </div>

            <PurchaseLineEditor
              items={editPurchaseForm.items}
              setItems={updater => setEditPurchaseForm(f => ({ ...f, items: updater(f.items) }))}
              stockItems={stockItems}
            />
          </div>
        )}
      </Modal>
    </>
  );

  return { openAddPurchase, openPurchaseDetail, openPurchaseEdit, cancelPurchase, modals };
}
