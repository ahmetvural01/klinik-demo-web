import { HeaderSkeleton, Skeleton } from "@/components/ui/PageSkeleton";
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";

// Ana sayfa yüklenirken görünen iskelet — sayfanın gerçek düzeniyle aynı
// sıra ve ızgara (başlık → Yapılacaklar → Bugünkü randevular → Duyurular /
// Ekip mesajları; 1360 px ve üstünde randevular solda, diğerleri sağ sütunda).
// Önceden 4 özet kutulu genel iskelet görünüyor, sayfa açılınca zıplıyordu.
// Hook ve "use client" yok: loading.tsx (sunucu bileşeni) içinde çalışır.

/**
 * Başlık: ortak HeaderSkeleton; PageHeader'daki "Bugünkü tahsilat" satırı
 * (finans merkezine erişen rolde) `stats` ile çizilir — yoksa sayfa açılınca
 * başlık 1 satır uzayıp altındaki her şey aşağı kayardı. "Yeni randevu"
 * düğmesi yalnız randevu verebilene.
 */
function HomeHeaderSkeleton({ action, stats }: { action: boolean; stats: boolean }) {
  return <HeaderSkeleton action={action} stats={stats ? 1 : 0} />;
}

function CardSkeleton({ titleWidth, rows, leading }: { titleWidth: string; rows: number; leading?: "icon" | "avatar" }) {
  return (
    <div className="ui-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 pb-3 pt-3.5">
        <Skeleton className={`h-4 ${titleWidth}`} />
      </div>
      <ListRowSkeleton variant="row" leading={leading} rows={rows} />
    </div>
  );
}

/** Bugünkü randevular: başlık satırı (‹ Bugün ›, Takvimde aç) + kart (süzgeç çipleri, liste). */
function AgendaSkeleton() {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-36" />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <div className="ui-list-table ui-surface overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="md:hidden">
          <ListRowSkeleton rows={5} />
        </div>
        <div className="hidden overflow-hidden md:block">
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              <TableRowsSkeleton rows={6} columns={5} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type HomeSkeletonProps = {
  /** Randevu listesi (appointments:read). Yoksa (ör. Muhasebe) tek sütun: Yapılacaklar → Duyurular / Ekip mesajları. */
  agenda?: boolean;
  /** Başlıkta "Yeni randevu" (appointments:write). */
  action?: boolean;
  /** Başlıkta "Bugünkü tahsilat" satırı (finance:center + payments:read). */
  stats?: boolean;
  /** Duyurular kartı (announcements:read). */
  announcements?: boolean;
  /** Ekip mesajları kartı (messages:read). */
  messages?: boolean;
};

/** Duyurular / Ekip mesajları: sayfadaki ızgarayla aynı (tek kart satırı doldurur). */
function SideCardsSkeleton({ agenda, announcements, messages }: { agenda: boolean; announcements: boolean; messages: boolean }) {
  if (!announcements && !messages) return null;
  const single = announcements !== messages;
  return (
    <div className={`grid gap-4 ${single ? "" : "lg:grid-cols-2"} ${agenda ? "min-[1360px]:col-start-2 min-[1360px]:row-start-2 min-[1360px]:grid-cols-1" : ""}`}>
      {announcements && <CardSkeleton titleWidth="w-24" rows={2} />}
      {messages && <CardSkeleton titleWidth="w-32" rows={3} leading="avatar" />}
    </div>
  );
}

// Ekran okuyucu metni kabın SONUNDA: ilk çocuk olunca `space-y-4` başlığa
// 16 px üst boşluk veriyor, iskelet sayfadan 16 px aşağıda durup açılışta
// bütün içerik yukarı zıplıyordu.
export function HomeSkeleton({ agenda = true, action = agenda, stats = false, announcements = true, messages = true }: HomeSkeletonProps) {
  if (!agenda) {
    return (
      <div className="space-y-4 pb-4" role="status" aria-busy="true">
        <HomeHeaderSkeleton action={action} stats={stats} />
        <div className="grid gap-4">
          <CardSkeleton titleWidth="w-28" rows={3} leading="icon" />
          <SideCardsSkeleton agenda={false} announcements={announcements} messages={messages} />
        </div>
        <span className="sr-only">Ana sayfa yükleniyor</span>
      </div>
    );
  }
  return (
    <div className="space-y-4 pb-4" role="status" aria-busy="true">
      <HomeHeaderSkeleton action={action} stats={stats} />
      <div className="grid gap-4 min-[1360px]:grid-cols-[minmax(0,1fr)_340px] min-[1360px]:grid-rows-[auto_1fr] min-[1360px]:items-start">
        <div className="min-[1360px]:col-start-2 min-[1360px]:row-start-1">
          <CardSkeleton titleWidth="w-28" rows={3} leading="icon" />
        </div>
        <div className="min-w-0 min-[1360px]:col-start-1 min-[1360px]:row-span-2 min-[1360px]:row-start-1">
          <AgendaSkeleton />
        </div>
        <SideCardsSkeleton agenda announcements={announcements} messages={messages} />
      </div>
      <span className="sr-only">Ana sayfa yükleniyor</span>
    </div>
  );
}
