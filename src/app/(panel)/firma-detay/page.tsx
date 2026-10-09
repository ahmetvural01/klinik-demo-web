"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Eye, FlaskConical, Pencil, Plus, ShoppingCart, Trash2, Wallet, XCircle } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency, formatPhoneNumber } from "@/lib/format";
import { stripSystemTags } from "@/lib/format-text";
import { Button, IconButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { DateText, Money } from "@/components/ui/Money";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { paymentMethodLabel } from "@/components/firma/FirmaPaymentModal";
import { FIRMA_KATEGORILERI, telHref } from "@/components/firma/firma-shared";
import {
  usePurchaseModals, summarizeLines,
  type StockItem, type Purchase,
} from "../firma/purchase-shared";

type FirmaKontakt = {
  id: string; ad: string; unvan?: string | null; email?: string | null; telefon?: string | null;
  rol?: string | null; isPrimary: boolean; isActive: boolean;
};

type Firma = {
  id: string; name: string; phone?: string | null; iban?: string | null; ibanName?: string | null;
  notes?: string | null; kategori: string; paymentTerms?: string | null;
  isActive: boolean; createdAt: string;
  borc: number; odenen: number; bakiye: number;
  kontaktler?: FirmaKontakt[];
};

type Islem = {
  id: string; firmaId: string; tarih: string; islemTipi: "ALIM" | "HIZMET" | "ODEME";
  urunHizmet?: string | null; aciklama?: string | null; tutar: number | string;
  faturaNo?: string | null; yontem?: string | null; kdvOrani: number;
  status: string; cumBakiye?: number;
  sourceType?: string | null; sourceId?: string | null;
  purchase?: { id: string; items: { productName: string; quantity: number; unit: string }[] } | null;
};

type Ekstre = { islemler: Islem[]; topBorc: number; topOdeme: number; netBakiye: number };

const ISLEM_TIPI: Record<Islem["islemTipi"], { label: string; tone: "neutral" | "success" }> = {
  ALIM: { label: "Alım", tone: "neutral" },
  HIZMET: { label: "Hizmet", tone: "neutral" },
  ODEME: { label: "Ödeme", tone: "success" },
};

const TAB_KEYS = ["hareketler", "siparisler", "yetkililer"] as const;
type DetailTab = typeof TAB_KEYS[number];
const PAGE_SIZE = 20;

const EMPTY_KONTAKT = { ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false };

const isLabIslem = (islem: Islem) => islem.sourceType === "LAB_INVOICE" || String(islem.aciklama || "").includes("[SISTEM:LAB_FATURA:");
/** Ödeme bir satın almayla birlikte girildiyse o satın almanın kimliği. */
const linkedPurchaseId = (islem: Islem) => islem.purchase?.id || (islem.sourceType === "PURCHASE" || islem.sourceType === "PURCHASE_PAYMENT" ? islem.sourceId || null : null);

function islemDescription(islem: Islem): string {
  if (islem.purchase?.items?.length) return summarizeLines(islem.purchase.items, 3);
  const text = stripSystemTags(islem.aciklama) || stripSystemTags(islem.urunHizmet);
  if (islem.islemTipi === "ODEME") {
    const method = paymentMethodLabel(islem.yontem);
    return [method, text && text !== "Satın alma ödemesi" ? text : islem.sourceType === "PURCHASE_PAYMENT" ? "Satın almayla birlikte ödendi" : ""].filter(Boolean).join(" · ");
  }
  return text || stripSystemTags(islem.urunHizmet) || "";
}

function FirmaDetayContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const { can } = usePermissions();
  const canWriteFinance = can("finance:write");
  const canWriteLab = can("lab:write");
  const canPurchase = canWriteFinance && can("stock:write");

  const [tab, setTab] = useTabParam<DetailTab>(TAB_KEYS, "hareketler");
  const [firma, setFirma] = useState<Firma | null>(null);
  const [firmaLoading, setFirmaLoading] = useState(true);
  const [firmaError, setFirmaError] = useState<string | null>(null);
  const [ekstre, setEkstre] = useState<Ekstre | null>(null);
  const [ekstreError, setEkstreError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [ekstreTipi, setEkstreTipi] = useState("");
  const [ekstreFrom, setEkstreFrom] = useState("");
  const [ekstreTo, setEkstreTo] = useState("");
  const [page, setPage] = useState(1);
  const firmaLoadRef = useRef(0);
  const ekstreLoadRef = useRef(0);
  const orderLoadRef = useRef(0);

  const loadFirma = useCallback(async () => {
    if (!id) { setFirmaLoading(false); setFirmaError("Firma seçilmedi."); return; }
    const sequence = ++firmaLoadRef.current;
    setFirmaError(null);
    try {
      // Tek firma uç noktası pasif firmaları da döndürür; pasife alınan firma
      // "bulunamadı" olmaz, "Aktif et" düğmesi ve kalan borcu görünür kalır.
      const response = await fetch(`/api/firma/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 404 ? "Firma bulunamadı. Silinmiş ya da başka şubeye ait olabilir." : body?.error || "Firma yüklenemedi.");
      if (sequence !== firmaLoadRef.current) return;
      setFirma(body as Firma);
    } catch (error) {
      if (sequence === firmaLoadRef.current) setFirmaError(error instanceof Error ? error.message : "Firma yüklenemedi.");
    } finally {
      if (sequence === firmaLoadRef.current) setFirmaLoading(false);
    }
  }, [id]);

  const loadEkstre = useCallback(async () => {
    if (!id) return;
    const sequence = ++ekstreLoadRef.current;
    setEkstreError(null);
    try {
      const response = await fetch(`/api/firma/${encodeURIComponent(id)}/islemler`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Hesap hareketleri yüklenemedi.");
      if (sequence !== ekstreLoadRef.current) return;
      setEkstre(body as Ekstre);
    } catch (error) {
      if (sequence === ekstreLoadRef.current) setEkstreError(error instanceof Error ? error.message : "Hesap hareketleri yüklenemedi.");
    }
  }, [id]);

  const loadOrders = useCallback(async () => {
    if (!id) return;
    const sequence = ++orderLoadRef.current;
    setOrdersError(null);
    try {
      const response = await fetch(`/api/purchases?firmaId=${encodeURIComponent(id)}&receiptStatus=SIPARIS_VERILDI`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Siparişler yüklenemedi.");
      if (sequence !== orderLoadRef.current) return;
      setOrders(Array.isArray(body) ? body.filter((row: Purchase) => row.receiptStatus === "SIPARIS_VERILDI") : []);
      setOrdersLoaded(true);
    } catch (error) {
      if (sequence === orderLoadRef.current) setOrdersError(error instanceof Error ? error.message : "Siparişler yüklenemedi.");
    }
  }, [id]);

  const loadStockItems = useCallback(async () => {
    try {
      const response = await fetch("/api/stock", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.ok && Array.isArray(body)) setStockItems(body);
    } catch {
      // Yalnız satın alma formundaki ürün önerileri için.
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadFirma(); void loadEkstre(); void loadOrders(); void loadStockItems();
  }, [loadFirma, loadEkstre, loadOrders, loadStockItems]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshAll, 300);
    };
    window.addEventListener("ks:realtime-sync", refresh);
    window.addEventListener("focus", refresh);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("ks:realtime-sync", refresh); window.removeEventListener("focus", refresh); };
  }, [refreshAll]);

  useEffect(() => { setPage(1); }, [ekstreTipi, ekstreFrom, ekstreTo]);

  const isLabFirma = firma?.kategori === "LAB";
  const kontaktler = useMemo(() => firma?.kontaktler || [], [firma]);

  const purchaseManager = usePurchaseModals({
    stockItems,
    firmas: firma && !isLabFirma && firma.isActive ? [{ id: firma.id, name: firma.name, bakiye: firma.bakiye }] : [],
    currentFirmaId: firma?.id,
    onChanged: async () => { refreshAll(); },
    canWrite: canPurchase,
  });

  // ── Firma düzenle / pasife al ───────────────────────────────────────────
  const [showEditFirma, setShowEditFirma] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", iban: "", ibanName: "", notes: "", kategori: "TEDARICI" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editNameError, setEditNameError] = useState<string | undefined>();
  const [savingFirma, setSavingFirma] = useState(false);

  const openEditFirma = () => {
    if (!firma) return;
    setEditForm({
      name: firma.name, phone: firma.phone || "", iban: firma.iban || "", ibanName: firma.ibanName || "",
      notes: firma.notes || "", kategori: firma.kategori,
    });
    setEditError(null);
    setEditNameError(undefined);
    setShowEditFirma(true);
  };

  const handleEditFirma = async () => {
    if (!firma || savingFirma) return;
    if (editForm.name.trim().length < 2) { setEditNameError("Firma adını yazın (en az 2 harf)."); return; }
    setSavingFirma(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/firma/${firma.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, name: editForm.name.trim(), iban: editForm.iban.replace(/\s+/g, " ").trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Firma güncellenemedi.");
      setShowEditFirma(false);
      showToastSafe({ title: "Firma güncellendi", message: editForm.name.trim(), type: "success", icon: "firma" });
      await loadFirma();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSavingFirma(false);
    }
  };

  const toggleFirmaActive = async () => {
    if (!firma) return;
    const nextActive = !firma.isActive;
    const confirmed = await confirmDialog({
      title: nextActive ? "Firma aktif edilsin mi?" : "Firma pasife alınsın mı?",
      message: nextActive
        ? "Firma yeniden satın alma ve ödeme listelerinde görünür."
        : firma.bakiye > 0
          ? `Bu firmaya ${formatCurrency(firma.bakiye)} kalan borç var. Pasif firma yeni satın almada listelenmez; borcu Satın Alma ekranında "Pasif firmalar" filtresinde ve bu sayfada görünmeye devam eder.`
          : "Pasif firma yeni satın almada listelenmez. Geçmiş kayıtları saklanır; istediğinizde yeniden aktif edebilirsiniz.",
      danger: !nextActive,
      confirmText: nextActive ? "Aktif et" : "Pasife al",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/firma/${firma.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: nextActive }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Firma durumu değiştirilemedi.");
      setShowEditFirma(false);
      showToastSafe({ title: nextActive ? "Firma aktif edildi" : "Firma pasife alındı", message: firma.name, type: "success" });
      await loadFirma();
    } catch (error) {
      showToastSafe({ title: "Değiştirilemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  const cancelPayment = async (islem: Islem) => {
    if (!firma || !canWriteFinance) return;
    const confirmed = await confirmDialog({
      title: "Ödeme iptal edilsin mi?",
      message: `${formatCurrency(Number(islem.tutar))} tutarındaki ödeme kaydı iptal edilir ve Muhasebe'deki “Firma Ödemesi” gideri de geri alınır. Firmanın kalan borcu bu kadar artar.`,
      danger: true,
      confirmText: "Ödemeyi iptal et",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/firma/${firma.id}/islemler/${islem.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IPTAL" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Ödeme iptal edilemedi.");
      showToastSafe({ title: "Ödeme iptal edildi", message: data.message || "Kalan borç güncellendi.", type: "success" });
      refreshAll();
    } catch (error) {
      showToastSafe({ title: "İptal edilemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  // ── Yetkili kişiler ─────────────────────────────────────────────────────
  const [kontaktModal, setKontaktModal] = useState<{ mode: "add" } | { mode: "edit"; kontakt: FirmaKontakt } | null>(null);
  const [kontaktForm, setKontaktForm] = useState(EMPTY_KONTAKT);
  const [kontaktError, setKontaktError] = useState<string | null>(null);
  const [kontaktNameError, setKontaktNameError] = useState<string | undefined>();
  const [savingKontakt, setSavingKontakt] = useState(false);

  const openKontakt = (kontakt?: FirmaKontakt) => {
    setKontaktForm(kontakt
      ? { ad: kontakt.ad, unvan: kontakt.unvan || "", email: kontakt.email || "", telefon: kontakt.telefon || "", rol: kontakt.rol || "", isPrimary: kontakt.isPrimary }
      : { ...EMPTY_KONTAKT, isPrimary: kontaktler.length === 0 });
    setKontaktError(null);
    setKontaktNameError(undefined);
    setKontaktModal(kontakt ? { mode: "edit", kontakt } : { mode: "add" });
  };

  const saveKontakt = async () => {
    if (!firma || !kontaktModal || savingKontakt) return;
    if (!kontaktForm.ad.trim()) { setKontaktNameError("Ad soyad yazın."); return; }
    setSavingKontakt(true);
    setKontaktError(null);
    try {
      const response = await fetch(
        kontaktModal.mode === "edit" ? `/api/firma/${firma.id}/kontaktler/${kontaktModal.kontakt.id}` : `/api/firma/${firma.id}/kontaktler`,
        {
          method: kontaktModal.mode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...kontaktForm, ad: kontaktForm.ad.trim() }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Yetkili kişi kaydedilemedi.");
      showToastSafe({ title: kontaktModal.mode === "edit" ? "Yetkili kişi güncellendi" : "Yetkili kişi eklendi", message: kontaktForm.ad.trim(), type: "success" });
      setKontaktModal(null);
      await loadFirma();
    } catch (error) {
      setKontaktError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSavingKontakt(false);
    }
  };

  const deleteKontakt = async (kontakt: FirmaKontakt) => {
    if (!firma) return;
    const confirmed = await confirmDialog({ title: "Yetkili kişi silinsin mi?", message: `${kontakt.ad} bu firmanın kişi listesinden kaldırılır.`, danger: true, confirmText: "Sil", cancelText: "Vazgeç" });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/firma/${firma.id}/kontaktler/${kontakt.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Yetkili kişi silinemedi.");
      showToastSafe({ title: "Yetkili kişi silindi", message: kontakt.ad, type: "success" });
      await loadFirma();
    } catch (error) {
      showToastSafe({ title: "Silinemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  const copyIban = async () => {
    if (!firma?.iban) return;
    try {
      await navigator.clipboard.writeText(firma.iban.replace(/\s+/g, ""));
      showToastSafe({ title: "IBAN kopyalandı", message: firma.iban, type: "success" });
    } catch {
      showToastSafe({ title: "Kopyalanamadı", message: "IBAN'ı seçip elle kopyalayın.", type: "error" });
    }
  };

  // ── Hesap hareketleri (yeniden eskiye) ──────────────────────────────────
  const filtersActive = Boolean(ekstreTipi || ekstreFrom || ekstreTo);
  const islemler = useMemo(() => {
    const rows = (ekstre?.islemler || []).filter((islem) => {
      if (ekstreTipi && islem.islemTipi !== ekstreTipi) return false;
      const day = islem.tarih.substring(0, 10);
      if (ekstreFrom && day < ekstreFrom) return false;
      if (ekstreTo && day > ekstreTo) return false;
      return true;
    });
    return [...rows].reverse();
  }, [ekstre, ekstreTipi, ekstreFrom, ekstreTo]);
  const pageCount = Math.max(1, Math.ceil(islemler.length / PAGE_SIZE));
  const pageRows = islemler.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const islemActions = (islem: Islem) => {
    const purchaseId = islem.islemTipi === "ALIM" ? linkedPurchaseId(islem) : null;
    if (purchaseId) {
      return <IconButton icon={Eye} title="Satın alma detayını aç" size="sm" onClick={() => void purchaseManager.openPurchaseDetail(purchaseId)} />;
    }
    if (isLabIslem(islem)) {
      return <IconButton icon={FlaskConical} title="Laboratuvar işlerine git (iptal oradan yapılır)" size="sm" href="/lab" />;
    }
    if (islem.islemTipi === "ODEME" && canWriteFinance) {
      return <IconButton icon={XCircle} title="Ödemeyi iptal et" tone="danger" size="sm" onClick={() => void cancelPayment(islem)} />;
    }
    return null;
  };

  const islemColumns: ListTableColumn<Islem>[] = [
    { key: "tarih", header: "Tarih", render: (islem) => <DateText value={islem.tarih} className="whitespace-nowrap text-slate-600" /> },
    { key: "tip", header: "İşlem", render: (islem) => <Badge tone={ISLEM_TIPI[islem.islemTipi]?.tone || "neutral"}>{ISLEM_TIPI[islem.islemTipi]?.label || islem.islemTipi}</Badge> },
    {
      key: "aciklama",
      header: "Açıklama",
      cellClassName: "max-w-[300px]",
      render: (islem) => {
        const text = islemDescription(islem);
        return text ? <span className="block truncate text-slate-700" title={text}>{text}</span> : <EmptyValue />;
      },
    },
    { key: "fatura", header: "Fatura no", render: (islem) => islem.faturaNo ? <span className="text-slate-600">{islem.faturaNo}</span> : <EmptyValue /> },
    {
      key: "tutar",
      header: "Tutar",
      align: "right",
      render: (islem) => islem.islemTipi === "ODEME"
        ? <span className="whitespace-nowrap font-semibold tabular-nums text-emerald-700">−{formatCurrency(Number(islem.tutar))}</span>
        : <Money value={Number(islem.tutar)} className="font-semibold text-slate-900" />,
    },
    ...(!filtersActive ? [{
      key: "bakiye",
      header: "Kalan",
      align: "right" as const,
      render: (islem: Islem) => <Money value={islem.cumBakiye ?? 0} className="text-slate-500" />,
    }] : []),
    { key: "actions", header: "", align: "right", render: islemActions },
  ];

  const orderColumns: ListTableColumn<Purchase>[] = [
    { key: "tarih", header: "Sipariş tarihi", render: (order) => <DateText value={order.tarih} className="whitespace-nowrap" /> },
    { key: "urunler", header: "Ürünler", cellClassName: "max-w-[340px]", render: (order) => <span className="block truncate text-slate-700">{summarizeLines(order.lines, 3) || `${order._count?.items ?? 0} kalem`}</span> },
    { key: "fatura", header: "Fatura no", render: (order) => order.faturaNo || <EmptyValue /> },
    { key: "tutar", header: "Tutar", align: "right", render: (order) => <Money value={order.total ?? null} className="text-slate-700" /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (order) => canPurchase ? <Button size="sm" variant="secondary" onClick={() => void purchaseManager.openReceivePurchase(order.id)}>Teslim al</Button> : null,
    },
  ];

  const kontaktColumns: ListTableColumn<FirmaKontakt>[] = [
    {
      key: "ad",
      header: "Ad soyad",
      render: (kontakt) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{kontakt.ad}</span>
            {kontakt.isPrimary && <Badge tone="info">Ana kişi</Badge>}
          </div>
          {(kontakt.unvan || kontakt.rol) && <p className="text-xs text-slate-500">{[kontakt.unvan, kontakt.rol].filter(Boolean).join(" · ")}</p>}
        </div>
      ),
    },
    { key: "telefon", header: "Telefon", render: (kontakt) => kontakt.telefon ? <a href={telHref(kontakt.telefon)} className="whitespace-nowrap text-slate-700 hover:text-primary">{formatPhoneNumber(kontakt.telefon)}</a> : <EmptyValue /> },
    { key: "email", header: "E-posta", render: (kontakt) => kontakt.email ? <a href={`mailto:${kontakt.email}`} className="text-slate-700 hover:text-primary">{kontakt.email}</a> : <EmptyValue /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (kontakt) => canWriteFinance ? (
        <div className="flex justify-end gap-1.5">
          <IconButton icon={Pencil} title={`${kontakt.ad} bilgilerini düzenle`} size="sm" onClick={() => openKontakt(kontakt)} />
          <IconButton icon={Trash2} title={`${kontakt.ad} kişisini sil`} tone="danger" size="sm" onClick={() => void deleteKontakt(kontakt)} />
        </div>
      ) : null,
    },
  ];

  if (firmaLoading && !firma) {
    return (
      <div className="space-y-3 pt-4" aria-busy="true" aria-label="Yükleniyor">
        <div className="h-12 w-72 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  if (!firma) {
    return (
      <div className="space-y-3">
        <PageHeader icon="firma" title="Firma" back={{ href: "/firma", label: "Satın Alma" }} />
        <LoadErrorState message={firmaError || "Firma bulunamadı."} onRetry={id ? () => { setFirmaLoading(true); void loadFirma(); } : undefined} />
      </div>
    );
  }

  const ekstreFilters = [
    ...(ekstreTipi ? [{ key: "tip", label: `İşlem: ${ISLEM_TIPI[ekstreTipi as Islem["islemTipi"]]?.label}`, onRemove: () => setEkstreTipi("") }] : []),
    ...(ekstreFrom ? [{ key: "from", label: `Başlangıç: ${ekstreFrom.split("-").reverse().join(".")}`, onRemove: () => setEkstreFrom("") }] : []),
    ...(ekstreTo ? [{ key: "to", label: `Bitiş: ${ekstreTo.split("-").reverse().join(".")}`, onRemove: () => setEkstreTo("") }] : []),
  ];

  const newPurchaseButton = (primary: boolean) => {
    if (!firma.isActive) return null;
    if (isLabFirma) {
      return canWriteLab ? <Button variant={primary ? "primary" : "secondary"} icon={FlaskConical} href={`/lab?yeni=1&labName=${encodeURIComponent(firma.name)}`}>Yeni Lab İşi</Button> : null;
    }
    return canPurchase ? <Button variant={primary ? "primary" : "secondary"} icon={ShoppingCart} onClick={() => purchaseManager.openAddPurchase(firma.id)}>Yeni Satın Alma</Button> : null;
  };
  const canPay = canWriteFinance && firma.bakiye > 0;

  return (
    <div className="space-y-3">
      <PageHeader
        icon="firma"
        title={firma.name}
        back={{ href: "/firma", label: "Satın Alma" }}
        description={(
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{FIRMA_KATEGORILERI[firma.kategori] || firma.kategori}</span>
            {!firma.isActive && <Badge tone="neutral">Pasif</Badge>}
            {firma.phone && <>· <a href={telHref(firma.phone)} className="font-medium text-slate-700 hover:text-primary">{formatPhoneNumber(firma.phone)}</a></>}
          </span>
        )}
        stats={[
          { label: "Toplam alım", value: formatCurrency(firma.borc) },
          { label: "Ödenen", value: formatCurrency(firma.odenen), color: "text-emerald-700" },
          { label: "Kalan borç", value: formatCurrency(firma.bakiye), color: firma.bakiye > 0 ? "text-red-700" : "text-slate-800" },
        ]}
        actions={(
          <>
            {canWriteFinance && <Button variant="secondary" icon={Pencil} onClick={openEditFirma}>Düzenle</Button>}
            {newPurchaseButton(!canPay)}
            {canPay && <Button icon={Wallet} onClick={() => void purchaseManager.openFirmaPayment(firma.id)}>Ödeme Yap</Button>}
          </>
        )}
      />

      {!firma.isActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>Bu firma pasif: yeni satın almada listelenmez. Geçmiş ve kalan borç burada görünür.</span>
          {canWriteFinance && <Button size="sm" variant="secondary" onClick={() => void toggleFirmaActive()}>Aktif et</Button>}
        </div>
      )}

      {(firma.iban || firma.notes) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-[rgb(var(--app-surface))] px-4 py-3 text-sm">
          {firma.iban && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-slate-500">IBAN</span>
              <span className="truncate font-mono font-medium text-slate-800">{firma.iban}</span>
              {firma.ibanName && <span className="text-slate-500">({firma.ibanName})</span>}
              <IconButton icon={Copy} title="IBAN'ı kopyala" size="sm" onClick={() => void copyIban()} />
            </span>
          )}
          {firma.notes && <span className="min-w-0 text-slate-600">{firma.notes}</span>}
        </div>
      )}

      {isLabFirma && (
        <p className="text-sm text-slate-600">
          Bu firma laboratuvar olarak çalışır: işler ve faturaları Laboratuvar ekranından girilir, tutarları aşağıdaki hesap hareketlerine hizmet borcu olarak düşer.
        </p>
      )}

      <Tabs<DetailTab>
        ariaLabel="Firma bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { key: "hareketler", label: "Hesap hareketleri" },
          ...(isLabFirma && orders.length === 0 ? [] : [{ key: "siparisler" as const, label: "Bekleyen siparişler", count: orders.length, countTone: "warning" as const }]),
          { key: "yetkililer", label: "Yetkili kişiler", count: kontaktler.length },
        ]}
      />

      {tab === "hareketler" && (
        <>
          <Toolbar>
            <div className="sm:w-44">
              <Select aria-label="İşlem türü" value={ekstreTipi} onChange={(event) => setEkstreTipi(event.target.value)}>
                <option value="">Tüm işlemler</option>
                <option value="ALIM">Alım</option>
                <option value="HIZMET">Hizmet</option>
                <option value="ODEME">Ödeme</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="w-16 shrink-0 sm:w-auto">Başlangıç</span>
              <span className="min-w-0 flex-1 sm:w-40 sm:flex-none"><Input type="date" value={ekstreFrom} onChange={(event) => setEkstreFrom(event.target.value)} /></span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="w-16 shrink-0 sm:w-auto">Bitiş</span>
              <span className="min-w-0 flex-1 sm:w-40 sm:flex-none"><Input type="date" value={ekstreTo} onChange={(event) => setEkstreTo(event.target.value)} /></span>
            </label>
          </Toolbar>
          <ActiveFilters filters={ekstreFilters} onClearAll={() => { setEkstreTipi(""); setEkstreFrom(""); setEkstreTo(""); }} />
          {filtersActive && <p className="text-xs text-slate-500">Filtre açıkken “Kalan” sütunu gizlenir; firmanın güncel kalan borcu başlıkta.</p>}
          <ListTable<Islem>
            columns={islemColumns}
            rows={pageRows}
            rowKey={(islem) => islem.id}
            loading={!ekstre && !ekstreError}
            error={ekstreError}
            onRetry={() => void loadEkstre()}
            emptyText={filtersActive ? "Bu filtreye uyan işlem yok" : "Henüz alım, hizmet veya ödeme yok"}
            emptyDescription={filtersActive ? undefined : isLabFirma ? "Laboratuvar faturaları girildikçe burada görünür." : "Faturayı “Yeni Satın Alma” ile girin; ödemeleri “Ödeme Yap” ile kaydedin."}
            onRowClick={(islem) => {
              const purchaseId = islem.islemTipi === "ALIM" ? linkedPurchaseId(islem) : null;
              if (purchaseId) void purchaseManager.openPurchaseDetail(purchaseId);
            }}
            getRowAriaLabel={(islem) => `${ISLEM_TIPI[islem.islemTipi]?.label || "İşlem"} ${formatCurrency(Number(islem.tutar))}`}
            pager={islemler.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: islemler.length, onPageChange: setPage } : undefined}
            mobileCard={(islem) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={ISLEM_TIPI[islem.islemTipi]?.tone || "neutral"}>{ISLEM_TIPI[islem.islemTipi]?.label}</Badge>
                    <DateText value={islem.tarih} className="text-xs text-slate-500" />
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-700">{islemDescription(islem) || (islem.faturaNo ? `Fatura ${islem.faturaNo}` : "")}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {islem.islemTipi === "ODEME"
                    ? <span className="font-semibold tabular-nums text-emerald-700">−{formatCurrency(Number(islem.tutar))}</span>
                    : <Money value={Number(islem.tutar)} className="font-semibold" />}
                  {islemActions(islem)}
                </div>
              </div>
            )}
          />
        </>
      )}

      {tab === "siparisler" && (
        <ListTable<Purchase>
          columns={orderColumns}
          rows={orders}
          rowKey={(order) => order.id}
          loading={!ordersLoaded && !ordersError}
          error={ordersError}
          onRetry={() => void loadOrders()}
          emptyText="Teslimat bekleyen sipariş yok"
          emptyDescription="“Yeni Satın Alma”da “Yalnız sipariş verildi” seçilen kayıtlar ürünler gelene kadar burada bekler."
          onRowClick={(order) => void purchaseManager.openPurchaseDetail(order.id)}
          getRowAriaLabel={(order) => `${formatCurrency(Number(order.total || 0))} tutarlı siparişi aç`}
          mobileCard={(order) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{summarizeLines(order.lines) || `${order._count?.items ?? 0} kalem`}</p>
                <p className="text-xs text-slate-500"><DateText value={order.tarih} /> · {formatCurrency(Number(order.total || 0))}</p>
              </div>
              {canPurchase && <Button size="sm" variant="secondary" onClick={() => void purchaseManager.openReceivePurchase(order.id)}>Teslim al</Button>}
            </div>
          )}
        />
      )}

      {tab === "yetkililer" && (
        <ListTable<FirmaKontakt>
          columns={kontaktColumns}
          rows={kontaktler}
          rowKey={(kontakt) => kontakt.id}
          emptyText="Henüz yetkili kişi yok"
          emptyDescription="Sipariş verdiğiniz ya da fatura sorduğunuz kişiyi ekleyin."
          emptyAction={canWriteFinance ? <Button size="sm" icon={Plus} onClick={() => openKontakt()}>Yetkili Kişi Ekle</Button> : undefined}
          header={canWriteFinance && kontaktler.length > 0 ? (
            <div className="flex justify-end border-b border-slate-100 px-3 py-2">
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => openKontakt()}>Yetkili Kişi Ekle</Button>
            </div>
          ) : undefined}
          mobileCard={(kontakt) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{kontakt.ad}{kontakt.isPrimary ? " · Ana kişi" : ""}</p>
                <p className="text-xs text-slate-500">{[kontakt.unvan, kontakt.rol].filter(Boolean).join(" · ")}</p>
                {kontakt.telefon && <a href={telHref(kontakt.telefon)} className="text-sm text-primary">{formatPhoneNumber(kontakt.telefon)}</a>}
              </div>
              {canWriteFinance && (
                <div className="flex shrink-0 gap-1.5">
                  <IconButton icon={Pencil} title={`${kontakt.ad} bilgilerini düzenle`} size="sm" onClick={() => openKontakt(kontakt)} />
                  <IconButton icon={Trash2} title={`${kontakt.ad} kişisini sil`} tone="danger" size="sm" onClick={() => void deleteKontakt(kontakt)} />
                </div>
              )}
            </div>
          )}
        />
      )}

      <Modal
        module="firma"
        open={showEditFirma}
        onClose={() => setShowEditFirma(false)}
        title="Firmayı düzenle"
        footer={(
          <>
            {firma.isActive && (
              <Button variant="ghost" className="mr-auto !text-red-700 hover:!bg-red-50" onClick={() => void toggleFirmaActive()} disabled={savingFirma}>
                Pasife al
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowEditFirma(false)} disabled={savingFirma}>Vazgeç</Button>
            <Button onClick={() => void handleEditFirma()} loading={savingFirma}>Kaydet</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormErrorBanner message={editError} />
          <FormField label="Firma Adı" htmlFor="firma-edit-name" required error={editNameError}>
            <Input id="firma-edit-name" value={editForm.name} onChange={(event) => { setEditForm((form) => ({ ...form, name: event.target.value })); setEditNameError(undefined); }} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Firma türü" htmlFor="firma-edit-kategori" required>
              <Select id="firma-edit-kategori" value={editForm.kategori} onChange={(event) => setEditForm((form) => ({ ...form, kategori: event.target.value }))}>
                {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </FormField>
            <FormField label="Telefon" htmlFor="firma-edit-phone">
              <Input id="firma-edit-phone" type="tel" inputMode="tel" value={editForm.phone} onChange={(event) => setEditForm((form) => ({ ...form, phone: event.target.value }))} />
            </FormField>
            <FormField label="IBAN" htmlFor="firma-edit-iban">
              <Input id="firma-edit-iban" value={editForm.iban} onChange={(event) => setEditForm((form) => ({ ...form, iban: event.target.value.toUpperCase() }))} className="font-mono" />
            </FormField>
            <FormField label="IBAN hesap sahibi" htmlFor="firma-edit-iban-name">
              <Input id="firma-edit-iban-name" value={editForm.ibanName} onChange={(event) => setEditForm((form) => ({ ...form, ibanName: event.target.value }))} />
            </FormField>
          </div>
          <FormField label="Notlar" htmlFor="firma-edit-notes">
            <Textarea id="firma-edit-notes" value={editForm.notes} onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))} rows={2} />
          </FormField>
        </div>
      </Modal>

      <Modal
        module="firma"
        open={Boolean(kontaktModal)}
        onClose={() => setKontaktModal(null)}
        title={kontaktModal?.mode === "edit" ? "Yetkili kişiyi düzenle" : "Yetkili kişi ekle"}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setKontaktModal(null)} disabled={savingKontakt}>Vazgeç</Button>
            <Button onClick={() => void saveKontakt()} loading={savingKontakt}>Kaydet</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormErrorBanner message={kontaktError} />
          <FormField label="Ad soyad" htmlFor="kontakt-ad" required error={kontaktNameError}>
            <Input id="kontakt-ad" value={kontaktForm.ad} onChange={(event) => { setKontaktForm((form) => ({ ...form, ad: event.target.value })); setKontaktNameError(undefined); }} data-autofocus />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Unvan" htmlFor="kontakt-unvan">
              <Input id="kontakt-unvan" value={kontaktForm.unvan} onChange={(event) => setKontaktForm((form) => ({ ...form, unvan: event.target.value }))} placeholder="Ör. Satış temsilcisi" />
            </FormField>
            <FormField label="Sorumlu olduğu iş" htmlFor="kontakt-rol">
              <Input id="kontakt-rol" value={kontaktForm.rol} onChange={(event) => setKontaktForm((form) => ({ ...form, rol: event.target.value }))} placeholder="Ör. sipariş, fatura" />
            </FormField>
            <FormField label="Telefon" htmlFor="kontakt-telefon">
              <Input id="kontakt-telefon" type="tel" inputMode="tel" value={kontaktForm.telefon} onChange={(event) => setKontaktForm((form) => ({ ...form, telefon: event.target.value }))} />
            </FormField>
            <FormField label="E-posta" htmlFor="kontakt-email">
              <Input id="kontakt-email" type="email" value={kontaktForm.email} onChange={(event) => setKontaktForm((form) => ({ ...form, email: event.target.value }))} />
            </FormField>
          </div>
          <Switch
            checked={kontaktForm.isPrimary}
            onChange={(checked) => setKontaktForm((form) => ({ ...form, isPrimary: checked }))}
            label="Ana iletişim kişisi yap"
            description="Satın Alma listesinde firmanın yanında bu kişi görünür."
          />
        </div>
      </Modal>

      {purchaseManager.modals}
    </div>
  );
}

export default function FirmaDetayPage() {
  return (
    <Suspense fallback={null}>
      <FirmaDetayContent />
    </Suspense>
  );
}
