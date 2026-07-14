"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { showToastSafe } from "@/lib/toast-client";
import { useSlashFocus } from "@/lib/use-slash-focus";
import { stripSystemTags } from "@/lib/format-text";
import { downloadCsv } from "@/lib/csv-export";
import JsBarcode from "jsbarcode";
import { ProfessionalDataTable } from "@/components/ui/ProfessionalDataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Download, Plus, Printer } from "lucide-react";

type StockItem = {
  id: string; name: string; category: string; unit: string;
  quantity: number; minQuantity: number; unitPrice?: number | null; supplier?: string | null;
  barcode?: string | null; expiresAt?: string | null; storageLocation?: string | null;
  averageUnitPrice?: number | null;
  lastPurchase?: {
    date?: string | null;
    supplier?: string | null;
    unitPrice?: number | null;
    quantity?: number | null;
    invoiceNo?: string | null;
  } | null;
};
type StockMoveForm = { type: string; quantity: string; note: string };
type StockMovement = {
  id: string;
  type: string;
  quantity: number;
  unitPrice?: number | null;
  supplier?: string | null;
  note?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
};

const CATEGORIES = ["Tümü", "Anestezi", "İmplant", "Protez", "Dolgu", "Ortodonti", "Cerrahi", "Sarf", "Diğer"];
const UNITS = ["adet", "kutu", "şişe", "ampul", "set", "ml", "gr"];
const CURRENCY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });

