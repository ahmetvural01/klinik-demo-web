"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Info, RefreshCw } from "lucide-react";
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { ListPager, type ListPagerProps } from "@/components/ui/ListPager";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import type { IconAccent } from "@/components/ui/IconFrame";

export interface ListTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  headerClassName?: string;
  cellClassName?: string;
  /** Verilirse başlık tıklanınca bu anahtarla sıralama istenir (bkz. sort/onSortChange). */
  sortKey?: string;
  /**
   * Başlığın yanında ⓘ ipucu: sütunun nasıl hesaplandığı ("Kalan borç =
   * indirimli tedavi tutarı − tahsilatlar"). Uzun açıklamayı tablo üstüne
   * paragraf olarak yazmak yerine kullanılır; dokunmatikte dokununca açılır.
   */
  headerHint?: string;
  render: (row: T) => ReactNode;
}

export type ListSort = { key: string; dir: "asc" | "desc" };

export interface ListTableProps<T> {
  columns: ListTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  /** Yükleme hatası: liste yerine açık hata ve "Yeniden dene" gösterilir (boş liste gibi görünmez). */
  error?: string | null;
  /**
   * Veri ekrandayken arka plandaki yenileme başarısız oldu: liste yerinde
   * kalır, üstünde ince şerit ("{staleError} Son yüklenen liste
   * gösteriliyor.") ve (onRetry varsa) "Yeniden dene" görünür. İlk yükleme
   * hatası için `error` kullanın.
   */
  staleError?: string | null;
  onRetry?: () => void;
  /**
   * Kart içinde tablonun üstündeki başlık çubuğu (Section başlığıyla aynı
   * ölçü): kısa ad, bir satırlık alt başlık, sağda ikincil eylemler. Elle
   * yazılmış `header={<h2>…</h2>}` kutularının yerine geçer.
   */
  title?: ReactNode;
  /**
   * Başlığın hemen yanında küçük rozet (Badge: kapsam, durum) — başlık
   * metnine gömülmez, tablonun erişilebilir adına karışmaz (Section badge ile aynı).
   */
  badge?: ReactNode;
  /** Başlık altında TEK satır özet ("12 tahsilat · toplam ₺48.250"). */
  subtitle?: ReactNode;
  /** Başlık çubuğunun sağı: "Tahsilat dökümü", "Dışa aktar" gibi ikincil eylemler. */
  actions?: ReactNode;
  /** Başlık düzeyi (sayfa içi ana liste h2; sekme/kart içi alt liste h3). */
  titleAs?: "h2" | "h3";
  /**
   * Araç çubuğu yuvası (sadelik K1): arama/süzgeç/dışa aktar çubuğu
   * (`<Toolbar>`) listenin KARTININ üst şeridi olarak çizilir — ayrı kart
   * olmaz. `title` varsa onun altında, `header`'ın üstünde durur. Yuvadaki
   * Toolbar'ın çerçevesi kendiliğinden kalkar. Açılır menüler (ActionMenu,
   * ExportMenu) portal kullandığı için kartın kenarında kırpılmaz.
   */
  toolbar?: ReactNode;
  emptyText?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Boş durum ikonunun modül vurgu rengi (bkz. IconFrame) — opsiyonel. */
  emptyAccent?: IconAccent;
  emptyIcon?: ComponentType<{ className?: string }>;
  emptyIllustrative?: boolean;
  onRowClick?: (row: T) => void;
  /**
   * `onRowClick` yalnız bu satırlarda çalışsın (ör. yalnız faturaya bağlı
   * alım satırı açılır). Diğer satırlar düğme gibi davranmaz: imleç, odak ve
   * `role="button"` almaz. Verilmezse tüm satırlar tıklanabilir.
   */
  isRowClickable?: (row: T) => boolean;
  getRowAriaLabel?: (row: T) => string;
  /** Satıra durum vurgusu (ör. geciken kayıt) için ek sınıf. */
  rowClassName?: (row: T) => string;
  /**
   * Verilirse dar ekranda (<768px) tablo yerine bu kart görünümü kullanılır —
   * sayfaların aynı listeyi mobil için ikinci kez elle yazmasına gerek kalmaz.
   * Kart içeriği satırın en önemli 2-3 bilgisini ve eylemlerini göstermeli.
   */
  mobileCard?: (row: T) => ReactNode;
  /**
   * Kart görünümünde kartın SAĞ ÜST köşesindeki eylem (genellikle satırın
   * "…" ActionMenu'si). Verilirse eylem ayrı bir sıra oluşturmaz; kart
   * içeriği sağda ona yer bırakır (sadelik K3/K9). Aynı menüyü `mobileCard`
   * içinde ikinci kez çizmeyin.
   */
  mobileCardActions?: (row: T) => ReactNode;
  /**
   * Kart görünümünün geçerli olduğu genişlik: "md" (varsayılan, <768px) ya da
   * "lg" (<1024px). Çok sütunlu tablo tablette (menü açıkken) sığmıyorsa "lg".
   */
  cardBelow?: "md" | "lg";
  sort?: ListSort | null;
  onSortChange?: (key: string) => void;
  pager?: ListPagerProps;
  /**
   * Tablonun üstünde, aynı kart içinde gösterilecek içerik (ör. toplu işlem
   * çubuğu `BulkActionBar`, özet satırı). `title` verilirse onun altında durur.
   */
  header?: ReactNode;
  /**
   * Çoklu seçim: her satırın başında onay kutusu, başlıkta "görünenlerin
   * tümünü seç". onRowClick verilmemişse satıra tıklamak seçimi değiştirir —
   * küçük onay kutusunu hedeflemek gerekmez. Klavyede Tab onay kutularında
   * durur (Boşluk seçer); satır ayrıca Tab durağı olmaz.
   */
  selection?: {
    selectedIds: readonly string[];
    onChange: (ids: string[]) => void;
    isSelectable?: (row: T) => boolean;
  };
}

