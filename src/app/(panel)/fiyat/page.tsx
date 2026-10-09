"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { Check, ExternalLink, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { formatCurrency } from "@/lib/format";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Modal } from "@/components/ui/Modal";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Money } from "@/components/ui/Money";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { activePriceListStorageKey } from "@/lib/dental-treatment-catalog";
import { matchesSearch } from "@/components/stock/stock-shared";

type Price = { id: string; code: string; treatment: string; amount: number | string; isCustom: boolean; isTemplate?: boolean; catalogYear?: number };
type PriceMeta = { activeCatalogYear: number; latestPublishedYear: number; updateAvailable: boolean; officialPdfUrl: string };
type ListKey = "standard" | "custom";
type ViewKey = "tdb" | "ozel";

const VIEW_KEYS = ["tdb", "ozel"] as const;
const VIEW_TO_LIST: Record<ViewKey, ListKey> = { tdb: "standard", ozel: "custom" };
const LIST_LABEL: Record<ListKey, string> = { standard: "TDB tarifesi", custom: "Özel fiyatlar" };
const PAGE_SIZE = 20;

const priceKey = (code: string, treatment: string) => `${code.trim()}::${treatment.trim().toLocaleLowerCase("tr-TR")}`;

async function readJsonArray(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "Fiyat listesi yüklenemedi.");
  return Array.isArray(body) ? body : [];
}

