"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, MinusCircle, Plus, RotateCcw, ShoppingCart } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { downloadCsv } from "@/lib/csv-export";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ListTable, EmptyValue, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money, formatDateText } from "@/components/ui/Money";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { StockItemFormModal } from "@/components/stock/StockItemFormModal";
import { StockMovementModal } from "@/components/stock/StockMovementModal";
import { StockItemDetailModal } from "@/components/stock/StockItemDetailModal";
import { printBarcodeLabel } from "@/components/stock/barcode-print";
import {
  STOCK_CATEGORIES,
  STOCK_STATUS_META,
  expiryState,
  formatQuantity,
  itemExpiry,
  matchesSearch,
  optionsWithCurrent,
  stockStatus,
  suggestedOrderQuantity,
  type StockItem,
  type StockStatusKey,
} from "@/components/stock/stock-shared";
import { usePurchaseModals, type PurchaseFirmaOption } from "../firma/purchase-shared";

const StockEmptyIcon = createSceneIllustration("stok");

const VIEW_KEYS = ["tumu", "kritik", "siparis", "skt-yakin", "skt-gecti", "arsiv"] as const;
type StockView = typeof VIEW_KEYS[number];
const PAGE_SIZE = 25;

const VIEW_FILTER: Record<Exclude<StockView, "tumu" | "arsiv">, (item: StockItem, status: StockStatusKey) => boolean> = {
  kritik: (_item, status) => status === "critical",
  siparis: (item) => (item.onOrderQuantity || 0) > 0,
  "skt-yakin": (item) => expiryState(itemExpiry(item)) === "soon",
  "skt-gecti": (item) => expiryState(itemExpiry(item)) === "expired",
};

