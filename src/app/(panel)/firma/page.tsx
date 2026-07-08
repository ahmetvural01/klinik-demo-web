"use client";
import { useState, useEffect, useCallback } from "react";

type Toast = { type: "success" | "error" | "info"; text: string };

type FirmaKontakt = {
  id: string; ad: string; unvan?: string; email?: string; telefon?: string;
  rol?: string; isPrimary: boolean; isActive: boolean;
};

type Firma = {
  id: string; name: string; phone?: string; iban?: string; ibanName?: string;
  notes?: string; kategori: string; paymentTerms: string; vendorScore: number;
  isActive: boolean; createdAt: string;
  borc: number; odenen: number; bakiye: number;
  primaryKontakt?: FirmaKontakt | null; toplamKontakt: number;
};

type Islem = {
  id: string; firmaId: string; tarih: string; islemTipi: string;
  urunHizmet?: string; aciklama?: string; tutar: number;
  faturaNo?: string; yontem?: string; kdvOrani: number;
  status: string; cumBakiye?: number;
};

type Ekstre = { islemler: Islem[]; topBorc: number; topOdeme: number; netBakiye: number };

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
};

const FIRMA_CACHE_KEY = "firma:list:v1";
const STOCK_CACHE_KEY = "stock:list:v1";

const FIRMA_KATEGORILERI: Record<string, string> = {
  TEDARICI: "Tedarikçi",
  HIZMET_SAGLAYICI: "Hizmet Sağlayıcı",
  LAB: "Laboratuvar",
  KONTRAKTOR: "Yüklenici",
  BANK: "Banka",
  DIGER: "Diğer"
};

const PAYMENT_TERMS: Record<string, { label: string; days: number }> = {
  COD: { label: "Nakit Ödeme", days: 0 },
  NET_15: { label: "Net 15", days: 15 },
  NET_30: { label: "Net 30", days: 30 },
  NET_60: { label: "Net 60", days: 60 },
  NET_90: { label: "Net 90", days: 90 },
  EOM: { label: "Ay Sonu", days: 30 }
};

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

const SCORE_COLOR = (score: number): string => {
  if (score >= 80) return "text-emerald-700 bg-emerald-50";
  if (score >= 60) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
};

const renderScore = (s: number) => {
  const filled = Math.round(s / 20);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
};

const fmt = (n: number) =>
  "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("tr-TR");
const formLabel = "mb-1.5 block text-sm font-semibold text-slate-700";
const formInput = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100";
const modalAction = "flex-1 rounded-xl px-4 py-3 text-sm font-bold transition";

