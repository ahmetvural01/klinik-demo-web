import type { ReactNode } from "react";
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";

/**
 * Sayfa biçimine uyan TEK yükleniyor iskeleti. Önceden 30'a yakın loading.tsx
 * dosyasının her biri kendi kutularını farklı yükseklik, köşe ve satır satır
 * gecikmeli nabızla yazıyordu; liste sayfası yüklenirken özet kartı, takvim
 * yüklenirken tablo görünüyor, içerik gelince sayfa zıplıyordu. Buradaki
 * parçalar gerçek bileşenlerle aynı ölçüdedir (PageHeader, Tabs, Toolbar,
 * StatStrip, ListTable, Section, FormSection) ve sayfanın kendi sırasını
 * izler: başlık → sekmeler → araç çubuğu → özet → içerik.
 *
 * Sunucu bileşeninde çalışır (hook ve "use client" yok): loading.tsx ve
 * <Suspense fallback> içinde doğrudan kullanılır.
 *
 *   // Liste sayfası (hasta, stok, lab…)
 *   <PageSkeleton toolbar body="table" />
 *   // Sekmeli ayar formu
 *   <PageSkeleton tabs={5} headerAction={false} body="form" />
 *   // Hasta dosyası
 *   <PageSkeleton tabs={6} body="detail" />
 *   // Randevu takvimi (telefonda liste görünümü açılıyorsa mobileBody)
 *   <PageSkeleton toolbar body="calendar" mobileBody="table" columns={4} />
 *
 * Parçalar tek başına da kullanılabilir (sayfa içinde bir bölüm yüklenirken):
 * HeaderSkeleton, TabsSkeleton, ToolbarSkeleton, StatsSkeleton,
 * TableSkeleton, CardsSkeleton, FormSkeleton (pencere içinde framed={false}),
 * DetailSkeleton, CalendarSkeleton; liste satırı için ListSkeleton'daki
 * ListRowSkeleton variant="row". Skeleton tek şerittir.
 */

export type PageSkeletonBody = "table" | "cards" | "form" | "detail" | "calendar" | "none";

export type PageSkeletonProps = {
  /** Sayfa başlığı (PageHeader) iskeleti. Sayfa içinde, gerçek başlığın altında kullanılıyorsa false. */
  header?: boolean;
  /** Başlığın sağındaki birincil düğme yeri. Sayfada birincil eylem yoksa false (mobilde boşluk zıplamasın). */
  headerAction?: boolean;
  /** PageHeader `stats` satırındaki sayı adedi (0 = yok). Özet kutuları için `stats` kullanılır. */
  headerStats?: number;
  /** Sekme sayısı (0 = sekme yok). */
  tabs?: number;
  /** Arama + filtre çubuğu (Toolbar). */
  toolbar?: boolean;
  /** Özet sayaç kutusu sayısı (StatStrip; 0 = yok). Yalnız sayfada gerçekten sayaç varsa verin. */
  stats?: number;
  /**
   * İçerik biçimi:
   * "table" liste/tablo (mobilde satır şeritleri) · "cards" kart ızgarası ·
   * "form" başlıklı form bölümü · "detail" ayrıntı (etiket–değer + yan liste) ·
   * "calendar" saat × doktor ızgarası · "none" içerik yok.
   */
  body: PageSkeletonBody;
  /**
   * Telefonda (<640px) farklı içerik açılıyorsa onun biçimi (ör. randevu:
   * geniş ekranda takvim, telefonda liste). Verilmezse her genişlikte `body`.
   */
  mobileBody?: PageSkeletonBody;
  /** table: satır (8) · cards: kart (6) · form: alan (6) · detail: etiket–değer çifti (6) · calendar: saat dilimi (10). */
  rows?: number;
  /** table: sütun (5) · cards: en çok sütun 2–4 (3) · form: 1–3 (2) · detail: 1–3 (2) · calendar: doktor sütunu (4). */
  columns?: number;
  /** Ekran okuyucunun duyacağı metin (ör. "Hasta dosyası yükleniyor"). */
  label?: string;
  className?: string;
};

