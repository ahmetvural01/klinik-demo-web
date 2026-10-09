"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FlaskConical, Plus, ShoppingCart, Wallet } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { showToastSafe } from "@/lib/toast-client";
import { clientMutation } from "@/lib/client-mutation";
import { formatCurrency, formatPhoneNumber } from "@/lib/format";
import { Button, IconButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ListTable, EmptyValue, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money } from "@/components/ui/Money";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { matchesSearch } from "@/components/stock/stock-shared";
import { FIRMA_KATEGORILERI, telHref } from "@/components/firma/firma-shared";
import {
  usePurchaseModals, summarizeLines,
  type Purchase, type StockItem,
} from "./purchase-shared";

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

const VIEW_KEYS = ["firmalar", "siparisler"] as const;
type FirmaView = typeof VIEW_KEYS[number];
type DurumFilter = "aktif" | "pasif" | "tumu";

const EMPTY_FIRMA_FORM = { name: "", phone: "", iban: "", ibanName: "", notes: "", kategori: "TEDARICI" };

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
  const [firmas, setFirmas] = useState<Firma[]>([]);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const firmaLoadSequenceRef = useRef(0);

  const [search, setSearch] = useState("");
  const [durum, setDurum] = useState<DurumFilter>("aktif");
  const [kategori, setKategori] = useState("");
  const [sort, setSort] = useState<ListSort>({ key: "bakiye", dir: "desc" });

  const [showAddFirma, setShowAddFirma] = useState(false);
  const [firmaForm, setFirmaForm] = useState(EMPTY_FIRMA_FORM);
  const [firmaErrors, setFirmaErrors] = useState<{ name?: string }>({});
  const [firmaFormError, setFirmaFormError] = useState<string | null>(null);
  const [isSubmittingFirma, setIsSubmittingFirma] = useState(false);
  const firmaSubmittingRef = useRef(false);

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
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const response = await fetch("/api/purchases?receiptStatus=SIPARIS_VERILDI", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Bekleyen siparişler yüklenemedi.");
      setOrders(Array.isArray(body) ? body.filter((row: Purchase) => row.receiptStatus === "SIPARIS_VERILDI") : []);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Bekleyen siparişler yüklenemedi.");
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadStockItems = useCallback(async () => {
    try {
      const response = await fetch("/api/stock", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.ok && Array.isArray(body)) setStockItems(body);
    } catch {
      // Ürün listesi yalnız satın alma formundaki öneriler için; yüklenemezse yeni ürün olarak yazılabilir.
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadFirmas();
    void loadOrders();
    void loadStockItems();
  }, [loadFirmas, loadOrders, loadStockItems]);

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
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshAll]);

  const activeMaterialFirmas = useMemo(
    () => firmas.filter((firma) => firma.isActive && firma.kategori !== "LAB").map((firma) => ({ id: firma.id, name: firma.name, bakiye: firma.bakiye })),
    [firmas],
  );
  const purchaseManager = usePurchaseModals({
    stockItems,
    firmas: activeMaterialFirmas,
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
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [searchParams, canPurchase, loaded, pathname, router]);

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
    () => orders.filter((order) => matchesSearch(search, order.firma?.name, order.faturaNo, summarizeLines(order.lines, 10))),
    [orders, search],
  );

  const exportFirmasCsv = () => {
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

  const openAddFirma = () => {
    setFirmaForm(EMPTY_FIRMA_FORM);
    setFirmaErrors({});
    setFirmaFormError(null);
    setShowAddFirma(true);
  };

  function requestCloseAddFirma() {
    if (firmaSubmittingRef.current) return;
    setShowAddFirma(false);
  }

  const handleAddFirma = async () => {
    if (firmaSubmittingRef.current) return;
    if (firmaForm.name.trim().length < 2) {
      setFirmaErrors({ name: "Firma adını yazın (en az 2 harf)." });
      return;
    }
    firmaSubmittingRef.current = true;
    setIsSubmittingFirma(true);
    setFirmaFormError(null);
    try {
      await clientMutation("/api/firma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...firmaForm,
          name: firmaForm.name.trim(),
          phone: firmaForm.phone.trim() || null,
          iban: firmaForm.iban.replace(/\s+/g, " ").trim() || null,
          ibanName: firmaForm.ibanName.trim() || null,
          notes: firmaForm.notes.trim() || null,
        }),
      }, "Firma eklenemedi. Bilgileri kontrol edip tekrar deneyin.");
      const name = firmaForm.name.trim();
      firmaSubmittingRef.current = false;
      setShowAddFirma(false);
      showToastSafe({ title: "Firma eklendi", message: `${name} listede. Alış için “Yeni Satın Alma”yı kullanın.`, type: "success", icon: "firma" });
      await loadFirmas();
    } catch (error) {
      // Hata form içinde kalır; girilen bilgiler korunur.
      setFirmaFormError(error instanceof Error ? error.message : "Firma eklenemedi.");
    } finally {
      firmaSubmittingRef.current = false;
      setIsSubmittingFirma(false);
    }
  };

  const firmaActions = (firma: Firma) => (
    <div className="flex justify-end gap-1.5">
      {canWriteFinance && firma.isActive && firma.bakiye > 0 && (
        <IconButton icon={Wallet} title={`${firma.name} için ödeme yap`} size="sm" onClick={() => void purchaseManager.openFirmaPayment(firma.id)} />
      )}
      {firma.isActive && firma.kategori === "LAB" && canWriteLab && (
        <IconButton icon={FlaskConical} title={`${firma.name} için lab işi`} size="sm" href={`/lab?yeni=1&labName=${encodeURIComponent(firma.name)}`} />
      )}
      {firma.isActive && firma.kategori !== "LAB" && canPurchase && (
        <IconButton icon={ShoppingCart} title={`${firma.name} için satın alma ekle`} size="sm" onClick={() => purchaseManager.openAddPurchase(firma.id)} />
      )}
    </div>
  );

  const firmaColumns: ListTableColumn<Firma>[] = [
    {
      key: "name",
      header: "Firma",
      sortKey: "name",
      cellClassName: "max-w-[300px]",
      render: (firma) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/firma-detay?id=${firma.id}`} className="truncate font-semibold text-slate-900 hover:text-primary">{firma.name}</Link>
            {!firma.isActive && <Badge tone="neutral">Pasif</Badge>}
          </div>
          <p className="truncate text-xs text-slate-500">
            {[FIRMA_KATEGORILERI[firma.kategori] || firma.kategori, firma.primaryKontakt?.ad].filter(Boolean).join(" · ")}
            {firma.bekleyenSiparis ? ` · ${firma.bekleyenSiparis} sipariş bekliyor` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Telefon",
      render: (firma) => firma.phone
        ? <a href={telHref(firma.phone)} className="whitespace-nowrap text-slate-700 hover:text-primary">{formatPhoneNumber(firma.phone)}</a>
        : <EmptyValue />,
    },
    {
      key: "bakiye",
      header: "Kalan borç",
      align: "right",
      sortKey: "bakiye",
      render: (firma) => firma.bakiye > 0
        ? <Money value={firma.bakiye} className="font-bold text-slate-900" />
        : <EmptyValue />,
    },
    {
      key: "son",
      header: "Son işlem",
      sortKey: "son",
      render: (firma) => <DateText value={firma.sonIslemTarihi || null} className="text-slate-600" />,
    },
    { key: "actions", header: "", align: "right", render: firmaActions },
  ];

  const orderColumns: ListTableColumn<Purchase>[] = [
    { key: "tarih", header: "Sipariş tarihi", render: (order) => <DateText value={order.tarih} className="whitespace-nowrap" /> },
    { key: "firma", header: "Firma", render: (order) => <span className="font-semibold text-slate-900">{order.firma?.name || "—"}</span> },
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

  const firmaFilters = [
    ...(search.trim() ? [{ key: "search", label: `Arama: ${search.trim()}`, onRemove: () => setSearch("") }] : []),
    ...(view === "firmalar" && durum !== "aktif" ? [{ key: "durum", label: durum === "pasif" ? "Yalnız pasif firmalar" : "Aktif + pasif", onRemove: () => setDurum("aktif") }] : []),
    ...(view === "firmalar" && kategori ? [{ key: "kategori", label: `Tür: ${FIRMA_KATEGORILERI[kategori]}`, onRemove: () => setKategori("") }] : []),
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        icon="firma"
        title="Satın Alma"
        description="Tedarikçiler, alışlar, bekleyen siparişler ve firmalara ödemeler."
        stats={loaded ? [
          { label: "Firmalara kalan borç", value: formatCurrency(totalDebt), color: totalDebt > 0 ? "text-red-700" : undefined },
          { label: "Bekleyen sipariş", value: ordersLoading ? "…" : orders.length },
        ] : undefined}
        actions={(
          <>
            {canWriteFinance && <Button variant="secondary" icon={Plus} onClick={openAddFirma}>Yeni Firma</Button>}
            {canPurchase && <Button icon={ShoppingCart} onClick={() => purchaseManager.openAddPurchase()}>Yeni Satın Alma</Button>}
          </>
        )}
      />

      <Tabs<FirmaView>
        ariaLabel="Satın alma bölümleri"
        value={view}
        onChange={setView}
        items={[
          { key: "firmalar", label: "Tedarikçiler" },
          { key: "siparisler", label: "Bekleyen siparişler", count: orders.length, countTone: "warning" },
        ]}
      />

      <Toolbar
        actions={view === "firmalar" ? (
          <Button size="sm" variant="secondary" icon={Download} onClick={exportFirmasCsv} disabled={filteredFirmas.length === 0}>CSV indir</Button>
        ) : undefined}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={view === "firmalar" ? "Firma, telefon, IBAN veya yetkili ara" : "Firma, ürün veya fatura no ara"}
          slashShortcut
          wrapperClassName="flex-1 min-w-[220px]"
        />
        {view === "firmalar" && (
          <>
            <div className="sm:w-44">
              <Select aria-label="Firma türü" value={kategori} onChange={(event) => setKategori(event.target.value)}>
                <option value="">Tüm türler</option>
                {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </div>
            <div className="sm:w-44">
              <Select aria-label="Firma durumu" value={durum} onChange={(event) => setDurum(event.target.value as DurumFilter)}>
                <option value="aktif">Aktif firmalar</option>
                <option value="pasif">Pasif firmalar</option>
                <option value="tumu">Tümü</option>
              </Select>
            </div>
          </>
        )}
      </Toolbar>
      <ActiveFilters filters={firmaFilters} onClearAll={() => { setSearch(""); setDurum("aktif"); setKategori(""); }} />

      {view === "firmalar" ? (
        <ListTable<Firma>
          columns={firmaColumns}
          rows={filteredFirmas}
          rowKey={(firma) => firma.id}
          loading={loading && !loaded}
          error={loadError}
          onRetry={() => void loadFirmas()}
          emptyText={firmaFilters.length > 0 ? "Bu filtreye uyan firma yok" : "Henüz firma eklenmemiş"}
          emptyDescription={firmaFilters.length > 0 ? undefined : "Malzeme aldığınız tedarikçiyi “Yeni Firma” ile ekleyin; sonra faturayı “Yeni Satın Alma” ile girin."}
          emptyAction={firmaFilters.length === 0 && canWriteFinance ? <Button size="sm" icon={Plus} onClick={openAddFirma}>Yeni Firma</Button> : undefined}
          emptyIcon={FirmaEmptyIcon}
          emptyIllustrative
          onRowClick={(firma) => router.push(`/firma-detay?id=${firma.id}`)}
          getRowAriaLabel={(firma) => `${firma.name} firma sayfasını aç`}
          sort={sort}
          onSortChange={(key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }))}
          mobileCard={(firma) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{firma.name}{!firma.isActive ? " · Pasif" : ""}</p>
                <p className="truncate text-xs text-slate-500">
                  {FIRMA_KATEGORILERI[firma.kategori] || firma.kategori}
                  {firma.phone ? ` · ${formatPhoneNumber(firma.phone)}` : ""}
                  {firma.bekleyenSiparis ? ` · ${firma.bekleyenSiparis} sipariş bekliyor` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {firma.bakiye > 0 ? <Money value={firma.bakiye} className="font-bold text-slate-900" /> : <span className="text-xs text-slate-400">Borç yok</span>}
              </div>
            </div>
          )}
        />
      ) : (
        <ListTable<Purchase>
          columns={orderColumns}
          rows={filteredOrders}
          rowKey={(order) => order.id}
          loading={ordersLoading && orders.length === 0}
          error={ordersError}
          onRetry={() => void loadOrders()}
          emptyText={search.trim() ? "Bu aramaya uyan sipariş yok" : "Teslimat bekleyen sipariş yok"}
          emptyDescription={search.trim() ? undefined : "“Yeni Satın Alma”da “Yalnız sipariş verildi” seçilen kayıtlar ürünler gelene kadar burada bekler."}
          onRowClick={(order) => void purchaseManager.openPurchaseDetail(order.id)}
          getRowAriaLabel={(order) => `${order.firma?.name || "Firma"} siparişini aç`}
          mobileCard={(order) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{order.firma?.name}</p>
                <p className="truncate text-xs text-slate-500"><DateText value={order.tarih} /> · {summarizeLines(order.lines) || `${order._count?.items ?? 0} kalem`}</p>
                <Money value={order.total ?? null} className="text-xs text-slate-600" />
              </div>
              {canPurchase && <Button size="sm" variant="secondary" onClick={() => void purchaseManager.openReceivePurchase(order.id)}>Teslim al</Button>}
            </div>
          )}
        />
      )}

      <Modal
        module="firma"
        open={showAddFirma}
        onClose={requestCloseAddFirma}
        title="Yeni Firma"
        description="Malzeme aldığınız tedarikçi, hizmet aldığınız firma veya laboratuvar."
        footer={(
          <>
            <Button variant="secondary" disabled={isSubmittingFirma} onClick={requestCloseAddFirma}>Vazgeç</Button>
            <Button onClick={() => void handleAddFirma()} loading={isSubmittingFirma}>Kaydet</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormErrorBanner message={firmaFormError} />
          <FormField label="Firma Adı" htmlFor="firma-name" required error={firmaErrors.name}>
            <Input
              id="firma-name"
              value={firmaForm.name}
              onChange={(event) => { setFirmaForm((form) => ({ ...form, name: event.target.value })); setFirmaErrors({}); }}
              data-autofocus
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Firma türü" htmlFor="firma-kategori" required>
              <Select id="firma-kategori" value={firmaForm.kategori} onChange={(event) => setFirmaForm((form) => ({ ...form, kategori: event.target.value }))}>
                {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </FormField>
            <FormField label="Telefon" htmlFor="firma-phone">
              <Input id="firma-phone" type="tel" inputMode="tel" value={firmaForm.phone} onChange={(event) => setFirmaForm((form) => ({ ...form, phone: event.target.value }))} placeholder="0 (5xx) xxx xx xx" />
            </FormField>
            <FormField label="IBAN" htmlFor="firma-iban" hint="Ödeme yaparken kopyalamak için.">
              <Input id="firma-iban" value={firmaForm.iban} onChange={(event) => setFirmaForm((form) => ({ ...form, iban: event.target.value.toUpperCase() }))} placeholder="TR00 0000 ..." className="font-mono" />
            </FormField>
            <FormField label="IBAN hesap sahibi" htmlFor="firma-iban-name">
              <Input id="firma-iban-name" value={firmaForm.ibanName} onChange={(event) => setFirmaForm((form) => ({ ...form, ibanName: event.target.value }))} />
            </FormField>
          </div>
          <FormField label="Notlar" htmlFor="firma-notes">
            <Textarea id="firma-notes" value={firmaForm.notes} onChange={(event) => setFirmaForm((form) => ({ ...form, notes: event.target.value }))} rows={2} />
          </FormField>
        </div>
      </Modal>

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
