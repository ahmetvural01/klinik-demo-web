"use client";
import { useState, useEffect, useCallback } from "react";

type Category = { id: string; name: string; isActive: boolean };
type Expense = {
  id: string; tarih: string; category: string; categoryId?: string;
  description?: string; tutar: number; yontem: string;
  faturaNo?: string; kdvOrani: number; status: string;
  expenseCategory?: { id: string; name: string };
};

const YONTEMLER: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı",
  HAVALE_EFT: "Havale/EFT", MAIL_ORDER: "Mail Order", DIGER: "Diğer"
};

const fmt = (n: number) =>
  "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("tr-TR");

export default function GiderPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text }); setTimeout(() => setToast(null), 3500);
  };

  // Filtreler
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [catFilter, setCatFilter] = useState("");

  // Modal
  const [showAdd, setShowAdd] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);

  // Form
  const [form, setForm] = useState({
    tarih: new Date().toISOString().split("T")[0],
    categoryId: "", category: "",
    description: "", tutar: "", yontem: "NAKIT",
    faturaNo: "", kdvOrani: "0"
  });
  const [newCatName, setNewCatName] = useState("");

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (catFilter) params.set("categoryId", catFilter);
      const r = await fetch(`/api/gider?${params}`);
      const d = await r.json();
      setExpenses(d.expenses || []);
      setTotal(d.total || 0);
    } finally { setLoading(false); }
  }, [from, to, catFilter]);

  const loadCategories = useCallback(async () => {
    const r = await fetch("/api/gider-kategorileri");
    const d = await r.json();
    setCategories(d);
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  // KPI per category
  const byCategory = expenses.reduce((acc: Record<string, number>, e) => {
    const cat = e.category || "Diger";
    acc[cat] = (acc[cat] || 0) + Number(e.tutar);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!form.tarih || !form.tutar || (!form.category && !form.categoryId)) {
      showToast("error", "Tarih, kategori ve tutar zorunlu"); return;
    }
    const cat = form.categoryId
      ? categories.find(c => c.id === form.categoryId)?.name || form.category
      : form.category;

    const r = await fetch("/api/gider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tarih: form.tarih, categoryId: form.categoryId || null,
        category: cat, description: form.description || null,
        tutar: Number(form.tutar), yontem: form.yontem,
        faturaNo: form.faturaNo || null, kdvOrani: Number(form.kdvOrani)
      })
    });
    if (r.ok) {
      setShowAdd(false);
      setForm({ tarih: new Date().toISOString().split("T")[0], categoryId: "", category: "", description: "", tutar: "", yontem: "NAKIT", faturaNo: "", kdvOrani: "0" });
      showToast("success", "Gider kaydedildi");
      loadExpenses();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata");
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Bu gideri silmek istediğinizden emin misiniz?")) return;
    await fetch(`/api/gider/${id}`, { method: "DELETE" });
    showToast("success", "Gider silindi");
    loadExpenses();
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await fetch("/api/gider-kategorileri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim() })
    });
    setNewCatName("");
    loadCategories();
  };

  const toggleCategory = async (id: string, isActive: boolean) => {
    await fetch(`/api/gider-kategorileri/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive })
    });
    loadCategories();
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>{toast.type === "success" ? "✓" : "✕"} {toast.text}</div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Gider Takip</h1>
          <p className="mt-0.5 text-sm text-slate-500">Klinik giderlerini kategorilere göre takip edin</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCatMgr(true)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Kategoriler
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Gider Ekle
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-2xl bg-red-600 p-4 text-white">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">Dönem Toplam Gider</p>
          <p className="mt-1 text-3xl font-black">{fmt(total)}</p>
        </div>
        {Object.entries(byCategory).slice(0, 2).map(([cat, amt]) => (
          <div key={cat} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="truncate text-[11px] font-medium uppercase text-slate-500">{cat}</p>
            <p className="mt-1 text-xl font-black text-red-700">{fmt(amt)}</p>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-semibold text-slate-500">Başlangıç:</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-semibold text-slate-500">Bitiş:</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-primary focus:bg-white focus:outline-none">
          <option value="">Tüm Kategoriler</option>
          {categories.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Tablo */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5 text-left">Tarih</th>
              <th className="px-3 py-2.5 text-left">Kategori</th>
              <th className="px-3 py-2.5 text-left">Açıklama</th>
              <th className="px-3 py-2.5 text-left">Yöntem</th>
              <th className="px-3 py-2.5 text-left">Fatura No</th>
              <th className="px-3 py-2.5 text-center">KDV %</th>
              <th className="px-3 py-2.5 text-right">Tutar</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-slate-400">Yükleniyor…</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-slate-400">Bu dönem için gider bulunamadı</td></tr>
            ) : (
              expenses.map(e => (
                <tr key={e.id} className="border-b border-slate-50 transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(e.tarih)}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{e.category}</span>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-500">{e.description || "—"}</td>
                  <td className="px-3 py-2.5">{YONTEMLER[e.yontem] || e.yontem}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.faturaNo || "—"}</td>
                  <td className="px-3 py-2.5 text-center">{e.kdvOrani}%</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-red-700">{fmt(Number(e.tutar))}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => handleCancel(e.id)}
                      className="rounded px-2 py-0.5 text-[10px] text-red-400 transition hover:bg-red-50 hover:text-red-600">Sil</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              <tr className="bg-red-50 border-t-2 border-red-200">
                <td colSpan={6} className="px-3 py-2 text-xs font-bold text-slate-600">TOPLAM</td>
                <td className="px-3 py-2 text-right font-bold text-red-700 text-sm">{fmt(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal: Gider Ekle */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-slate-900">Yeni Gider Ekle</h3>
              <p className="mt-0.5 text-xs text-slate-500">Gider bilgilerini doldurun</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Tarih *</label>
                <input type="date" value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Kategori *</label>
                <select value={form.categoryId} onChange={e => {
                  const cat = categories.find(c => c.id === e.target.value);
                  setForm({ ...form, categoryId: e.target.value, category: cat?.name || "" });
                }}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none">
                  <option value="">-- Kategori Seçin --</option>
                  {categories.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value="__manual">Manuel Gir…</option>
                </select>
                {form.categoryId === "__manual" && (
                  <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                    placeholder="Kategori adı girin" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none" />
                )}
              </div>

              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Açıklama</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Tutar (₺) *</label>
                <input type="number" value={form.tutar} onChange={e => setForm({ ...form, tutar: e.target.value })}
                  placeholder="0.00" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Ödeme Yöntemi</label>
                <select value={form.yontem} onChange={e => setForm({ ...form, yontem: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none">
                  {Object.entries(YONTEMLER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Fatura No</label>
                <input value={form.faturaNo} onChange={e => setForm({ ...form, faturaNo: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">KDV Oranı (%)</label>
                <select value={form.kdvOrani} onChange={e => setForm({ ...form, kdvOrani: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none">
                  <option value="0">%0 (KDV Yok)</option>
                  <option value="10">%10</option>
                  <option value="20">%20</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Vazgeç
              </button>
              <button onClick={handleAdd}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">
                Gider Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Kategori Yönetimi */}
      {showCatMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-slate-900">Gider Kategorileri</h3>
              <p className="mt-0.5 text-xs text-slate-500">Kategori ekleyin veya devre dışı bırakın</p>
            </div>

            <div className="flex gap-2">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                placeholder="Yeni kategori adı…" className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none" />
              <button onClick={handleAddCategory}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700">
                Ekle
              </button>
            </div>

            <div className="max-h-60 space-y-1.5 overflow-y-auto">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className={`text-sm ${c.isActive ? "text-slate-700" : "text-slate-400 line-through"}`}>{c.name}</span>
                  <button onClick={() => toggleCategory(c.id, c.isActive)}
                    className={`text-xs font-semibold ${c.isActive ? "text-red-500 hover:text-red-700" : "text-emerald-600 hover:text-emerald-800"}`}>
                    {c.isActive ? "Devre Dışı" : "Aktif Et"}
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => setShowCatMgr(false)}
              className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