/**
 * Tek gri iskelet şeridi — ölçü/biçim className ile verilir ("h-4 w-32",
 * "h-8 w-8 rounded-full"). Önce PageSkeleton ve parçalarını kullanın; bu
 * yalnız satır içi tek bir değerin yüklenmesi gibi küçük yerler için.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`ui-skeleton-shimmer block rounded bg-slate-100 ${className}`} />;
}

// Sayfa zemininde (başlık) ve gri sekme kabında duran şeritler: slate-100 bu
// zeminlerde neredeyse görünmüyordu. `.ui-skeleton-shimmer` zemin rengini
// katmansız CSS'te verdiği için yardımcı sınıf ancak `!` ile ezer.
const ON_TINT = "!bg-slate-200";

// Sabit genişlik dizileri: rastgele değer sunucu/istemci çıktısını farklılaştırırdı.
const TAB_WIDTHS = ["w-16", "w-20", "w-14", "w-24", "w-16", "w-12", "w-20", "w-14"];
const HEAD_WIDTHS = ["w-20", "w-16", "w-24", "w-14", "w-16", "w-12", "w-20", "w-14"];
const TITLE_WIDTHS = ["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-3/4", "w-1/2"];
const LABEL_WIDTHS = ["w-20", "w-24", "w-16", "w-28", "w-20", "w-14"];
const VALUE_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-2/5"];
const NAME_WIDTHS = ["w-24", "w-20", "w-28", "w-16", "w-24", "w-20"];

const STAT_COLUMNS: Record<2 | 3 | 4 | 5, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

const CARD_COLUMNS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

const FIELD_COLUMNS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  const number = Number.isFinite(value) ? Math.round(value as number) : fallback;
  return Math.min(Math.max(number, min), max);
}

/** Boş giriş kutusu: gerçek kontrol gibi beyaz zemin + kenarlık, içinde kısa yer tutucu. */
function FieldBox({ className = "", bar }: { className?: string; bar?: string }) {
  return (
    <span className={`flex h-10 items-center rounded-[var(--radius-control)] border border-slate-200 bg-[rgb(var(--app-surface))] px-3 ${className}`}>
      {bar && <Skeleton className={`h-3 ${bar}`} />}
    </span>
  );
}

/**
 * PageHeader ile aynı ölçü: 36px modül ikonu, başlık (24px satır), bir satır
 * açıklama, sağda düğme. `stats`: PageHeader `stats` satırındaki sayı adedi
 * (açıklamanın altında tek satır; veri gelince başlık zıplamasın).
 */
export function HeaderSkeleton({ action = true, stats = 0 }: { action?: boolean; stats?: number }) {
  return (
    <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className={`h-9 w-9 shrink-0 rounded-lg ${ON_TINT}`} />
        <div className="min-w-0 flex-1">
          <div className="flex h-6 items-center"><Skeleton className={`h-5 w-44 max-w-full ${ON_TINT}`} /></div>
          <div className="mt-0.5 flex h-5 items-center"><Skeleton className={`h-3.5 w-72 max-w-full ${ON_TINT}`} /></div>
          {stats > 0 && (
            <div className="mt-1 flex h-4 flex-wrap items-center gap-x-4 overflow-hidden">
              {Array.from({ length: Math.min(stats, 4) }).map((_, index) => (
                <Skeleton key={index} className={`h-3 ${ON_TINT} ${LABEL_WIDTHS[index % LABEL_WIDTHS.length]}`} />
              ))}
            </div>
          )}
        </div>
      </div>
      {action && <Skeleton className={`h-10 w-32 shrink-0 rounded-md ${ON_TINT}`} />}
    </div>
  );
}

/** Tabs ile aynı kap (.ui-tabs) ve 36px sekme yüksekliği; ilki seçili görünür. */
export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="ui-tabs">
      {Array.from({ length: Math.max(1, count) }).map((_, index) => (
        <span
          key={index}
          className={`flex h-9 shrink-0 items-center rounded-lg px-3.5 ${index === 0 ? "bg-[rgb(var(--app-surface))] shadow-[0_1px_2px_rgb(15_23_42/0.08)]" : ""}`}
        >
          <Skeleton className={`h-3 ${index === 0 ? "" : ON_TINT} ${TAB_WIDTHS[index % TAB_WIDTHS.length]}`} />
        </span>
      ))}
    </div>
  );
}

/**
 * Toolbar ile aynı kap ve sarma düzeni: arama kutusu (genişler), iki filtre,
 * sağda ikincil düğme (mobilde gizli). Dar alanda filtreler alt satıra iner.
 */
export function ToolbarSkeleton() {
  return (
    <div className="ui-toolbar flex flex-col gap-2 p-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FieldBox className="sm:min-w-[220px] sm:flex-1" bar="w-2/5" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <FieldBox className="sm:w-36" bar="w-3/5" />
          <FieldBox className="sm:w-36" bar="w-1/2" />
        </div>
      </div>
      <Skeleton className="hidden h-10 w-28 shrink-0 rounded-md sm:block" />
    </div>
  );
}

