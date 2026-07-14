"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Eye, Plus, Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { useSlashFocus } from "@/lib/use-slash-focus";
import { showToastSafe } from "@/lib/toast-client";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormField, inputErrorClass } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import {
  usePurchaseModals, fmt,
  type StockItem,
} from "./purchase-shared";

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

  const showToast = useCallback((type: "success" | "error" | "info", text: string) => {
    showToastSafe({ message: text, type });
  }, []);

  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchInputRef);

  const [showAddFirma, setShowAddFirma] = useState(false);
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

  const firmaColumns: ListTableColumn<Firma>[] = [
    {
      key: "name",
      header: "Firma",
      cellClassName: "max-w-[280px]",
      render: (f) => (
        <>
          <Link href={`/firma-detay?id=${f.id}`} className="block truncate font-black text-slate-900 hover:text-primary">{f.name}</Link>
          {f.notes && <p className="mt-0.5 truncate text-xs text-slate-400">{f.notes}</p>}
        </>
      ),
    },
    {
      key: "kategori",
      header: "Tür",
      render: (f) => <Badge tone="neutral">{FIRMA_KATEGORILERI[f.kategori] || f.kategori}</Badge>,
    },
    {
      key: "iletisim",
      header: "İletişim",
      render: (f) => (
        <div className="text-xs text-slate-500">
          <div>{f.phone || "-"}</div>
          {f.primaryKontakt?.ad ? <div className="mt-0.5 truncate">{f.primaryKontakt.ad}</div> : null}
        </div>
      ),
    },
    { key: "borc", header: "Borç", align: "right", render: (f) => <span className="font-semibold text-slate-700">{fmt(f.borc)}</span> },
    { key: "odenen", header: "Ödenen", align: "right", render: (f) => <span className="font-semibold text-emerald-700">{fmt(f.odenen)}</span> },
    { key: "bakiye", header: "Kalan", align: "right", render: (f) => <span className="font-black text-slate-900">{fmt(f.bakiye)}</span> },
    {
      key: "islem",
      header: "İşlem",
      align: "right",
      render: (f) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} title="Detay" href={`/firma-detay?id=${f.id}`} />
          {f.kategori === "LAB" ? (
            <Button variant="secondary" size="sm" href={`/lab?new=1&labName=${encodeURIComponent(f.name)}`}>Lab Siparişi Oluştur</Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => purchaseManager.openAddPurchase(f.id)}>Alım</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">Satın Alma</h1>
          </div>
          <Button variant="secondary" onClick={() => purchaseManager.openAddPurchase()}>
            Satın Alma Kaydet
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Firma veya tedarikçi ara ( / )" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          <Button icon={Plus} onClick={() => setShowAddFirma(true)}>
            Yeni Firma
          </Button>
          <Button variant="secondary" icon={Download} onClick={exportFirmasCsv} disabled={filteredFirmas.length === 0}>
            CSV
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
          <span>{filteredFirmas.length}/{firmas.length} firma</span>
          <span>Borç {fmt(topBorc)}</span>
          <span>Ödenen {fmt(topOdeme)}</span>
          <span className={topBakiye > 0 ? "text-red-700" : "text-emerald-700"}>Kalan {fmt(topBakiye)}</span>
        </div>
      </div>

      <ListTable<Firma>
        columns={firmaColumns}
        rows={filteredFirmas}
        rowKey={(f) => f.id}
        loading={loading}
        emptyText="Firma bulunamadı"
      />

      <Modal
        open={showAddFirma}
        onClose={() => setShowAddFirma(false)}
        title="Yeni Firma Ekle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddFirma(false)}>Vazgeç</Button>
            <Button onClick={handleAddFirma} loading={isSubmittingFirma}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Firma Adı" required>
            <input value={firmaForm.name}
              onChange={e => setFirmaForm({ ...firmaForm, name: e.target.value })}
              className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(false)}`} />
          </FormField>
          <FormField label="Telefon">
            <input value={firmaForm.phone}
              onChange={e => setFirmaForm({ ...firmaForm, phone: e.target.value })}
              className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(false)}`} />
          </FormField>
          <FormField label="IBAN">
            <input value={firmaForm.iban}
              onChange={e => setFirmaForm({ ...firmaForm, iban: e.target.value })}
              placeholder="TR00 0000 ..."
              className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(false)}`} />
          </FormField>
          <FormField label="IBAN Hesap Sahibi">
            <input value={firmaForm.ibanName}
              onChange={e => setFirmaForm({ ...firmaForm, ibanName: e.target.value })}
              className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(false)}`} />
          </FormField>
          <FormField label="Firma Türü" required>
            <select
              value={firmaForm.kategori}
              onChange={(e) => setFirmaForm({ ...firmaForm, kategori: e.target.value })}
              className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(false)}`}
            >
              {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Notlar">
            <textarea value={firmaForm.notes} onChange={e => setFirmaForm({ ...firmaForm, notes: e.target.value })}
              rows={3} className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${inputErrorClass(false)}`} />
          </FormField>
        </div>
      </Modal>

      {purchaseManager.modals}
    </div>
  );
}
