"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { Check, ExternalLink, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { formatCurrency } from "@/lib/format";
import { moneyInputError, parseTurkishMoney, toMoneyValue } from "@/lib/money-input";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Callout } from "@/components/ui/Callout";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Money } from "@/components/ui/Money";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { matchesSearch } from "@/components/stock/stock-shared";

type Price = { id: string; code: string; treatment: string; amount: number | string; isCustom: boolean; isTemplate?: boolean; catalogYear?: number };
type PriceMeta = { activeCatalogYear: number; latestPublishedYear: number; updateAvailable: boolean; officialPdfUrl: string };
type ListKey = "standard" | "custom";
type ShowKey = "all" | "changed" | "custom";
/** Satırın türü: TDB kalemi (klinik ücreti = TDB), klinikte değiştirilmiş TDB kalemi, kliniğe özel kalem. */
type RowKind = "tdb" | "override" | "own";
type Row = { price: Price; kind: RowKind; tdb: number | null };

const PAGE_SIZE = 25;
const priceKey = (code: string, treatment: string) => `${code.trim()}::${treatment.trim().toLocaleLowerCase("tr-TR")}`;

/** Kliniğe özel kalemlere sıradaki "Ö-00n" kodu (kod alanı boş bırakılınca). */
function nextOwnCode(prices: Price[]) {
  const max = prices.reduce((current, price) => {
    const match = /^Ö-(\d+)$/i.exec(price.code.trim());
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `Ö-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Fiyat listesi — TEK tablo: her tedavinin TDB ücreti ve kliniğin ücreti yan
 * yana. Önceden iki sekme aynı ~300 kalemi iki kez gösteriyor, TDB sekmesinde
 * düzenleme olmadığı için kullanıcı sekme değiştirip kalemi yeniden arıyordu;
 * "hasta dosyasında hangi liste kullanılsın" kurum ayarı da sekmeye göre
 * beliren bir düğmede gizliydi. Ayar artık listenin üstünde tek anahtar.
 */
function FiyatManagement() {
  const pathname = usePathname();
  // Ayarlar > Fiyat listesi sekmesine gömülüyken sayfanın kendi başlığı çizilmez.
  const embedded = !pathname?.startsWith("/fiyat");
  const { can } = usePermissions();
  const canWritePrices = can("prices:write");

  const [standardPrices, setStandardPrices] = useState<Price[]>([]);
  const [customPrices, setCustomPrices] = useState<Price[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<ListKey | null>(null);
  const [savingActive, setSavingActive] = useState(false);
  const [priceMeta, setPriceMeta] = useState<PriceMeta | null>(null);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<ShowKey>("all");
  const [page, setPage] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ code: "", treatment: "", amount: "" });
  const [newErrors, setNewErrors] = useState<{ code?: string; treatment?: string; amount?: string }>({});
  const [newFormError, setNewFormError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  // İki liste ve kullanılan liste tek istekte gelir (önceden üç ayrı istekti).
  const loadAll = useCallback(async () => {
    try {
      const response = await fetch("/api/prices?bundle=1", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) throw new Error(body?.message || "Fiyat listesi yüklenemedi.");
      setStandardPrices(Array.isArray(body.standard) ? (body.standard as Price[]) : []);
      setCustomPrices(Array.isArray(body.custom) ? (body.custom as Price[]) : []);
      setActiveList(body.activePriceList === "custom" ? "custom" : "standard");
      setLoadError(null);
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Fiyat listesi yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadAll();
    // Yeni tarife kontrolü yalnız bilgi içindir; listeyi bekletmez.
    fetch("/api/prices?meta=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((meta) => { if (active && meta) setPriceMeta(meta as PriceMeta); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [loadAll]);

  useEffect(() => { setPage(1); setEditingId(null); }, [show, search]);

  const tdbByKey = useMemo(() => new Map(standardPrices.map((price) => [priceKey(price.code, price.treatment), Number(price.amount)])), [standardPrices]);

  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = customPrices.map((price) => {
      const tdb = tdbByKey.get(priceKey(price.code, price.treatment));
      const kind: RowKind = price.isTemplate ? "tdb" : tdb === undefined ? "own" : "override";
      return { price, kind, tdb: tdb ?? null };
    });
    // TDB tarifesinde olmayan ama kurumun "standart" listesinde duran kayıtlar
    // (ör. demo kurulumunun "İlk Muayene / Kompozit Dolgu" kalemleri): hasta
    // dosyasında önerilmeye devam ediyor ve eski ekranda "TDB tarifesi"
    // sekmesinde görünüyordu. Tek tabloda kaybolmasınlar — kliniğin kendi
    // kalemi olarak gösterilir (ücreti düzeltilebilir, silinebilir).
    const customKeys = new Set(customPrices.map((price) => priceKey(price.code, price.treatment)));
    const standardOnly = standardPrices.filter((price) => !customKeys.has(priceKey(price.code, price.treatment)));
    if (standardOnly.length === 0) return rows;
    // Sunucunun sıralamasıyla aynı: koda göre (sayısal), sonra ada göre.
    return [...rows, ...standardOnly.map((price): Row => ({ price, kind: "own", tdb: null }))].sort((a, b) =>
      a.price.code.localeCompare(b.price.code, "tr", { numeric: true }) || a.price.treatment.localeCompare(b.price.treatment, "tr"));
  }, [customPrices, standardPrices, tdbByKey]);

  const changedCount = allRows.filter((row) => row.kind === "override" && Number(row.price.amount) !== row.tdb).length;
  const ownCount = allRows.filter((row) => row.kind === "own").length;

  const rows = useMemo(() => allRows.filter((row) => {
    if (show === "changed" && !(row.kind === "override" && Number(row.price.amount) !== row.tdb)) return false;
    if (show === "custom" && row.kind !== "own") return false;
    return matchesSearch(search, row.price.treatment, row.price.code);
  }), [allRows, search, show]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  const changeActiveList = async (useClinic: boolean) => {
    if (!canWritePrices || savingActive) return;
    const next: ListKey = useClinic ? "custom" : "standard";
    const confirmed = await confirmDialog({
      title: useClinic ? "Klinik fiyatları önerilsin mi?" : "TDB tarifesi önerilsin mi?",
      message: `Tüm personel hasta dosyasında tedavi eklerken ${useClinic ? "kliniğin ücretlerini" : "TDB tarifesini"} görecek. Daha önce eklenmiş tedavilerin ücreti değişmez.`,
      confirmText: "Değiştir",
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
      showToastSafe({ title: "Ayar kaydedildi", message: useClinic ? "Hasta dosyasında klinik fiyatları önerilecek." : "Hasta dosyasında TDB tarifesi önerilecek.", type: "success" });
    } catch (error) {
      showToastSafe({ title: "Değiştirilemedi", message: error instanceof Error ? error.message : "Tekrar deneyin.", type: "error" });
    } finally {
      setSavingActive(false);
    }
  };

  const startEdit = (price: Price) => {
    setEditingId(price.id);
    setEditAmount(toMoneyValue(price.amount) ?? "");
    setEditError("");
  };

  const saveEdit = async (price: Price) => {
    if (savingEdit) return;
    const error = moneyInputError(editAmount, { required: true, allowZero: true });
    if (error) {
      setEditError(error);
      return;
    }
    const amount = parseTurkishMoney(editAmount);
    setSavingEdit(true);
    try {
      // TDB kalemi düzenlenince kliniğe özel kayıt oluşturulur (aynı kod + ad).
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
      showToastSafe({ title: "Ücret kaydedildi", message: `${price.treatment}: ${formatCurrency(Number(amount))}`, type: "success" });
      await loadAll();
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : "Bağlantı kurulamadı.");
    } finally {
      setSavingEdit(false);
    }
  };

  const removePrice = async (row: Row) => {
    const { price } = row;
    const override = row.kind === "override";
    const confirmed = await confirmDialog({
      title: override ? "TDB ücretine dönülsün mü?" : "Kalem silinsin mi?",
      message: override
        ? `${price.treatment} için kliniğin ücreti silinir; TDB ücreti (${formatCurrency(row.tdb || 0)}) kullanılır.`
        : `${price.treatment} fiyat listesinden kaldırılır. Daha önce eklenmiş tedaviler etkilenmez.`,
      confirmText: override ? "TDB ücretine dön" : "Sil",
      cancelText: "Vazgeç",
      danger: !override,
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/prices/${price.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Kalem silinemedi.");
      showToastSafe({ title: override ? "TDB ücretine dönüldü" : "Kalem silindi", message: price.treatment, type: "success" });
      await loadAll();
    } catch (error) {
      showToastSafe({ title: "Silinemedi", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  };

  const openNew = () => {
    setNewForm({ code: "", treatment: "", amount: "" });
    setNewErrors({});
    setNewFormError(null);
    setNewOpen(true);
  };

  const submitNew = async (event?: FormEvent) => {
    event?.preventDefault();
    if (savingNew) return;
    const errors: typeof newErrors = {};
    if (!newForm.treatment.trim()) errors.treatment = "Tedavi adını yazın.";
    const amountError = moneyInputError(newForm.amount, { required: true, allowZero: true });
    if (amountError) errors.amount = amountError;
    if (newForm.code.trim().length > 50) errors.code = "Kod en fazla 50 karakter olabilir.";
    setNewErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    const code = newForm.code.trim() || nextOwnCode(customPrices);
    setSavingNew(true);
    setNewFormError(null);
    try {
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // createOnly: aynı kod/ad varsa sunucu üzerine yazmaz, nedenini söyler.
        body: JSON.stringify({ code, treatment: newForm.treatment.trim(), amount: parseTurkishMoney(newForm.amount), isCustom: true, createOnly: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Kalem eklenemedi.");
      setNewOpen(false);
      showToastSafe({ title: "Kalem eklendi", message: `${newForm.treatment.trim()} (${code}): ${formatCurrency(Number(parseTurkishMoney(newForm.amount)))}`, type: "success" });
      setShow("custom");
      setSearch("");
      await loadAll();
    } catch (error) {
      setNewFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSavingNew(false);
    }
  };

  const kindBadge = (row: Row) => (row.kind === "override"
    ? <Badge tone="info">Değiştirildi</Badge>
    : row.kind === "own" ? <Badge tone="neutral">Kliniğe özel</Badge> : null);

  const clinicCell = (row: Row) => {
    const { price } = row;
    if (editingId !== price.id) {
      return <Money value={Number(price.amount)} className={row.kind === "tdb" ? "text-slate-600" : "font-semibold text-slate-900"} />;
    }
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") { event.preventDefault(); void saveEdit(price); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditingId(null); }
    };
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-1.5">
          <div className="w-32">
            <MoneyInput
              size="sm"
              value={editAmount}
              onChange={(value) => { setEditAmount(value); setEditError(""); }}
              onKeyDown={onKeyDown}
              aria-label={`${price.treatment} klinik ücreti`}
              aria-invalid={editError ? true : undefined}
              className="text-right"
              autoFocus
            />
          </div>
          <IconButton icon={Check} title="Kaydet" tone="primary" size="sm" onClick={() => void saveEdit(price)} disabled={savingEdit} />
          <IconButton icon={X} title="Vazgeç" size="sm" onClick={() => setEditingId(null)} />
        </div>
        {editError && <p role="alert" className="text-xs font-medium text-red-600">{editError}</p>}
      </div>
    );
  };

  const rowActions = (row: Row): ActionMenuItem[] => [
    { key: "edit", label: "Ücreti değiştir", icon: Pencil, onSelect: () => startEdit(row.price) },
    ...(row.kind === "override" ? [{ key: "reset", label: "TDB ücretine dön", icon: RotateCcw, onSelect: () => void removePrice(row) }] : []),
    ...(row.kind === "own" ? [{ key: "delete", label: "Kalemi sil", icon: Trash2, danger: true, onSelect: () => void removePrice(row) }] : []),
  ];

  const columns: ListTableColumn<Row>[] = [
    { key: "code", header: "Kod", render: (row) => <span className="font-mono text-xs text-slate-500">{row.price.code}</span> },
    {
      key: "treatment",
      header: "Tedavi",
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">{row.price.treatment}</span>
          {kindBadge(row)}
        </span>
      ),
    },
    { key: "tdb", header: "TDB ücreti", align: "right", render: (row) => (row.tdb === null ? <EmptyValue /> : <Money value={row.tdb} className="text-slate-500" />) },
    { key: "clinic", header: "Klinik ücreti", align: "right", headerHint: "Değiştirilmemiş kalemde TDB ücreti geçerlidir.", render: clinicCell },
    {
      key: "fark",
      header: "Fark",
      align: "right",
      render: (row) => {
        if (row.tdb === null || row.kind === "tdb") return <EmptyValue />;
        const diff = Math.round((Number(row.price.amount) - row.tdb) * 100) / 100;
        if (diff === 0) return <EmptyValue />;
        return <span className={`tabular-nums font-semibold ${diff > 0 ? "text-emerald-700" : "text-amber-700"}`}>{diff > 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))}</span>;
      },
    },
    ...(canWritePrices ? [{
      key: "actions",
      header: "",
      align: "right" as const,
      render: (row: Row) => editingId === row.price.id ? null : (
        <div className="flex justify-end gap-1.5">
          <IconButton icon={Pencil} title={`${row.price.treatment} ücretini değiştir`} size="sm" onClick={() => startEdit(row.price)} />
          {row.kind === "override" && <IconButton icon={RotateCcw} title="TDB ücretine dön" size="sm" onClick={() => void removePrice(row)} />}
          {row.kind === "own" && <IconButton icon={Trash2} title="Kalemi sil" tone="danger" size="sm" onClick={() => void removePrice(row)} />}
        </div>
      ),
    }] : []),
  ];

  const tdbYear = priceMeta?.activeCatalogYear || standardPrices[0]?.catalogYear || 2026;
  const newButton = canWritePrices ? <Button icon={Plus} variant={embedded ? "secondary" : "primary"} size={embedded ? "sm" : "md"} onClick={openNew}>Yeni özel fiyat</Button> : undefined;
  const filtered = Boolean(search.trim()) || show !== "all";

  return (
    <section className="space-y-3">
      {!embedded && (
        <PageHeader
          icon="finance"
          title="Fiyat listesi"
          description="Hasta dosyasında tedavi eklerken önerilen ücretler."
          actions={newButton}
        />
      )}

      <div className="ui-surface overflow-hidden">
        <SettingsList aria-label="Fiyat ayarı">
          <SettingsRow
            title="Hasta dosyasında klinik fiyatlarını öner"
            description={activeList === null
              ? "Ayar okunuyor…"
              : activeList === "custom"
                ? "Açık: kliniğin ücretleri önerilir (değiştirilmemiş kalemde TDB ücreti)."
                : `Kapalı: TDB ${tdbYear} tarifesi önerilir; kliniğin ücretleri kullanılmaz.`}
            status={!canWritePrices && activeList !== null ? <Badge tone={activeList === "custom" ? "success" : "neutral"}>{activeList === "custom" ? "Açık" : "Kapalı"}</Badge> : undefined}
            toggle={canWritePrices ? {
              checked: activeList === "custom",
              onChange: (checked) => void changeActiveList(checked),
              label: "Hasta dosyasında klinik fiyatlarını öner",
              disabled: activeList === null || savingActive,
            } : undefined}
          />
        </SettingsList>
      </div>

      {priceMeta?.updateAvailable && (
        <Callout
          tone="info"
          compact
          action={priceMeta.officialPdfUrl ? (
            <Button size="sm" variant="secondary" icon={ExternalLink} href={priceMeta.officialPdfUrl} target="_blank">Tarifeyi aç</Button>
          ) : undefined}
        >
          TDB {priceMeta.latestPublishedYear} tarifesi yayımlandı; sistemdeki liste {priceMeta.activeCatalogYear}. Değişen ücretleri satırdan girebilirsiniz.
        </Callout>
      )}

      <Toolbar actions={embedded ? newButton : undefined}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tedavi adı veya kod ara"
          slashShortcut={!embedded}
          wrapperClassName="flex-1 min-w-[220px]"
        />
        <ChoiceCards<ShowKey>
          label="Gösterilen kalemler"
          labelHidden
          variant="pills"
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: "Tümü" },
            { value: "changed", label: "Değiştirilenler", count: changedCount },
            { value: "custom", label: "Kliniğe özel", count: ownCount },
          ]}
        />
      </Toolbar>

      <ListTable<Row>
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.price.id}
        loading={!loaded && !loadError}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void loadAll()}
        emptyText={filtered ? "Bu seçime uyan kalem yok" : "Liste boş"}
        emptyDescription={show === "changed" && !search.trim()
          ? "Henüz TDB'den farklı ücret girilmemiş. Bir satırdaki kalem simgesiyle ücreti değiştirin."
          : show === "custom" && !search.trim() ? "TDB'de olmayan tedaviler için “Yeni özel fiyat” ekleyin." : undefined}
        pager={rows.length > PAGE_SIZE ? { page: Math.min(page, pageCount), pageCount, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage } : undefined}
        mobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{row.price.treatment}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-mono">{row.price.code}</span>
                  {kindBadge(row)}
                </p>
              </div>
              {editingId !== row.price.id && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Money value={Number(row.price.amount)} className={row.kind === "tdb" ? "text-slate-600" : "font-semibold text-slate-900"} />
                  {canWritePrices && <ActionMenu label={`${row.price.treatment} için işlemler`} items={rowActions(row)} />}
                </div>
              )}
            </div>
            {row.kind === "override" && row.tdb !== null && editingId !== row.price.id && (
              <p className="text-xs text-slate-500">TDB ücreti {formatCurrency(row.tdb)}</p>
            )}
            {editingId === row.price.id && clinicCell(row)}
          </div>
        )}
      />

      <FormModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSubmit={(event) => submitNew(event)}
        submitting={savingNew}
        error={newFormError}
        module="finance"
        title="Yeni özel fiyat"
        description="TDB'de olmayan bir tedavi için ücret."
      >
        <FormField label="Tedavi adı" htmlFor="price-treatment" required error={newErrors.treatment}>
          <Input id="price-treatment" value={newForm.treatment} maxLength={200} data-autofocus onChange={(event) => { setNewForm((form) => ({ ...form, treatment: event.target.value })); setNewErrors((current) => ({ ...current, treatment: undefined })); }} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Ücret" htmlFor="price-amount" required error={newErrors.amount}>
            <MoneyInput id="price-amount" value={newForm.amount} onChange={(amount) => { setNewForm((form) => ({ ...form, amount })); setNewErrors((current) => ({ ...current, amount: undefined })); }} />
          </FormField>
          <FormField label="Kod" htmlFor="price-code" error={newErrors.code} hint={`Boş bırakılırsa ${nextOwnCode(customPrices)} verilir.`}>
            <Input id="price-code" value={newForm.code} maxLength={50} onChange={(event) => { setNewForm((form) => ({ ...form, code: event.target.value })); setNewErrors((current) => ({ ...current, code: undefined })); }} className="font-mono" />
          </FormField>
        </div>
      </FormModal>
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
