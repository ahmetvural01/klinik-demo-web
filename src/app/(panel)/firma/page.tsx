"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, PackageCheck, Plus, ShoppingCart, Wallet } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency, formatPhoneNumber } from "@/lib/format";
import { DATE_PRESET_LABELS } from "@/lib/date-presets";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { Button } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money } from "@/components/ui/Money";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { matchesSearch } from "@/components/stock/stock-shared";
import { FIRMA_KATEGORILERI, telHref } from "@/components/firma/firma-shared";
import { FirmaFormModal } from "@/components/firma/FirmaFormModal";
import { usePurchaseModals } from "@/components/firma/usePurchaseModals";
import { RECEIPT_STATUS_META, summarizeLines, type Purchase } from "@/components/firma/purchase-model";

const FirmaEmptyIcon = createSceneIllustration("firma");

type FirmaKontakt = { id: string; ad: string };

type Firma = {
  id: string; name: string; phone?: string | null; iban?: string | null; ibanName?: string | null;
  notes?: string | null; kategori: string; paymentTerms: string;
  isActive: boolean; createdAt: string;
  borc: number; odenen: number; bakiye: number;
  sonIslemTarihi?: string | null;
  bekleyenSiparis?: number;
  primaryKontakt?: FirmaKontakt | null; toplamKontakt: number;
};

const VIEW_KEYS = ["firmalar", "satinalmalar", "siparisler"] as const;
type FirmaView = typeof VIEW_KEYS[number];
type DurumFilter = "aktif" | "pasif" | "tumu";
const PURCHASE_PRESETS = ["ay", "gecen-ay", "3ay", "yil", "ozel"] as const;
const DAY_MS = 86_400_000;

/**
 * Satırda gösterilecek tür: olağan "Tedarikçi" her satırda tekrar etmez
 * (sadelik K5); yalnız farklı türler (Laboratuvar, Hizmet sağlayıcı…) yazılır.
 */
const kategoriText = (kategori: string) => (kategori === "TEDARICI" ? "" : FIRMA_KATEGORILERI[kategori] || kategori);

/** Siparişin kaç gündür beklediği (yalnız istemcide, veri gelince hesaplanır). */
function waitingDays(tarih: string) {
  const days = Math.floor((Date.now() - new Date(tarih).getTime()) / DAY_MS);
  return days > 0 ? days : 0;
}

function FirmaContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canWriteFinance = can("finance:write");
  const canWriteLab = can("lab:write");
  // Satın alma kaydı hem finans hem stok yazma yetkisi ister (sunucu ile aynı kural).
  const canPurchase = canWriteFinance && can("stock:write");

  const [view, setView] = useTabParam<FirmaView>(VIEW_KEYS, "firmalar");
  const period = useDateRangeParam(PURCHASE_PRESETS, "ay");
  const [firmas, setFirmas] = useState<Firma[]>([]);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  // Sonuç hangi dönem için okunduysa onunla saklanır: dönem değişince eski
  // dönemin satırları ya da "Geçen ay satın alma yok" yazısı yeni dönemmiş gibi görünmez.
  const [purchaseResult, setPurchaseResult] = useState<{ key: string; rows: Purchase[] } | null>(null);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const firmaLoadSequenceRef = useRef(0);
  const purchaseLoadSequenceRef = useRef(0);

  const [search, setSearch] = useState("");
  const [durum, setDurum] = useState<DurumFilter>("aktif");
  const [kategori, setKategori] = useState("");
  const [sort, setSort] = useState<ListSort>({ key: "bakiye", dir: "desc" });
  const [showAddFirma, setShowAddFirma] = useState(false);

  const loadFirmas = useCallback(async () => {
    const sequence = ++firmaLoadSequenceRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      // Pasife alınmış ama borcu kalan firmalar da toplamlarda kalsın diye hepsi okunur.
      const response = await fetch("/api/firma?durum=tumu", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Tedarikçi listesi yüklenemedi.");
      if (sequence !== firmaLoadSequenceRef.current) return;
      setFirmas(Array.isArray(body) ? body : []);
      setLoaded(true);
    } catch (error) {
      if (sequence !== firmaLoadSequenceRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Tedarikçi listesi yüklenemedi.");
    } finally {
      if (sequence === firmaLoadSequenceRef.current) setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersError(null);
    try {
      const response = await fetch("/api/purchases?receiptStatus=SIPARIS_VERILDI", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Bekleyen siparişler yüklenemedi.");
      setOrders(Array.isArray(body) ? body.filter((row: Purchase) => row.receiptStatus === "SIPARIS_VERILDI") : []);
      setOrdersLoaded(true);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Bekleyen siparişler yüklenemedi.");
    }
  }, []);

  const periodRange = period.range;
  const periodError = period.error;
  const periodKey = periodRange ? `${periodRange.from}|${periodRange.to}` : "tum";
  const purchases = purchaseResult && purchaseResult.key === periodKey ? purchaseResult.rows : null;
  // Satın almalar listesi yalnız sekme açılınca ve seçili dönem için okunur.
  const loadPurchases = useCallback(async () => {
    if (periodError) return;
    const sequence = ++purchaseLoadSequenceRef.current;
    const key = periodRange ? `${periodRange.from}|${periodRange.to}` : "tum";
    setPurchasesLoading(true);
    setPurchasesError(null);
    try {
      const params = new URLSearchParams();
      if (periodRange) { params.set("from", periodRange.from); params.set("to", periodRange.to); }
      const response = await fetch(`/api/purchases${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Satın almalar yüklenemedi.");
      if (sequence !== purchaseLoadSequenceRef.current) return;
      setPurchaseResult({ key, rows: Array.isArray(body) ? body : [] });
    } catch (error) {
      if (sequence === purchaseLoadSequenceRef.current) setPurchasesError(error instanceof Error ? error.message : "Satın almalar yüklenemedi.");
    } finally {
      if (sequence === purchaseLoadSequenceRef.current) setPurchasesLoading(false);
    }
  }, [periodRange, periodError]);

  useEffect(() => { void loadFirmas(); void loadOrders(); }, [loadFirmas, loadOrders]);
  useEffect(() => { if (view === "satinalmalar") void loadPurchases(); }, [view, loadPurchases]);

  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; });
  const refreshAll = useCallback(() => {
    void loadFirmas();
    void loadOrders();
    if (viewRef.current === "satinalmalar") void loadPurchases();
    else setPurchaseResult(null);
  }, [loadFirmas, loadOrders, loadPurchases]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshAll, 300);
    };
    window.addEventListener("ks:realtime-sync", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshAll]);

  const activeMaterialFirmas = useMemo(
    () => firmas
      .filter((firma) => firma.isActive && firma.kategori !== "LAB")
      .map((firma) => ({ id: firma.id, name: firma.name, bakiye: firma.bakiye, bekleyenSiparis: firma.bekleyenSiparis })),
    [firmas],
  );
  const purchaseManager = usePurchaseModals({
    firmas: loaded ? activeMaterialFirmas : undefined,
    onFirmasChanged: () => void loadFirmas(),
    onChanged: async () => { refreshAll(); },
    canWrite: canPurchase,
  });

  // Sözleşme §5: ?yeni=1 sayfanın birincil "Yeni" formunu (satın alma) açar.
  const openAddPurchaseRef = useRef(purchaseManager.openAddPurchase);
  useEffect(() => { openAddPurchaseRef.current = purchaseManager.openAddPurchase; });
  useEffect(() => {
    if (searchParams.get("yeni") !== "1" || !canPurchase || !loaded) return;
    openAddPurchaseRef.current(searchParams.get("firmaId") || undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("yeni");
    params.delete("firmaId");
    // history.replaceState: adres temizlenirken sunucuya tur atılmaz.
    window.history.replaceState(null, "", params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }, [searchParams, canPurchase, loaded, pathname]);

  const totalDebt = useMemo(() => firmas.reduce((sum, firma) => sum + Math.max(0, firma.bakiye || 0), 0), [firmas]);

  const filteredFirmas = useMemo(() => {
    const rows = firmas.filter((firma) => {
      if (durum === "aktif" && !firma.isActive) return false;
      if (durum === "pasif" && firma.isActive) return false;
      if (kategori && firma.kategori !== kategori) return false;
      return matchesSearch(search, firma.name, FIRMA_KATEGORILERI[firma.kategori], firma.phone, firma.phone?.replace(/\D/g, ""), firma.iban, firma.primaryKontakt?.ad, firma.notes);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "bakiye") return ((a.bakiye || 0) - (b.bakiye || 0)) * dir || a.name.localeCompare(b.name, "tr");
      if (sort.key === "son") return ((a.sonIslemTarihi || "").localeCompare(b.sonIslemTarihi || "")) * dir;
      return a.name.localeCompare(b.name, "tr") * dir;
    });
  }, [firmas, durum, kategori, search, sort]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => matchesSearch(search, order.firma?.name, summarizeLines(order.lines, 10))),
    [orders, search],
  );
  const filteredPurchases = useMemo(
    () => (purchases || []).filter((row) => matchesSearch(search, row.firma?.name, summarizeLines(row.lines, 10))),
    [purchases, search],
  );

  const exportFirmasCsv = async () => {
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(`tedarikciler-${new Date().toISOString().slice(0, 10)}.csv`, filteredFirmas.map((firma) => ({
      Firma: firma.name,
      Tür: FIRMA_KATEGORILERI[firma.kategori] || firma.kategori,
      Durum: firma.isActive ? "Aktif" : "Pasif",
      Telefon: firma.phone || "",
      IBAN: firma.iban || "",
      "IBAN hesap sahibi": firma.ibanName || "",
      "Toplam alım": firma.borc,
      Ödenen: firma.odenen,
      "Kalan borç": firma.bakiye,
      "Yetkili kişi": firma.primaryKontakt?.ad || "",
      Notlar: firma.notes || "",
    })));
    showToastSafe({ title: "Dosya indirildi", message: `${filteredFirmas.length} tedarikçi Excel'de açılabilir CSV olarak indirildi.`, type: "success" });
  };

  const canPayFirma = (firma: Firma) => canWriteFinance && firma.isActive && firma.bakiye > 0;
  const firmaMenuItems = (firma: Firma): ActionMenuItem[] => [
    ...(firma.isActive && firma.kategori !== "LAB" && canPurchase
      ? [{ key: "satinalma", label: "Satın alma ekle", icon: ShoppingCart, onSelect: () => purchaseManager.openAddPurchase(firma.id) }]
      : []),
    ...(firma.isActive && firma.kategori === "LAB" && canWriteLab
      ? [{ key: "lab", label: "Laboratuvar işi ekle", icon: FlaskConical, href: `/lab?yeni=1&labName=${encodeURIComponent(firma.name)}` }]
      : []),
  ];

  const firmaActions = (firma: Firma) => {
    const menu = firmaMenuItems(firma);
    return (
      <div className="flex justify-end gap-1.5">
        {canPayFirma(firma) && (
          <Button size="sm" variant="secondary" onClick={() => void purchaseManager.openFirmaPayment(firma.id)} aria-label={`${firma.name} için ödeme yap`}>Ödeme yap</Button>
        )}
        {menu.length > 0 && <ActionMenu items={menu} label={`${firma.name} işlemleri`} />}
      </div>
    );
  };

  // Telefon: bütün satır eylemleri kartın sağ üst köşesindeki "…" menüsünde (ayrı eylem sırası yok).
  const firmaMobileMenu = (firma: Firma) => {
    const items: ActionMenuItem[] = [
      ...(canPayFirma(firma) ? [{ key: "odeme", label: "Ödeme yap", icon: Wallet, onSelect: () => void purchaseManager.openFirmaPayment(firma.id) }] : []),
      ...firmaMenuItems(firma),
    ];
    return items.length > 0 ? <ActionMenu items={items} label={`${firma.name} işlemleri`} /> : null;
  };

  // Borcu olmayan tedarikçide hücre boş (her satırda "Borç yok" tekrar etmez); fazla ödeme yazılır.
  const balanceCell = (firma: Firma) => firma.bakiye > 0
    ? <Money value={firma.bakiye} className="font-bold text-slate-900" />
    : firma.bakiye < 0
      ? <span className="whitespace-nowrap text-xs font-semibold text-primary">Alacak <Money value={-firma.bakiye} /></span>
      : null;

  const firmaColumns: ListTableColumn<Firma>[] = [
    {
      key: "name",
      header: "Tedarikçi",
      sortKey: "name",
      cellClassName: "max-w-[300px]",
      render: (firma) => {
        // İkinci satır yalnız bilgi varsa: farklı tür, yetkili kişi, bekleyen sipariş.
        const detail = [
          kategoriText(firma.kategori),
          firma.primaryKontakt?.ad,
          firma.bekleyenSiparis ? `${firma.bekleyenSiparis} sipariş bekliyor` : "",
        ].filter(Boolean).join(" · ");
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/firma-detay?id=${firma.id}`} className="truncate font-semibold text-slate-900 hover:text-primary">{firma.name}</Link>
              {!firma.isActive && <Badge tone="neutral">Pasif</Badge>}
            </div>
            {detail && <p className="truncate text-xs text-slate-500">{detail}</p>}
          </div>
        );
      },
    },
    {
      key: "phone",
      header: "Telefon",
      render: (firma) => firma.phone
        ? <a href={telHref(firma.phone)} className="whitespace-nowrap text-slate-700 hover:text-primary">{formatPhoneNumber(firma.phone)}</a>
        : null,
    },
    { key: "bakiye", header: "Kalan borç", align: "right", sortKey: "bakiye", render: balanceCell },
    {
      key: "son",
      header: "Son işlem",
      sortKey: "son",
      // İşlemi olmayan tedarikçide hücre boş ("İşlem yok" her satırda tekrar etmez).
      render: (firma) => firma.sonIslemTarihi
        ? <DateText value={firma.sonIslemTarihi} className="text-slate-600" />
        : null,
    },
    { key: "actions", header: "", align: "right", render: firmaActions },
  ];

  const orderColumns: ListTableColumn<Purchase>[] = [
    {
      key: "tarih",
      header: "Sipariş tarihi",
      render: (order) => {
        const days = waitingDays(order.tarih);
        return (
          <div className="whitespace-nowrap">
            <DateText value={order.tarih} />
            {days > 0 && <p className={`text-xs ${days > 7 ? "font-semibold text-amber-700" : "text-slate-500"}`}>{days} gündür bekliyor</p>}
          </div>
        );
      },
    },
    { key: "firma", header: "Tedarikçi", render: (order) => <span className="font-semibold text-slate-900">{order.firma?.name || "—"}</span> },
    {
      key: "urunler",
      header: "Ürünler",
      cellClassName: "max-w-[320px]",
      render: (order) => <span className="block truncate text-slate-700">{summarizeLines(order.lines) || `${order._count?.items ?? 0} kalem`}</span>,
    },
    { key: "tutar", header: "Tutar", align: "right", render: (order) => <Money value={order.total ?? null} className="text-slate-700" /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (order) => canPurchase ? (
        <Button size="sm" variant="secondary" onClick={() => void purchaseManager.openReceivePurchase(order.id)}>Teslim al</Button>
      ) : null,
    },
  ];

  const isAwaitingDelivery = (row: Purchase) => row.receiptStatus === "SIPARIS_VERILDI";
  const receiptBadge = (row: Purchase) => <Badge tone={RECEIPT_STATUS_META[row.receiptStatus].tone}>{RECEIPT_STATUS_META[row.receiptStatus].label}</Badge>;
  // Telefon: "Teslim al" kartın sağ üst köşesindeki "…" menüsünde (ayrı eylem sırası yok).
  const orderMobileMenu = (order: Purchase) => (canPurchase ? (
    <ActionMenu
      label={`${order.firma?.name || "Tedarikçi"} siparişi işlemleri`}
      items={[{ key: "teslim", label: "Teslim al", icon: PackageCheck, onSelect: () => void purchaseManager.openReceivePurchase(order.id) }]}
    />
  ) : null);

  const purchaseColumns: ListTableColumn<Purchase>[] = [
    { key: "tarih", header: "Tarih", render: (row) => <DateText value={row.tarih} className="whitespace-nowrap" /> },
    { key: "firma", header: "Tedarikçi", render: (row) => <span className="font-semibold text-slate-900">{row.firma?.name || "—"}</span> },
    {
      key: "urunler",
      header: "Ürünler",
      cellClassName: "max-w-[320px]",
      render: (row) => <span className="block truncate text-slate-700">{summarizeLines(row.lines) || `${row._count?.items ?? 0} kalem`}</span>,
    },
    { key: "tutar", header: "Tutar", align: "right", render: (row) => <Money value={row.total ?? null} className="font-semibold text-slate-900" /> },
    // Olağan durum (teslim alındı) her satırda rozet olarak tekrar etmez; yalnız teslimat
    // bekleyen kayıt işaretlenir. Hiç bekleyen yoksa sütun da yok.
    ...(filteredPurchases.some(isAwaitingDelivery)
      ? [{ key: "durum", header: "Durum", render: (row: Purchase) => (isAwaitingDelivery(row) ? receiptBadge(row) : null) }]
      : []),
  ];

  const firmaFilters = [
    ...(view === "firmalar" && durum !== "aktif" ? [{ key: "durum", label: durum === "pasif" ? "Yalnız pasif tedarikçiler" : "Aktif + pasif", onRemove: () => setDurum("aktif") }] : []),
    ...(view === "firmalar" && kategori ? [{ key: "kategori", label: `Tür: ${FIRMA_KATEGORILERI[kategori]}`, onRemove: () => setKategori("") }] : []),
    ...(view === "satinalmalar" && period.activeFilter ? [period.activeFilter] : []),
  ];
  const searchActive = Boolean(search.trim());

  const toolbarFilters = view === "firmalar" ? (
    <>
      <div className="sm:w-44">
        <Select aria-label="Tedarikçi türü" value={kategori} onChange={(event) => setKategori(event.target.value)}>
          <option value="">Tüm türler</option>
          {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
      </div>
      <div className="sm:w-44">
        <Select aria-label="Tedarikçi durumu" value={durum} onChange={(event) => setDurum(event.target.value as DurumFilter)}>
          <option value="aktif">Aktif tedarikçiler</option>
          <option value="pasif">Pasif tedarikçiler</option>
          <option value="tumu">Tümü</option>
        </Select>
      </div>
    </>
  ) : view === "satinalmalar" ? <DateRangeFilter {...period.filterProps} /> : undefined;

  const toolbarActions = view === "firmalar" ? (
    <>
      {canWriteFinance && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setShowAddFirma(true)}>Yeni tedarikçi</Button>}
      <ExportMenu onExcel={exportFirmasCsv} disabled={filteredFirmas.length === 0} disabledReason="Dışa aktarılacak tedarikçi yok" />
    </>
  ) : undefined;

  // Arama ve süzgeçler listenin kartının üst şeridi: araç çubuğu ayrı kart değil (sadelik K1).
  const toolbar = (
    <>
      <Toolbar
        filters={toolbarFilters}
        filterCount={firmaFilters.length}
        actions={toolbarActions}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={view === "firmalar" ? "Tedarikçi, telefon, IBAN veya yetkili ara" : "Tedarikçi ya da ürün ara"}
          slashShortcut
          wrapperClassName="flex-1 min-w-[220px]"
        />
      </Toolbar>
      <ActiveFilters filters={firmaFilters} onClearAll={() => { setDurum("aktif"); setKategori(""); period.reset(); }} />
    </>
  );

  return (
    <div className="space-y-3">
      <PageHeader
        icon="firma"
        title="Satın alma"
        stats={loaded ? [
          { label: "Tedarikçilere kalan borç", value: formatCurrency(totalDebt), color: totalDebt > 0 ? "text-red-700" : undefined },
        ] : undefined}
        actions={canPurchase ? <Button icon={ShoppingCart} onClick={() => purchaseManager.openAddPurchase()}>Yeni satın alma</Button> : undefined}
      />

      <Tabs<FirmaView>
        ariaLabel="Satın alma bölümleri"
        value={view}
        onChange={setView}
        items={[
          { key: "firmalar", label: "Tedarikçiler" },
          { key: "satinalmalar", label: "Satın almalar" },
          { key: "siparisler", label: "Bekleyen siparişler", count: orders.length, countTone: "warning", countLabel: "bekleyen sipariş" },
        ]}
      />

      {view === "firmalar" && (
        <ListTable<Firma>
          toolbar={toolbar}
          columns={firmaColumns}
          rows={filteredFirmas}
          rowKey={(firma) => firma.id}
          loading={loading && !loaded}
          error={!loaded ? loadError : null}
          staleError={loaded ? loadError : null}
          onRetry={() => void loadFirmas()}
          emptyText={firmaFilters.length > 0 || searchActive ? "Bu filtreye uyan tedarikçi yok" : "Henüz tedarikçi eklenmemiş"}
          // Boş listede ayrı "Yeni tedarikçi" düğmesi yok: araç çubuğundaki aynı düğme zaten görünür.
          emptyDescription={firmaFilters.length > 0 || searchActive ? undefined : "Alımı “Yeni satın alma” ile girerken tedarikçiyi de ekleyebilirsiniz."}
          emptyIcon={FirmaEmptyIcon}
          emptyIllustrative
          onRowClick={(firma) => router.push(`/firma-detay?id=${firma.id}`)}
          getRowAriaLabel={(firma) => `${firma.name} tedarikçi sayfasını aç`}
          sort={sort}
          onSortChange={(key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }))}
          mobileCard={(firma) => {
            const detail = [
              kategoriText(firma.kategori),
              firma.phone ? formatPhoneNumber(firma.phone) : "",
              firma.bekleyenSiparis ? `${firma.bekleyenSiparis} sipariş bekliyor` : "",
            ].filter(Boolean).join(" · ");
            return (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{firma.name}{!firma.isActive ? " · Pasif" : ""}</p>
                  {detail && <p className="truncate text-xs text-slate-500">{detail}</p>}
                </div>
                <div className="shrink-0 text-right">
                  {balanceCell(firma)}
                </div>
              </div>
            );
          }}
          mobileCardActions={firmaMobileMenu}
        />
      )}

      {view === "satinalmalar" && (
        <ListTable<Purchase>
          toolbar={toolbar}
          columns={purchaseColumns}
          rows={filteredPurchases}
          rowKey={(row) => row.id}
          loading={purchasesLoading && purchases === null}
          error={purchases === null ? purchasesError : null}
          staleError={purchases !== null ? purchasesError : null}
          onRetry={() => void loadPurchases()}
          emptyText={searchActive ? "Bu aramaya uyan satın alma yok" : `${period.value.preset === "ozel" ? "Seçilen dönemde" : DATE_PRESET_LABELS[period.value.preset]} satın alma yok`}
          emptyDescription={searchActive ? undefined : "Alımı “Yeni satın alma” ile girin; teslim alınan ve bekleyen kayıtlar burada listelenir."}
          onRowClick={(row) => void purchaseManager.openPurchaseDetail(row.id)}
          getRowAriaLabel={(row) => `${row.firma?.name || "Tedarikçi"} satın alması ayrıntısını aç`}
          mobileCard={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{row.firma?.name}</p>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                  {isAwaitingDelivery(row) && receiptBadge(row)}
                  <span className="truncate"><DateText value={row.tarih} /> · {summarizeLines(row.lines) || `${row._count?.items ?? 0} kalem`}</span>
                </p>
              </div>
              <Money value={row.total ?? null} className="shrink-0 font-semibold text-slate-900" />
            </div>
          )}
        />
      )}

      {view === "siparisler" && (
        <ListTable<Purchase>
          toolbar={toolbar}
          columns={orderColumns}
          rows={filteredOrders}
          rowKey={(order) => order.id}
          loading={!ordersLoaded && !ordersError}
          error={!ordersLoaded ? ordersError : null}
          staleError={ordersLoaded ? ordersError : null}
          onRetry={() => void loadOrders()}
          emptyText={searchActive ? "Bu aramaya uyan sipariş yok" : "Teslimat bekleyen sipariş yok"}
          emptyDescription={searchActive ? undefined : "“Yeni satın alma”da durum “Sipariş verildi” seçilen kayıtlar ürünler gelene kadar burada bekler."}
          onRowClick={(order) => void purchaseManager.openPurchaseDetail(order.id)}
          getRowAriaLabel={(order) => `${order.firma?.name || "Tedarikçi"} siparişini aç`}
          // Telefon kartı iki satır: tedarikçi + tutar; tarih · ürünler. "Teslim al" sağ üstte "…".
          mobileCard={(order) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{order.firma?.name}</p>
                <p className="truncate text-xs text-slate-500"><DateText value={order.tarih} /> · {summarizeLines(order.lines) || `${order._count?.items ?? 0} kalem`}</p>
              </div>
              <Money value={order.total ?? null} className="shrink-0 text-sm font-semibold text-slate-900" />
            </div>
          )}
          mobileCardActions={canPurchase ? orderMobileMenu : undefined}
        />
      )}

      <FirmaFormModal
        open={showAddFirma}
        onClose={() => setShowAddFirma(false)}
        onSaved={async () => { await loadFirmas(); }}
      />

      {purchaseManager.modals}
    </div>
  );
}

export default function FirmaPage() {
  return (
    <Suspense fallback={null}>
      <FirmaContent />
    </Suspense>
  );
}