function FiyatManagement() {
  const pathname = usePathname();
  // Ayarlar > Fiyat Listesi sekmesine gömülüyken sayfanın kendi başlığı
  // çizilmez (Ayarlar başlığı + sekme adı zaten "Fiyat Listesi" diyor).
  const embedded = !pathname?.startsWith("/fiyat");
  const { can, scopeKey } = usePermissions();
  const canWritePrices = can("prices:write");

  const [view, setViewParam] = useTabParam<ViewKey>(VIEW_KEYS, "tdb", "liste");
  const userPickedViewRef = useRef(false);
  const [standardPrices, setStandardPrices] = useState<Price[]>([]);
  const [customPrices, setCustomPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<ListKey | null>(null);
  const [savingActive, setSavingActive] = useState(false);
  const [priceMeta, setPriceMeta] = useState<PriceMeta | null>(null);
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [page, setPage] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ code: "", treatment: "", amount: "" });
  const [newErrors, setNewErrors] = useState<{ code?: string; treatment?: string; amount?: string }>({});
  const [newFormError, setNewFormError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  // Ayar yanıtı geç gelirse en güncel adres çubuğu güncelleyicisi kullanılır.
  const setViewParamRef = useRef(setViewParam);
  useEffect(() => { setViewParamRef.current = setViewParam; });

  const setView = (next: ViewKey) => {
    userPickedViewRef.current = true;
    setViewParam(next);
  };

  const rememberActive = useCallback((value: ListKey) => {
    // Hasta kartı ilk açılışta bu değeri okur; yalnız kurum ayarı değişince yazılır
    // (önceden sekmeye bakmak bile bu değeri değiştiriyordu).
    try { window.localStorage.setItem(activePriceListStorageKey(scopeKey), value); } catch { /* depolama kapalı */ }
  }, [scopeKey]);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/prices/active-list", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Kullanılan fiyat listesi okunamadı.");
      const value: ListKey = body?.activePriceList === "custom" ? "custom" : "standard";
      setActiveList(value);
      rememberActive(value);
      // Kullanıcı henüz sekme seçmediyse ve adreste ?liste= yoksa klinikte kullanılan listeyi göster.
      if (!userPickedViewRef.current && !new URLSearchParams(window.location.search).get("liste") && value === "custom") {
        setViewParamRef.current("ozel");
      }
    } catch (error) {
      showToastSafe({ title: "Fiyat ayarı okunamadı", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    }
  }, [rememberActive]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [standard, custom] = await Promise.all([
        fetch("/api/prices?type=standard", { cache: "no-store" }).then(readJsonArray),
        fetch("/api/prices?type=custom", { cache: "no-store" }).then(readJsonArray),
      ]);
      setStandardPrices(standard as Price[]);
      setCustomPrices(custom as Price[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Fiyat listeleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/prices?meta=1", { cache: "no-store" });
      if (!response.ok) return;
      setPriceMeta(await response.json());
    } catch {
      // Tarife yılı bilgisi yalnız bilgilendirme içindir.
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadAll();
    void loadMeta();
    // Yalnız ilk açılışta; sekme değişimi yeniden yükleme gerektirmez.
  }, [loadSettings, loadAll, loadMeta]);

  useEffect(() => { setPage(1); setEditingId(null); }, [view, search, onlyChanged]);

  const tdbByKey = useMemo(() => new Map(standardPrices.map((price) => [priceKey(price.code, price.treatment), Number(price.amount)])), [standardPrices]);
  const isOverride = useCallback((price: Price) => !price.isTemplate && tdbByKey.has(priceKey(price.code, price.treatment)), [tdbByKey]);
  const changedCount = useMemo(
    () => customPrices.filter((price) => !price.isTemplate && Number(price.amount) !== tdbByKey.get(priceKey(price.code, price.treatment))).length,
    [customPrices, tdbByKey],
  );

  const listKey = VIEW_TO_LIST[view];
  const rows = useMemo(() => {
    const source = listKey === "custom" ? customPrices : standardPrices;
    return source.filter((price) => {
      if (listKey === "custom" && onlyChanged && (price.isTemplate || Number(price.amount) === tdbByKey.get(priceKey(price.code, price.treatment)))) return false;
      return matchesSearch(search, price.treatment, price.code);
    });
  }, [listKey, customPrices, standardPrices, onlyChanged, search, tdbByKey]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeActiveList = async () => {
    if (!canWritePrices || savingActive) return;
    const next = listKey;
    const confirmed = await confirmDialog({
      title: "Hasta kartında bu liste kullanılsın mı?",
      message: `Tüm personel hasta kartında tedavi eklerken ${LIST_LABEL[next].toLocaleLowerCase("tr-TR")} ücretlerini görecek. Daha önce eklenmiş tedavilerin ücreti değişmez.`,
      confirmText: `${LIST_LABEL[next]} kullan`,
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    setSavingActive(true);
    try {
      const response = await fetch("/api/prices/active-list", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activePriceList: next }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Ayar kaydedilemedi.");
      setActiveList(next);
      rememberActive(next);
      showToastSafe({ title: "Kullanılan liste değişti", message: `Hasta kartında artık ${LIST_LABEL[next].toLocaleLowerCase("tr-TR")} kullanılıyor.`, type: "success" });
    } catch (error) {
      showToastSafe({ title: "Değiştirilemedi", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    } finally {
      setSavingActive(false);
    }
  };

  const startEdit = (price: Price) => {
    setEditingId(price.id);
    setEditAmount(String(Number(price.amount)));
  };

  const saveEdit = async (price: Price) => {
    if (savingEdit) return;
    const amount = Number(editAmount.replace(",", "."));
    if (editAmount.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      showToastSafe({ title: "Geçerli bir ücret girin", message: "Ör. 1500 ya da 1500,50", type: "error" });
      return;
    }
    setSavingEdit(true);
    try {
      // TDB kopyası satırı düzenlenince kliniğe özel kayıt oluşturulur.
      const response = price.isTemplate || price.id.startsWith("custom-template-") || price.id.startsWith("tdb-")
        ? await fetch("/api/prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: price.code, treatment: price.treatment, amount, isCustom: true }),
          })
        : await fetch(`/api/prices/${price.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Ücret kaydedilemedi.");
      setEditingId(null);
      showToastSafe({ title: "Ücret kaydedildi", message: `${price.treatment}: ${formatCurrency(amount)}`, type: "success" });
      await loadAll();
    } catch (error) {
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    } finally {
      setSavingEdit(false);
    }
  };

  const removePrice = async (price: Price) => {
    const override = isOverride(price);
    const confirmed = await confirmDialog({
      title: override ? "TDB fiyatına dönülsün mü?" : "Özel fiyat silinsin mi?",
      message: override
        ? `${price.treatment} için kliniğe özel ücret silinir; TDB ücreti (${formatCurrency(tdbByKey.get(priceKey(price.code, price.treatment)) || 0)}) kullanılır.`
        : `${price.treatment} özel fiyat listesinden kaldırılır. Daha önce eklenmiş tedaviler etkilenmez.`,
      confirmText: override ? "TDB fiyatına dön" : "Sil",
      cancelText: "Vazgeç",
      danger: !override,
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/prices/${price.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Fiyat silinemedi.");
      showToastSafe({ title: override ? "TDB fiyatına dönüldü" : "Fiyat silindi", message: price.treatment, type: "success" });
      await loadAll();
    } catch (error) {
      showToastSafe({ title: "Silinemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  const openNew = () => {
    setNewForm({ code: "", treatment: "", amount: "" });
    setNewErrors({});
    setNewFormError(null);
    setShowNew(true);
  };

  const submitNew = async () => {
    if (savingNew) return;
    const amount = Number(newForm.amount.replace(",", "."));
    const errors: typeof newErrors = {};
    if (!newForm.code.trim()) errors.code = "Kod girin (ör. D-001).";
    if (!newForm.treatment.trim()) errors.treatment = "Tedavi adını yazın.";
    if (newForm.amount.trim() === "" || !Number.isFinite(amount) || amount < 0) errors.amount = "Ücreti girin.";
    setNewErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSavingNew(true);
    setNewFormError(null);
    try {
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newForm.code.trim(), treatment: newForm.treatment.trim(), amount, isCustom: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Fiyat eklenemedi.");
      setShowNew(false);
      showToastSafe({ title: "Özel fiyat eklendi", message: `${newForm.treatment.trim()}: ${formatCurrency(amount)}`, type: "success" });
      setView("ozel");
      await loadAll();
    } catch (error) {
      setNewFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSavingNew(false);
    }
  };

  const amountCell = (price: Price) => {
    if (editingId !== price.id) return <Money value={Number(price.amount)} className="font-semibold text-slate-900" />;
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") { event.preventDefault(); void saveEdit(price); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditingId(null); }
    };
    return (
      <div className="flex items-center justify-end gap-1.5">
        <div className="w-28">
          <Input
            size="sm"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={editAmount}
            onChange={(event) => setEditAmount(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`${price.treatment} ücreti`}
            className="text-right"
            autoFocus
          />
        </div>
        <IconButton icon={Check} title="Kaydet" tone="primary" size="sm" onClick={() => void saveEdit(price)} disabled={savingEdit} />
        <IconButton icon={X} title="Vazgeç" size="sm" onClick={() => setEditingId(null)} />
      </div>
    );
  };

  const columns: ListTableColumn<Price>[] = [
    { key: "code", header: "Kod", render: (price) => <span className="font-mono text-xs text-slate-500">{price.code}</span> },
    {
      key: "treatment",
      header: "Tedavi",
      render: (price) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{price.treatment}</span>
          {listKey === "custom" && !price.isTemplate && (
            <Badge tone="info">{isOverride(price) ? "Değiştirildi" : "Kliniğe özel"}</Badge>
          )}
        </span>
      ),
    },
    { key: "amount", header: "Ücret", align: "right", render: amountCell },
    ...(listKey === "custom" ? [
      {
        key: "tdb",
        header: "TDB ücreti",
        align: "right" as const,
        render: (price: Price) => {
          const tdb = tdbByKey.get(priceKey(price.code, price.treatment));
          return tdb === undefined ? <EmptyValue /> : <Money value={tdb} className="text-slate-500" />;
        },
      },
      {
        key: "fark",
        header: "Fark",
        align: "right" as const,
        render: (price: Price) => {
          const tdb = tdbByKey.get(priceKey(price.code, price.treatment));
          if (tdb === undefined) return <EmptyValue />;
          const diff = Math.round((Number(price.amount) - tdb) * 100) / 100;
          if (diff === 0) return <EmptyValue />;
          return <span className={`tabular-nums font-semibold ${diff > 0 ? "text-emerald-700" : "text-amber-700"}`}>{diff > 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))}</span>;
        },
      },
    ] : []),
    ...(listKey === "custom" && canWritePrices ? [{
      key: "actions",
      header: "",
      align: "right" as const,
      render: (price: Price) => editingId === price.id ? null : (
        <div className="flex justify-end gap-1.5">
          <IconButton icon={Pencil} title={`${price.treatment} ücretini değiştir`} size="sm" onClick={() => startEdit(price)} />
          {!price.isTemplate && (
            isOverride(price)
              ? <IconButton icon={RotateCcw} title="TDB fiyatına dön" size="sm" onClick={() => void removePrice(price)} />
              : <IconButton icon={Trash2} title="Özel fiyatı sil" tone="danger" size="sm" onClick={() => void removePrice(price)} />
          )}
        </div>
      ),
    }] : []),
  ];

  const activeLabel = activeList ? LIST_LABEL[activeList] : "…";
  const filters = [
    ...(search.trim() ? [{ key: "search", label: `Arama: ${search.trim()}`, onRemove: () => setSearch("") }] : []),
    ...(listKey === "custom" && onlyChanged ? [{ key: "changed", label: "Yalnız değiştirdiklerim", onRemove: () => setOnlyChanged(false) }] : []),
  ];

  return (
    <section className="space-y-3">
      {!embedded && (
        <PageHeader
          icon="finance"
          title="Fiyat Listesi"
          description="Hasta kartında tedavi eklerken önerilen ücretler."
          actions={canWritePrices ? <Button icon={Plus} onClick={openNew}>Yeni Özel Fiyat</Button> : undefined}
        />
      )}

      <Tabs<ViewKey>
        ariaLabel="Fiyat listeleri"
        size={embedded ? "sm" : "md"}
        value={view}
        onChange={setView}
        items={[
          { key: "tdb", label: "TDB tarifesi" },
          { key: "ozel", label: "Özel fiyatlar", count: changedCount },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[rgb(var(--app-surface))] px-3 py-2.5 text-sm">
        <p className="text-slate-700">
          Hasta kartında kullanılan: <strong className="text-slate-900">{activeLabel}</strong>
          {activeList && activeList === listKey && <Badge tone="success" className="ml-2">Bu liste</Badge>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canWritePrices && activeList && activeList !== listKey && (
            <Button size="sm" variant="secondary" loading={savingActive} onClick={() => void changeActiveList()}>
              Hasta kartında bu listeyi kullan
            </Button>
          )}
          {embedded && canWritePrices && <Button size="sm" variant="secondary" icon={Plus} onClick={openNew}>Yeni Özel Fiyat</Button>}
        </div>
      </div>

      {priceMeta?.updateAvailable && view === "tdb" && (
        <p className="text-xs leading-5 text-slate-600">
          TDB {priceMeta.latestPublishedYear} tarifesi yayımlandı; sistemdeki liste {priceMeta.activeCatalogYear} yılına ait. Katalog güncellemesini sistem sağlayıcınız yapar; o zamana kadar değişen ücretleri “Özel fiyatlar”dan girebilirsiniz.{" "}
          {priceMeta.officialPdfUrl && (
            <a href={priceMeta.officialPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              TDB {priceMeta.latestPublishedYear} tarifesini aç <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </p>
      )}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tedavi adı veya kod ara"
          slashShortcut={!embedded}
          wrapperClassName="flex-1 min-w-[220px]"
        />
        {listKey === "custom" && (
          <div className="sm:w-60">
            <Select aria-label="Gösterilen fiyatlar" value={onlyChanged ? "changed" : "all"} onChange={(event) => setOnlyChanged(event.target.value === "changed")}>
              <option value="all">Tüm tedaviler</option>
              <option value="changed">Yalnız değiştirdiklerim ({changedCount})</option>
            </Select>
          </div>
        )}
      </Toolbar>
      <ActiveFilters filters={filters} onClearAll={() => { setSearch(""); setOnlyChanged(false); }} />

      <ListTable<Price>
        columns={columns}
        rows={pageRows}
        rowKey={(price) => price.id}
        loading={loading}
        error={loadError}
        onRetry={() => void loadAll()}
        emptyText={filters.length > 0 ? "Bu aramaya uyan tedavi yok" : "Liste boş"}
        emptyDescription={listKey === "custom" && onlyChanged ? "Henüz TDB'den farklı ücret girilmemiş. Bir satırdaki kalem simgesiyle ücreti değiştirin." : undefined}
        pager={rows.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage } : undefined}
        mobileCard={(price) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{price.treatment}</p>
              <p className="font-mono text-xs text-slate-500">
                {price.code}
                {listKey === "custom" && !price.isTemplate ? ` · ${isOverride(price) ? "Değiştirildi" : "Kliniğe özel"}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {amountCell(price)}
              {listKey === "custom" && canWritePrices && editingId !== price.id && (
                <IconButton icon={Pencil} title={`${price.treatment} ücretini değiştir`} size="sm" onClick={() => startEdit(price)} />
              )}
            </div>
          </div>
        )}
      />

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        module="finance"
        title="Yeni Özel Fiyat"
        description="TDB'de olmayan bir tedavi için ücret. TDB'deki bir tedavinin ücretini değiştirmek için “Özel fiyatlar”da satırdaki kalem simgesini kullanın."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowNew(false)} disabled={savingNew}>Vazgeç</Button>
            <Button onClick={() => void submitNew()} loading={savingNew}>Kaydet</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormErrorBanner message={newFormError} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <FormField label="Kod" htmlFor="price-code" required error={newErrors.code}>
              <Input id="price-code" value={newForm.code} onChange={(event) => { setNewForm((form) => ({ ...form, code: event.target.value })); setNewErrors((current) => ({ ...current, code: undefined })); }} className="font-mono" data-autofocus />
            </FormField>
            <FormField label="Tedavi adı" htmlFor="price-treatment" required error={newErrors.treatment}>
              <Input id="price-treatment" value={newForm.treatment} onChange={(event) => { setNewForm((form) => ({ ...form, treatment: event.target.value })); setNewErrors((current) => ({ ...current, treatment: undefined })); }} />
            </FormField>
          </div>
          <FormField label="Ücret (₺)" htmlFor="price-amount" required error={newErrors.amount}>
            <Input id="price-amount" type="number" inputMode="decimal" min="0" step="0.01" value={newForm.amount} onChange={(event) => { setNewForm((form) => ({ ...form, amount: event.target.value })); setNewErrors((current) => ({ ...current, amount: undefined })); }} />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}

export default function FiyatPage() {
  return (
    <Suspense fallback={null}>
      <FiyatManagement />
    </Suspense>
  );
}
