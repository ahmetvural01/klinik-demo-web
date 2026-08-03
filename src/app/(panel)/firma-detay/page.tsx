"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { ProfessionalDataTable } from "@/components/ui/ProfessionalDataTable";
import { Button } from "@/components/ui/Button";
import { Modal, DIRTY_CONFIRM_MESSAGE, DIRTY_CONFIRM_CANCEL_TEXT, DIRTY_CONFIRM_CONFIRM_TEXT } from "@/components/ui/Modal";
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
  const [ekstreTipi, setEkstreTipi] = useState("");
  const [ekstreFrom, setEkstreFrom] = useState("");
  const [ekstreTo, setEkstreTo] = useState("");
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
      showToast("error", "Firma ekstresi güncellenemedi; son başarılı kayıtlar korunuyor.");
    }
  }, [id, showToast]);

  const loadKontaktler = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/firma/${id}/kontaktler`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error();
      setKontaktler(Array.isArray(d) ? d : []);
    } catch { showToast("error", "Firma iletişim bilgileri güncellenemedi."); }
  }, [id, showToast]);

  const loadStockItems = useCallback(async () => {
    try {
      const r = await fetch("/api/stock", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error();
      const rows = Array.isArray(d) ? d : [];
      setStockItems(rows);
      sessionStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(rows));
    } catch { showToast("error", "Stok seçenekleri güncellenemedi."); }
  }, [showToast]);

  const loadFirmaPurchases = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/purchases?firmaId=${id}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error();
      setFirmaPurchases(Array.isArray(d) ? d : []);
    } catch { showToast("error", "Satın alma geçmişi güncellenemedi."); }
  }, [id, showToast]);

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
  const editFirmaSnapshotRef = useRef("");
  const openEditFirma = () => {
    if (!firma) return;
    const next = {
      name: firma.name, phone: firma.phone || "", iban: firma.iban || "", ibanName: firma.ibanName || "",
      notes: firma.notes || "", kategori: firma.kategori, paymentTerms: firma.paymentTerms,
    };
    setEditForm(next);
    editFirmaSnapshotRef.current = JSON.stringify(next);
    setShowEditFirma(true);
  };
  const editFirmaDirty = showEditFirma && JSON.stringify(editForm) !== editFirmaSnapshotRef.current;
  const requestCloseEditFirma = async () => {
    if (editFirmaDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE, danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT, confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) return;
    setShowEditFirma(false);
  };
  const handleEditFirma = async () => {
    if (!firma) return;
    try {
      const r = await fetch(`/api/firma/${firma.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      if (r.ok) { setShowEditFirma(false); showToast("success", "Firma güncellendi"); await loadFirma(); }
      else { const e = await r.json().catch(() => ({})); showToast("error", e.error || "Hata oluştu"); }
    } catch {
      showToast("error", "Bağlantı hatası — firma güncellenemedi. Lütfen tekrar deneyin.");
    }
  };

  const toggleFirmaActive = async () => {
    if (!firma) return;
    const nextActive = !firma.isActive;
    const message = nextActive ? "Firma tekrar aktif edilsin mi?" : "Firma pasife alınsın mı? Pasif firmalar yeni alım/hizmet kaydında listelenmez.";
    if (!(await confirmDialog({ message, danger: !nextActive, confirmText: nextActive ? "Aktif Et" : "Pasife Al" }))) return;
    try {
      const r = await fetch(`/api/firma/${firma.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: nextActive }),
      });
      if (r.ok) { showToast("success", nextActive ? "Firma aktif edildi" : "Firma pasife alındı"); await loadFirma(); }
      else { const e = await r.json().catch(() => ({})); showToast("error", e.error || "Hata oluştu"); }
    } catch {
      showToast("error", "Bağlantı hatası — firma durumu değiştirilemedi. Lütfen tekrar deneyin.");
    }
  };

  const cancelIslem = async (iid: string) => {
    if (!firma) return;
    if (!(await confirmDialog({ message: "Bu işlemi iptal etmek istediğinizden emin misiniz?", danger: true, confirmText: "İptal Et" }))) return;
    try {
      const r = await fetch(`/api/firma/${firma.id}/islemler/${iid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IPTAL" }),
      });
      const data = await r.json().catch(() => ({}));
      showToast(r.ok ? "success" : "error", data.message || data.error || (r.ok ? "İşlem iptal edildi" : "İşlem iptal edilemedi"));
      await Promise.all([loadEkstre(), loadFirma(), loadStockItems()]);
    } catch {
      showToast("error", "Bağlantı hatası — işlem iptal edilemedi. Lütfen tekrar deneyin.");
    }
  };

  // ── Kontakt Ekle modal ────────────────────────────────────────────────────
  const [showAddKontakt, setShowAddKontakt] = useState(false);
  const [isSubmittingKontakt, setIsSubmittingKontakt] = useState(false);
  const [kontaktForm, setKontaktForm] = useState({ ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false });
  const kontaktFormDirty = Boolean(
    kontaktForm.ad.trim() || kontaktForm.unvan.trim() || kontaktForm.email.trim() || kontaktForm.telefon.trim() || kontaktForm.rol.trim() || kontaktForm.isPrimary
  );
  const requestCloseAddKontakt = async () => {
    if (kontaktFormDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE, danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT, confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) return;
    setShowAddKontakt(false);
  };
  const handleAddKontakt = async () => {
    if (!firma || !kontaktForm.ad.trim()) { showToast("error", "Kontakt adı zorunlu"); return; }
    if (isSubmittingKontakt) return;
    setIsSubmittingKontakt(true);
    try {
      const r = await fetch(`/api/firma/${firma.id}/kontaktler`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kontaktForm),
      });
      if (r.ok) {
        setShowAddKontakt(false);
        setKontaktForm({ ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false });
        showToast("success", "Kontakt eklendi");
        await loadKontaktler();
      } else {
        const e = await r.json().catch(() => ({}));
        showToast("error", e.error || "Kontakt eklenemedi");
      }
    } catch {
      showToast("error", "Bağlantı hatası — kontakt eklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsSubmittingKontakt(false);
    }
  };

  const [editingKontakt, setEditingKontakt] = useState<FirmaKontakt | null>(null);
  const [editKontaktForm, setEditKontaktForm] = useState({ ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false });
  const [isSavingKontakt, setIsSavingKontakt] = useState(false);

  const editKontaktSnapshotRef = useRef("");
  const openEditKontakt = (k: FirmaKontakt) => {
    setEditingKontakt(k);
    const next = { ad: k.ad, unvan: k.unvan || "", email: k.email || "", telefon: k.telefon || "", rol: k.rol || "", isPrimary: k.isPrimary };
    setEditKontaktForm(next);
    editKontaktSnapshotRef.current = JSON.stringify(next);
  };
  const editKontaktDirty = Boolean(editingKontakt) && JSON.stringify(editKontaktForm) !== editKontaktSnapshotRef.current;
  const requestCloseEditKontakt = async () => {
    if (editKontaktDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE, danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT, confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) return;
    setEditingKontakt(null);
  };

  const handleSaveKontakt = async () => {
    if (!firma || !editingKontakt || !editKontaktForm.ad.trim()) { showToast("error", "Kontakt adı zorunlu"); return; }
    if (isSavingKontakt) return;
    setIsSavingKontakt(true);
    try {
      const r = await fetch(`/api/firma/${firma.id}/kontaktler/${editingKontakt.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editKontaktForm),
      });
      if (r.ok) {
        setEditingKontakt(null);
        showToast("success", "Kontakt güncellendi");
        await loadKontaktler();
      } else {
        const e = await r.json().catch(() => ({}));
        showToast("error", e.error || "Kontakt güncellenemedi");
      }
    } catch {
      showToast("error", "Bağlantı hatası — kontakt güncellenemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsSavingKontakt(false);
    }
  };

  const handleDeleteKontakt = async (k: FirmaKontakt) => {
    if (!firma) return;
    if (!(await confirmDialog({ message: `${k.ad} kontaktı silinsin mi?`, danger: true, confirmText: "Sil" }))) return;
    try {
      const r = await fetch(`/api/firma/${firma.id}/kontaktler/${k.id}`, { method: "DELETE" });
      if (r.ok) {
        showToast("success", "Kontakt silindi");
        await loadKontaktler();
      } else {
        showToast("error", "Kontakt silinemedi");
      }
    } catch {
      showToast("error", "Bağlantı hatası — kontakt silinemedi. Lütfen tekrar deneyin.");
    }
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
      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">{firma.name}</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{FIRMA_KATEGORILERI[firma.kategori] || firma.kategori}</span>
              {firma.isActive ? (
                <Badge tone="success">Aktif</Badge>
              ) : (
                <Badge tone="critical">Pasif</Badge>
              )}
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
            <Button variant={firma.isActive ? "secondary" : "primary"} onClick={() => void toggleFirmaActive()}>
              {firma.isActive ? "Pasife Al" : "Aktif Et"}
            </Button>
            {isLabFirma ? (
              <Button variant="primary" href={`/lab?new=1&labName=${encodeURIComponent(firma.name)}`}>Laboratuvar İşi Oluştur</Button>
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
                <Button size="sm" variant="primary" href={`/lab?new=1&labName=${encodeURIComponent(firma.name)}`}>Laboratuvar İşi Oluştur</Button>
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
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                          {fmtDate(p.tarih)} · {p._count?.items ?? p.items?.length ?? 0} kalem
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            p.receiptStatus === "SIPARIS_VERILDI"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {p.receiptStatus === "SIPARIS_VERILDI" ? "Teslimat bekliyor" : "Teslim alındı"}
                          </span>
                        </span>
                        {p.faturaNo && <span className="block text-xs text-slate-400">Fatura: {p.faturaNo}</span>}
                      </span>
                      <span className="text-sm font-bold text-red-700">
                        {fmt(Number(
                          p.total
                          || p.firmaIslem?.tutar
                          || (p.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
                        ))}
                      </span>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-800">{k.ad}</p>
                      {k.isPrimary && <Badge tone="info">Ana Kontakt</Badge>}
                      {k.unvan && <span className="text-sm text-slate-500">{k.unvan}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditKontakt(k)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Düzenle</button>
                      <button onClick={() => void handleDeleteKontakt(k)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Sil</button>
                    </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
            <span className="text-sm font-bold text-slate-700">Hesap Ekstresi</span>
            <div className="flex flex-wrap items-center gap-2">
              <select value={ekstreTipi} onChange={e => setEkstreTipi(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-primary focus:outline-none">
                <option value="">Tüm işlem tipleri</option>
                <option value="ALIM">Alım</option>
                <option value="HIZMET">Hizmet</option>
                <option value="ODEME">Ödeme</option>
              </select>
              <input type="date" value={ekstreFrom} onChange={e => setEkstreFrom(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-primary focus:outline-none" />
              <span className="text-xs text-slate-400">—</span>
              <input type="date" value={ekstreTo} onChange={e => setEkstreTo(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-primary focus:outline-none" />
              {(ekstreTipi || ekstreFrom || ekstreTo) && (
                <button type="button" onClick={() => { setEkstreTipi(""); setEkstreFrom(""); setEkstreTo(""); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                  Temizle
                </button>
              )}
            </div>
          </div>
          {!ekstre || ekstre.islemler.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">Henüz alım, hizmet veya ödeme işlemi yok</div>
          ) : (
            (() => {
              const filteredIslemler = ekstre.islemler.filter((i) => {
                if (ekstreTipi && i.islemTipi !== ekstreTipi) return false;
                const day = i.tarih.substring(0, 10);
                if (ekstreFrom && day < ekstreFrom) return false;
                if (ekstreTo && day > ekstreTo) return false;
                return true;
              });
              return filteredIslemler.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Filtreyle eşleşen işlem yok</div>
              ) : (
                <ProfessionalDataTable data={filteredIslemler} columns={ekstreColumns} emptyText="Henüz alım, hizmet veya ödeme işlemi yok" pageSize={12} />
              );
            })()
          )}
        </div>

      {/* Modal: Firma Düzenle */}
      <Modal
        module="firma"
        open={showEditFirma}
        onClose={() => setShowEditFirma(false)}
        isDirty={editFirmaDirty}
        title="Firma Bilgilerini Düzenle"
        footer={
          <>
            <Button variant="secondary" onClick={() => void requestCloseEditFirma()}>Vazgeç</Button>
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
        module="firma"
        open={showAddKontakt}
        onClose={() => setShowAddKontakt(false)}
        isDirty={kontaktFormDirty}
        title="Kontakt Ekle"
        footer={
          <>
            <Button variant="secondary" onClick={() => void requestCloseAddKontakt()}>Vazgeç</Button>
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

      <Modal
        module="firma"
        open={Boolean(editingKontakt)}
        onClose={() => setEditingKontakt(null)}
        isDirty={editKontaktDirty}
        title="Kontaktı Düzenle"
        footer={
          <>
            <Button variant="secondary" onClick={() => void requestCloseEditKontakt()}>Vazgeç</Button>
            <Button onClick={handleSaveKontakt} loading={isSavingKontakt}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Ad Soyad" required>
            <input value={editKontaktForm.ad} onChange={e => setEditKontaktForm({ ...editKontaktForm, ad: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="Unvan">
            <input value={editKontaktForm.unvan} onChange={e => setEditKontaktForm({ ...editKontaktForm, unvan: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="Telefon">
            <input value={editKontaktForm.telefon} onChange={e => setEditKontaktForm({ ...editKontaktForm, telefon: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="E-posta">
            <input value={editKontaktForm.email} onChange={e => setEditKontaktForm({ ...editKontaktForm, email: e.target.value })} className={formInput} />
          </FormField>
          <FormField label="Rol">
            <input value={editKontaktForm.rol} onChange={e => setEditKontaktForm({ ...editKontaktForm, rol: e.target.value })} className={formInput} />
          </FormField>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={editKontaktForm.isPrimary} onChange={e => setEditKontaktForm({ ...editKontaktForm, isPrimary: e.target.checked })} />
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