const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// Kart ve tablo görünümünün değiştiği genişlik (Tailwind sınıfları sabit yazılmalı).
const CARD_ONLY_CLASS: Record<"md" | "lg", string> = { md: "md:hidden", lg: "lg:hidden" };
const TABLE_ONLY_CLASS: Record<"md" | "lg", string> = { md: "hidden md:block", lg: "hidden lg:block" };

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button'], [role='menuitem']";

function isFromInteractiveChild(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  // Gövdeye (portal) çizilen menünün boşluğuna ya da ayırıcısına tıklama React
  // ağacında satıra kabarıyor ve hasta dosyasını açıyordu: hedef DOM'da satırın
  // içinde değilse satır tıklaması sayılmaz.
  if (!(event.currentTarget as HTMLElement).contains(target)) return true;
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  // Satırın kendisi role="button" taşıdığı için closest() ona da eşleşir —
  // currentTarget hariç tutulmazsa satır tıklaması hiç çalışmaz.
  return Boolean(interactive && interactive !== event.currentTarget);
}

/**
 * Sütun başlığındaki ⓘ ipucu. Açıklama gövdeye (portal) çizilir: tablonun
 * yatay kaydırma kutusu kısa listelerde onu kırpmasın. Metin ekran okuyucuya
 * `aria-describedby` ile her zaman bağlıdır; görsel balon yalnız tekrarıdır.
 */
