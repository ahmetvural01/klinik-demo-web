"use client";
import { useState, useEffect, useCallback } from "react";

type Toast = { type: "success" | "error" | "info"; text: string };

type Firma = {
  id: string; name: string; phone?: string; iban?: string; ibanName?: string;
  notes?: string; isActive: boolean; createdAt: string;
  borc: number; odenen: number; bakiye: number;
};
type Islem = {
  id: string; firmaId: string; tarih: string; islemTipi: string;
  urunHizmet?: string; aciklama?: string; tutar: number;
  faturaNo?: string; yontem?: string; kdvOrani: number;
  status: string; cumBakiye?: number;
};
type Ekstre = { islemler: Islem[]; topBorc: number; topOdeme: number; netBakiye: number };
type StockItem = { id: string; name: string; category: string; unit: string; quantity: number };

const ISLEM_TIPI: Record<string, string> = { ALIM: "Alım", HIZMET: "Hizmet", ODEME: "Ödeme" };
const YONTEMLER: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı",
  HAVALE_EFT: "Havale/EFT", MAIL_ORDER: "Mail Order", DIGER: "Diğer"
};
const TIPI_COLOR: Record<string, string> = {
  ALIM: "bg-red-100 text-red-700",
  HIZMET: "bg-amber-100 text-amber-700",
  ODEME: "bg-emerald-100 text-emerald-700"
};
const fmt = (n: number) =>
  "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("tr-TR");