function StokContent() {
  const router = useRouter();
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

  const [view, setView] = useTabParam<StockView>(VIEW_KEYS, "tumu", "durum");
  const [items, setItems] = useState<StockItem[]>([]);
  const [archived, setArchived] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const loadSequenceRef = useRef(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<ListSort>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [firmas, setFirmas] = useState<PurchaseFirmaOption[]>([]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formItem, setFormItem] = useState<StockItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<StockItem | null>(null);

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
      setRefreshToken((value) => value + 1);
    } catch (error) {
      if (sequence !== loadSequenceRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Stok listesi yüklenemedi.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, []);

  const fetchArchived = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const response = await fetch("/api/stock?arsiv=1", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Arşiv yüklenemedi.");
      setArchived(Array.isArray(body) ? body : []);
    } catch (error) {
      showToastSafe({ title: "Arşiv yüklenemedi", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const fetchFirmas = useCallback(async () => {
    if (!canOrder) return;
    try {
      const response = await fetch("/api/firma", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body)) return;
      setFirmas(body
        .filter((firma: { kategori?: string }) => firma.kategori !== "LAB")
        .map((firma: { id: string; name: string; bakiye?: number }) => ({ id: firma.id, name: firma.name, bakiye: firma.bakiye })));
    } catch {
      // Firma listesi yalnız "Sipariş ver" için gerekir; yüklenemezse form firma araması boş kalır.
    }
  }, [canOrder]);

  useEffect(() => { void fetchItems(); void fetchFirmas(); }, [fetchItems, fetchFirmas]);
  useEffect(() => { if (view === "arsiv") void fetchArchived(); }, [view, fetchArchived]);

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
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [searchParams, canWriteStock, pathname, router]);

  useEffect(() => { setPage(1); }, [view, search, category, sort]);

  const statusById = useMemo(() => new Map(items.map((item) => [item.id, stockStatus(item)])), [items]);
  const counts = useMemo(() => {
    const result = { kritik: 0, siparis: 0, "skt-yakin": 0, "skt-gecti": 0 } as Record<Exclude<StockView, "tumu" | "arsiv">, number>;
    for (const item of items) {
      const status = statusById.get(item.id) || "ok";
      (Object.keys(result) as Array<keyof typeof result>).forEach((key) => {
        if (VIEW_FILTER[key](item, status)) result[key] += 1;
      });
    }
    return result;
  }, [items, statusById]);

  const categoryOptions = useMemo(
    () => optionsWithCurrent(STOCK_CATEGORIES, ...items.map((item) => item.category)),
    [items],
  );

  const baseRows = view === "arsiv" ? archived : items;
  const filtered = useMemo(() => {
    const rows = baseRows.filter((item) => {
      if (!matchesSearch(search, item.name, item.barcode, item.storageLocation, item.lastPurchase?.supplier, item.category)) return false;
      if (category && item.category !== category) return false;
      if (view === "tumu" || view === "arsiv") return true;
      return VIEW_FILTER[view](item, statusById.get(item.id) || "ok");
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "quantity") return (a.quantity - b.quantity) * dir;
      if (sort.key === "expiry") return ((itemExpiry(a) || "9999").localeCompare(itemExpiry(b) || "9999")) * dir;
      if (sort.key === "cost") return ((a.averageUnitPrice || 0) - (b.averageUnitPrice || 0)) * dir;
      return a.name.localeCompare(b.name, "tr") * dir;
    });
  }, [baseRows, search, category, view, statusById, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalValue = useMemo(() => items.reduce((sum, item) => sum + item.quantity * (item.averageUnitPrice || 0), 0), [items]);
  const detailItem = detailId ? items.find((item) => item.id === detailId) || null : null;

  const afterChange = useCallback(() => {
    window.dispatchEvent(new CustomEvent("ks:realtime-sync", { detail: { scope: "stock" } }));
    void fetchItems();
  }, [fetchItems]);

  const purchaseManager = usePurchaseModals({
    stockItems: items,
    firmas,
    canWrite: canOrder,
    onChanged: async () => { afterChange(); },
  });

  const openOrder = (item: StockItem) => {
    const supplierId = item.lastPurchase?.supplierId && firmas.some((firma) => firma.id === item.lastPurchase?.supplierId)
      ? item.lastPurchase.supplierId
      : undefined;
    purchaseManager.openAddPurchase(supplierId, {
      receiptStatus: "SIPARIS_VERILDI",
      lines: [{
        stockItemId: item.id,
        productQuery: item.name,
        unit: item.unit,
        quantity: String(suggestedOrderQuantity(item)),
        unitPrice: item.lastPurchase?.unitPrice ? String(item.lastPurchase.unitPrice) : "",
      }],
    });
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
      setArchived((current) => current.filter((row) => row.id !== item.id));
      afterChange();
    } catch (error) {
      showToastSafe({ title: "Geri alınamadı", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    }
  };

  const printBarcode = (item: StockItem) => {
    const result = printBarcodeLabel({ id: item.id, name: item.name, barcode: item.barcode, storageLocation: item.storageLocation, expiry: itemExpiry(item) });
    if (result === "popup-blocked") showToastSafe({ title: "Pencere açılamadı", message: "Tarayıcı açılır pencereyi engelledi. Bu site için açılır pencerelere izin verin.", type: "error" });
    if (result === "invalid-code") showToastSafe({ title: "Barkod basılamadı", message: "Barkod yalnız harf ve rakam içermeli. Ürünü düzenleyip barkodu kontrol edin.", type: "error" });
  };

  const exportCsv = () => {
    downloadCsv(`stok-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((item) => ({
      Ürün: item.name,
      Kategori: item.category,
      Mevcut: item.quantity,
      Minimum: item.minQuantity,
      Siparişte: item.onOrderQuantity || 0,
      Birim: item.unit,
      Durum: STOCK_STATUS_META[stockStatus(item)].label,
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
            {[item.category, item.storageLocation ? `Raf ${item.storageLocation}` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Mevcut",
      align: "right",
      sortKey: "quantity",
      render: (item) => {
        const low = item.quantity < item.minQuantity;
        return (
          <div className="whitespace-nowrap">
            <span className={`font-bold tabular-nums ${low ? "text-red-700" : "text-slate-900"}`}>{formatQuantity(item.quantity, item.unit)}</span>
            <p className="text-xs text-slate-500">min {item.minQuantity}{item.onOrderQuantity ? ` · siparişte ${item.onOrderQuantity}` : ""}</p>
          </div>
        );
      },
    },
    {
      key: "durum",
      header: "Durum",
      render: (item) => {
        if (view === "arsiv") return <Badge tone="neutral">Arşivde</Badge>;
        const status = statusById.get(item.id) || "ok";
        return status === "ok"
          ? <span className="text-xs text-slate-500">Yeterli</span>
          : <Badge tone={STOCK_STATUS_META[status].tone}>{STOCK_STATUS_META[status].label}</Badge>;
      },
    },
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

  function rowActions(item: StockItem) {
    if (view === "arsiv") {
      return canDeleteStock ? (
        <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => void restoreItem(item)}>Geri al</Button>
      ) : null;
    }
    const status = statusById.get(item.id) || "ok";
    return (
      <div className="flex justify-end gap-1.5">
        {canOrder && status === "critical" && (
          <IconButton icon={ShoppingCart} title={`${item.name} için sipariş ver`} tone="primary" size="sm" onClick={() => openOrder(item)} />
        )}
        {canWriteStock && (
          <IconButton icon={MinusCircle} title={`${item.name} stok çıkışı`} size="sm" onClick={() => setMoveItem(item)} />
        )}
      </div>
    );
  }

  const activeFilters = [
    ...(search.trim() ? [{ key: "search", label: `Arama: ${search.trim()}`, onRemove: () => setSearch("") }] : []),
    ...(category ? [{ key: "category", label: `Kategori: ${category}`, onRemove: () => setCategory("") }] : []),
  ];

  const emptyText = view === "arsiv"
    ? "Arşivde ürün yok"
    : activeFilters.length > 0 || view !== "tumu"
      ? "Bu filtreye uyan ürün yok"
      : "Henüz ürün eklenmemiş";

  return (
    <div className="space-y-3">
      <PageHeader
        icon="box"
        title="Stok"
        description="Ürünlerin miktarı, son kullanma tarihi ve kritik seviyesi."
        stats={loaded ? [
          { label: "Ürün", value: items.length.toLocaleString("tr-TR") },
          ...(canSeeCost ? [{ label: "Stok değeri", value: formatCurrency(totalValue) }] : []),
        ] : undefined}
        actions={canWriteStock ? (
          <Button icon={Plus} onClick={() => { setFormItem(null); setFormOpen(true); }}>Yeni Ürün</Button>
        ) : undefined}
      />

      <Tabs<StockView>
        ariaLabel="Stok durumu"
        value={view}
        onChange={setView}
        items={[
          { key: "tumu", label: "Tümü" },
          { key: "kritik", label: "Kritik", count: loaded ? counts.kritik : undefined, countTone: "critical" },
          { key: "siparis", label: "Siparişte", count: loaded ? counts.siparis : undefined },
          { key: "skt-yakin", label: "SKT yakın", count: loaded ? counts["skt-yakin"] : undefined, countTone: "warning" },
          { key: "skt-gecti", label: "SKT geçti", count: loaded ? counts["skt-gecti"] : undefined, countTone: "critical" },
          { key: "arsiv", label: "Arşiv" },
        ]}
      />

      <Toolbar
        actions={(
          <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>
            CSV indir
          </Button>
        )}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Ürün, barkod, raf veya tedarikçi ara"
          slashShortcut
          wrapperClassName="flex-1 min-w-[220px]"
        />
        <div className="sm:w-48">
          <Select aria-label="Kategori" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </div>
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={() => { setSearch(""); setCategory(""); }} />

      {view === "kritik" && counts.kritik > 0 && canOrder && (
        <p className="text-xs text-slate-500">Satırdaki sepet düğmesi son tedarikçi ve son fiyatla sipariş formunu doldurur.</p>
      )}

      <ListTable<StockItem>
        columns={columns}
        rows={pageRows}
        rowKey={(item) => item.id}
        loading={view === "arsiv" ? archiveLoading : loading && !loaded}
        error={view === "arsiv" ? null : loadError}
        onRetry={() => void fetchItems()}
        emptyText={emptyText}
        emptyDescription={view === "tumu" && activeFilters.length === 0 ? "İlk ürünü “Yeni Ürün” ile ekleyin ya da Satın Alma'da faturayı girin; ürünler otomatik eklenir." : undefined}
        emptyAction={view === "tumu" && activeFilters.length === 0 && canWriteStock ? <Button size="sm" icon={Plus} onClick={() => { setFormItem(null); setFormOpen(true); }}>Yeni Ürün</Button> : undefined}
        emptyIcon={StockEmptyIcon}
        emptyIllustrative
        onRowClick={view === "arsiv" ? undefined : (item) => setDetailId(item.id)}
        getRowAriaLabel={(item) => `${item.name} ürün detayını aç`}
        sort={sort}
        onSortChange={(key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }))}
        pager={filtered.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: filtered.length, onPageChange: setPage } : undefined}
        mobileCard={(item) => {
          const status = statusById.get(item.id) || "ok";
          return (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  <span className={item.quantity < item.minQuantity ? "font-bold text-red-700" : "font-semibold text-slate-700"}>{formatQuantity(item.quantity, item.unit)}</span>
                  {` · min ${item.minQuantity}`}
                  {item.storageLocation ? ` · Raf ${item.storageLocation}` : ""}
                </p>
                {view !== "arsiv" && status !== "ok" && (
                  <Badge tone={STOCK_STATUS_META[status].tone} className="mt-1">{STOCK_STATUS_META[status].label}</Badge>
                )}
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
        refreshToken={refreshToken}
        onMove={(item) => setMoveItem(item)}
        onEdit={(item) => { setFormItem(item); setFormOpen(true); }}
        onArchive={(item) => void archiveItem(item)}
        onOrder={(item) => { setDetailId(null); openOrder(item); }}
        onPrintBarcode={printBarcode}
      />

      <StockItemFormModal
        open={formOpen}
        item={formItem}
        onClose={() => setFormOpen(false)}
        onSaved={() => afterChange()}
      />

      <StockMovementModal
        open={Boolean(moveItem)}
        item={moveItem}
        canSeeCost={canSeeCost}
        onClose={() => setMoveItem(null)}
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