export default function StokPage() {
  const [items,      setItems]      = useState<StockItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [category,   setCategory]   = useState("Tümü");
  const [statusFilter, setStatusFilter] = useState<"TUMU" | "KRITIK" | "SKT_YAKIN" | "SKT_GECMIS">("TUMU");
  const [search,     setSearch]     = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchInputRef);
  const [showNew,    setShowNew]    = useState(false);
  const [moveItem,   setMoveItem]   = useState<StockItem | null>(null);
  const [editItem,   setEditItem]   = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "Sarf", unit: "adet", minQuantity: "5", barcode: "", expiresAt: "", storageLocation: "" });

  const [saving,     setSaving]     = useState(false);

  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [historyMovements, setHistoryMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [newItem, setNewItem] = useState({ name: "", category: "Sarf", unit: "adet", quantity: "", minQuantity: "5", barcode: "", expiresAt: "", storageLocation: "" });
  const [move,    setMove]    = useState<StockMoveForm>({ type: "CIKIS", quantity: "", note: "" });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems(); }, [category]);

  // Başka bir personel stok girişi/çıkışı yaptığında listeyi tazele.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fetchItems(); }, 400);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Sekmeye geri dönüldüğünde (arka planda kaçırılmış olabilecek olayları) tazele.
  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchItems();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function fetchItems() {
    setLoading(true);
    const qs = category !== "Tümü" ? `?category=${encodeURIComponent(category)}` : "";
    try {
      const r = await fetch(`/api/stock${qs}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message || "Stok verileri yüklenemedi.");
      setItems(Array.isArray(d) ? d : []);
    } catch (error) {
      setItems([]);
      showToastSafe({ title: "Stok yüklenemedi", message: error instanceof Error ? error.message : "Stok verileri yüklenemedi.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  function upsertItem(nextItem: StockItem) {
    setItems((current) => {
      const exists = current.some((item) => item.id === nextItem.id);
      if (!exists) return [...current, nextItem].sort((a, b) => a.name.localeCompare(b.name, "tr"));
      return current.map((item) => (item.id === nextItem.id ? nextItem : item));
    });
    window.dispatchEvent(new CustomEvent("ks:realtime-sync", { detail: { scope: "stock" } }));
  }

  async function submitNew() {
    if (!newItem.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newItem, unitPrice: null, supplier: null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || "Lütfen bilgileri kontrol edip tekrar deneyin.");
      upsertItem(body as StockItem);
      setShowNew(false);
      setNewItem({ name: "", category: "Sarf", unit: "adet", quantity: "", minQuantity: "5", barcode: "", expiresAt: "", storageLocation: "" });
      showToastSafe({ title: "Stok kartı açıldı", message: "Liste güncellendi.", type: "success" });
      void fetchItems();
    } catch (error) {
      showToastSafe({ title: "Stok eklenemedi", message: error instanceof Error ? error.message : "Lütfen bilgileri kontrol edip tekrar deneyin.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function submitMove() {
    if (!moveItem || !move.quantity) return;
    const qty = Number(move.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToastSafe({ title: "Geçerli miktar girin", message: "Stok çıkış miktarı pozitif olmalıdır.", type: "error" });
      return;
    }
    if (move.type === "CIKIS" && qty > moveItem.quantity) {
      showToastSafe({ title: "Yetersiz stok", message: `En fazla ${moveItem.quantity} ${moveItem.unit} stoktan düşülebilir.`, type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/${moveItem.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(move) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || "Lütfen miktar ve işlem bilgilerini kontrol edin.");
      upsertItem({ ...(body as StockItem), lastPurchase: moveItem.lastPurchase, averageUnitPrice: moveItem.averageUnitPrice });
      setMoveItem(null);
      setMove({ type: "CIKIS", quantity: "", note: "" });
      showToastSafe({ title: "Stok hareketi işlendi", message: "Miktar anlık güncellendi.", type: "success" });
      void fetchItems();
    } catch (error) {
      showToastSafe({ title: "Stok hareketi kaydedilemedi", message: error instanceof Error ? error.message : "Lütfen miktar ve işlem bilgilerini kontrol edin.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: StockItem) {
    setEditItem(item);
    setEditForm({
      name: item.name,
      category: item.category || "Sarf",
      unit: item.unit || "adet",
      minQuantity: String(item.minQuantity ?? 5),
      barcode: item.barcode || "",
      expiresAt: item.expiresAt ? item.expiresAt.slice(0, 10) : "",
      storageLocation: item.storageLocation || "",
    });
  }

  async function submitEdit() {
    if (!editItem || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/${editItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          minQuantity: Number(editForm.minQuantity) || 0,
          unitPrice: null,
          supplier: null,
          barcode: editForm.barcode || null,
          expiresAt: editForm.expiresAt || null,
          storageLocation: editForm.storageLocation || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || "Stok kartı güncellenemedi.");
      upsertItem({ ...(body as StockItem), lastPurchase: editItem.lastPurchase, averageUnitPrice: editItem.averageUnitPrice });
      setEditItem(null);
      showToastSafe({ title: "Stok kartı güncellendi", message: "Ürün bilgileri yenilendi.", type: "success" });
      void fetchItems();
    } catch (error) {
      showToastSafe({ title: "Stok kartı güncellenemedi", message: error instanceof Error ? error.message : "Lütfen bilgileri kontrol edin.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(item: StockItem) {
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/stock/${item.id}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      setHistoryMovements(res.ok && Array.isArray(body?.movements) ? body.movements : []);
    } catch {
      setHistoryMovements([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const filtered = items.filter((i) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.lastPurchase?.supplier || i.supplier || "").toLowerCase().includes(q) ||
      (i.barcode || "").toLowerCase().includes(q) ||
      (i.storageLocation || "").toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusFilter === "KRITIK") return i.quantity < i.minQuantity;
    if (statusFilter === "SKT_YAKIN") return isExpiringSoon(i.expiresAt);
    if (statusFilter === "SKT_GECMIS") return isExpired(i.expiresAt);
    return true;
  });
  const lowStock  = items.filter(i => i.quantity < i.minQuantity).length;
  const averageCost = (item: StockItem) => item.averageUnitPrice ?? null;
  const stockValue = (item: StockItem) => item.quantity * (averageCost(item) ?? 0);
  const totalValue = items.reduce((s, i) => s + stockValue(i), 0);
  const expiringSoon = items.filter(i => isExpiringSoon(i.expiresAt)).length;
  const expiredCount = items.filter(i => isExpired(i.expiresAt)).length;

  function isExpiringSoon(value?: string | null) {
    if (!value) return false;
    const expiresAt = new Date(value).getTime();
    const now = Date.now();
    const ninetyDays = 1000 * 60 * 60 * 24 * 90;
    return expiresAt >= now && expiresAt <= now + ninetyDays;
  }

  function isExpired(value?: string | null) {
    return Boolean(value && new Date(value).getTime() < Date.now());
  }

  function formatDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString("tr-TR") : "";
  }

  function printBarcode(item: StockItem) {
    const code = item.barcode || item.id.slice(-10).toUpperCase();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, code, { format: "CODE128", width: 2, height: 56, displayValue: true, fontSize: 13, margin: 8 });
    const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=520");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>${item.name}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111827}.label{border:1px solid #111827;padding:14px;width:320px}.name{font-weight:700;font-size:14px}.meta{font-size:12px;color:#475569;margin-top:4px}svg{width:100%;height:auto;margin-top:8px}@media print{button{display:none}body{margin:8mm}.label{break-inside:avoid}}</style></head><body><button onclick="window.print()">Yazdır</button><div class="label"><div class="name">${item.name.replace(/</g, "&lt;")}</div><div class="meta">${item.storageLocation ? `Raf: ${item.storageLocation.replace(/</g, "&lt;")} · ` : ""}${item.expiresAt ? `SKT: ${formatDate(item.expiresAt)}` : ""}</div>${svg.outerHTML}</div></body></html>`);
    win.document.close();
  }

  function exportStockCsv() {
    downloadCsv(`stok-envanter-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((item) => ({
      Malzeme: item.name,
      Kategori: item.category,
      Stok: item.quantity,
      "Minimum Stok": item.minQuantity,
      Birim: item.unit,
      "Ortalama Maliyet": averageCost(item) ?? "",
      "Son Alış Fiyatı": item.lastPurchase?.unitPrice || "",
      "Son Tedarikçi": item.lastPurchase?.supplier || "",
      "Stok Değeri": stockValue(item),
      Barkod: item.barcode || "",
      "Raf/Konum": item.storageLocation || "",
      "Son Kullanma": item.expiresAt ? formatDate(item.expiresAt) : "",
      Durum: item.quantity < item.minQuantity ? "Kritik" : "Normal",
    })));
    showToastSafe({ title: "CSV hazırlandı", message: `${filtered.length} stok kalemi dışa aktarıldı.`, type: "success" });
  }

  const stockColumns: ColumnDef<StockItem, unknown>[] = [
    {
      accessorKey: "name",
      header: "Malzeme",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{item.name}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{item.category}</span>
              {item.storageLocation && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{item.storageLocation}</span>}
              {item.expiresAt && (
                <Badge tone={isExpired(item.expiresAt) ? "critical" : isExpiringSoon(item.expiresAt) ? "warning" : "neutral"}>
                  SKT {formatDate(item.expiresAt)}
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "quantity",
      header: "Mevcut",
      cell: ({ row }) => {
        const item = row.original;
        const low = item.quantity < item.minQuantity;
        return (
          <div className="whitespace-nowrap text-right">
            <span className={`text-base font-black ${low ? "text-red-600" : "text-slate-800"}`}>{item.quantity}</span>
            <span className="ml-1 text-xs text-slate-400">{item.unit}</span>
            <p className={`mt-0.5 text-[11px] font-bold ${low ? "text-red-600" : "text-slate-400"}`}>
              Min {item.minQuantity}
            </p>
          </div>
        );
      },
    },
    {
      id: "lastPurchase",
      accessorFn: (item) => item.lastPurchase?.unitPrice || 0,
      header: "Son Alış",
      cell: ({ row }) => {
        const item = row.original;
        const last = item.lastPurchase;
        if (!last) return <span className="text-xs text-slate-400">Satın alma yok</span>;
        return (
          <div className="min-w-0">
            <p className="whitespace-nowrap font-semibold text-slate-700">{CURRENCY.format(Number(last.unitPrice || 0))}/{item.unit}</p>
            <p className="max-w-[180px] truncate text-[11px] text-slate-400">
              {last.supplier || "Firma yok"}{last.date ? ` · ${formatDate(last.date)}` : ""}
            </p>
          </div>
        );
      },
    },
    {
      id: "averageCost",
      accessorFn: (item) => averageCost(item) || 0,
      header: "Ort. Maliyet",
      cell: ({ row }) => {
        const item = row.original;
        const cost = averageCost(item);
        if (cost === null) return <span className="text-xs text-slate-400">Maliyet yok</span>;
        return (
          <div className="whitespace-nowrap text-right">
            <p className="font-semibold text-slate-800">{CURRENCY.format(cost)}</p>
            <p className="text-[11px] text-slate-400">Değer {CURRENCY.format(stockValue(item))}</p>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "İşlem",
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setMoveItem(item);
                setMove({
                  type: "CIKIS",
                  quantity: "",
                  note: "",
                });
              }}
            >
              Düş
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void openHistory(item)}>
              Geçmiş
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
              Düzenle
            </Button>
          </div>
        );
      },
    },
  ];

  const inp = "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Malzeme, barkod, raf veya son tedarikçi ara… ( / )" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/30">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/30">
          <option value="TUMU">Tüm durumlar</option>
          <option value="KRITIK">Kritik stok</option>
          <option value="SKT_YAKIN">SKT yakın</option>
          <option value="SKT_GECMIS">SKT geçmiş</option>
        </select>
        <Button size="sm" variant="secondary" icon={Download} onClick={exportStockCsv} disabled={filtered.length === 0}>
          CSV
        </Button>
        <Button size="sm" variant="primary" icon={Plus} onClick={() => setShowNew(true)}>
          Yeni Kart
        </Button>
      </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
          <span>{filtered.length}/{items.length} kalem</span>
          {lowStock > 0 && <span className="text-red-600">{lowStock} kritik</span>}
          {expiringSoon > 0 && <span className="text-amber-700">{expiringSoon} SKT yakın</span>}
          {expiredCount > 0 && <span className="text-red-700">{expiredCount} SKT geçmiş</span>}
          <span className="text-slate-700">Değer: {CURRENCY.format(totalValue)}</span>
        </div>
      </div>

      {loading && filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400 shadow-sm">
          Stok kalemleri yükleniyor...
        </div>
      ) : (
        <ProfessionalDataTable data={filtered} columns={stockColumns} emptyText="Stok kalemi bulunamadı" pageSize={15} />
      )}

      {/* New Item Modal */}
      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Yeni Stok Kalemi"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowNew(false)}>İptal</Button>
            <Button variant="primary" loading={saving} onClick={submitNew}>
              {saving ? "Kaydediliyor…" : "Stok Kartını Aç"}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField label="Malzeme Adı" required>
            <input value={newItem.name} onChange={e => setNewItem(i => ({ ...i, name: e.target.value }))} className={inp + " w-full"} placeholder="Anestezi kartuşu, implant…" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kategori">
              <select value={newItem.category} onChange={e => setNewItem(i => ({ ...i, category: e.target.value }))} className={inp + " w-full"}>
                {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Birim">
              <select value={newItem.unit} onChange={e => setNewItem(i => ({ ...i, unit: e.target.value }))} className={inp + " w-full"}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Başlangıç Stok">
              <input type="number" value={newItem.quantity} onChange={e => setNewItem(i => ({ ...i, quantity: e.target.value }))} className={inp + " w-full"} placeholder="0" />
            </FormField>
            <FormField label="Min. Stok">
              <input type="number" value={newItem.minQuantity} onChange={e => setNewItem(i => ({ ...i, minQuantity: e.target.value }))} className={inp + " w-full"} placeholder="5" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Barkod">
              <input value={newItem.barcode} onChange={e => setNewItem(i => ({ ...i, barcode: e.target.value }))} className={inp + " w-full font-mono"} placeholder="CODE128" />
            </FormField>
            <FormField label="Son Kullanma">
              <input type="date" value={newItem.expiresAt} onChange={e => setNewItem(i => ({ ...i, expiresAt: e.target.value }))} className={inp + " w-full"} />
            </FormField>
            <FormField label="Raf / Konum">
              <input value={newItem.storageLocation} onChange={e => setNewItem(i => ({ ...i, storageLocation: e.target.value }))} className={inp + " w-full"} placeholder="A-2, depo" />
            </FormField>
          </div>
          <p className="text-xs text-slate-500">Bu form yalnızca ürün kartı açar. Tedarikçi, fatura, alış miktarı ve fiyatı Satın Alma & Tedarikçiler ekranındaki satın alma kaydında tutulur.</p>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        title="Stok Kartını Düzenle"
        description="Bu form ürün kimliğini düzenler. Alış fiyatı ve tedarikçi satın alma satırlarında tutulur."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditItem(null)}>Vazgeç</Button>
            <Button variant="primary" loading={saving} disabled={saving || !editForm.name.trim()} onClick={submitEdit}>
              {saving ? "Kaydediliyor…" : "Kartı Güncelle"}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField label="Malzeme Adı" required>
            <input value={editForm.name} onChange={e => setEditForm(i => ({ ...i, name: e.target.value }))} className={inp + " w-full"} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kategori">
              <select value={editForm.category} onChange={e => setEditForm(i => ({ ...i, category: e.target.value }))} className={inp + " w-full"}>
                {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Birim">
              <select value={editForm.unit} onChange={e => setEditForm(i => ({ ...i, unit: e.target.value }))} className={inp + " w-full"}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Minimum Stok">
            <input type="number" value={editForm.minQuantity} onChange={e => setEditForm(i => ({ ...i, minQuantity: e.target.value }))} className={inp + " w-full"} />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Barkod">
              <input value={editForm.barcode} onChange={e => setEditForm(i => ({ ...i, barcode: e.target.value }))} className={inp + " w-full font-mono"} />
            </FormField>
            <FormField label="Son Kullanma">
              <input type="date" value={editForm.expiresAt} onChange={e => setEditForm(i => ({ ...i, expiresAt: e.target.value }))} className={inp + " w-full"} />
            </FormField>
            <FormField label="Raf / Konum">
              <input value={editForm.storageLocation} onChange={e => setEditForm(i => ({ ...i, storageLocation: e.target.value }))} className={inp + " w-full"} />
            </FormField>
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      <Modal
        open={Boolean(moveItem)}
        onClose={() => setMoveItem(null)}
        title="Stok Çıkışı"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setMoveItem(null); setMove({ type: "CIKIS", quantity: "", note: "" }); }}>İptal</Button>
            <Button variant="primary" loading={saving} onClick={submitMove}>
              {saving ? "Kaydediliyor…" : "Çıkışı Kaydet"}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {moveItem && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">{moveItem.name}</p>
              <p className="text-xs text-slate-500">Mevcut: {moveItem.quantity} {moveItem.unit}</p>
            </div>
          )}
          <FormField label="Çıkış Miktarı">
            <input type="number" value={move.quantity} onChange={e => setMove(m => ({ ...m, quantity: e.target.value }))} min="1" className={inp + " w-full"} placeholder="0" />
          </FormField>
          <FormField label="Açıklama">
            <input value={move.note} onChange={e => setMove(m => ({ ...m, note: e.target.value }))} className={inp + " w-full"} placeholder="Hangi işlemde kullanıldı?" />
          </FormField>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        open={Boolean(historyItem)}
        onClose={() => setHistoryItem(null)}
        title={historyItem ? `${historyItem.name} — Hareket Geçmişi` : "Hareket Geçmişi"}
        description={historyItem ? `Son 50 hareket · Güncel stok: ${historyItem.quantity} ${historyItem.unit}` : undefined}
        size="lg"
        footer={historyItem ? (
          <Button variant="secondary" size="sm" icon={Printer} onClick={() => printBarcode(historyItem)}>
            Barkod
          </Button>
        ) : undefined}
      >
        {historyLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : historyMovements.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Bu kalem için henüz hareket kaydı yok.</p>
        ) : (
          <div className="space-y-2">
            {historyMovements.map(m => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.type === "GIRIS" ? "success" : "critical"}>
                      {m.type === "GIRIS" ? "Giriş" : "Çıkış"}
                    </Badge>
                    <span className="font-black text-slate-800">{m.type === "GIRIS" ? "+" : "-"}{m.quantity} {historyItem?.unit}</span>
                    {m.unitPrice ? <span className="text-xs text-slate-500">· {CURRENCY.format(Number(m.unitPrice))}/{historyItem?.unit}</span> : null}
                    {m.supplier ? <span className="text-xs text-slate-500">· {m.supplier}</span> : null}
                  </div>
                  {stripSystemTags(m.note) && <p className="mt-1 text-xs text-slate-500">{stripSystemTags(m.note)}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(m.createdAt).toLocaleString("tr-TR")}{m.user?.fullName ? ` · ${m.user.fullName}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
