"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarClock, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { formatCurrency } from "@/lib/format";
import { toMoneyValue } from "@/lib/money-input";
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  matchesSearch,
  optionsWithCurrent,
  searchKey,
} from "@/components/stock/stock-shared";
import {
  centsToNumber,
  emptyLine,
  lineTotalCents,
  purchaseTotalCents,
  type LineErrors,
  type PurchaseLineForm,
  type StockItem,
} from "@/components/firma/purchase-model";

type PurchaseLineEditorProps = {
  items: PurchaseLineForm[];
  setItems: (updater: (items: PurchaseLineForm[]) => PurchaseLineForm[]) => void;
  stockItems: StockItem[];
  /** Ürün listesi henüz yükleniyorsa öneri kutusunda "Aranıyor" görünür. */
  stockLoading?: boolean;
  /** Seçili firma: ürün seçilince aynı firmadan son alış fiyatı önerilir. */
  firmaId?: string;
  errors: LineErrors;
  onClearError: (key: string, field: "product" | "quantity" | "unitPrice") => void;
  /** Pencere açılınca ilk satırın miktarı odak alır (ör. Stok'tan sipariş: ürün ve tedarikçi hazır). */
  autoFocusFirstQuantity?: boolean;
};

const FIELD_SELECTOR = "input:not([disabled]):not([type=hidden]):not([type=checkbox]), select:not([disabled])";

/**
 * Satın alma satırları — oluşturma ve düzenleme aynı editörü kullanır.
 * Masaüstünde tablo düzeni (etiketler bir kez başlıkta), telefonda kart.
 * Satır alanlarında Enter bir sonraki alana geçer; son satırın fiyatında
 * Enter yeni satır açar (fatura girişi klavyeden bırakılmadan sürer; yanlış
 * Enter yarım faturayı kaydetmez). Yeni ürün seçenekleri (kategori/birim)
 * yalnız ürün alanından çıkınca ve listede eşleşme yoksa açılır — yazarken
 * form zıplamaz.
 */