/** StatStrip ile aynı kutu ve sütun düzeni. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  const shown = Math.max(1, count);
  const columns = Math.min(Math.max(shown, 2), 5) as 2 | 3 | 4 | 5;
  return (
    // StatStrip gibi: telefonda tek sayıda kutuda son kutu tam genişlik.
    <div className={`grid gap-2 ${STAT_COLUMNS[columns]} max-sm:[&>*:last-child:nth-child(odd)]:col-span-2`}>
      {Array.from({ length: shown }).map((_, index) => (
        <div key={index} className="rounded-[var(--radius-surface)] border border-slate-200 bg-white px-3.5 py-3">
          <div className="flex h-4 items-center"><Skeleton className={`h-3 max-w-full ${LABEL_WIDTHS[index % LABEL_WIDTHS.length]}`} /></div>
          <Skeleton className="mt-1.5 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * ListTable'ın kendi yükleme görünümüyle birebir: aynı kap, başlık satırı ve
 * TableRowsSkeleton; mobilde (md altı) mobil kart yüklenirken görünen şeritler.
 */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  const rowCount = clamp(rows, 8, 1, 50);
  const columnCount = clamp(columns, 5, 1, 12);
  return (
    <div className="ui-list-table ui-surface overflow-hidden">
      <div className="md:hidden">
        <ListRowSkeleton rows={Math.min(rowCount, 5)} />
      </div>
      <div className="hidden overflow-hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200/80">
              {Array.from({ length: columnCount }).map((_, index) => (
                <th key={index} className="px-3 py-2.5 text-left sm:px-4">
                  <span aria-hidden="true" className={`ui-skeleton-shimmer inline-block h-2.5 rounded bg-slate-100 align-middle ${HEAD_WIDTHS[index % HEAD_WIDTHS.length]}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <TableRowsSkeleton rows={rowCount} columns={columnCount} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Kart ızgarası: başlık + durum rozeti, iki satır metin, alt bilgi. */
export function CardsSkeleton({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  const columnCount = clamp(columns, 3, 2, 4) as 2 | 3 | 4;
  return (
    <div className={`grid grid-cols-1 gap-3 ${CARD_COLUMNS[columnCount]}`}>
      {Array.from({ length: clamp(count, 6, 1, 24) }).map((_, index) => (
        <div key={index} className="ui-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={`h-4 ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}`} />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * FormSection ile aynı kap: ikonlu başlık, etiket + giriş kutusu ızgarası;
 * `footer` (varsayılan true) altta Vazgeç/Kaydet yeri çizer — SaveBar'lı sayfa
 * formunda false verilir (PageSkeleton body="form" verir). Modal/Drawer gövdesinde framed={false}: yalnız alan
 * ızgarası (pencerenin kendi başlığı ve eylem şeridi var; kart içinde kart olmaz).
 */
export function FormSkeleton({ fields = 6, columns = 2, footer = true, framed = true }: { fields?: number; columns?: number; footer?: boolean; framed?: boolean }) {
  const columnCount = clamp(columns, 2, 1, 3) as 1 | 2 | 3;
  const grid = (
    <div className={`grid gap-4 ${FIELD_COLUMNS[columnCount]}`}>
      {Array.from({ length: clamp(fields, 6, 1, 30) }).map((_, index) => (
        <div key={index} className="min-w-0">
          <div className="mb-1.5 flex h-4 items-center"><Skeleton className={`h-3 ${LABEL_WIDTHS[index % LABEL_WIDTHS.length]}`} /></div>
          <FieldBox />
        </div>
      ))}
    </div>
  );
  if (!framed) {
    // Pencere gövdesinde tek başına durur: yükleme durumu ekran okuyucuya burada söylenir.
    return (
      <div aria-busy="true">
        <div aria-hidden="true">{grid}</div>
        <span role="status" className="sr-only">Yükleniyor</span>
      </div>
    );
  }
  // FormSection (Section görünümü) ile aynı başlık: küçük ikon + başlık satırı.
  return (
    <div className="ui-surface">
      <div className="px-4 pb-1 pt-3.5">
        <div className="flex h-5 items-center gap-2">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-4 w-36 max-w-full" />
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        {grid}
        {footer && (
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Section ile aynı başlık boşlukları; flush = kenara dayalı liste içeriği. */
function SectionShell({ titleWidth, flush = false, children }: { titleWidth: string; flush?: boolean; children: ReactNode }) {
  return (
    <div className="ui-surface overflow-hidden">
      <div className={`px-4 pt-3.5 ${flush ? "border-b border-slate-100 pb-3" : "pb-1"}`}>
        <div className="flex h-5 items-center"><Skeleton className={`h-4 ${titleWidth}`} /></div>
      </div>
      <div className={flush ? "" : "px-4 pb-4 pt-2"}>{children}</div>
    </div>
  );
}

/** Ayrıntı sayfası: solda etiket–değer bölümü + kısa liste, sağda (geniş ekranda) yan liste. */
export function DetailSkeleton({ pairs = 6, columns = 2 }: { pairs?: number; columns?: number }) {
  const columnCount = clamp(columns, 2, 1, 3) as 1 | 2 | 3;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <SectionShell titleWidth="w-32">
          <div className={`grid gap-x-6 gap-y-4 ${FIELD_COLUMNS[columnCount]}`}>
            {Array.from({ length: clamp(pairs, 6, 1, 30) }).map((_, index) => (
              <div key={index} className="min-w-0 space-y-1.5">
                <Skeleton className={`h-3 ${LABEL_WIDTHS[index % LABEL_WIDTHS.length]}`} />
                <Skeleton className={`h-4 ${VALUE_WIDTHS[index % VALUE_WIDTHS.length]}`} />
              </div>
            ))}
          </div>
        </SectionShell>
        <SectionShell titleWidth="w-28" flush>
          <ListRowSkeleton rows={3} variant="row" />
        </SectionShell>
      </div>
      <SectionShell titleWidth="w-24" flush>
        <ListRowSkeleton rows={4} variant="row" leading="icon" />
      </SectionShell>
    </div>
  );
}

// Takvimde bazı hücreler "dolu" görünür; desen sabit (sunucu/istemci aynı çıktı).
function isBooked(row: number, column: number) {
  return (row * 5 + column * 3) % 7 < 2;
}

// Dar ekranda tüm doktor sütunları sığmaz: ilk sütun her zaman, ikincisi sm+, kalanlar md+.
function calendarColumnClass(column: number) {
  return column === 0 ? "" : column === 1 ? "hidden sm:block" : "hidden md:block";
}

/** Randevu ızgarası: solda saat sütunu, üstte doktor adları, bazı hücreler dolu. */
export function CalendarSkeleton({ slots = 10, columns = 4 }: { slots?: number; columns?: number }) {
  const columnCount = clamp(columns, 4, 1, 8);
  const slotCount = clamp(slots, 10, 1, 40);
  return (
    <div className="ui-surface overflow-hidden">
      <div className="flex border-b border-slate-200/80">
        <div className="w-16 shrink-0" />
        {Array.from({ length: columnCount }).map((_, column) => (
          <div key={column} className={`min-w-0 flex-1 border-l border-slate-100 px-3 py-2.5 ${calendarColumnClass(column)}`}>
            <div className="flex h-5 items-center"><Skeleton className={`h-3.5 max-w-full ${NAME_WIDTHS[column % NAME_WIDTHS.length]}`} /></div>
          </div>
        ))}
      </div>
      {Array.from({ length: slotCount }).map((_, row) => (
        <div key={row} className="flex border-b border-slate-100 last:border-b-0">
          <div className="flex w-16 shrink-0 justify-end bg-slate-50/70 px-2 pt-2">
            <Skeleton className="h-3 w-9" />
          </div>
          {Array.from({ length: columnCount }).map((_, column) => (
            <div key={column} className={`h-12 min-w-0 flex-1 border-l border-slate-100 p-1 ${calendarColumnClass(column)}`}>
              {isBooked(row, column) && <Skeleton className="h-full w-full rounded-md" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({
  header = true,
  headerAction = true,
  headerStats = 0,
  tabs = 0,
  toolbar = false,
  stats = 0,
  body,
  mobileBody,
  rows,
  columns,
  label = "Yükleniyor",
  className = "",
}: PageSkeletonProps) {
  const content = (kind: PageSkeletonBody) => (
    <>
      {kind === "table" && <TableSkeleton rows={rows} columns={columns} />}
      {kind === "cards" && <CardsSkeleton count={rows} columns={columns} />}
      {/* Sayfa formunda kartta düğme yok (SaveBar yalnız değişiklikte çıkar); iskelet düğme yeri çizerse veri gelince ekran zıplar. */}
      {kind === "form" && <FormSkeleton fields={rows} columns={columns} footer={false} />}
      {kind === "detail" && <DetailSkeleton pairs={rows} columns={columns} />}
      {kind === "calendar" && <CalendarSkeleton slots={rows} columns={columns} />}
    </>
  );
  // Duyarlı iskelet CSS ile seçilir (sunucu bileşeni; ilk karede doğru biçim):
  // telefonda ilk karede takvim görünüp listeye geçiyordu.
  const responsive = mobileBody !== undefined && mobileBody !== body;
  return (
    // aria-busy: ekran görüntüsü/test betikleri (scripts/visual-audit.mjs) yüklemenin bittiğini buradan anlar.
    <div aria-busy="true" className={`ui-page-skeleton ${className}`}>
      <div aria-hidden="true" className="space-y-4">
        {header && <HeaderSkeleton action={headerAction} stats={headerStats} />}
        {tabs > 0 && <TabsSkeleton count={tabs} />}
        {toolbar && <ToolbarSkeleton />}
        {stats > 0 && <StatsSkeleton count={stats} />}
        {responsive ? (
          <>
            <div className="sm:hidden">{content(mobileBody)}</div>
            <div className="hidden sm:block">{content(body)}</div>
          </>
        ) : content(body)}
      </div>
      <span role="status" className="sr-only">{label}</span>
    </div>
  );
}
