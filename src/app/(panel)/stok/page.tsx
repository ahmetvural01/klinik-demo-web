"use client";

import { useEffect, useState } from "react";

type StockItem = {
  id: string; name: string; category: string; unit: string;
  quantity: number; minQuantity: number; unitPrice?: number; supplier?: string;
};

const CATEGORIES = ["Tümü", "Anestezi", "İmplant", "Protez", "Dolgu", "Ortodonti", "Cerrahi", "Sarf", "Diğer"];
const UNITS = ["adet", "kutu", "şişe", "ampul", "set", "ml", "gr"];
const CURRENCY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });

export default function StokPage() {
  const [items,      setItems]      = useState<StockItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [category,   setCategory]   = useState("Tümü");
  const [search,     setSearch]     = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [moveItem,   setMoveItem]   = useState<StockItem | null>(null);
  const [saving,     setSaving]     = useState(false);

  const [newItem, setNewItem] = useState({ name: "", category: "Sarf", unit: "adet", quantity: "", minQuantity: "5", unitPrice: "", supplier: "" });
  const [move,    setMove]    = useState({ type: "GIRIS", quantity: "", note: "" });

  useEffect(() => { fetchItems(); }, [category]);

  function fetchItems() {
    setLoading(true);
    const qs = category !== "Tümü" ? `?category=${encodeURIComponent(category)}` : "";
    fetch(`/api/stock${qs}`).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }

  async function submitNew() {
    if (!newItem.name) return;
    setSaving(true);
    await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newItem) }).catch(() => {});
    setShowNew(false);
    setNewItem({ name: "", category: "Sarf", unit: "adet", quantity: "", minQuantity: "5", unitPrice: "", supplier: "" });
    setSaving(false);
    fetchItems();
  }

  async function submitMove() {
    if (!moveItem || !move.quantity) return;
    setSaving(true);
    await fetch(`/api/stock/${moveItem.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(move) }).catch(() => {});
    setMoveItem(null);
    setMove({ type: "GIRIS", quantity: "", note: "" });
    setSaving(false);
    fetchItems();
  }

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.supplier || "").toLowerCase().includes(search.toLowerCase()));
  const lowStock  = items.filter(i => i.quantity < i.minQuantity).length;

  const inp = "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Stok Yönetimi</h1>
          <p className="mt-0.5 text-sm text-slate-500">Sarf malzeme ve ekipman takibi</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Stok Ekle
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="grad-blue rounded-2xl p-4 text-white">
          <p className="text-xs font-bold uppercase opacity-80">Toplam Kalem</p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p>
        </div>
        <div className={`rounded-2xl p-4 ${lowStock > 0 ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
          <p className="text-xs font-bold uppercase opacity-80">Kritik Stok</p>
          <p className="mt-1 text-2xl font-bold">{lowStock}</p>
        </div>
        <div className="grad-violet rounded-2xl p-4 text-white">
          <p className="text-xs font-bold uppercase opacity-80">Toplam Değer</p>
          <p className="mt-1 text-xl font-black">{CURRENCY.format(items.reduce((s, i) => s + (i.quantity * (i.unitPrice || 0)), 0))}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Malzeme veya tedarikçi ara…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${category === c ? "bg-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <svg className="h-5 w-5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p className="text-sm font-semibold text-red-700">{lowStock} ürün kritik stok seviyesinin altında!</p>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16 text-sm text-slate-400">Yükleniyor…</div>}

      {/* Table */}
      {!loading && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                {["Malzeme","Kategori","Stok","Min. Stok","Birim","Birim Fiyat","Toplam Değer","Tedarikçi","İşlem"].map(h => (
                  <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400">Stok kalemi bulunamadı</td></tr>
              )}
              {filtered.map(item => {
                const low  = item.quantity < item.minQuantity;
                const val  = item.quantity * (item.unitPrice || 0);
                return (
                  <tr key={item.id} className={`transition ${low ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{item.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-black text-lg ${low ? "text-red-600" : "text-slate-800"}`}>{item.quantity}</span>
                      <span className="ml-1 text-[11px] text-slate-400">{item.unit}</span>
                      {low && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-600">DÜŞÜK</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{item.minQuantity}</td>
                    <td className="px-4 py-3 text-slate-500">{item.unit}</td>
                    <td className="px-4 py-3 text-slate-600">{item.unitPrice ? CURRENCY.format(item.unitPrice) : "—"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{val > 0 ? CURRENCY.format(val) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.supplier || "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setMoveItem(item)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-primary hover:text-white hover:border-primary">
                        Hareket
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Item Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-black text-slate-900">Yeni Stok Kalemi</h2>
              <button onClick={() => setShowNew(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Malzeme Adı *</label>
                <input value={newItem.name} onChange={e => setNewItem(i => ({ ...i, name: e.target.value }))} className={inp + " w-full"} placeholder="Anestezi kartuşu, implant…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Kategori</label>
                  <select value={newItem.category} onChange={e => setNewItem(i => ({ ...i, category: e.target.value }))} className={inp + " w-full"}>
                    {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Birim</label>
                  <select value={newItem.unit} onChange={e => setNewItem(i => ({ ...i, unit: e.target.value }))} className={inp + " w-full"}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Başlangıç Stok</label>
                  <input type="number" value={newItem.quantity} onChange={e => setNewItem(i => ({ ...i, quantity: e.target.value }))} className={inp + " w-full"} placeholder="0" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Min. Stok</label>
                  <input type="number" value={newItem.minQuantity} onChange={e => setNewItem(i => ({ ...i, minQuantity: e.target.value }))} className={inp + " w-full"} placeholder="5" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Birim Fiyat (₺)</label>
                  <input type="number" value={newItem.unitPrice} onChange={e => setNewItem(i => ({ ...i, unitPrice: e.target.value }))} className={inp + " w-full"} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tedarikçi</label>
                <input value={newItem.supplier} onChange={e => setNewItem(i => ({ ...i, supplier: e.target.value }))} className={inp + " w-full"} placeholder="Tedarikçi firma adı" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNew(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={submitNew} disabled={saving} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "Kaydediliyor…" : "Ekle"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {moveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-black text-slate-900">Stok Hareketi</h2>
              <button onClick={() => setMoveItem(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">{moveItem.name}</p>
                <p className="text-xs text-slate-500">Mevcut: {moveItem.quantity} {moveItem.unit}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Hareket Türü</label>
                <div className="flex gap-2">
                  {["GIRIS","CIKIS"].map(t => (
                    <button key={t} onClick={() => setMove(m => ({ ...m, type: t }))} className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${move.type === t ? (t === "GIRIS" ? "bg-emerald-500 text-white" : "bg-red-500 text-white") : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {t === "GIRIS" ? "Giriş +" : "Çıkış -"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Miktar</label>
                <input type="number" value={move.quantity} onChange={e => setMove(m => ({ ...m, quantity: e.target.value }))} min="1" className={inp + " w-full"} placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Not</label>
                <input value={move.note} onChange={e => setMove(m => ({ ...m, note: e.target.value }))} className={inp + " w-full"} placeholder="Sipariş no, açıklama…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setMoveItem(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
                <button onClick={submitMove} disabled={saving} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