function HeaderHint({ label, hint }: { label: string; hint: string }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Balon en çok 16rem; ekran kenarına taşmasın diye merkez sıkıştırılır.
    const half = Math.min(128, window.innerWidth / 2 - 8);
    const center = Math.max(8 + half, Math.min(rect.left + rect.width / 2, window.innerWidth - 8 - half));
    setPosition({ top: rect.bottom + 6, left: center });
  };
  const hide = () => setPosition(null);

  useEffect(() => {
    if (!position) return;
    // Esc yalnız balonu kapatır (WCAG 1.4.13). Yakalama evresinde durdurulur:
    // pencere/çekmece içindeki listede aynı Esc pencereyi de kapatmasın.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
    };
    const onMove = () => setPosition(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [position]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label || "Sütun"} hakkında`}
        aria-describedby={hintId}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={show}
        // Görünen ikon küçük; ::before ile dokunma alanı 32×40px'e büyür (başlık satırı uzamaz,
        // yandaki sıralama düğmesinin üstüne binmez).
        className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-slate-500 !min-h-0 before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-[''] hover:text-slate-700 focus-visible:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span id={hintId} className="sr-only normal-case">{hint}</span>
      {position && typeof document !== "undefined" && createPortal(
        // Katman sırası: menü 320 < ülke kodu 330 < ipucu 340 < onay 350 < bildirim 360;
        // pencere (300) ve çekmece (280) içindeki listede de balon önde kalır.
        <div
          aria-hidden="true"
          style={{ position: "fixed", top: position.top, left: position.left, transform: "translateX(-50%)" }}
          className="pointer-events-none z-[var(--z-hint)] w-max max-w-[16rem] rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium normal-case leading-5 tracking-normal text-white shadow-lg"
        >
          {hint}
        </div>,
        document.body,
      )}
    </>
  );
}

// Bu bileşen src/app/globals.css'teki .panel-content table/thead/th/td taban
// stiline güvenir, onu tekrar tanımlamaz.
export function ListTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  error,
  staleError,
  onRetry,
  title,
  badge,
  subtitle,
  actions,
  titleAs = "h2",
  toolbar,
  emptyText = "Kayıt bulunamadı",
  emptyDescription,
  emptyAction,
  emptyAccent,
  emptyIcon,
  emptyIllustrative = false,
  onRowClick,
  isRowClickable,
  getRowAriaLabel,
  rowClassName,
  mobileCard,
  mobileCardActions,
  cardBelow = "md",
  sort,
  onSortChange,
  pager,
  header,
  selection,
}: ListTableProps<T>) {
  const titleId = useId();
  const hasStickyActions = columns.some((column) => column.key === "islem" || column.key === "actions");
  const tableMinWidth = columns.length >= 6 ? "min-w-[820px]" : columns.length >= 4 ? "min-w-[680px]" : "";
  const isActionsColumn = (key: string) => hasStickyActions && (key === "islem" || key === "actions");

  const selectedSet = new Set(selection?.selectedIds || []);
  const canSelect = (row: T) => Boolean(selection) && (selection?.isSelectable?.(row) ?? true);
  const selectableRows = selection ? rows.filter(canSelect) : [];
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedSet.has(rowKey(row)));
  const someVisibleSelected = selectableRows.some((row) => selectedSet.has(rowKey(row)));
  const toggleRow = (row: T) => {
    if (!selection || !canSelect(row)) return;
    const id = rowKey(row);
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange([...next]);
  };
  const toggleAllVisible = () => {
    if (!selection) return;
    const next = new Set(selectedSet);
    for (const row of selectableRows) {
      if (allVisibleSelected) next.delete(rowKey(row));
      else next.add(rowKey(row));
    }
    selection.onChange([...next]);
  };
  const columnCount = columns.length + (selection ? 1 : 0);
  const selectBox = (row: T) => (
    <input
      type="checkbox"
      checked={selectedSet.has(rowKey(row))}
      disabled={!canSelect(row)}
      onChange={() => toggleRow(row)}
      aria-label={`${getRowAriaLabel?.(row) || "Satır"} — seç`}
      className="h-[18px] w-[18px]"
    />
  );

  // Satır "düğme" mi: onRowClick varsa yalnız isRowClickable'ın izin verdiği
  // satırlar; yoksa seçimli listede her satır (tıklamak seçer).
  const canClickRow = (row: T) => Boolean(onRowClick) && (isRowClickable?.(row) ?? true);
  const isInteractiveRow = (row: T) => (onRowClick ? canClickRow(row) : Boolean(selection));

  // Seçimli listede satır tıklaması yalnız fare/dokunma kolaylığıdır: satır
  // odaklanabilir olsaydı her satırda iki Tab durağı (satır + onay kutusu)
  // olur, ekran okuyucu da adı ve rolü olmayan bir öğeye düşerdi.
  const rowHandlers = (row: T) => !onRowClick && selection ? {
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      toggleRow(row);
    },
  } : onRowClick && canClickRow(row) ? {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": getRowAriaLabel?.(row),
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      onRowClick(row);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (isFromInteractiveChild(event)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onRowClick(row);
      }
    },
  } : {};

  const showError = Boolean(error) && !loading;
  const showSkeleton = loading && rows.length === 0 && !showError;
  const showEmpty = !loading && !showError && rows.length === 0;
  const empty = (
    <EmptyState title={emptyText} description={emptyDescription} action={emptyAction} accent={emptyAccent} icon={emptyIcon} illustrative={emptyIllustrative} compact />
  );
  const TitleTag = titleAs;
  const hasTitleBar = Boolean(title || actions);
  // Yeniden denenirken (loading) şerit gizlenir: kullanıcı denemenin başladığını görür.
  const showStale = Boolean(staleError) && !showError && !loading;

  return (
    <div className="ui-list-table ui-surface overflow-hidden" aria-busy={loading || undefined}>
      {hasTitleBar && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 pb-3 pt-3.5">
          <div className="min-w-0">
            {title && (badge ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <TitleTag id={titleId} className="text-sm font-extrabold text-slate-900">{title}</TitleTag>
                <span className="inline-flex shrink-0 items-center text-xs font-semibold">{badge}</span>
              </div>
            ) : (
              <TitleTag id={titleId} className="text-sm font-extrabold text-slate-900">{title}</TitleTag>
            ))}
            {subtitle && <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p>}
          </div>
          {/* sm:-my-2: 36px düğme 20px başlık satırına taşmadan oturur; eylemli ve eylemsiz başlık aynı yükseklikte kalır. */}
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:-my-2">{actions}</div>}
        </div>
      )}
      {toolbar && <div className="ui-list-table-toolbar border-b border-slate-100">{toolbar}</div>}
      {header}
      {showStale && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-900">
          <span className="flex min-w-0 items-center gap-1.5 py-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            <span className="min-w-0">{staleError} Son yüklenen liste gösteriliyor.</span>
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ui-touch-target inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-amber-900 !min-h-0 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Yeniden dene
            </button>
          )}
        </div>
      )}
      {showError && (
        <div className="p-3">
          <LoadErrorState message={error || "Liste yüklenemedi."} onRetry={onRetry} />
        </div>
      )}

      {mobileCard && !showError && (
        <div className={`divide-y divide-slate-100 ${CARD_ONLY_CLASS[cardBelow]}`}>
          {showSkeleton ? <ListRowSkeleton rows={Math.min(skeletonRows, 5)} /> : showEmpty ? empty : rows.map((row) => (
            <div
              key={rowKey(row)}
              {...rowHandlers(row)}
              className={`ui-list-card px-4 py-3 ${mobileCardActions ? "relative pr-12" : ""} ${isInteractiveRow(row) ? "cursor-pointer active:bg-primary/5 focus:outline-none focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" : ""} ${selection && selectedSet.has(rowKey(row)) ? "bg-primary/[0.05]" : ""} ${rowClassName?.(row) || ""}`}
            >
              {selection ? (
                <div className="flex items-start gap-3">
                  <span className="pt-0.5">{selectBox(row)}</span>
                  <div className="min-w-0 flex-1">{mobileCard(row)}</div>
                </div>
              ) : mobileCard(row)}
              {/* Sağ üst köşe: "…" menüsü ayrı bir eylem sırası oluşturmaz. */}
              {mobileCardActions && <div className="absolute right-2 top-2 flex items-center gap-1">{mobileCardActions(row)}</div>}
            </div>
          ))}
        </div>
      )}

      {!showError && (
        <div className={`${mobileCard ? TABLE_ONLY_CLASS[cardBelow] : ""} overflow-x-auto`}>
          <table className={`${tableMinWidth} w-full`} aria-labelledby={title ? titleId : undefined}>
            {/* Boş listede sütun başlıkları gösterilmez: başlık satırı ile "kayıt yok"
                metni üst üste görünüyor, ekran gereksiz kalabalıklaşıyordu. */}
            <thead className={showEmpty ? "sr-only" : undefined}>
              <tr className="border-b border-slate-200/80">
                {selection && (
                  <th className="w-10 px-3 py-2 sm:px-4">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(element) => { if (element) element.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                      disabled={selectableRows.length === 0}
                      onChange={toggleAllVisible}
                      aria-label="Görünen satırların tümünü seç"
                      className="h-[18px] w-[18px]"
                    />
                  </th>
                )}
                {columns.map((col) => {
                  const sorted = sort && col.sortKey && sort.key === col.sortKey ? sort.dir : null;
                  const actionsColumn = isActionsColumn(col.key);
                  return (
                    <th
                      key={col.key}
                      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                      className={[
                        "whitespace-nowrap py-2",
                        // Eylem sütunu daraltılır (içeriği kadar): "…" ve tek görünür eylem sığar, tablo genişliğini yemez.
                        actionsColumn ? "w-px pl-2 pr-2 sm:pr-3" : "px-3 sm:px-4",
                        ALIGN_CLASS[col.align || "left"],
                        actionsColumn ? "md:sticky md:right-0 md:z-10 md:bg-[rgb(var(--app-surface))]" : "",
                        col.headerClassName || "",
                      ].filter(Boolean).join(" ")}
                    >
                      {actionsColumn && !col.sortKey && !col.headerHint ? (
                        // "İşlem" başlığı eylem ikonlarının üstünde bilgi taşımaz: görsel olarak gizli, ekran okuyucu duyar.
                        <span className="sr-only">{col.header}</span>
                      ) : col.sortKey && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(col.sortKey as string)}
                          className={`ui-table-sort-button inline-flex items-center gap-1 uppercase tracking-wide ${col.align === "right" ? "flex-row-reverse" : ""}`}
                        >
                          {col.header}
                          {sorted === "asc" ? <ArrowUp className="h-3 w-3 text-primary" aria-hidden="true" />
                            : sorted === "desc" ? <ArrowDown className="h-3 w-3 text-primary" aria-hidden="true" />
                              : <ArrowUpDown className="h-3 w-3 text-slate-300" aria-hidden="true" />}
                        </button>
                      ) : col.header}
                      {col.headerHint && (
                        <span className="ml-1 inline-flex align-middle">
                          <HeaderHint label={col.header} hint={col.headerHint} />
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {showSkeleton ? (
                <TableRowsSkeleton rows={skeletonRows} columns={columnCount} />
              ) : showEmpty ? (
                <tr>
                  <td colSpan={columnCount}>{empty}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    {...rowHandlers(row)}
                    className={`group transition-colors duration-150 hover:bg-primary/[0.035] ${isInteractiveRow(row) ? "cursor-pointer focus:outline-none focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" : ""} ${selection && selectedSet.has(rowKey(row)) ? "bg-primary/[0.05]" : ""} ${rowClassName?.(row) || ""}`}
                  >
                    {selection && <td className="h-12 w-10 px-3 py-2 sm:px-4">{selectBox(row)}</td>}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          // Satır ritmi (sadelik K9): tek satırlı satır 48px, iki satırlı ~52–56px.
                          "h-12 py-2",
                          isActionsColumn(col.key) ? "ui-list-actions-cell w-px whitespace-nowrap pl-2 pr-2 sm:pr-3" : "px-3 sm:px-4",
                          ALIGN_CLASS[col.align || "left"],
                          // Yapışkan eylem hücresi opak kalır (kayan içerik altından
                          // görünmez) ve satırın zeminini aynen taşır: üzerine gelme,
                          // seçim ve rowClassName vurgusu (geciken satırın kırmızısı)
                          // hücrede kesilmez (bkz. globals.css .ui-list-sticky-cell).
                          isActionsColumn(col.key) ? "ui-list-sticky-cell md:sticky md:right-0 md:z-10" : "",
                          col.cellClassName || "",
                        ].filter(Boolean).join(" ")}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {pager && rows.length > 0 && !showError && <ListPager {...pager} />}
    </div>
  );
}

/** Boş değer için tek tip gösterim ("—", soluk). */
export function EmptyValue() {
  // Adsız <span>'deki aria-label yok sayılır; ekran okuyucu "uzun çizgi" yerine "Bilgi yok" duysun.
  return (
    <span className="text-slate-300">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Bilgi yok</span>
    </span>
  );
}
