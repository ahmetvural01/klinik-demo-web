"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, Copy, FlaskConical, Pencil, Plus, Power, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency, formatPhoneNumber } from "@/lib/format";
import { stripSystemTags } from "@/lib/format-text";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { Button, IconButton } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { FormModal } from "@/components/ui/FormModal";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Checkbox } from "@/components/ui/Checkbox";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Section } from "@/components/ui/Section";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { DateText, Money } from "@/components/ui/Money";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { paymentMethodLabel } from "@/components/firma/FirmaPaymentModal";
import { FIRMA_KATEGORILERI, telHref } from "@/components/firma/firma-shared";
import { FirmaFormModal } from "@/components/firma/FirmaFormModal";
import { usePurchaseModals } from "@/components/firma/usePurchaseModals";
import { summarizeLines, type Purchase } from "@/components/firma/purchase-model";

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
const LEDGER_PRESETS = ["tum", "ay", "gecen-ay", "90", "ozel"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 86_400_000;

const EMPTY_KONTAKT = { ad: "", unvan: "", email: "", telefon: "", rol: "", isPrimary: false };

const isLabIslem = (islem: Islem) => islem.sourceType === "LAB_INVOICE" || String(islem.aciklama || "").includes("[SISTEM:LAB_FATURA:");
/** Alım satırı bir satın almaya bağlıysa o satın almanın kimliği. */
const linkedPurchaseId = (islem: Islem) => (islem.islemTipi === "ALIM"
  ? islem.purchase?.id || (islem.sourceType === "PURCHASE" ? islem.sourceId || null : null)
  : null);

function islemDescription(islem: Islem): string {
  if (islem.purchase?.items?.length) return summarizeLines(islem.purchase.items, 3);
  const text = stripSystemTags(islem.aciklama) || stripSystemTags(islem.urunHizmet);
  if (islem.islemTipi === "ODEME") {
    const method = paymentMethodLabel(islem.yontem);
    return [method, text && text !== "Satın alma ödemesi" ? text : islem.sourceType === "PURCHASE_PAYMENT" ? "Satın almayla birlikte ödendi" : ""].filter(Boolean).join(" · ");
  }
  return text || stripSystemTags(islem.urunHizmet) || "";
}

/** Ödemeler eksi ve yeşil, borçlar düz — masaüstü ve telefonda aynı biçim. */
function IslemAmount({ islem, className = "" }: { islem: Islem; className?: string }) {
  const amount = Number(islem.tutar);
  return islem.islemTipi === "ODEME"
    ? <Money value={-amount} tone="positive" className={`whitespace-nowrap font-semibold ${className}`} />
    : <Money value={amount} className={`whitespace-nowrap font-semibold text-slate-900 ${className}`} />;
}

function FirmaDetayContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const { can } = usePermissions();
  const canWriteFinance = can("finance:write");
  const canWriteLab = can("lab:write");
  const canPurchase = canWriteFinance && can("stock:write");

  const [tab, setTab] = useTabParam<DetailTab>(TAB_KEYS, "hareketler");
  const period = useDateRangeParam(LEDGER_PRESETS, "tum");
  const [firma, setFirma] = useState<Firma | null>(null);
  const [firmaLoading, setFirmaLoading] = useState(true);
  const [firmaError, setFirmaError] = useState<string | null>(null);
  const [ekstre, setEkstre] = useState<Ekstre | null>(null);
  const [ekstreError, setEkstreError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ekstreTipi, setEkstreTipi] = useState("");
  const [page, setPage] = useState(1);
  const firmaLoadRef = useRef(0);
  const ekstreLoadRef = useRef(0);
  const orderLoadRef = useRef(0);

  const loadFirma = useCallback(async () => {
    if (!id) { setFirmaLoading(false); setFirmaError("Tedarikçi seçilmedi."); return; }
    const sequence = ++firmaLoadRef.current;
    setFirmaError(null);
    try {
      // Tek firma uç noktası pasif firmaları da döndürür; pasife alınan firma
      // "bulunamadı" olmaz, "Aktif et" ve kalan borç görünür kalır.
      const response = await fetch(`/api/firma/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 404 ? "Tedarikçi bulunamadı. Silinmiş ya da başka şubeye ait olabilir." : body?.error || "Tedarikçi yüklenemedi.");
      if (sequence !== firmaLoadRef.current) return;
      setFirma(body as Firma);
    } catch (error) {
      if (sequence === firmaLoadRef.current) setFirmaError(error instanceof Error ? error.message : "Tedarikçi yüklenemedi.");
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

  // Ürün listesi artık açılışta çekilmez; satın alma formu açılınca yüklenir.
  const refreshAll = useCallback(() => {
    void loadFirma(); void loadEkstre(); void loadOrders();
  }, [loadFirma, loadEkstre, loadOrders]);

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

  const periodRange = period.range;
  useEffect(() => { setPage(1); }, [ekstreTipi, periodRange]);

  const isLabFirma = firma?.kategori === "LAB";
  const kontaktler = useMemo(() => firma?.kontaktler || [], [firma]);

  const purchaseFirmas = useMemo(
    () => (firma && !isLabFirma && firma.isActive ? [{ id: firma.id, name: firma.name, bakiye: firma.bakiye }] : []),
    [firma, isLabFirma],
  );
  const purchaseManager = usePurchaseModals({
    firmas: purchaseFirmas,
    currentFirmaId: firma?.id,
    onChanged: async () => { refreshAll(); },
    canWrite: canPurchase,
  });

  const [showEditFirma, setShowEditFirma] = useState(false);

  const toggleFirmaActive = async () => {
    if (!firma) return;
    const nextActive = !firma.isActive;
    const confirmed = await confirmDialog({
      title: nextActive ? "Tedarikçi aktif edilsin mi?" : "Tedarikçi pasife alınsın mı?",
      message: nextActive
        ? "Tedarikçi yeniden satın alma ve ödeme listelerinde görünür."
        : firma.bakiye > 0
          ? `Bu tedarikçiye ${formatCurrency(firma.bakiye)} kalan borç var. Pasif tedarikçi yeni satın almada listelenmez; borcu Satın alma ekranında "Pasif tedarikçiler" filtresinde ve bu sayfada görünmeye devam eder.`
          : "Pasif tedarikçi yeni satın almada listelenmez. Geçmiş kayıtları saklanır; istediğinizde yeniden aktif edebilirsiniz.",
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
      if (!response.ok) throw new Error(body.error || "Tedarikçi durumu değiştirilemedi.");
      showToastSafe({ title: nextActive ? "Tedarikçi aktif edildi" : "Tedarikçi pasife alındı", message: firma.name, type: "success" });
      await loadFirma();
    } catch (error) {
      showToastSafe({ title: "Değiştirilemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  const cancelPayment = async (islem: Islem) => {
    if (!firma || !canWriteFinance) return;
    const confirmed = await confirmDialog({
      title: "Ödeme iptal edilsin mi?",
      message: `${formatCurrency(Number(islem.tutar))} tutarındaki ödeme kaydı iptal edilir ve Muhasebe'deki “Firma Ödemesi” gideri de geri alınır. Tedarikçinin kalan borcu bu kadar artar.`,
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
  const [kontaktErrors, setKontaktErrors] = useState<{ ad?: string; email?: string }>({});
  const [savingKontakt, setSavingKontakt] = useState(false);

  const openKontakt = (kontakt?: FirmaKontakt) => {
    setKontaktForm(kontakt
      ? { ad: kontakt.ad, unvan: kontakt.unvan || "", email: kontakt.email || "", telefon: kontakt.telefon || "", rol: kontakt.rol || "", isPrimary: kontakt.isPrimary }
      : { ...EMPTY_KONTAKT, isPrimary: kontaktler.length === 0 });
    setKontaktError(null);
    setKontaktErrors({});
    setKontaktModal(kontakt ? { mode: "edit", kontakt } : { mode: "add" });
  };

  const saveKontakt = async () => {
    if (!firma || !kontaktModal || savingKontakt) return;
    const nextErrors: typeof kontaktErrors = {};
    if (!kontaktForm.ad.trim()) nextErrors.ad = "Ad soyad yazın.";
    if (kontaktForm.email.trim() && !EMAIL_PATTERN.test(kontaktForm.email.trim())) nextErrors.email = "E-posta adresi geçerli değil (ör. ad@firma.com).";
    setKontaktErrors(nextErrors);
    if (nextErrors.ad || nextErrors.email) return;
    setSavingKontakt(true);
    setKontaktError(null);
    try {
      const response = await fetch(
        kontaktModal.mode === "edit" ? `/api/firma/${firma.id}/kontaktler/${kontaktModal.kontakt.id}` : `/api/firma/${firma.id}/kontaktler`,
        {
          method: kontaktModal.mode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...kontaktForm, ad: kontaktForm.ad.trim(), email: kontaktForm.email.trim() }),
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
    const confirmed = await confirmDialog({ title: "Yetkili kişi silinsin mi?", message: `${kontakt.ad} bu tedarikçinin kişi listesinden kaldırılır.`, danger: true, confirmText: "Sil", cancelText: "Vazgeç" });
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
  const islemler = useMemo(() => {
    const rows = (ekstre?.islemler || []).filter((islem) => {
      if (ekstreTipi && islem.islemTipi !== ekstreTipi) return false;
      const day = islem.tarih.substring(0, 10);
      if (periodRange && (day < periodRange.from || day > periodRange.to)) return false;
      return true;
    });
    return [...rows].reverse();
  }, [ekstre, ekstreTipi, periodRange]);
  const pageCount = Math.max(1, Math.ceil(islemler.length / PAGE_SIZE));
  const pageRows = islemler.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const islemActions = (islem: Islem) => {
    if (isLabIslem(islem)) {
      return <IconButton icon={FlaskConical} title="Laboratuvar işlerine git (iptal oradan yapılır)" size="sm" href="/lab" />;
    }
    if (islem.islemTipi === "ODEME" && canWriteFinance) {
      return (
        <ActionMenu
          label={`${formatCurrency(Number(islem.tutar))} ödeme işlemleri`}
          items={[{ key: "iptal", label: "Ödemeyi iptal et", icon: Ban, danger: true, onSelect: () => void cancelPayment(islem) }]}
        />
      );
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
    { key: "tutar", header: "Tutar", align: "right", render: (islem) => <IslemAmount islem={islem} /> },
    // Kalan bakiye tüm geçmiş üzerinden hesaplanır: tarih süzgecinde doğru kalır,
    // yalnız işlem türü süzülünce anlamını yitirir.
    ...(!ekstreTipi ? [{
      key: "bakiye",
      header: "Kalan",
      align: "right" as const,
      render: (islem: Islem) => <Money value={islem.cumBakiye ?? 0} className="text-slate-500" />,
    }] : []),
    { key: "actions", header: "", align: "right", render: islemActions },
  ];

  const orderColumns: ListTableColumn<Purchase>[] = [
    {
      key: "tarih",
      header: "Sipariş tarihi",
      render: (order) => {
        const days = Math.max(0, Math.floor((Date.now() - new Date(order.tarih).getTime()) / DAY_MS));
        return (
          <div className="whitespace-nowrap">
            <DateText value={order.tarih} />
            {days > 0 && <p className={`text-xs ${days > 7 ? "font-semibold text-amber-700" : "text-slate-500"}`}>{days} gündür bekliyor</p>}
          </div>
        );
      },
    },
    { key: "urunler", header: "Ürünler", cellClassName: "max-w-[340px]", render: (order) => <span className="block truncate text-slate-700">{summarizeLines(order.lines, 3) || `${order._count?.items ?? 0} kalem`}</span> },
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
    return <PageSkeleton tabs={3} toolbar body="table" columns={6} label="Tedarikçi yükleniyor" />;
  }

  if (!firma) {
    return (
      <div className="space-y-3">
        <PageHeader icon="firma" title="Tedarikçi" back={{ href: "/firma", label: "Satın alma" }} />
        <LoadErrorState message={firmaError || "Tedarikçi bulunamadı."} onRetry={id ? () => { setFirmaLoading(true); void loadFirma(); } : undefined} />
      </div>
    );
  }

  const ekstreFilters = [
    ...(ekstreTipi ? [{ key: "tip", label: `İşlem: ${ISLEM_TIPI[ekstreTipi as Islem["islemTipi"]]?.label}`, onRemove: () => setEkstreTipi("") }] : []),
    ...(period.activeFilter ? [period.activeFilter] : []),
  ];
  const filtersActive = ekstreFilters.length > 0;

  const newPurchaseButton = (primary: boolean) => {
    if (!firma.isActive) return null;
    if (isLabFirma) {
      return canWriteLab ? <Button variant={primary ? "primary" : "secondary"} icon={FlaskConical} href={`/lab?yeni=1&labName=${encodeURIComponent(firma.name)}`}>Yeni lab işi</Button> : null;
    }
    return canPurchase ? <Button variant={primary ? "primary" : "secondary"} icon={ShoppingCart} onClick={() => purchaseManager.openAddPurchase(firma.id)}>Yeni satın alma</Button> : null;
  };
  const canPay = canWriteFinance && firma.bakiye > 0;
  const headerMenu: ActionMenuItem[] = canWriteFinance ? [
    { key: "edit", label: "Bilgileri düzenle", icon: Pencil, onSelect: () => setShowEditFirma(true) },
    firma.isActive
      ? { key: "pasif", label: "Pasife al", icon: Power, danger: true, separatorBefore: true, onSelect: () => void toggleFirmaActive() }
      : { key: "aktif", label: "Aktif et", icon: Power, separatorBefore: true, onSelect: () => void toggleFirmaActive() },
  ] : [];
  const hasInfo = Boolean(firma.iban || firma.ibanName || firma.notes);

  return (
    <div className="space-y-3">
      <PageHeader
        icon="firma"
        title={firma.name}
        back={{ href: "/firma", label: "Satın alma" }}
        description={(
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{FIRMA_KATEGORILERI[firma.kategori] || firma.kategori}</span>
            {!firma.isActive && <Badge tone="neutral">Pasif</Badge>}
            {firma.phone && <>· <a href={telHref(firma.phone)} className="font-medium text-slate-700 hover:text-primary">{formatPhoneNumber(firma.phone)}</a></>}
          </span>
        )}
        stats={[
          { label: "Toplam borç", value: formatCurrency(firma.borc) },
          { label: "Ödenen", value: formatCurrency(firma.odenen), color: "text-emerald-700" },
          { label: "Kalan", value: formatCurrency(firma.bakiye), color: firma.bakiye > 0 ? "text-red-700" : "text-slate-800" },
        ]}
        actions={(
          <>
            {headerMenu.length > 0 && <ActionMenu items={headerMenu} trigger="button" label="Diğer" size="md" />}
            {newPurchaseButton(!canPay)}
            {canPay && <Button icon={Wallet} onClick={() => void purchaseManager.openFirmaPayment(firma.id)}>Ödeme yap</Button>}
          </>
        )}
      />

      {!firma.isActive && (
        <Callout
          tone="neutral"
          action={canWriteFinance ? <Button size="sm" variant="secondary" onClick={() => void toggleFirmaActive()}>Aktif et</Button> : undefined}
        >
          Bu tedarikçi pasif: yeni satın almada listelenmez. Geçmiş ve kalan borç burada görünür.
        </Callout>
      )}

      {hasInfo && (
        <Section>
          <DescriptionList
            columns={3}
            items={[
              {
                key: "iban",
                label: "IBAN",
                hidden: !firma.iban,
                value: firma.iban ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-slate-800">{firma.iban}</span>
                    <IconButton icon={Copy} title="IBAN'ı kopyala" size="sm" onClick={() => void copyIban()} />
                  </span>
                ) : null,
              },
              { key: "sahip", label: "Hesap sahibi", value: firma.ibanName, hidden: !firma.ibanName },
              { key: "not", label: "Not", value: firma.notes, hidden: !firma.notes },
            ]}
          />
        </Section>
      )}

      <Tabs<DetailTab>
        ariaLabel="Tedarikçi bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { key: "hareketler", label: "Hesap hareketleri" },
          ...(isLabFirma && orders.length === 0 ? [] : [{ key: "siparisler" as const, label: "Bekleyen siparişler", count: orders.length, countTone: "warning" as const, countLabel: "bekleyen sipariş" }]),
          { key: "yetkililer", label: "Yetkili kişiler" },
        ]}
      />

      {tab === "hareketler" && (
        <>
          <Toolbar
            filters={(
              <>
                <div className="sm:w-44">
                  <Select aria-label="İşlem türü" value={ekstreTipi} onChange={(event) => setEkstreTipi(event.target.value)}>
                    <option value="">Tüm işlemler</option>
                    <option value="ALIM">Alım</option>
                    <option value="HIZMET">Hizmet</option>
                    <option value="ODEME">Ödeme</option>
                  </Select>
                </div>
                <DateRangeFilter {...period.filterProps} />
              </>
            )}
            filterCount={ekstreFilters.length}
          />
          <ActiveFilters filters={ekstreFilters} onClearAll={() => { setEkstreTipi(""); period.reset(); }} />
          <ListTable<Islem>
            columns={islemColumns}
            rows={pageRows}
            rowKey={(islem) => islem.id}
            loading={!ekstre && !ekstreError}
            error={!ekstre ? ekstreError : null}
            staleError={ekstre ? ekstreError : null}
            onRetry={() => void loadEkstre()}
            emptyText={filtersActive ? "Bu filtreye uyan işlem yok" : "Henüz alım, hizmet veya ödeme yok"}
            emptyDescription={filtersActive ? undefined : isLabFirma ? "Laboratuvar işleri ve faturaları Laboratuvar ekranından girilir; tutarları burada görünür." : "Faturayı “Yeni satın alma” ile girin; ödemeleri “Ödeme yap” ile kaydedin."}
            onRowClick={(islem) => {
              const purchaseId = linkedPurchaseId(islem);
              if (purchaseId) void purchaseManager.openPurchaseDetail(purchaseId);
            }}
            // Yalnız satın almaya bağlı alım satırı bir şey açar; diğer satırlar düğme gibi davranmaz.
            isRowClickable={(islem) => Boolean(linkedPurchaseId(islem))}
            getRowAriaLabel={(islem) => `${islem.faturaNo ? `Fatura ${islem.faturaNo}` : "Alım"} ${formatCurrency(Number(islem.tutar))} ayrıntısını aç`}
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
                  <IslemAmount islem={islem} />
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
          error={!ordersLoaded ? ordersError : null}
          staleError={ordersLoaded ? ordersError : null}
          onRetry={() => void loadOrders()}
          emptyText="Teslimat bekleyen sipariş yok"
          emptyDescription="“Yeni satın alma”da durum “Sipariş verildi” seçilen kayıtlar ürünler gelene kadar burada bekler."
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
          actions={canWriteFinance && kontaktler.length > 0 ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => openKontakt()}>Yetkili kişi ekle</Button> : undefined}
          emptyText="Henüz yetkili kişi yok"
          emptyDescription="Sipariş verdiğiniz ya da fatura sorduğunuz kişiyi ekleyin."
          emptyAction={canWriteFinance ? <Button size="sm" icon={Plus} onClick={() => openKontakt()}>Yetkili kişi ekle</Button> : undefined}
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

      <FirmaFormModal
        open={showEditFirma}
        firma={firma}
        onClose={() => setShowEditFirma(false)}
        onSaved={async () => { await loadFirma(); }}
      />

      <FormModal
        module="firma"
        open={Boolean(kontaktModal)}
        onClose={() => setKontaktModal(null)}
        title={kontaktModal?.mode === "edit" ? "Yetkili kişiyi düzenle" : "Yetkili kişi ekle"}
        onSubmit={() => saveKontakt()}
        submitting={savingKontakt}
        error={kontaktError}
      >
        <FormField label="Ad soyad" htmlFor="kontakt-ad" required error={kontaktErrors.ad}>
          <Input id="kontakt-ad" value={kontaktForm.ad} onChange={(event) => { setKontaktForm((form) => ({ ...form, ad: event.target.value })); setKontaktErrors((current) => ({ ...current, ad: undefined })); }} data-autofocus />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Görevi" htmlFor="kontakt-unvan">
            <Input id="kontakt-unvan" value={kontaktForm.unvan} onChange={(event) => setKontaktForm((form) => ({ ...form, unvan: event.target.value }))} placeholder="Ör. Satış temsilcisi, muhasebe" />
          </FormField>
          {/* Eski kayıtlarda ikinci görev alanı doluysa kaybolmasın diye gösterilir. */}
          {kontaktModal?.mode === "edit" && kontaktModal.kontakt.rol ? (
            <FormField label="Sorumlu olduğu iş" htmlFor="kontakt-rol">
              <Input id="kontakt-rol" value={kontaktForm.rol} onChange={(event) => setKontaktForm((form) => ({ ...form, rol: event.target.value }))} />
            </FormField>
          ) : null}
          <FormField label="Telefon" htmlFor="kontakt-telefon">
            <Input id="kontakt-telefon" type="tel" inputMode="tel" value={kontaktForm.telefon} onChange={(event) => setKontaktForm((form) => ({ ...form, telefon: event.target.value }))} />
          </FormField>
          <FormField label="E-posta" htmlFor="kontakt-email" error={kontaktErrors.email}>
            <Input id="kontakt-email" type="email" value={kontaktForm.email} onChange={(event) => { setKontaktForm((form) => ({ ...form, email: event.target.value })); setKontaktErrors((current) => ({ ...current, email: undefined })); }} />
          </FormField>
        </div>
        <Checkbox
          checked={kontaktForm.isPrimary}
          onChange={(checked) => setKontaktForm((form) => ({ ...form, isPrimary: checked }))}
          label="Ana iletişim kişisi"
          description="Satın alma listesinde tedarikçinin yanında bu kişi görünür."
        />
      </FormModal>

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
