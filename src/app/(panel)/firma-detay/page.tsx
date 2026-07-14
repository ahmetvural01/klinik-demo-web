"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { ProfessionalDataTable } from "@/components/ui/ProfessionalDataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import {
  usePurchaseModals, fmt, fmtDate, formInput,
  type StockItem, type Purchase,
} from "../firma/purchase-shared";

type FirmaKontakt = {
  id: string; ad: string; unvan?: string; email?: string; telefon?: string;
  rol?: string; isPrimary: boolean; isActive: boolean;
};

type Firma = {
  id: string; name: string; phone?: string; iban?: string; ibanName?: string;
  notes?: string; kategori: string; paymentTerms: string; vendorScore: number;
  isActive: boolean; createdAt: string;
  borc: number; odenen: number; bakiye: number;
  toplamKontakt: number;
};

type Islem = {
  id: string; firmaId: string; tarih: string; islemTipi: string;
  urunHizmet?: string; aciklama?: string; tutar: number;
  faturaNo?: string; yontem?: string; kdvOrani: number;
  status: string; cumBakiye?: number;
};

type Ekstre = { islemler: Islem[]; topBorc: number; topOdeme: number; netBakiye: number };

const STOCK_CACHE_KEY = "stock:list:v1";

const FIRMA_KATEGORILERI: Record<string, string> = {
  TEDARICI: "Tedarikçi", HIZMET_SAGLAYICI: "Hizmet Sağlayıcı", LAB: "Laboratuvar",
  KONTRAKTOR: "Yüklenici", BANK: "Banka", DIGER: "Diğer"
};
const ISLEM_TIPI: Record<string, string> = { ALIM: "Alım", HIZMET: "Hizmet", ODEME: "Ödeme" };
const YONTEMLER: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", HAVALE_EFT: "Havale/EFT", MAIL_ORDER: "Mail Order", DIGER: "Diğer"
};
const TIPI_TONE: Record<string, "critical" | "warning" | "success"> = {
  ALIM: "critical", HIZMET: "warning", ODEME: "success"
};

function FirmaDetayContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";

  const [firma, setFirma] = useState<Firma | null>(null);
  const [ekstre, setEkstre] = useState<Ekstre | null>(null);
  const [kontaktler, setKontaktler] = useState<FirmaKontakt[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(STOCK_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [firmaPurchases, setFirmaPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", text: string) => {
    showToastSafe({ message: text, type });
  }, []);

  const loadFirma = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const r = await fetch("/api/firma", { cache: "no-store" });
      const d = await r.json();
      const rows: Firma[] = Array.isArray(d) ? d : [];
      const found = rows.find(f => f.id === id) || null;
      setFirma(found);
      if (!found) setLoadError("Firma bulunamadı");
    } catch {
      setLoadError("Firma yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadEkstre = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/firma/${id}/islemler`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message);
      setEkstre(d);
    } catch {
      setEkstre({ islemler: [], topBorc: 0, topOdeme: 0, netBakiye: 0 });
    }
  }, [id]);

  const loadKontaktler = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/firma/${id}/kontaktler`, { cache: "no-store" });
      const d = await r.json();
      setKontaktler(Array.isArray(d) ? d : []);
    } catch { setKontaktler([]); }
  }, [id]);

  const loadStockItems = useCallback(async () => {
    try {
      const r = await fetch("/api/stock", { cache: "no-store" });
      const d = await r.json();
      const rows = Array.isArray(d) ? d : [];
      setStockItems(rows);
      sessionStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(rows));
    } catch { setStockItems([]); }
  }, []);

  const loadFirmaPurchases = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/purchases?firmaId=${id}`, { cache: "no-store" });
      const d = await r.json();
      setFirmaPurchases(Array.isArray(d) ? d : []);
    } catch { setFirmaPurchases([]); }
  }, [id]);

  const refreshAll = useCallback(() => {
    void loadFirma(); void loadEkstre(); void loadKontaktler(); void loadStockItems(); void loadFirmaPurchases();
  }, [loadFirma, loadEkstre, loadKontaktler, loadStockItems, loadFirmaPurchases]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => { if (timer) clearTimeout(timer); timer = setTimeout(refreshAll, 150); };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("ks:realtime-sync", onRealtime); };
  }, [refreshAll]);

  const isLabFirma = firma?.kategori === "LAB";

  const purchaseManager = usePurchaseModals({
    stockItems,
    firmas: firma && !isLabFirma ? [{ id: firma.id, name: firma.name }] : [],
    showToast,
    currentFirmaId: firma?.id,
    onChanged: async () => { await refreshAll(); },
  });

  // ── Firma Düzenle modal ───────────────────────────────────────────────────
  const [showEditFirma, setShowEditFirma] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", phone: "", iban: "", ibanName: "", notes: "", kategori: "TEDARICI", paymentTerms: "NET_30"
  });
  const openEditFirma = () => {
    if (!firma) return;
    setEditForm({
      name: firma.name, phone: firma.phone || "", iban: firma.iban || "", ibanName: firma.ibanName || "",
      notes: firma.notes || "", kategori: firma.kategori, paymentTerms: firma.paymentTerms,
    });
    setShowEditFirma(true);
  };
  const handleEditFirma = async () => {
    if (!firma) return;
    const r = await fetch(`/api/firma/${firma.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
    });
    if (r.ok) { setShowEditFirma(false); showToast("success", "Firma güncellendi"); await loadFirma(); }
    else { const e = await r.json(); showToast("error", e.error || "Hata oluştu"); }
  };

  // ── Hizmet/Ödeme Ekle modal ───────────────────────────────────────────────
  const [showAddIslem, setShowAddIslem] = useState(false);
  const [isSubmittingIslem, setIsSubmittingIslem] = useState(false);
  const [islemForm, setIslemForm] = useState({
    tarih: new Date().toISOString().split("T")[0], islemTipi: "HIZMET", urunHizmet: "", aciklama: "",
    tutar: "", faturaNo: "", yontem: "NAKIT", kdvOrani: "0"
  });
  const openAddIslem = () => {
    setIslemForm((current) => ({
      ...current,
      islemTipi: isLabFirma ? "ODEME" : current.islemTipi,
      urunHizmet: isLabFirma ? "" : current.urunHizmet,
    }));
    setShowAddIslem(true);
  };
  const handleAddIslem = async () => {
    if (!firma || !islemForm.tarih || !islemForm.islemTipi || !islemForm.tutar) { showToast("error", "Zorunlu alanlar eksik"); return; }
    if (isSubmittingIslem) return;
    setIsSubmittingIslem(true);
    const r = await fetch(`/api/firma/${firma.id}/islemler`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tarih: islemForm.tarih, islemTipi: islemForm.islemTipi,
        urunHizmet: islemForm.urunHizmet || null, aciklama: islemForm.aciklama || null,
        tutar: Number(islemForm.tutar), faturaNo: islemForm.faturaNo || null,
        yontem: islemForm.yontem || null, kdvOrani: Number(islemForm.kdvOrani),
      }),
    });
    const data = await r.json();
    if (r.ok) {
      setShowAddIslem(false);
      setIslemForm({ tarih: new Date().toISOString().split("T")[0], islemTipi: "HIZMET", urunHizmet: "", aciklama: "", tutar: "", faturaNo: "", yontem: "NAKIT", kdvOrani: "0" });
      showToast("success", data.message || "İşlem eklendi");
      await Promise.all([loadEkstre(), loadFirma()]);
    } else {
      showToast("error", data.error || "Hata oluştu");
    }
    setIsSubmittingIslem(false);
  };
  const cancelIslem = async (iid: string) => {
    if (!firma) return;
    if (!(await confirmDialog({ message: "Bu işlemi iptal etmek istediğinizden emin misiniz?", danger: true, confirmText: "İptal Et" }))) return;
    const r = await fetch(`/api/firma/${firma.id}/islemler/${iid}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IPTAL" }),
    });
    const data = await r.json();
    showToast(r.ok ? "success" : "error", data.message || data.error || (r.ok ? "İşlem iptal edildi" : "İşlem iptal edilemedi"));
    await Promise.all([loadEkstre(), loadFirma(), loadStockItems()]);
  };

  // ── Kontakt Ekle modal ────────────────────────────────────────────────────
  const [showAddKontakt, setShowAddKontakt] = useState(false);
  const [isSubmittingKontakt, setIsSubmittingKontakt] = useState(false);
  const [kontaktForm, setKontaktForm] = useState({ ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false });
  const handleAddKontakt = async () => {
    if (!firma || !kontaktForm.ad.trim()) { showToast("error", "Kontakt adı zorunlu"); return; }
    if (isSubmittingKontakt) return;
    setIsSubmittingKontakt(true);
    const r = await fetch(`/api/firma/${firma.id}/kontaktler`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kontaktForm),
    });
    if (r.ok) {
      setShowAddKontakt(false);
      setKontaktForm({ ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false });
      showToast("success", "Kontakt eklendi");
      await loadKontaktler();
    } else {
      const e = await r.json();
      showToast("error", e.error || "Kontakt eklenemedi");
    }
    setIsSubmittingKontakt(false);
  };

  const purchaseByIslemId = new Map(firmaPurchases.map(p => [p.firmaIslemId, p]));

  const ekstreColumns: ColumnDef<Islem, unknown>[] = [
    { accessorKey: "tarih", header: "Tarih", cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.tarih)}</span> },
    {
      accessorKey: "islemTipi", header: "Tip",
      cell: ({ row }) => <Badge tone={TIPI_TONE[row.original.islemTipi]}>{ISLEM_TIPI[row.original.islemTipi]}</Badge>,
    },
    {
      id: "detail", accessorFn: (item) => item.urunHizmet || item.aciklama || "", header: "Ürün/Hizmet",
      cell: ({ row }) => <span className="block max-w-[180px] truncate text-slate-600">{row.original.urunHizmet || row.original.aciklama || "-"}</span>,
    },
    { accessorKey: "faturaNo", header: "Fatura", cell: ({ row }) => <span className="text-slate-400">{row.original.faturaNo || "-"}</span> },
    {
      accessorKey: "tutar", header: "Tutar",
      cell: ({ row }) => (
        <span className={`block text-right font-semibold ${row.original.islemTipi === "ODEME" ? "text-emerald-700" : "text-red-700"}`}>
          {row.original.islemTipi === "ODEME" ? "-" : ""}{fmt(Number(row.original.tutar))}
        </span>
      ),
    },
    { accessorKey: "cumBakiye", header: "Bakiye", cell: ({ row }) => <span className="block text-right font-semibold text-slate-600">{fmt(row.original.cumBakiye || 0)}</span> },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => {
        const purchase = purchaseByIslemId.get(row.original.id);
        if (purchase) {
          return (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="secondary" onClick={() => purchaseManager.openPurchaseDetail(purchase.id)}>Detay</Button>
              <Button size="sm" variant="secondary" onClick={() => purchaseManager.openPurchaseEdit(purchase.id)}>Düzenle</Button>
              <Button size="sm" variant="danger" onClick={() => purchaseManager.cancelPurchase(purchase.id, purchase.firmaId)}>İptal</Button>
            </div>
          );
        }
        return <Button size="sm" variant="danger" onClick={() => cancelIslem(row.original.id)}>İptal</Button>;
      },
    },
  ];

  if (loading) return (
    <section className="space-y-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="h-20 animate-pulse rounded-lg bg-slate-50" />
        <div className="h-20 animate-pulse rounded-lg bg-slate-50" />
        <div className="h-20 animate-pulse rounded-lg bg-slate-50" />
        <div className="h-20 animate-pulse rounded-lg bg-slate-50" />
      </div>
      <div className="h-56 animate-pulse rounded-lg bg-slate-50" />
    </section>
  );

  if (!firma) return (
    <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <p>{loadError || "Firma bulunamadı"}. <Link href="/firma" className="text-primary underline">Geri Dön</Link></p>
    </section>
  );

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">{firma.name}</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{FIRMA_KATEGORILERI[firma.kategori] || firma.kategori}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {firma.phone && <span>Tel: {firma.phone}</span>}
              {firma.iban && <span>IBAN: {firma.iban}{firma.ibanName ? ` (${firma.ibanName})` : ""}</span>}
            </div>
            {firma.notes && <p className="mt-2 text-sm italic text-slate-500">{firma.notes}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" href="/firma">Tedarikçi Listesi</Button>
            <Button variant="secondary" onClick={openEditFirma}>Düzenle</Button>
            {isLabFirma ? (
              <Button variant="primary" href={`/lab?new=1&labName=${encodeURIComponent(firma.name)}`}>Lab Siparişi Oluştur</Button>
            ) : (
              <Button variant="danger" onClick={() => purchaseManager.openAddPurchase(firma.id)}>Malzeme Alımı</Button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase text-slate-500">Toplam Borç</p>
            <p className="mt-1 text-lg font-black text-red-700">{fmt(firma.borc)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase text-slate-500">Ödenen</p>
            <p className="mt-1 text-lg font-black text-emerald-700">{fmt(firma.odenen)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase text-slate-500">Net Kalan</p>
            <p className="mt-1 text-lg font-black text-amber-700">{fmt(firma.bakiye)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-slate-900">Firma Bilgileri</h3>
            <dl className="space-y-2 text-sm">
              {[
                ["Firma Adı", firma.name],
                ["Kategori", FIRMA_KATEGORILERI[firma.kategori] || firma.kategori],
                ["Telefon", firma.phone || "-"],
                ["IBAN", firma.iban || "-"],
                ["IBAN Hesap Sahibi", firma.ibanName || "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-50 pb-1.5">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {isLabFirma ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Laboratuvar İşleri</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Bu firma laboratuvar olarak çalışır. Malzeme siparişi açılmaz; lab işi ve faturası Laboratuvar ekranından kaydedilir, tutarlar aşağıdaki hesap ekstresine hizmet borcu olarak düşer.
                  </p>
                </div>
                <Button size="sm" variant="primary" href={`/lab?new=1&labName=${encodeURIComponent(firma.name)}`}>Lab Siparişi Oluştur</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900">Satın Alımlar</h3>
                <Button size="sm" variant="danger" onClick={() => purchaseManager.openAddPurchase(firma.id)}>Yeni Satın Alma</Button>
              </div>
              {firmaPurchases.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Henüz satın alma kaydı yok</p>
              ) : (
                <div className="space-y-2">
                  {firmaPurchases.map(p => (
                    <button key={p.id} onClick={() => purchaseManager.openPurchaseDetail(p.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50">
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">{fmtDate(p.tarih)} · {p._count?.items ?? p.items?.length ?? 0} kalem</span>
                        {p.faturaNo && <span className="block text-xs text-slate-400">Fatura: {p.faturaNo}</span>}
                      </span>
                      <span className="text-sm font-bold text-red-700">{fmt(Number(p.firmaIslem?.tutar || 0))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Kontaklar</h3>
            <Button size="sm" onClick={() => setShowAddKontakt(true)}>Kontakt Ekle</Button>
          </div>
          {kontaktler.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">Henüz kontakt eklenmemiş</div>
          ) : (
            <div className="space-y-2">
              {kontaktler.map(k => (
                <div key={k.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-800">{k.ad}</p>
                    {k.isPrimary && <Badge tone="info">Ana Kontakt</Badge>}
                    {k.unvan && <span className="text-sm text-slate-500">{k.unvan}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {k.telefon && <span>Tel: {k.telefon}</span>}
                    {k.email && <span>E-posta: {k.email}</span>}
                    {k.rol && <span>Rol: {k.rol}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
            <span className="text-sm font-bold text-slate-700">Hesap Ekstresi</span>
          </div>
          {!ekstre || ekstre.islemler.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">Henüz alım, hizmet veya ödeme işlemi yok</div>
          ) : (
            <ProfessionalDataTable data={ekstre.islemler} columns={ekstreColumns} emptyText="Henüz alım, hizmet veya ödeme işlemi yok" pageSize={12} />
          )}
        </div>

      {/* Modal: Firma Düzenle */}
      <Modal
        open={showEditFirma}
        onClose={() => setShowEditFirma(false)}
        title="Firma Bilgilerini Düzenle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditFirma(false)}>Vazgeç</Button>
            <Button onClick={handleEditFirma}>Güncelle</Button>
          </>
        }
      >
        <div className="space-y-4">
          {[
            { key: "name", label: "Firma Adı", required: true }, { key: "phone", label: "Telefon" },
            { key: "iban", label: "IBAN" }, { key: "ibanName", label: "IBAN Hesap Sahibi" },
          ].map(f => (
            <FormField key={f.key} label={f.label} required={f.required}>
              <input value={(editForm as Record<string, string>)[f.key]} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} className={formInput} />
            </FormField>
          ))}
          <FormField label="Firma Türü" required>
            <select value={editForm.kategori} onChange={e => setEditForm({ ...editForm, kategori: e.target.value })} className={formInput}>
              {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Notlar">
            <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={3} className={formInput} />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={showAddIslem}
        onClose={() => setShowAddIslem(false)}
        title={isLabFirma ? "Firma Ödemesi Ekle" : "Hizmet veya Ödeme Ekle"}
        description={
          isLabFirma
            ? `${firma.name} laboratuvar faturaları Laboratuvar ekranından oluşur. Burada firmaya yapılan ödeme kaydedilir.`
            : `${firma.name} için cari ve gider kaydı birlikte güncellenir. Malzeme/ürün alımı için "Malzeme Alımı" butonunu kullanın.`
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddIslem(false)}>Vazgeç</Button>
            <Button onClick={handleAddIslem} loading={isSubmittingIslem}>Kaydet</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Tarih" required>
            <input type="date" value={islemForm.tarih} onChange={e => setIslemForm({ ...islemForm, tarih: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="İşlem Tipi" required>
            <select value={islemForm.islemTipi} onChange={e => setIslemForm({ ...islemForm, islemTipi: e.target.value })} className={formInput}>
              {!isLabFirma && <option value="HIZMET">Hizmet Alımı</option>}
              <option value="ODEME">Firmaya Ödeme</option>
            </select>
          </FormField>
          {!isLabFirma && (
            <div className="sm:col-span-2">
              <FormField label="Ürün veya Hizmet Adı">
                <input value={islemForm.urunHizmet} onChange={e => setIslemForm({ ...islemForm, urunHizmet: e.target.value })} className={formInput} />
              </FormField>
            </div>
          )}
          {(islemForm.islemTipi === "HIZMET" || islemForm.islemTipi === "ODEME") && (
            <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {isLabFirma ? "Ödeme kaydedildiğinde laboratuvar firmasının cari bakiyesi güncellenir." : "Bu işlem kaydedildiğinde muhasebe gider kaydı otomatik oluşur."}
            </div>
          )}
          <div className="sm:col-span-2">
            <FormField label="Açıklama">
              <input value={islemForm.aciklama} onChange={e => setIslemForm({ ...islemForm, aciklama: e.target.value })} className={formInput} />
            </FormField>
          </div>
          <FormField label="Tutar (₺)" required>
            <input type="number" value={islemForm.tutar} onChange={e => setIslemForm({ ...islemForm, tutar: e.target.value })} placeholder="0.00" className={formInput} />
          </FormField>
          <FormField label="Fatura No">
            <input value={islemForm.faturaNo} onChange={e => setIslemForm({ ...islemForm, faturaNo: e.target.value })} className={formInput} />
          </FormField>
          {islemForm.islemTipi === "ODEME" && (
            <FormField label="Ödeme Yöntemi">
              <select value={islemForm.yontem} onChange={e => setIslemForm({ ...islemForm, yontem: e.target.value })} className={formInput}>
                {Object.entries(YONTEMLER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
          )}
          <FormField label="KDV Oranı (%)">
            <select value={islemForm.kdvOrani} onChange={e => setIslemForm({ ...islemForm, kdvOrani: e.target.value })} className={formInput}>
              <option value="0">%0</option><option value="10">%10</option><option value="20">%20</option>
            </select>
          </FormField>
        </div>
      </Modal>

      <Modal
        open={showAddKontakt}
        onClose={() => setShowAddKontakt(false)}
        title="Kontakt Ekle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddKontakt(false)}>Vazgeç</Button>
            <Button onClick={handleAddKontakt} loading={isSubmittingKontakt}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Ad Soyad" required>
            <input value={kontaktForm.ad} onChange={e => setKontaktForm({ ...kontaktForm, ad: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="Unvan">
            <input value={kontaktForm.unvan} onChange={e => setKontaktForm({ ...kontaktForm, unvan: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="Telefon">
            <input value={kontaktForm.telefon} onChange={e => setKontaktForm({ ...kontaktForm, telefon: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="E-posta">
            <input value={kontaktForm.email} onChange={e => setKontaktForm({ ...kontaktForm, email: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="Rol">
            <input value={kontaktForm.rol} onChange={e => setKontaktForm({ ...kontaktForm, rol: e.target.value })} className={formInput} />
          </FormField>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={kontaktForm.isPrimary} onChange={e => setKontaktForm({ ...kontaktForm, isPrimary: e.target.checked })} />
            Ana kontakt olarak işaretle
          </label>
        </div>
      </Modal>

      {purchaseManager.modals}
    </section>
  );
}

export default function FirmaDetayPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Yükleniyor…</div>}>
      <FirmaDetayContent />
    </Suspense>
  );
}
