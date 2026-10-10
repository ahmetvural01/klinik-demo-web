"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MinusCircle, Plus, RotateCcw, ShoppingCart } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { formatCurrency } from "@/lib/format";
import { toMoneyValue } from "@/lib/money-input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { Button, IconButton } from "@/components/ui/Button";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Badge } from "@/components/ui/Badge";
import { ListTable, EmptyValue, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money, formatDateText } from "@/components/ui/Money";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { StockItemFormModal } from "@/components/stock/StockItemFormModal";
import { StockMovementModal, type StockLotPreview } from "@/components/stock/StockMovementModal";
import { StockItemDetailModal } from "@/components/stock/StockItemDetailModal";
import { printBarcodeLabel } from "@/components/stock/barcode-print";
import {
  STOCK_CATEGORIES,
  countCriticalStock,
  expiryState,
  formatQuantity,
  isCriticalStock,
  isLowStock,
  itemExpiry,
  matchesSearch,
  optionsWithCurrent,
  searchKey,
  stockBadges,
  stockCategoryLabel,
  stockLabelCode,
  suggestedOrderQuantity,
  type StockItem,
} from "@/components/stock/stock-shared";
import { usePurchaseModals } from "@/components/firma/usePurchaseModals";

const StockEmptyIcon = createSceneIllustration("stok");

const VIEW_KEYS = ["tumu", "kritik", "siparis", "skt", "arsiv"] as const;
type StockView = typeof VIEW_KEYS[number];
const PAGE_SIZE = 25;
const NAME_SORT: ListSort = { key: "name", dir: "asc" };
const EXPIRY_SORT: ListSort = { key: "expiry", dir: "asc" };

/** Eski `?durum=` bağlantıları (menü, ana sayfa, yer imleri) yeni sekmelere eşlenir. */
const LEGACY_VIEW: Record<string, StockView> = { tumu: "tumu", kritik: "kritik", siparis: "siparis", "skt-yakin": "skt", "skt-gecti": "skt", arsiv: "arsiv" };

const VIEW_FILTER: Record<Exclude<StockView, "tumu" | "arsiv">, (item: StockItem) => boolean> = {
  kritik: (item) => isCriticalStock(item),
  siparis: (item) => (item.onOrderQuantity || 0) > 0,
  skt: (item) => {
    const state = expiryState(itemExpiry(item));
    return state === "expired" || state === "soon";
  },
};

function StokContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canWriteStock = can("stock:write");
  const canDeleteStock = can("stock:delete");
  // Satın alma kaydı hem finans hem stok yazma yetkisi ister (sunucu ile aynı kural).
  const canOrder = canWriteStock && can("finance:write");
  // Maliyet (alış fiyatı, ortalama maliyet, stok değeri) finans bilgisidir;
  // sunucu da finance:read olmayan rollere bu alanları göndermez.
  const canSeeCost = can("finance:read");

  const legacyView = LEGACY_VIEW[searchParams.get("durum") || ""] || "tumu";
  const [view, setView] = useTabParam<StockView>(VIEW_KEYS, legacyView);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archived, setArchived] = useState<StockItem[] | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<ListSort | null>(null);
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formItem, setFormItem] = useState<StockItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [move, setMove] = useState<{ item: StockItem; lots: StockLotPreview[] | null } | null>(null);

  const fetchItems = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/stock", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Stok listesi yüklenemedi.");
      if (sequence !== loadSequenceRef.current) return;
      setItems(Array.isArray(body) ? body : []);
      setLoaded(true);
    } catch (error) {
      if (sequence !== loadSequenceRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Stok listesi yüklenemedi.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, []);

  const fetchArchived = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const response = await fetch("/api/stock?arsiv=1", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Arşiv yüklenemedi.");
      setArchived(Array.isArray(body) ? body : []);
    } catch (error) {
      // Önceden yalnız kısa bildirim çıkıyor, liste "Arşivde ürün yok" diyordu.
      setArchiveError(error instanceof Error ? error.message : "Arşiv yüklenemedi.");
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  useEffect(() => { void fetchItems(); }, [fetchItems]);
  useEffect(() => { if (view === "arsiv" && archived === null) void fetchArchived(); }, [view, archived, fetchArchived]);

  // Eski `?durum=` adresi sekme parametresine çevrilir (adres temiz kalır).
  useEffect(() => {
    if (!searchParams.get("durum")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("durum");
    if (!params.get("tab") && legacyView !== "tumu") params.set("tab", legacyView);
    window.history.replaceState(null, "", params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }, [searchParams, legacyView, pathname]);

  // Başka bir personel stok hareketi yaptığında ya da sekmeye dönüldüğünde listeyi tazele.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void fetchItems(); }, 400);
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
  }, [fetchItems]);

  // Üst bardaki "+ Yeni" menüsü ya da başka ekran ?yeni=1 ile yeni ürün formunu açar.
  useEffect(() => {
    if (searchParams.get("yeni") !== "1" || !canWriteStock) return;
    setFormItem(null);
    setFormOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("yeni");
    // history.replaceState: adres temizlenirken sunucuya tur atılmaz.
    window.history.replaceState(null, "", params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }, [searchParams, canWriteStock, pathname]);

  const activeSort = sort ?? (view === "skt" ? EXPIRY_SORT : NAME_SORT);
  useEffect(() => { setPage(1); }, [view, search, category, sort]);

  const counts = useMemo(() => {
    let siparis = 0;
    let skt = 0;
    let expired = 0;
    for (const item of items) {
      if (VIEW_FILTER.siparis(item)) siparis += 1;
      const state = expiryState(itemExpiry(item));
      if (state === "expired") expired += 1;
      if (state === "expired" || state === "soon") skt += 1;
    }
    return { kritik: countCriticalStock(items), siparis, skt, expired };
  }, [items]);

  const categoryOptions = useMemo(
    () => optionsWithCurrent(STOCK_CATEGORIES, ...items.map((item) => stockCategoryLabel(item.category))),
    [items],
  );

  const baseRows = useMemo(() => (view === "arsiv" ? archived || [] : items), [view, archived, items]);
  const filtered = useMemo(() => {
    const rows = baseRows.filter((item) => {
      if (!matchesSearch(search, item.name, item.barcode, stockLabelCode(item), item.storageLocation, item.lastPurchase?.supplier, item.category, stockCategoryLabel(item.category))) return false;
      // Eski kodlar ("MEDIKAL", "SARF") bugünkü etiketle süzülür (kayıt değişmez).
      if (category && stockCategoryLabel(item.category) !== category) return false;
      if (view === "tumu" || view === "arsiv") return true;
      return VIEW_FILTER[view](item);
    });
    const dir = activeSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (activeSort.key === "quantity") return (a.quantity - b.quantity) * dir;
      if (activeSort.key === "expiry") return ((itemExpiry(a) || "9999").localeCompare(itemExpiry(b) || "9999")) * dir;
      if (activeSort.key === "cost") return ((a.averageUnitPrice || 0) - (b.averageUnitPrice || 0)) * dir;
      return a.name.localeCompare(b.name, "tr") * dir;
    });
  }, [baseRows, search, category, view, activeSort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalValue = useMemo(() => items.reduce((sum, item) => sum + item.quantity * (item.averageUnitPrice || 0), 0), [items]);
  const detailItem = detailId ? items.find((item) => item.id === detailId) || null : null;
  const singleMatch = view !== "arsiv" && search.trim() && filtered.length === 1 ? filtered[0] : null;

  // Kendi işlemimizden sonra yalnız liste yenilenir; menü rozetleri sunucunun
  // gerçek zamanlı olayıyla güncellenir (önceden yerel olay + doğrudan istek
  // aynı ağır listeyi 2-3 kez çekiyordu).
  const afterChange = useCallback(() => {
    void fetchItems();
  }, [fetchItems]);

  const purchaseManager = usePurchaseModals({
    stockItems: items,
    canWrite: canOrder,
    onChanged: async () => { afterChange(); },
  });

  const openOrder = (item: StockItem) => {
    purchaseManager.openAddPurchase(item.lastPurchase?.supplierId || undefined, {
      receiptStatus: "SIPARIS_VERILDI",
      firmaName: item.lastPurchase?.supplier || null,
      lines: [{
        stockItemId: item.id,
        productQuery: item.name,
        unit: item.unit,
        quantity: String(suggestedOrderQuantity(item)),
        unitPrice: toMoneyValue(item.lastPurchase?.unitPrice) ?? "",
      }],
    });
  };

  const openMove = (item: StockItem, lots: StockLotPreview[] | null = null) => setMove({ item, lots });

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || view === "arsiv") return;
    const query = searchKey(search);
    if (!query) return;
    // Barkod okuyucu kodu yazıp Enter'a basar: tam barkod/etiket eşleşmesi ya da
    // tek sonuç varsa ürün doğrudan açılır (asistan: okut → miktar → Enter).
    const exact = items.find((item) => searchKey(item.barcode) === query || searchKey(stockLabelCode(item)) === query);
    const target = exact || singleMatch;
    if (!target) return;
    event.preventDefault();
    setSearch("");
    if (canWriteStock) openMove(target);
    else setDetailId(target.id);
  };

  const archiveItem = async (item: StockItem) => {
    const hasStock = item.quantity > 0;
    const confirmed = await confirmDialog({
      title: "Ürün arşivlensin mi?",
      message: hasStock
        ? `"${item.name}" kartında ${formatQuantity(item.quantity, item.unit)} stok görünüyor. Arşivlenince listede ve uyarılarda görünmez; geçmiş hareketler saklanır, "Arşiv" sekmesinden geri alınabilir. Ürün gerçekten bittiyse önce "Stok hareketi" ile çıkış yapın.`
        : `"${item.name}" listeden kaldırılır; geçmiş hareketler saklanır ve "Arşiv" sekmesinden geri alınabilir.`,
      danger: true,
      confirmText: "Arşivle",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/stock/${item.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.message || "Ürün arşivlenemedi. Tekrar deneyin.");
      setDetailId(null);
      setArchived(null);
      showToastSafe({ title: "Ürün arşivlendi", message: `${item.name} "Arşiv" sekmesine taşındı.`, type: "success" });
      afterChange();
    } catch (error) {
      showToastSafe({ title: "Ürün arşivlenemedi", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    }
  };

  const restoreItem = async (item: StockItem) => {
    try {
      const response = await fetch(`/api/stock/${item.id}/restore`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Ürün geri alınamadı.");
      showToastSafe({ title: "Ürün geri alındı", message: `${item.name} yeniden listede.`, type: "success" });
      setArchived((current) => (current || []).filter((row) => row.id !== item.id));
      afterChange();
    } catch (error) {
      showToastSafe({ title: "Geri alınamadı", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    }
  };

  const printBarcode = async (item: StockItem) => {
    // Pencere tıklamayla aynı anda açılır; barkod kütüphanesi ardından yüklenir.
    const result = await printBarcodeLabel({ id: item.id, name: item.name, barcode: item.barcode, storageLocation: item.storageLocation, expiry: itemExpiry(item) });
    if (result === "popup-blocked") showToastSafe({ title: "Pencere açılamadı", message: "Tarayıcı açılır pencereyi engelledi. Bu site için açılır pencerelere izin verin.", type: "error" });
    if (result === "invalid-code") showToastSafe({ title: "Barkod basılamadı", message: "Barkod yalnız harf ve rakam içermeli. Ürünü düzenleyip barkodu kontrol edin.", type: "error" });
    if (result === "load-failed") showToastSafe({ title: "Barkod hazırlanamadı", message: "Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
  };

  const exportCsv = async () => {
    // CSV kütüphanesi yalnız dışa aktarırken yüklenir (sayfa açılışını hafifletir).
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(`stok-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((item) => ({
      Ürün: item.name,
      Kategori: item.category,
      Mevcut: item.quantity,
      Minimum: item.minQuantity,
      Siparişte: item.onOrderQuantity || 0,
      Birim: item.unit,
      Durum: stockBadges(item).map((badge) => badge.label).join(", ") || "Yeterli",
      "En yakın SKT": itemExpiry(item) ? formatDateText(itemExpiry(item) as string) : "",
      ...(canSeeCost ? {
        "Ortalama maliyet": item.averageUnitPrice ?? "",
        "Stok değeri": item.averageUnitPrice ? Math.round(item.quantity * item.averageUnitPrice * 100) / 100 : "",
      } : {}),
      "Son tedarikçi": item.lastPurchase?.supplier || "",
      "Raf / konum": item.storageLocation || "",
      Barkod: item.barcode || "",
    })));
    showToastSafe({ title: "Dosya indirildi", message: `${filtered.length} ürün Excel'de açılabilir CSV olarak indirildi.`, type: "success" });
  };

  const statusBadges = (item: StockItem) => {
    if (view === "arsiv") return <Badge tone="neutral">Arşivde</Badge>;
    const badges = stockBadges(item);
    if (badges.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {badges.map((badge) => <Badge key={badge.key} tone={badge.tone}>{badge.label}</Badge>)}
      </div>
    );
  };

  function rowActions(item: StockItem) {
    if (view === "arsiv") {
      return canDeleteStock ? (
        <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => void restoreItem(item)}>Geri al</Button>
      ) : null;
    }
    return (
      <div className="flex justify-end gap-1.5">
        {canOrder && isCriticalStock(item) && (
          <IconButton icon={ShoppingCart} title={`${item.name} için sipariş ver (son tedarikçi ve fiyatla)`} tone="primary" size="sm" onClick={() => openOrder(item)} />
        )}
        {canWriteStock && (
          <Button size="sm" variant="secondary" icon={MinusCircle} onClick={() => openMove(item)} aria-label={`${item.name} stoktan düş`}>
            Stoktan düş
          </Button>
        )}
      </div>
    );
  }

  const columns: ListTableColumn<StockItem>[] = [
    {
      key: "name",
      header: "Ürün",
      sortKey: "name",
      cellClassName: "max-w-[320px]",
      render: (item) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{item.name}</p>
          <p className="truncate text-xs text-slate-500">
            {[stockCategoryLabel(item.category), item.storageLocation ? `Raf ${item.storageLocation}` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Mevcut",
      align: "right",
      sortKey: "quantity",
      render: (item) => (
        <div className="whitespace-nowrap">
          <span className={`font-bold tabular-nums ${isLowStock(item) ? "text-red-700" : "text-slate-900"}`}>{formatQuantity(item.quantity, item.unit)}</span>
          <p className="text-xs text-slate-500">min {item.minQuantity}</p>
        </div>
      ),
    },
    { key: "durum", header: "Durum", render: statusBadges },
    {
      key: "expiry",
      header: "En yakın SKT",
      sortKey: "expiry",
      render: (item) => {
        const expiry = itemExpiry(item);
        if (!expiry) return <EmptyValue />;
        const state = expiryState(expiry);
        return <DateText value={expiry} className={state === "expired" ? "font-semibold text-red-700" : state === "soon" ? "font-semibold text-amber-700" : "text-slate-600"} />;
      },
    },
    ...(canSeeCost ? [{
      key: "cost",
      header: "Ort. maliyet",
      align: "right" as const,
      sortKey: "cost",
      render: (item: StockItem) => <Money value={item.averageUnitPrice ?? null} className="text-slate-700" />,
    }] : []),
    {
      key: "actions",
      header: "",
      align: "right",
      render: (item) => rowActions(item),
    },
  ];

  const activeFilters = [
    ...(category ? [{ key: "category", label: `Kategori: ${category}`, onRemove: () => setCategory("") }] : []),
  ];

  const filteredOut = Boolean(search.trim()) || activeFilters.length > 0;
  const emptyText = view === "arsiv"
    ? (filteredOut ? "Bu aramaya uyan arşivli ürün yok" : "Arşivde ürün yok")
    : filteredOut || view !== "tumu"
      ? view === "kritik" && !filteredOut ? "Kritik seviyede ürün yok" : "Bu filtreye uyan ürün yok"
      : "Henüz ürün eklenmemiş";

  const listLoading = view === "arsiv" ? archiveLoading && archived === null : loading && !loaded;
  const listError = view === "arsiv" ? (archived === null ? archiveError : null) : (!loaded ? loadError : null);
  const listStaleError = view === "arsiv" ? (archived !== null ? archiveError : null) : (loaded ? loadError : null);

  return (
    <div className="space-y-3">
      <PageHeader
        icon="box"
        title="Stok"
        stats={loaded && canSeeCost ? [{ label: "Stok değeri", value: formatCurrency(totalValue) }] : undefined}
        actions={canWriteStock ? (
          <Button icon={Plus} onClick={() => { setFormItem(null); setFormOpen(true); }}>Yeni ürün</Button>
        ) : undefined}
      />

      <Tabs<StockView>
        ariaLabel="Stok durumu"
        value={view}
        onChange={(key) => { setView(key); setSort(null); }}
        items={[
          { key: "tumu", label: "Tümü" },
          { key: "kritik", label: "Kritik", count: loaded ? counts.kritik : undefined, countTone: "critical", countLabel: "kritik ürün" },
          { key: "siparis", label: "Siparişte", count: loaded ? counts.siparis : undefined, countLabel: "siparişteki ürün" },
          { key: "skt", label: "SKT", count: loaded ? counts.skt : undefined, countTone: counts.expired > 0 ? "critical" : "warning", countLabel: "SKT’si yakın ya da geçmiş ürün" },
          { key: "arsiv", label: "Arşiv" },
        ]}
      />

      <Toolbar
        filters={(
          <div className="sm:w-48">
            <Select aria-label="Kategori" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Tüm kategoriler</option>
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </div>
        )}
        filterCount={activeFilters.length}
        actions={<ExportMenu onExcel={exportCsv} disabled={filtered.length === 0} disabledReason="Dışa aktarılacak ürün yok" />}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          onKeyDown={onSearchKeyDown}
          placeholder="Ürün, barkod, raf veya tedarikçi ara"
          slashShortcut
          wrapperClassName="flex-1 min-w-[220px]"
        />
      </Toolbar>
      {(activeFilters.length > 0 || (singleMatch && canWriteStock)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ActiveFilters filters={activeFilters} onClearAll={() => setCategory("")} />
          {singleMatch && canWriteStock && (
            <p className="text-xs text-slate-500">
              <kbd className="rounded border border-slate-200 bg-white px-1 font-sans text-[11px] text-slate-600">Enter</kbd> ile <span className="font-semibold text-slate-700">{singleMatch.name}</span> stoktan düşülür
            </p>
          )}
        </div>
      )}

      <ListTable<StockItem>
        columns={columns}
        rows={pageRows}
        rowKey={(item) => item.id}
        loading={listLoading}
        error={listError}
        staleError={listStaleError}
        onRetry={() => void (view === "arsiv" ? fetchArchived() : fetchItems())}
        emptyText={emptyText}
        emptyDescription={view === "tumu" && !filteredOut ? "İlk ürünü “Yeni ürün” ile ekleyin ya da Satın alma'da faturayı girin; ürünler otomatik eklenir." : undefined}
        emptyAction={view === "tumu" && !filteredOut && canWriteStock ? <Button size="sm" icon={Plus} onClick={() => { setFormItem(null); setFormOpen(true); }}>Yeni ürün</Button> : undefined}
        emptyIcon={StockEmptyIcon}
        emptyIllustrative
        onRowClick={view === "arsiv" ? undefined : (item) => setDetailId(item.id)}
        getRowAriaLabel={(item) => `${item.name} ürün detayını aç`}
        sort={activeSort}
        onSortChange={(key) => setSort({ key, dir: activeSort.key === key && activeSort.dir === "asc" ? "desc" : "asc" })}
        pager={filtered.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: filtered.length, onPageChange: setPage } : undefined}
        mobileCard={(item) => {
          const expiry = itemExpiry(item);
          const expiryWarn = expiry ? expiryState(expiry) : null;
          return (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* Telefonda ad kesilmez, alt satıra geçer (yanında eylem düğmeleri var). */}
                <p className="break-words font-semibold text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  <span className={isLowStock(item) ? "font-bold text-red-700" : "font-semibold text-slate-700"}>{formatQuantity(item.quantity, item.unit)}</span>
                  {` · min ${item.minQuantity}`}
                  {item.storageLocation ? ` · Raf ${item.storageLocation}` : ""}
                  {expiry && (expiryWarn === "expired" || expiryWarn === "soon") ? <> · SKT <DateText value={expiry} /></> : null}
                </p>
                <div className="mt-1">{statusBadges(item)}</div>
              </div>
              <div className="shrink-0">{rowActions(item)}</div>
            </div>
          );
        }}
      />

      <StockItemDetailModal
        item={detailItem}
        onClose={() => setDetailId(null)}
        canWrite={canWriteStock}
        canDelete={canDeleteStock}
        canOrder={canOrder}
        canSeeCost={canSeeCost}
        onMove={(item, lots) => openMove(item, lots)}
        onEdit={(item) => { setFormItem(item); setFormOpen(true); }}
        onArchive={(item) => void archiveItem(item)}
        onOrder={(item) => { setDetailId(null); openOrder(item); }}
        onPrintBarcode={(item) => void printBarcode(item)}
      />

      <StockItemFormModal
        open={formOpen}
        item={formItem}
        onClose={() => setFormOpen(false)}
        onSaved={() => afterChange()}
      />

      <StockMovementModal
        open={Boolean(move)}
        item={move ? items.find((row) => row.id === move.item.id) || move.item : null}
        lots={move?.lots}
        canSeeCost={canSeeCost}
        onClose={() => setMove(null)}
        onSaved={() => afterChange()}
      />

      {purchaseManager.modals}
    </div>
  );
}

export default function StokPage() {
  return (
    <Suspense fallback={null}>
      <StokContent />
    </Suspense>
  );
}
