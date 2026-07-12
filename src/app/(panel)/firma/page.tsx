"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { downloadCsv } from "@/lib/csv-export";
import { useSlashFocus } from "@/lib/use-slash-focus";
import { backdropClose, useEscapeClose } from "@/lib/use-modal-dismiss";
import {
  usePurchaseModals, fmt, formLabel, formInput, modalAction,
  type StockItem,
} from "./purchase-shared";

type Toast = { type: "success" | "error" | "info"; text: string };

type FirmaKontakt = { id: string; ad: string };

type Firma = {
  id: string; name: string; phone?: string; iban?: string; ibanName?: string;
  notes?: string; kategori: string; paymentTerms: string; vendorScore: number;
  isActive: boolean; createdAt: string;
  borc: number; odenen: number; bakiye: number;
  primaryKontakt?: FirmaKontakt | null; toplamKontakt: number;
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
  const [isSubmittingFirma, setIsSubmittingFirma] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast["type"], text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchInputRef);

  const [showAddFirma, setShowAddFirma] = useState(false);
  useEscapeClose(() => setShowAddFirma(false), showAddFirma);
  const [firmaForm, setFirmaForm] = useState({
    name: "", phone: "", iban: "", ibanName: "", notes: "",
    kategori: "TEDARICI", paymentTerms: "NET_30"
  });

  const loadFirmas = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/firma", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.message || "Tedarikçi verileri yüklenemedi.");
      const rows = Array.isArray(d) ? d : [];
      setFirmas(rows);
      sessionStorage.setItem(FIRMA_CACHE_KEY, JSON.stringify(rows));
    } catch (error) {
      setFirmas([]);
      showToast("error", error instanceof Error ? error.message : "Tedarikçi verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadStockItems = useCallback(async () => {
    try {
      const r = await fetch("/api/stock", { cache: "no-store" });
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

  const refreshAll = useCallback(() => {
    void loadFirmas();
    void loadStockItems();
  }, [loadFirmas, loadStockItems]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshAll, 150);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [refreshAll]);

  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshAll();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refreshAll]);

  const materialPurchaseFirmas = firmas.filter((firma) => firma.kategori !== "LAB");
  const purchaseManager = usePurchaseModals({
    stockItems, firmas: materialPurchaseFirmas, showToast,
    onChanged: async () => { await Promise.all([loadFirmas(), loadStockItems()]); },
  });

  // KPI
  const topBorc = firmas.reduce((s, f) => s + f.borc, 0);
  const topOdeme = firmas.reduce((s, f) => s + f.odenen, 0);
  const topBakiye = firmas.reduce((s, f) => s + f.bakiye, 0);
  const filteredFirmas = firmas.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) ||
    FIRMA_KATEGORILERI[f.kategori]?.toLowerCase().includes(search.toLowerCase())
  );

  const exportFirmasCsv = () => {
    downloadCsv(`tedarikci-cari-${new Date().toISOString().slice(0, 10)}.csv`, filteredFirmas.map((f) => ({
      Firma: f.name,
      Kategori: FIRMA_KATEGORILERI[f.kategori] || f.kategori,
      Telefon: f.phone || "",
      IBAN: f.iban || "",
      "IBAN Adı": f.ibanName || "",
      "Toplam Borç": f.borc,
      "Toplam Ödenen": f.odenen,
      "Net Bakiye": f.bakiye,
      "Ana Kontakt": f.primaryKontakt?.ad || "",
      "Kontakt Sayısı": f.toplamKontakt,
      Notlar: f.notes || "",
    })));
    showToast("success", `${filteredFirmas.length} tedarikçi CSV olarak dışa aktarıldı`);
  };

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
      await loadFirmas();
    } else {
      const e = await r.json();
      showToast("error", e.error || "Hata oluştu");
    }
    setIsSubmittingFirma(false);
  };

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition ${
          toast.type === "success" ? "bg-emerald-500" : toast.type === "error" ? "bg-red-500" : "bg-blue-500"
        }`}>
          {toast.text}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">Satın Alma & Tedarikçiler</h1>
            <p className="mt-0.5 text-xs text-slate-500">Firmalar, laboratuvarlar ve cari bakiye takibi.</p>
          </div>
          <button onClick={() => purchaseManager.openAddPurchase()} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800">
            Malzeme Alımı Kaydet
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Firma veya tedarikçi ara ( / )" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={() => setShowAddFirma(true)}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
            + Yeni Firma
          </button>
          <button onClick={exportFirmasCsv} disabled={filteredFirmas.length === 0}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            CSV
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{firmas.length} firma</span>
          <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">Borç {fmt(topBorc)}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Ödenen {fmt(topOdeme)}</span>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Kalan {fmt(topBakiye)}</span>
        </div>
      </div>

          {loading && filteredFirmas.length === 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <TableRowsSkeleton rows={6} columns={7} />
                </tbody>
              </table>
            </div>
          ) : filteredFirmas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-500">Firma bulunamadı</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Firma</th>
                      <th className="px-3 py-3">Tür</th>
                      <th className="px-3 py-3">İletişim</th>
                      <th className="px-3 py-3 text-right">Borç</th>
                      <th className="px-3 py-3 text-right">Ödenen</th>
                      <th className="px-3 py-3 text-right">Kalan</th>
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFirmas.map(f => (
                        <tr key={f.id} className="transition hover:bg-slate-50">
                          <td className="max-w-[280px] px-3 py-3">
                            <Link href={`/firma-detay?id=${f.id}`} className="block truncate font-black text-slate-900 hover:text-primary">{f.name}</Link>
                            {f.notes && <p className="mt-0.5 truncate text-xs text-slate-400">{f.notes}</p>}
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{FIRMA_KATEGORILERI[f.kategori] || f.kategori}</span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">
                            <div>{f.phone || "-"}</div>
                            {f.primaryKontakt?.ad ? <div className="mt-0.5 truncate">{f.primaryKontakt.ad}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-700">{fmt(f.borc)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-emerald-700">{fmt(f.odenen)}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="font-black text-slate-900">{fmt(f.bakiye)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <Link href={`/firma-detay?id=${f.id}`}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Detay</Link>
                              {f.kategori === "LAB" ? (
                                <Link href={`/lab?new=1&labName=${encodeURIComponent(f.name)}`}
                                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Lab İşi</Link>
                              ) : (
                                <button onClick={() => purchaseManager.openAddPurchase(f.id)}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">Alım</button>
                              )}
                            </div>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      {/* Modal: Firma Ekle */}
      {showAddFirma && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdropClose(() => setShowAddFirma(false))}>
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
              <div>
                <label className={formLabel}>Firma Türü *</label>
                <select
                  value={firmaForm.kategori}
                  onChange={(e) => setFirmaForm({ ...firmaForm, kategori: e.target.value })}
                  className={formInput}
                >
                  {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
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

      {purchaseManager.modals}
    </div>
  );
}