export default function FirmaPage() {
  const [firmas, setFirmas] = useState<Firma[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(FIRMA_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState<Firma | null>(null);
  const [ekstre, setEkstre] = useState<Ekstre | null>(null);
  const [kontaktler, setKontaktler] = useState<FirmaKontakt[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(STOCK_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [loadingEkstre, setLoadingEkstre] = useState(false);
  const [isSubmittingFirma, setIsSubmittingFirma] = useState(false);
  const [isSubmittingIslem, setIsSubmittingIslem] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedTab, setSelectedTab] = useState<"ekstre" | "kontakt">("ekstre");

  const showToast = (type: Toast["type"], text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const [search, setSearch] = useState("");

  // Modals
  const [showAddFirma, setShowAddFirma] = useState(false);
  const [showAddIslem, setShowAddIslem] = useState(false);
  const [showEditFirma, setShowEditFirma] = useState(false);
  const [showAddKontakt, setShowAddKontakt] = useState(false);

  // Forms
  const [firmaForm, setFirmaForm] = useState({
    name: "", phone: "", iban: "", ibanName: "", notes: "",
    kategori: "TEDARICI", paymentTerms: "NET_30"
  });

  const [islemForm, setIslemForm] = useState({
    tarih: new Date().toISOString().split("T")[0],
    islemTipi: "ALIM", urunHizmet: "", aciklama: "", tutar: "",
    faturaNo: "", yontem: "NAKIT", kdvOrani: "0", stockItemId: "", stockQuantity: ""
  });

  const [editForm, setEditForm] = useState({
    name: "", phone: "", iban: "", ibanName: "", notes: "",
    kategori: "TEDARICI", paymentTerms: "NET_30"
  });

  const [kontaktForm, setKontaktForm] = useState({
    ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false
  });

  const loadFirmas = useCallback(async () => {
    try {
      const r = await fetch("/api/firma");
      const d = await r.json();
      const rows = Array.isArray(d) ? d : [];
      setFirmas(rows);
      sessionStorage.setItem(FIRMA_CACHE_KEY, JSON.stringify(rows));
    } catch {
      setFirmas([]);
    }
  }, []);

  const loadEkstre = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/firma/${id}/islemler`);
      const d = await r.json();
      setEkstre(d);
    } catch {
      setEkstre({ islemler: [], topBorc: 0, topOdeme: 0, netBakiye: 0 });
    } finally { setLoadingEkstre(false); }
  }, []);

  const loadKontaktler = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/firma/${id}/kontaktler`);
      const d = await r.json();
      setKontaktler(Array.isArray(d) ? d : []);
    } catch {
      setKontaktler([]);
    }
  }, []);

  const loadStockItems = useCallback(async () => {
    try {
      const r = await fetch("/api/stock");
      const d = await r.json();
      const rows = Array.isArray(d) ? d : [];
      setStockItems(rows);
      sessionStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(rows));
    } catch {
      setStockItems([]);
    }
  }, []);

  useEffect(() => {
    loadFirmas();
    loadStockItems();
  }, [loadFirmas, loadStockItems]);

  const selectFirma = (f: Firma) => {
    setSelected(f);
    loadEkstre(f.id);
    loadKontaktler(f.id);
    setSelectedTab("ekstre");
  };

  // KPI
  const topBorc = firmas.reduce((s, f) => s + f.borc, 0);
  const topOdeme = firmas.reduce((s, f) => s + f.odenen, 0);
  const topBakiye = firmas.reduce((s, f) => s + f.bakiye, 0);
  const avgScore = firmas.length > 0 ? Math.round(firmas.reduce((s, f) => s + f.vendorScore, 0) / firmas.length) : 0;

  const filteredFirmas = firmas.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) ||
    FIRMA_KATEGORILERI[f.kategori]?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddFirma = async () => {
    if (!firmaForm.name) { showToast("error", "Firma adı zorunludur"); return; }
    if (isSubmittingFirma) return;
    setIsSubmittingFirma(true);
    const r = await fetch("/api/firma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(firmaForm)
    });
    if (r.ok) {
      setShowAddFirma(false);
      setFirmaForm({
        name: "", phone: "", iban: "", ibanName: "", notes: "",
        kategori: "TEDARICI", paymentTerms: "NET_30"
      });
      showToast("success", "Firma eklendi");
      loadFirmas();
    } else {
      const e = await r.json();
      showToast("error", e.error || "Hata oluştu");
    }
    setIsSubmittingFirma(false);
  };

  const handleAddIslem = async () => {
    if (!selected || !islemForm.tarih || !islemForm.islemTipi || !islemForm.tutar) {
      showToast("error", "Zorunlu alanlar eksik"); return;
    }
    if (isSubmittingIslem) return;
    if (islemForm.islemTipi === "ALIM" && islemForm.stockItemId && !islemForm.stockQuantity) {
      showToast("error", "Stok kalemine işlenecek miktarı girin"); return;
    }
    setIsSubmittingIslem(true);
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
    setIsSubmittingIslem(false);
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
          {toast.text}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Tedarikçiler</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{firmas.length} firma</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">{fmt(topBakiye)} kalan</span>
        </div>
        <button onClick={() => setShowAddFirma(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Yeni Firma
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Toplam Borç", value: fmt(topBorc), color: "text-red-700", bg: "bg-red-50" },
          { label: "Ödenen", value: fmt(topOdeme), color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Net Bakiye", value: fmt(topBakiye), color: "text-amber-700", bg: "bg-amber-50" },
          { label: "Ort. Skor", value: avgScore.toString(), color: "text-blue-700", bg: "bg-blue-50" }
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3 border border-slate-100`}>
            <p className="text-xs font-semibold uppercase text-slate-500">{k.label}</p>
            <p className={`text-lg font-bold ${k.color} mt-0.5`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase text-blue-700">Entegre Tedarik Akışı</p>
            <h2 className="mt-1 text-base font-bold text-slate-900">Tek işlemle cari, stok ve muhasebe birlikte güncellenir</h2>
            <p className="mt-1 text-sm text-slate-600">
              Alım işlemleri seçili stok kalemine otomatik giriş yapabilir. Hizmet ve ödeme işlemleri muhasebe giderlerine otomatik yansıtılır.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 font-semibold">Alım: borç ve stok girişi</div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 font-semibold">Hizmet: borç ve gider</div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 font-semibold">Ödeme: bakiye ve kasa takibi</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sol: Firma listesi */}
        <div className="space-y-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Firma veya tedarikçi ara" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />

          {filteredFirmas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-sm text-slate-500">Firma bulunamadı</div>
          ) : (
            filteredFirmas.map(f => (
              <div key={f.id}
                onClick={() => selectFirma(f)}
                className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${selected?.id === f.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{f.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{FIRMA_KATEGORILERI[f.kategori]}</p>
                    <p className={`mt-1 text-sm font-semibold ${f.vendorScore >= 80 ? "text-emerald-700" : f.vendorScore >= 60 ? "text-amber-700" : "text-red-700"}`}>
                      {renderScore(f.vendorScore)} {f.vendorScore}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-700">{fmt(f.bakiye)}</p>
                    <p className="text-xs text-slate-500">kalan</p>
                  </div>
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
                    <h2 className="text-lg font-bold text-slate-900">{selected.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                      {selected.phone && <span>Tel: {selected.phone}</span>}
                      {selected.iban && <span>IBAN: {selected.iban} {selected.ibanName && `(${selected.ibanName})`}</span>}
                    </div>
                    {selected.notes && <p className="mt-2 text-sm italic text-slate-500">{selected.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditForm({ name: selected.name, phone: selected.phone || "", iban: selected.iban || "", ibanName: selected.ibanName || "", notes: selected.notes || "", kategori: selected.kategori, paymentTerms: selected.paymentTerms }); setShowEditFirma(true); }}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Düzenle</button>
                    <button onClick={() => setShowAddIslem(true)}
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Alım veya Ödeme Ekle</button>
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
                        <p className="text-xs font-semibold uppercase text-slate-500">{k.label}</p>
                        <p className={`text-sm font-bold ${k.color}`}>{k.val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ekstre tablosu */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-sm font-bold text-slate-700">Hesap Ekstresi</span>
                </div>
                {!ekstre || ekstre.islemler.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">Henüz alım, hizmet veya ödeme işlemi yok</div>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
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
                            <span className={`rounded px-2 py-1 text-xs font-semibold ${TIPI_COLOR[i.islemTipi]}`}>
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
                              className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-700">İptal</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Firma Ekle */}
      {showAddFirma && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-xl font-black text-slate-900">Yeni Firma Ekle</h3>
            {[
              { key: "name", label: "Firma Adı *", placeholder: "" },
              { key: "phone", label: "Telefon", placeholder: "" },
              { key: "iban", label: "IBAN", placeholder: "TR00 0000 ..." },
              { key: "ibanName", label: "IBAN Hesap Sahibi", placeholder: "" },
            ].map(f => (
              <div key={f.key}>
                <label className={formLabel}>{f.label}</label>
                <input value={(firmaForm as Record<string, string>)[f.key]}
                  onChange={e => setFirmaForm({ ...firmaForm, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className={formInput} />
              </div>
            ))}
            <div>
              <label className={formLabel}>Notlar</label>
              <textarea value={firmaForm.notes} onChange={e => setFirmaForm({ ...firmaForm, notes: e.target.value })}
                rows={3} className={formInput} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddFirma(false)}
                className={`${modalAction} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Vazgeç</button>
              <button onClick={handleAddFirma}
                disabled={isSubmittingFirma}
                className={`${modalAction} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60`}>{isSubmittingFirma ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Firma Duzenle */}
      {showEditFirma && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-xl font-black text-slate-900">Firma Bilgilerini Düzenle</h3>
            {[
              { key: "name", label: "Firma Adı *" },
              { key: "phone", label: "Telefon" },
              { key: "iban", label: "IBAN" },
              { key: "ibanName", label: "IBAN Hesap Sahibi" },
            ].map(f => (
              <div key={f.key}>
                <label className={formLabel}>{f.label}</label>
                <input value={(editForm as Record<string, string>)[f.key]}
                  onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  className={formInput} />
              </div>
            ))}
            <div>
              <label className={formLabel}>Notlar</label>
              <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3} className={formInput} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowEditFirma(false)}
                className={`${modalAction} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Vazgeç</button>
              <button onClick={handleEditFirma}
                className={`${modalAction} bg-blue-600 text-white hover:bg-blue-700`}>Güncelle</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Islem Ekle */}
      {showAddIslem && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">Alım veya Ödeme Ekle</h3>
              <p className="mt-1 text-sm text-slate-500">{selected.name} için cari, stok ve gider kaydı birlikte güncellenir.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabel}>Tarih *</label>
                <input type="date" value={islemForm.tarih} onChange={e => setIslemForm({ ...islemForm, tarih: e.target.value })}
                  className={formInput} />
              </div>
              <div>
                <label className={formLabel}>İşlem Tipi *</label>
                <select value={islemForm.islemTipi} onChange={e => setIslemForm({ ...islemForm, islemTipi: e.target.value })}
                  className={formInput}>
                  <option value="ALIM">Malzeme Alımı</option>
                  <option value="HIZMET">Hizmet Alımı</option>
                  <option value="ODEME">Firmaya Ödeme</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel}>Ürün veya Hizmet Adı</label>
                <input value={islemForm.urunHizmet} onChange={e => setIslemForm({ ...islemForm, urunHizmet: e.target.value })}
                  className={formInput} />
              </div>
              {islemForm.islemTipi === "ALIM" && (
                <>
                  <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
                    Stoklu bir malzeme alıyorsanız seçili stok kalemine giriş otomatik işlenir. Böylece ayrı stok hareketi açmanıza gerek kalmaz.
                  </div>
                  <div>
                    <label className={formLabel}>Stok Kalemine İşle</label>
                    <select
                      value={islemForm.stockItemId}
                      onChange={e => setIslemForm({ ...islemForm, stockItemId: e.target.value, stockQuantity: e.target.value ? islemForm.stockQuantity : "" })}
                      className={formInput}
                    >
                      <option value="">Stokla bağlantı kurma</option>
                      {stockItems.map(item => (
                        <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={formLabel}>Stok Giriş Miktarı</label>
                    <input
                      type="number"
                      min="1"
                      value={islemForm.stockQuantity}
                      onChange={e => setIslemForm({ ...islemForm, stockQuantity: e.target.value })}
                      disabled={!islemForm.stockItemId}
                      className={formInput}
                    />
                  </div>
                </>
              )}
              {(islemForm.islemTipi === "HIZMET" || islemForm.islemTipi === "ODEME") && (
                <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Bu işlem kaydedildiğinde muhasebe gider kaydı otomatik oluşur. Böylece firma ekranı ile gider ekranı arasında ikinci bir manuel giriş gerekmez.
                </div>
              )}
              <div className="sm:col-span-2">
                <label className={formLabel}>Açıklama</label>
                <input value={islemForm.aciklama} onChange={e => setIslemForm({ ...islemForm, aciklama: e.target.value })}
                  className={formInput} />
              </div>
              <div>
                <label className={formLabel}>Tutar (₺) *</label>
                <input type="number" value={islemForm.tutar} onChange={e => setIslemForm({ ...islemForm, tutar: e.target.value })}
                  placeholder="0.00" className={formInput} />
              </div>
              <div>
                <label className={formLabel}>Fatura No</label>
                <input value={islemForm.faturaNo} onChange={e => setIslemForm({ ...islemForm, faturaNo: e.target.value })}
                  className={formInput} />
              </div>
              {islemForm.islemTipi === "ODEME" && (
                <div>
                  <label className={formLabel}>Ödeme Yöntemi</label>
                  <select value={islemForm.yontem} onChange={e => setIslemForm({ ...islemForm, yontem: e.target.value })}
                    className={formInput}>
                    {Object.entries(YONTEMLER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={formLabel}>KDV Oranı (%)</label>
                <select value={islemForm.kdvOrani} onChange={e => setIslemForm({ ...islemForm, kdvOrani: e.target.value })}
                  className={formInput}>
                  <option value="0">%0</option>
                  <option value="10">%10</option>
                  <option value="20">%20</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddIslem(false)}
                className={`${modalAction} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Vazgeç</button>
              <button onClick={handleAddIslem}
                disabled={isSubmittingIslem}
                className={`${modalAction} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60`}>{isSubmittingIslem ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
