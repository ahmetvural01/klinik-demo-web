"use client";
import { useState } from "react";
import { confirmDialog } from "@/lib/confirm-client";
import { backdropClose, useEscapeClose } from "@/lib/use-modal-dismiss";

export type StockItem = { id: string; name: string; quantity: number; unit: string };

export type PurchaseItemRow = {
  id: string; stockItemId: string; productName: string;
  quantity: number; unit: string; unitPrice: number; lineTotal: number;
};

export type Purchase = {
  id: string; firmaId: string; firmaIslemId: string; tarih: string;
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
};

export const fmt = (n: number) =>
  "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);
export const fmtDate = (d: string) => new Date(d).toLocaleDateString("tr-TR");
export const formLabel = "mb-1.5 block text-sm font-semibold text-slate-700";
export const formInput = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100";
export const modalAction = "flex-1 rounded-xl px-4 py-3 text-sm font-bold transition";
const PAYMENT_METHODS = [
  { value: "NAKIT", label: "Nakit" },
  { value: "KREDI_KARTI", label: "Kredi Kartı" },
  { value: "HAVALE_EFT", label: "Havale/EFT" },
  { value: "MAIL_ORDER", label: "Mail Order" },
  { value: "DIGER", label: "Diğer" },
];

const newLineKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
export const emptyLine = (): PurchaseLineForm => ({ key: newLineKey(), stockItemId: "", productQuery: "", category: "Sarf", unit: "adet", quantity: "", unitPrice: "" });
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
              <p className="mt-1 text-xs font-medium text-blue-600">Yeni ürün olarak oluşturulacak</p>
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
    paidNow: false, paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "NAKIT", paymentAmount: "",
    items: [emptyLine()] as PurchaseLineForm[],
  });
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  const [showPurchaseDetail, setShowPurchaseDetail] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [purchaseDetailLoading, setPurchaseDetailLoading] = useState(false);

  const [showEditPurchase, setShowEditPurchase] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    tarih: "", faturaNo: "", aciklama: "", kdvOrani: "0",
    items: [] as PurchaseLineForm[],
  });
  const [isSubmittingPurchaseEdit, setIsSubmittingPurchaseEdit] = useState(false);

  useEscapeClose(() => setShowAddPurchase(false), showAddPurchase);
  useEscapeClose(() => setShowPurchaseDetail(false), showPurchaseDetail);
  useEscapeClose(() => setShowEditPurchase(false), showEditPurchase);

  const openAddPurchase = (firmaId?: string) => {
    const targetFirma = firmaId ? firmas.find(f => f.id === firmaId) : null;
    setPurchaseFirmaId(firmaId || "");
    setPurchaseFirmaQuery(targetFirma?.name || "");
    const today = new Date().toISOString().split("T")[0];
    setPurchaseForm({ tarih: today, faturaNo: "", aciklama: "", kdvOrani: "0", paidNow: false, paymentDate: today, paymentMethod: "NAKIT", paymentAmount: "", items: [emptyLine()] });
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
    if (purchaseForm.paidNow) {
      const paidAmount = purchaseForm.paymentAmount === "" ? total : Number(purchaseForm.paymentAmount);
      if (!purchaseForm.paymentMethod) { showToast("error", "Ödeme yapıldıysa ödeme yöntemi seçin"); return; }
      if (!paidAmount || paidAmount <= 0) { showToast("error", "Geçerli bir ödeme tutarı girin"); return; }
      if (paidAmount > total) { showToast("error", "Ödeme tutarı satın alma toplamını aşamaz"); return; }
    }
    if (isSubmittingPurchase) return;
    setIsSubmittingPurchase(true);
    const r = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firmaId: purchaseFirmaId, tarih: purchaseForm.tarih,
        faturaNo: purchaseForm.faturaNo || null, aciklama: purchaseForm.aciklama || null,
        kdvOrani: Number(purchaseForm.kdvOrani),
        paidNow: purchaseForm.paidNow,
        paymentDate: purchaseForm.paidNow ? purchaseForm.paymentDate : null,
        paymentMethod: purchaseForm.paidNow ? purchaseForm.paymentMethod : null,
        paymentAmount: purchaseForm.paidNow ? (purchaseForm.paymentAmount === "" ? total : Number(purchaseForm.paymentAmount)) : null,
        items: items.map(line => ({
          stockItemId: line.stockItemId || null,
          newProductName: line.stockItemId ? null : line.productQuery.trim(),
          category: line.category, unit: line.unit,
          quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
        })),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      setShowAddPurchase(false);
      showToast("success", purchaseForm.paidNow ? "Satın alma kaydedildi; stok, cari ve ödeme gideri işlendi" : "Satın alma kaydedildi; stok ve firma borcu güncellendi");
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
      {showAddPurchase && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdropClose(() => setShowAddPurchase(false))}>
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">Malzeme Alımı</h3>
              <p className="mt-1 text-sm text-slate-500">Her satır ilgili stok kalemine otomatik giriş yapar; toplam tutar firma borcuna eklenir.</p>
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

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddPurchase(false)}
                className={`${modalAction} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Vazgeç</button>
              <button onClick={submitPurchase} disabled={isSubmittingPurchase}
                className={`${modalAction} bg-red-600 text-white hover:bg-red-700 disabled:opacity-60`}>
                {isSubmittingPurchase ? "Kaydediliyor..." : "Satın Almayı Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Satın Alma Detayı */}
      {showPurchaseDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdropClose(() => setShowPurchaseDetail(false))}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            {purchaseDetailLoading ? (
              <div className="py-10 text-center text-sm text-slate-500">Yükleniyor…</div>
            ) : !viewingPurchase ? (
              <div className="py-10 text-center text-sm text-slate-500">Detay yüklenemedi</div>
            ) : (
              <>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Satın Alma Detayı — {viewingPurchase.firma?.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {fmtDate(viewingPurchase.tarih)}{viewingPurchase.faturaNo ? ` · Fatura: ${viewingPurchase.faturaNo}` : ""}
                    {viewingPurchase.status !== "AKTIF" ? " · İPTAL EDİLDİ" : ""}
                  </p>
                  {viewingPurchase.aciklama && <p className="mt-1 text-sm italic text-slate-500">{viewingPurchase.aciklama}</p>}
                </div>
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
                          <td className="px-3 py-2 font-semibold text-slate-800">{it.productName}</td>
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
                  <p className="text-lg font-black text-slate-900">Toplam: {fmt(Number(viewingPurchase.firmaIslem?.tutar || 0))}</p>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setShowPurchaseDetail(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Kapat</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Satın Almayı Düzelt */}
      {showEditPurchase && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdropClose(() => setShowEditPurchase(false))}>
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">Satın Almayı Düzelt</h3>
              <p className="mt-1 text-sm text-slate-500">Miktar/fiyat/ürün değişiklikleri stok ve firma bakiyesine otomatik yansır.</p>
            </div>

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

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowEditPurchase(false)}
                className={`${modalAction} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Vazgeç</button>
              <button onClick={submitPurchaseEdit} disabled={isSubmittingPurchaseEdit}
                className={`${modalAction} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60`}>
                {isSubmittingPurchaseEdit ? "Kaydediliyor..." : "Düzeltmeyi Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return { openAddPurchase, openPurchaseDetail, openPurchaseEdit, cancelPurchase, modals };
}