export function PurchaseLineEditor({ items, setItems, stockItems, stockLoading = false, firmaId, errors, onClearError, autoFocusFirstQuantity = false }: PurchaseLineEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedProductKey, setFocusedProductKey] = useState<string | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);

  const updateLine = (key: string, patch: Partial<PurchaseLineForm>) => setItems((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) => setItems((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  const addLine = (focus = false) => {
    const line = emptyLine();
    setItems((prev) => [...prev, line]);
    if (focus) setPendingFocusKey(line.key);
  };

  useEffect(() => {
    if (!pendingFocusKey) return;
    const input = document.getElementById(`${pendingFocusKey}-product`);
    if (input) {
      input.focus();
      setPendingFocusKey(null);
    }
  }, [pendingFocusKey, items]);

  const selectStockItem = (line: PurchaseLineForm, item: StockItem) => {
    const samePrice = item.lastPurchase?.unitPrice && item.lastPurchase.supplierId && item.lastPurchase.supplierId === firmaId;
    updateLine(line.key, {
      stockItemId: item.id,
      productQuery: item.name,
      unit: item.unit || "adet",
      ...(line.unitPrice === "" && samePrice ? { unitPrice: toMoneyValue(item.lastPurchase?.unitPrice) ?? "" } : {}),
    });
    onClearError(line.key, "product");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    event.preventDefault();
    const last = items[items.length - 1];
    if (last && target.id === `${last.key}-price`) {
      addLine(true);
      return;
    }
    const fields = Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) || []);
    const index = fields.indexOf(target);
    fields[index + 1]?.focus();
  };

  const total = purchaseTotalCents(items);

  return (
    <div ref={containerRef} className="space-y-2" onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between">
        <p className="ui-form-label text-xs font-bold text-slate-800">Ürünler</p>
        {/* Telefonda "Satır ekle" yalnız listenin altında (yeni satırın açıldığı yer); iki kez görünmez. */}
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => addLine(true)} className="hidden md:inline-flex">Satır ekle</Button>
      </div>
      {/* Masaüstü başlık satırı — etiketler bir kez burada. */}
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_128px_136px_112px_36px] gap-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
        <span>Ürün</span>
        <span>Miktar</span>
        <span>Birim fiyat</span>
        <span className="text-right">Tutar</span>
        <span />
      </div>
      <div className="space-y-2">
        {items.map((line, index) => {
          const lineError = errors[line.key] || {};
          const hasError = Boolean(lineError.product || lineError.quantity || lineError.unitPrice);
          const exactMatch = stockItems.some((item) => searchKey(item.name) === searchKey(line.productQuery));
          const isNew = !line.stockItemId && Boolean(line.productQuery.trim()) && !exactMatch;
          const showNewOptions = isNew && focusedProductKey !== line.key;
          const lotOpen = line.showLot || Boolean(line.lotNo || line.expiresAt);
          const options = stockItems
            .filter((item) => matchesSearch(line.productQuery, item.name, item.barcode))
            .slice(0, 30)
            .map((item) => ({
              id: item.id,
              label: item.name,
              meta: [
                `Stokta ${item.quantity} ${item.unit}`,
                item.lastPurchase?.unitPrice ? `Son alış ${formatCurrency(Number(item.lastPurchase.unitPrice))}${item.lastPurchase.supplier ? ` (${item.lastPurchase.supplier})` : ""}` : "",
              ].filter(Boolean).join(" · "),
            }));
          const rowLabel = `${index + 1}. satır`;
          const errorText = [lineError.product, lineError.quantity, lineError.unitPrice].filter(Boolean).join(" ");
          return (
            <div
              key={line.key}
              className={`rounded-lg border p-2.5 md:p-2 ${hasError ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,1fr)_128px_136px_112px_36px] md:items-start">
                {/* Ürün */}
                <div className="col-span-1 min-w-0">
                  <label htmlFor={`${line.key}-product`} className="mb-1 block text-xs font-bold text-slate-800 md:sr-only">
                    {`${index + 1}. ürün`}<span className="text-red-500">*</span>
                  </label>
                  {line.locked ? (
                    <p className="flex h-10 items-center gap-1.5 truncate px-1 text-sm font-semibold text-slate-800" title="Bu satırdan stok kullanıldı; ürün, miktar ve fiyat değiştirilemez.">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="truncate">{line.productQuery}</span>
                    </p>
                  ) : (
                    <div
                      onFocus={() => setFocusedProductKey(line.key)}
                      onBlur={() => setFocusedProductKey((current) => (current === line.key ? null : current))}
                    >
                      <SearchSelect
                        id={`${line.key}-product`}
                        aria-label={`${rowLabel} ürün`}
                        query={line.productQuery}
                        onQueryChange={(value) => {
                          // Aynı ad (harf farkı gözetmeden) yazılırsa mevcut karta bağlanır;
                          // önceden "İmplant" ile "implant" ikinci bir kart açıyordu.
                          const exact = stockItems.find((item) => searchKey(item.name) === searchKey(value));
                          updateLine(line.key, exact
                            ? { productQuery: value, stockItemId: exact.id, unit: exact.unit || "adet" }
                            : { productQuery: value, stockItemId: "" });
                          onClearError(line.key, "product");
                        }}
                        options={options}
                        loading={stockLoading && stockItems.length === 0 && Boolean(line.productQuery.trim())}
                        onSelect={(option) => {
                          const item = stockItems.find((stockItem) => stockItem.id === option.id);
                          if (item) selectStockItem(line, item);
                        }}
                        placeholder="Ürün adı ya da barkod"
                        emptyText="Listede yok — kaydedince yeni ürün olarak eklenir"
                        className="ui-control"
                      />
                    </div>
                  )}
                </div>
                {/* Telefonda satır menüsü ürünün sağında; masaüstünde en sonda. */}
                <div className="flex justify-end md:order-last">
                  <LineMenu
                    rowLabel={rowLabel}
                    lotOpen={lotOpen}
                    canRemove={items.length > 1 && !line.locked}
                    locked={Boolean(line.locked)}
                    onLot={() => updateLine(line.key, { showLot: true })}
                    onRemove={() => removeLine(line.key)}
                  />
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-2 md:contents">
                  {/* Miktar */}
                  <div className="min-w-0">
                    <label htmlFor={`${line.key}-quantity`} className="mb-1 block text-xs font-bold text-slate-800 md:sr-only">Miktar{line.unit ? <span className="font-normal text-slate-500"> ({line.unit})</span> : null}<span className="text-red-500">*</span></label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id={`${line.key}-quantity`}
                        aria-label={`${rowLabel} miktar`}
                        aria-invalid={lineError.quantity ? true : undefined}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={line.quantity}
                        disabled={line.locked}
                        data-autofocus={autoFocusFirstQuantity && index === 0 ? true : undefined}
                        onChange={(event) => { updateLine(line.key, { quantity: event.target.value }); onClearError(line.key, "quantity"); }}
                        className="min-w-0 flex-1 tabular-nums"
                      />
                      <span className="hidden w-9 shrink-0 truncate text-xs text-slate-500 md:inline" title={line.unit}>{line.unit}</span>
                    </div>
                  </div>
                  {/* Birim fiyat */}
                  <div className="min-w-0">
                    <label htmlFor={`${line.key}-price`} className="mb-1 block text-xs font-bold text-slate-800 md:sr-only">Birim fiyat<span className="text-red-500">*</span></label>
                    <MoneyInput
                      id={`${line.key}-price`}
                      aria-label={`${rowLabel} birim fiyat`}
                      aria-invalid={lineError.unitPrice ? true : undefined}
                      value={line.unitPrice}
                      disabled={line.locked}
                      onChange={(value) => { updateLine(line.key, { unitPrice: value }); onClearError(line.key, "unitPrice"); }}
                      className="text-right"
                    />
                  </div>
                  {/* Tutar */}
                  <div className="min-w-0">
                    <p className="mb-1 block text-xs font-bold text-slate-800 md:sr-only">Tutar</p>
                    <p className="flex h-10 items-center justify-end truncate text-sm font-bold tabular-nums text-slate-900">
                      {formatCurrency(centsToNumber(lineTotalCents(line)))}
                    </p>
                  </div>
                </div>
              </div>

              {errorText && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errorText}</p>}
              {line.locked && (
                <p className="mt-1 text-xs text-slate-500">Bu satırdan stok kullanıldı; ürün, miktar ve fiyat değiştirilemez. Farkı Stok sayfasında “Stok hareketi” ile girin.</p>
              )}

              {(showNewOptions || lotOpen) && (
                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                  {showNewOptions && (
                    <div className="flex flex-wrap items-end gap-2">
                      <Badge tone="info" className="mb-2.5">Yeni ürün</Badge>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                        Kategori
                        <Select size="sm" value={line.category} onChange={(event) => updateLine(line.key, { category: event.target.value })} className="w-32">
                          {optionsWithCurrent(STOCK_CATEGORIES, line.category).map((option) => <option key={option} value={option}>{option}</option>)}
                        </Select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                        Birim
                        <Select size="sm" value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })} className="w-24">
                          {optionsWithCurrent(STOCK_UNITS, line.unit).map((option) => <option key={option} value={option}>{option}</option>)}
                        </Select>
                      </label>
                    </div>
                  )}
                  {lotOpen && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                        Lot no
                        <Input size="sm" value={line.lotNo} disabled={line.locked} onChange={(event) => updateLine(line.key, { lotNo: event.target.value })} placeholder="Üretici lot no" className="w-36" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                        Son kullanma
                        <Input size="sm" type="date" value={line.expiresAt} disabled={line.locked} onChange={(event) => updateLine(line.key, { expiresAt: event.target.value })} className="w-40" />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => addLine(true)} className="md:hidden">Satır ekle</Button>
        <p className="ml-auto text-sm text-slate-600">
          Toplam (KDV dahil): <span className="font-bold tabular-nums text-slate-900">{formatCurrency(centsToNumber(total))}</span>
        </p>
      </div>
    </div>
  );
}

function LineMenu({ rowLabel, lotOpen, canRemove, locked, onLot, onRemove }: {
  rowLabel: string; lotOpen: boolean; canRemove: boolean; locked: boolean; onLot: () => void; onRemove: () => void;
}) {
  const items = [
    ...(!lotOpen && !locked ? [{ key: "lot", label: "Lot / SKT ekle", icon: CalendarClock, onSelect: onLot }] : []),
    {
      key: "remove",
      label: "Satırı sil",
      icon: Trash2,
      danger: true,
      disabled: !canRemove,
      disabledReason: locked ? "Bu satırdan stok kullanıldı; silinemez." : "En az bir satır kalmalı.",
      separatorBefore: !lotOpen && !locked,
      onSelect: onRemove,
    },
  ];
  return <ActionMenu items={items} label={`${rowLabel} işlemleri`} />;
}