export default function FirmaPage() {
  const [firmas, setFirmas] = useState<Firma[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selected, setSelected] = useState<Firma | null>(null);
  const [ekstre, setEkstre] = useState<Ekstre | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingEkstre, setLoadingEkstre] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = (type: Toast["type"], text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const [search, setSearch] = useState("");

  // Modals
  const [showAddFirma, setShowAddFirma] = useState(false);
  const [showAddIslem, setShowAddIslem] = useState(false);
  const [showEditFirma, setShowEditFirma] = useState(false);

  // Forms
  const [firmaForm, setFirmaForm] = useState({
    name: "", phone: "", iban: "", ibanName: "", notes: ""
  });
  const [islemForm, setIslemForm] = useState({
    tarih: new Date().toISOString().split("T")[0],
    islemTipi: "ALIM", urunHizmet: "", aciklama: "", tutar: "",
    faturaNo: "", yontem: "NAKIT", kdvOrani: "0", stockItemId: "", stockQuantity: ""
  });
  const [editForm, setEditForm] = useState({ name: "", phone: "", iban: "", ibanName: "", notes: "" });

  const loadFirmas = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/firma");
      const d = await r.json();
      setFirmas(d);
    } finally { setLoading(false); }
  }, []);

  const loadStockItems = useCallback(async () => {
    try {
      const r = await fetch("/api/stock");
      const d = await r.json();
      setStockItems(Array.isArray(d) ? d : []);
    } catch {
      setStockItems([]);
    }
  }, []);

  const loadEkstre = useCallback(async (id: string) => {
    setLoadingEkstre(true);
    try {
      const r = await fetch(`/api/firma/${id}/islemler`);
      const d = await r.json();
      setEkstre(d);
    } finally { setLoadingEkstre(false); }
  }, []);

  useEffect(() => { loadFirmas(); loadStockItems(); }, [loadFirmas, loadStockItems]);

  const selectFirma = (f: Firma) => {
    setSelected(f);
    loadEkstre(f.id);
  };

  // KPI
  const topBorc = firmas.reduce((s, f) => s + f.borc, 0);
  const topOdeme = firmas.reduce((s, f) => s + f.odenen, 0);
  const topBakiye = firmas.reduce((s, f) => s + f.bakiye, 0);

  const filteredFirmas = firmas.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddFirma = async () => {
    if (!firmaForm.name) { showToast("error", "Firma adı zorunludur"); return; }
    const r = await fetch("/api/firma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(firmaForm)
    });
    if (r.ok) {
      setShowAddFirma(false);
      setFirmaForm({ name: "", phone: "", iban: "", ibanName: "", notes: "" });
      showToast("success", "Firma eklendi");
      loadFirmas();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata oluştu");
    }
  };

  const handleAddIslem = async () => {
    if (!selected || !islemForm.tarih || !islemForm.islemTipi || !islemForm.tutar) {
      showToast("error", "Zorunlu alanlar eksik"); return;
    }
    if (islemForm.islemTipi === "ALIM" && islemForm.stockItemId && !islemForm.stockQuantity) {
      showToast("error", "Stok kalemine işlenecek miktarı girin"); return;
    }
    const r = await fetch(`/api/firma/${selected.id}/islemler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tarih: islemForm.tarih, islemTipi: islemForm.islemTipi,
        urunHizmet: islemForm.urunHizmet || null, aciklama: islemForm.aciklama || null,
        tutar: Number(islemForm.tutar), faturaNo: islemForm.faturaNo || null,
        yontem: islemForm.yontem || null, kdvOrani: Number(islemForm.kdvOrani),
        stockItemId: islemForm.stockItemId || null,
        stockQuantity: islemForm.stockQuantity ? Number(islemForm.stockQuantity) : null,
      })
    });
    const data = await r.json();
    if (r.ok) {
      setShowAddIslem(false);
      setIslemForm({ tarih: new Date().toISOString().split("T")[0], islemTipi: "ALIM", urunHizmet: "", aciklama: "", tutar: "", faturaNo: "", yontem: "NAKIT", kdvOrani: "0", stockItemId: "", stockQuantity: "" });
      showToast("success", data.message || "İşlem eklendi");
      loadEkstre(selected.id);
      loadFirmas();
      loadStockItems();
    } else {
      showToast("error", data.error || "Hata oluştu");
    }
  };

  const handleEditFirma = async () => {
    if (!selected) return;
    const r = await fetch(`/api/firma/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm)
    });
    if (r.ok) {
      setShowEditFirma(false);
      showToast("success", "Firma güncellendi");
      loadFirmas();
    } else {
      const e = await r.json(); showToast("error", e.error || "Hata oluştu");
    }
  };

  const cancelIslem = async (iid: string) => {
    if (!selected || !confirm("Bu islemi iptal etmek istediginizden emin misiniz?")) return;
    const r = await fetch(`/api/firma/${selected.id}/islemler/${iid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IPTAL" })
    });
    const data = await r.json();
    showToast(r.ok ? "success" : "error", data.message || data.error || (r.ok ? "İşlem iptal edildi" : "İşlem iptal edilemedi"));
    loadEkstre(selected.id);
    loadFirmas();
    loadStockItems();
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition ${
          toast.type === "success" ? "bg-emerald-500" : toast.type === "error" ? "bg-red-500" : "bg-blue-500"
        }`}>
          {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"} {toast.text}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Firma / Tedarikçi</h1>
          <p className="mt-0.5 text-sm text-slate-500">Tedarikçi cari hesap ve ekstre yönetimi</p>
        </div>
        <button onClick={() => setShowAddFirma(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Yeni Firma
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Toplam Borç", value: fmt(topBorc), color: "text-red-700", bg: "bg-red-50" },
          { label: "Ödenen", value: fmt(topOdeme), color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Net Bakiye", value: fmt(topBakiye), color: "text-amber-700", bg: "bg-amber-50" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3 border border-slate-100`}>
            <p className="text-[10px] text-slate-500 font-medium uppercase">{k.label}</p>
            <p className={`text-xl font-bold ${k.color} mt-0.5`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-700">Entegre Tedarik Akışı</p>
            <h2 className="mt-1 text-sm font-bold text-slate-900">Tek işlemle cari, stok ve muhasebe birlikte güncellenir</h2>
            <p className="mt-1 text-xs text-slate-600">
              Alım işlemleri seçili stok kalemine otomatik giriş yapabilir. Hizmet ve ödeme işlemleri muhasebe giderlerine otomatik yansıtılır.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-600 sm:grid-cols-3">
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">Alım → Firma borcu + stok girişi</div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">Hizmet → Firma borcu + gider</div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">Ödeme → Firma bakiyesi + gider kaydı</div>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sol: Firma listesi */}
        <div className="w-64 shrink-0 space-y-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Firma ara..." className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />

          {loading ? (
            <div className="text-center py-4 text-slate-400 text-xs">Yükleniyor...</div>
          ) : filteredFirmas.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-xs">Firma bulunamadı</div>
          ) : (
            filteredFirmas.map(f => (
              <div key={f.id}
                onClick={() => selectFirma(f)}
                className={`cursor-pointer rounded-xl border p-3 transition-all ${selected?.id === f.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <p className="text-xs font-semibold text-slate-800 truncate">{f.name}</p>
                {f.phone && <p className="text-[10px] text-slate-500 mt-0.5">{f.phone}</p>}
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-red-600 font-semibold">{fmt(f.bakiye)}</span>
                  <span className="text-[10px] text-slate-400">bakiye</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sag: Ekstre */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
              Sol taraftan bir firma seçin
            </div>
          ) : (
            <div className="space-y-3">
              {/* Firma bilgisi */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">{selected.name}</h2>
                    <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 mt-1">
                      {selected.phone && <span>Tel: {selected.phone}</span>}
                      {selected.iban && <span>IBAN: {selected.iban} {selected.ibanName && `(${selected.ibanName})`}</span>}
                    </div>
                    {selected.notes && <p className="text-[10px] text-slate-400 mt-1 italic">{selected.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditForm({ name: selected.name, phone: selected.phone || "", iban: selected.iban || "", ibanName: selected.ibanName || "", notes: selected.notes || "" }); setShowEditFirma(true); }}
                      className="border border-slate-200 text-slate-600 text-xs px-2.5 py-1 rounded-lg hover:bg-slate-50">Düzenle</button>
                    <button onClick={() => setShowAddIslem(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-2.5 py-1 rounded-lg">+ İşlem Ekle</button>
                  </div>
                </div>

                {/* Ozet kartlar */}
                {ekstre && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: "Toplam Borç", val: fmt(ekstre.topBorc), color: "text-red-700" },
                      { label: "Ödenen", val: fmt(ekstre.topOdeme), color: "text-emerald-700" },
                      { label: "Net Kalan", val: fmt(ekstre.netBakiye), color: "text-amber-700" },
                    ].map(k => (
                      <div key={k.label} className="bg-slate-50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-slate-400 uppercase">{k.label}</p>
                        <p className={`text-xs font-bold ${k.color}`}>{k.val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ekstre tablosu */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-600">Hesap Ekstresi</span>
                </div>
                {loadingEkstre ? (
                  <div className="text-center py-6 text-slate-400 text-xs">Yükleniyor...</div>
                ) : !ekstre || ekstre.islemler.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">Henüz işlem yok</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100">
                        <th className="text-left px-3 py-2">Tarih</th>
                        <th className="text-left px-3 py-2">Tip</th>
                        <th className="text-left px-3 py-2">Ürün/Hizmet</th>
                        <th className="text-left px-3 py-2">Fatura</th>
                        <th className="text-right px-3 py-2">Tutar</th>
                        <th className="text-right px-3 py-2">Bakiye</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ekstre.islemler.map(i => (
                        <tr key={i.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(i.tarih)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${TIPI_COLOR[i.islemTipi]}`}>
                              {ISLEM_TIPI[i.islemTipi]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">
                            {i.urunHizmet || i.aciklama || "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-400">{i.faturaNo || "-"}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${i.islemTipi === "ODEME" ? "text-emerald-700" : "text-red-700"}`}>
                            {i.islemTipi === "ODEME" ? "-" : ""}{fmt(Number(i.tutar))}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-600">
                            {fmt(i.cumBakiye || 0)}
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => cancelIslem(i.id)}
                              className="text-[10px] text-red-400 hover:text-red-600">İptal</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Firma Ekle */}
      {showAddFirma && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-700">Yeni Firma Ekle</h3>
            {[
              { key: "name", label: "Firma Adı *", placeholder: "" },
              { key: "phone", label: "Telefon", placeholder: "" },
              { key: "iban", label: "IBAN", placeholder: "TR00 0000 ..." },
              { key: "ibanName", label: "IBAN Hesap Sahibi", placeholder: "" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">{f.label}</label>
                <input value={(firmaForm as Record<string, string>)[f.key]}
                  onChange={e => setFirmaForm({ ...firmaForm, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            ))}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Notlar</label>
              <textarea value={firmaForm.notes} onChange={e => setFirmaForm({ ...firmaForm, notes: e.target.value })}
                rows={2} className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddFirma(false)}
                className="flex-1 border border-slate-200 text-slate-600 text-xs py-2 rounded-lg">Vazgeç</button>
              <button onClick={handleAddFirma}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Firma Duzenle */}
      {showEditFirma && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-700">Firma Düzenle</h3>
            {[
              { key: "name", label: "Firma Adı *" },
              { key: "phone", label: "Telefon" },
              { key: "iban", label: "IBAN" },
              { key: "ibanName", label: "IBAN Hesap Sahibi" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">{f.label}</label>
                <input value={(editForm as Record<string, string>)[f.key]}
                  onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            ))}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Notlar</label>
              <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2} className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowEditFirma(false)}
                className="flex-1 border border-slate-200 text-slate-600 text-xs py-2 rounded-lg">Vazgeç</button>
              <button onClick={handleEditFirma}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg">Güncelle</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Islem Ekle */}
      {showAddIslem && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-700">İşlem Ekle — {selected.name}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Tarih *</label>
                <input type="date" value={islemForm.tarih} onChange={e => setIslemForm({ ...islemForm, tarih: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">İşlem Tipi *</label>
                <select value={islemForm.islemTipi} onChange={e => setIslemForm({ ...islemForm, islemTipi: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="ALIM">Alım</option>
                  <option value="HIZMET">Hizmet</option>
                  <option value="ODEME">Ödeme (Firmaya Yapılan)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Ürün / Hizmet Adı</label>
                <input value={islemForm.urunHizmet} onChange={e => setIslemForm({ ...islemForm, urunHizmet: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {islemForm.islemTipi === "ALIM" && (
                <>
                  <div className="col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
                    Stoklu bir malzeme alıyorsanız seçili stok kalemine giriş otomatik işlenir. Böylece ayrı stok hareketi açmanıza gerek kalmaz.
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">Stok Kalemine İşle</label>
                    <select
                      value={islemForm.stockItemId}
                      onChange={e => setIslemForm({ ...islemForm, stockItemId: e.target.value, stockQuantity: e.target.value ? islemForm.stockQuantity : "" })}
                      className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">Bağlama</option>
                      {stockItems.map(item => (
                        <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">Stok Giriş Miktarı</label>
                    <input
                      type="number"
                      min="1"
                      value={islemForm.stockQuantity}
                      onChange={e => setIslemForm({ ...islemForm, stockQuantity: e.target.value })}
                      disabled={!islemForm.stockItemId}
                      className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100"
                    />
                  </div>
                </>
              )}
              {(islemForm.islemTipi === "HIZMET" || islemForm.islemTipi === "ODEME") && (
                <div className="col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                  Bu işlem kaydedildiğinde muhasebe gider kaydı otomatik oluşur. Böylece firma ekranı ile gider ekranı arasında ikinci bir manuel giriş gerekmez.
                </div>
              )}
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Açıklama</label>
                <input value={islemForm.aciklama} onChange={e => setIslemForm({ ...islemForm, aciklama: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Tutar (₺) *</label>
                <input type="number" value={islemForm.tutar} onChange={e => setIslemForm({ ...islemForm, tutar: e.target.value })}
                  placeholder="0.00" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Fatura No</label>
                <input value={islemForm.faturaNo} onChange={e => setIslemForm({ ...islemForm, faturaNo: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {islemForm.islemTipi === "ODEME" && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Ödeme Yöntemi</label>
                  <select value={islemForm.yontem} onChange={e => setIslemForm({ ...islemForm, yontem: e.target.value })}
                    className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {Object.entries(YONTEMLER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase">KDV Orani (%)</label>
                <select value={islemForm.kdvOrani} onChange={e => setIslemForm({ ...islemForm, kdvOrani: e.target.value })}
                  className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="0">%0</option>
                  <option value="10">%10</option>
                  <option value="20">%20</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddIslem(false)}
                className="flex-1 border border-slate-200 text-slate-600 text-xs py-2 rounded-lg">Vazgeç</button>
              <button onClick={handleAddIslem}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
