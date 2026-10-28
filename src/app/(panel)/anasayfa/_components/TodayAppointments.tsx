"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/ChoiceCards";
import { AgendaList } from "@/components/randevu/AgendaList";
import { AppointmentDetailModal } from "@/components/randevu/AppointmentDetailModal";
import { fetchDayAppointments } from "@/components/randevu/appointment-api";
import {
  activeCount,
  countByDisplay,
  displayStatus,
  type Appointment,
  type AppointmentPermissions,
  type CalendarSettings,
} from "@/components/randevu/appointment-utils";
import type { DisplayAppointmentStatus } from "@/lib/appointment-status";
import type { TreatmentOption } from "@/lib/appointment-follow-up";
import { CONNECTION_ERROR } from "./home-data";
import { dayLabelOf } from "./home-utils";

type ScopeKey = "benim" | "tumu";
type StatusFilter = "AKTIF" | DisplayAppointmentStatus;

const STATUS_OPTIONS: Array<{ value: DisplayAppointmentStatus; label: string; tone?: "warning" }> = [
  { value: "PLANLANDI", label: "Planlandı" },
  // Randevular ekranı ve satır rozetiyle aynı ad: hasta geldi, bekleme salonunda.
  { value: "BEKLIYOR", label: "Geldi (bekliyor)", tone: "warning" },
  { value: "TAMAMLANDI", label: "Tamamlandı" },
  { value: "GELMEDI", label: "Gelmedi" },
  { value: "IPTAL", label: "İptal" },
];

const byStart = (a: Appointment, b: Appointment) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime();

/** Bölüm başlığı: bugün / yarın / dün kısa adla, diğer günler "Randevular" + tarih satırı. */
function headingOf(dayOffset: number) {
  if (dayOffset === 0) return "Bugünkü randevular";
  if (dayOffset === 1) return "Yarınki randevular";
  if (dayOffset === -1) return "Dünkü randevular";
  return "Randevular";
}

type TodayAppointmentsProps = {
  todayKey: string | null;
  /** Listede gösterilen gün ("YYYY-MM-DD"); varsayılan bugün. */
  dayKey: string | null;
  /** Gösterilen günün bugüne uzaklığı (0 = bugün). */
  dayOffset: number;
  /** ‹ › ve "Bugün": gösterilecek günün bugüne uzaklığı. */
  onNavigate: (dayOffset: number) => void;
  /** Artınca liste yeniden istenir (başka personelin kaydı, form kaydı). */
  refreshToken: number;
  viewerId: string | null;
  tomorrow: { all: number; mine: number } | null;
  /** Bekleme listesindeki hasta sayısı (iptal sonrası "boşalan saate hasta" önerisi için). */
  waitlistCount: number;
  treatments: TreatmentOption[];
  settings: CalendarSettings | null;
  /** Takvim ayarları ve oturum bilgisi gelmeden liste çizilmez (tedavi adı / "Benim" sonradan değişip zıplamasın). */
  ready: boolean;
  permissions: AppointmentPermissions;
  onEdit: (appointment: Appointment) => void;
  onNextAppointment: (appointment: Appointment) => void;
  /** Bir randevunun durumu değişti — özet sayıları yenilensin. */
  onChanged: () => void;
  className?: string;
};

/**
 * Bugünkü randevular: Randevular > Liste görünümüyle aynı liste (AgendaList,
 * sıkı görünüm) ve aynı detay penceresi. Satıra dokununca detay açılır (Geldi /
 * Tamamlandı / Gelmedi, tahsilat, sonraki randevu); satır sonundaki tek
 * düğmeyle Geldi → Tamamlandı işaretlenir. Bugün randevusu olan kullanıcıda
 * (doktor) varsayılan "Benim" ve sıradaki hastası vurgulu. Başlıktaki ‹ › ile
 * önceki/sonraki güne bakılır, "Bugün" tek tıkla geri getirir; ayrıntılı
 * takvim Randevular sayfasındadır.
 */
export function TodayAppointments({
  todayKey,
  dayKey,
  dayOffset,
  onNavigate,
  refreshToken,
  viewerId,
  tomorrow,
  waitlistCount,
  treatments,
  settings,
  ready,
  permissions,
  onEdit,
  onNextAppointment,
  onChanged,
  className = "",
}: TodayAppointmentsProps) {
  const router = useRouter();
  const headingId = useId();
  // Liste ve hata hangi güne aitse onunla saklanır: gün değişince önceki günün
  // satırları yeni günün başlığı altında görünmez (yükleniyor görünümü gelir);
  // aynı günün yenilemesinde eldeki liste korunur.
  const [loaded, setLoaded] = useState<{ day: string; rows: Appointment[] } | null>(null);
  const [failure, setFailure] = useState<{ day: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [scopeChoice, setScopeChoice] = useState<ScopeKey | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("AKTIF");
  const [detail, setDetail] = useState<Appointment | null>(null);
  const isToday = dayOffset === 0;

  useEffect(() => {
    if (!dayKey) return undefined;
    const controller = new AbortController();
    setLoading(true);
    fetchDayAppointments(dayKey, undefined, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setLoaded({ day: dayKey, rows });
        setFailure(null);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || (loadError instanceof Error && loadError.name === "AbortError")) return;
        // Geçici hata: ekrandaki liste korunur, yalnız uyarı gösterilir.
        setFailure({
          day: dayKey,
          message: loadError instanceof TypeError ? CONNECTION_ERROR : loadError instanceof Error ? loadError.message : "Randevular yüklenemedi.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [dayKey, refreshToken, reloadKey]);

  const list = loaded && loaded.day === dayKey ? loaded.rows : null;
  const error = failure && failure.day === dayKey ? failure.message : null;
  const rows = useMemo(() => list || [], [list]);
  const hasMine = Boolean(viewerId) && rows.some((row) => row.doctor?.id === viewerId);
  const hasOthers = rows.some((row) => row.doctor?.id !== viewerId);
  // Kullanıcı seçmediyse: o gün kendi randevusu varsa "Benim", yoksa "Tüm doktorlar".
  const scope: ScopeKey = scopeChoice ?? (hasMine ? "benim" : "tumu");
  const mineOnly = scope === "benim" && hasMine && viewerId ? viewerId : null;
  const scoped = useMemo(() => (mineOnly ? rows.filter((row) => row.doctor?.id === mineOnly) : rows), [mineOnly, rows]);
  const counts = useMemo(() => countByDisplay(scoped), [scoped]);
  const active = activeCount(scoped);

  // Seçili durumda randevu kalmadıysa (ör. son bekleyen de tamamlandı) "Aktif"e dön:
  // boş liste "Bugün randevu yok" diyerek yanıltmasın.
  useEffect(() => {
    if (statusFilter !== "AKTIF" && list && counts[statusFilter] === 0) setStatusFilter("AKTIF");
  }, [counts, list, statusFilter]);

  const visible = useMemo(
    () => scoped.filter((row) => (statusFilter === "AKTIF" ? row.status !== "IPTAL" : displayStatus(row.status) === statusFilter)),
    [scoped, statusFilter],
  );

  // Doktorun sıradaki hastası (yalnız bugün): bekleme salonundaki ilk hasta, yoksa ilk planlı randevu.
  const nextUpId = useMemo(() => {
    if (!mineOnly || !isToday) return null;
    const sorted = [...scoped].sort(byStart);
    return sorted.find((row) => row.status === "GELDI")?.id
      || sorted.find((row) => row.status === "BEKLIYOR" || row.status === "ONAYLANDI")?.id
      || null;
  }, [isToday, mineOnly, scoped]);

  const statusOptions: ChoiceOption<StatusFilter>[] = [
    // İptaller bu sayıya girmez (yanında ayrıca "İptal" çipi var); ad bunu söyler.
    { value: "AKTIF", label: "Aktif", count: active },
    ...STATUS_OPTIONS
      .filter((option) => counts[option.value] > 0 || statusFilter === option.value)
      .map((option) => ({ value: option.value, label: option.label, count: counts[option.value], countTone: option.tone })),
  ];
  const singleDoctor = new Set(scoped.map((row) => row.doctor?.id || "")).size <= 1;
  // Tek durum varsa ("Aktif 1 · Planlandı 1" aynı şeyi iki kez sayıyordu) çipler gösterilmez.
  const distinctStatuses = STATUS_OPTIONS.filter((option) => counts[option.value] > 0).length;
  const showStatusFilter = distinctStatuses >= 2 || statusFilter !== "AKTIF";
  const showScopeFilter = hasMine && hasOthers;

  const replaceRow = (updated: Appointment) => {
    setLoaded((current) => current && { ...current, rows: current.rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) });
  };

  // Gün değişince durum süzgeci "Aktif"e döner (önceki günün süzgeci yeni günde boş liste göstermesin).
  const navigate = (offset: number) => {
    setStatusFilter("AKTIF");
    onNavigate(offset);
  };

  // "Takvimde aç": bakılan gün (bugün değilse) ve kişi seçimi Randevular'a taşınır.
  // "Benim" → doktorun kendisi; kendi randevusu olan kullanıcı "Tüm doktorlar"ı
  // seçtiyse Randevular'ın "tümü" değeri (doctorId=tum) — yoksa doktorun takvimi
  // varsayılan olarak yalnız kendi randevularıyla açılıyordu.
  const calendarParams = new URLSearchParams();
  if (!isToday && dayKey) calendarParams.set("date", dayKey);
  if (mineOnly) calendarParams.set("doctorId", mineOnly);
  else if (hasMine && scope === "tumu") calendarParams.set("doctorId", "tum");
  const calendarQuery = calendarParams.toString();
  const calendarHref = calendarQuery ? `/randevu?${calendarQuery}` : "/randevu";
  const tomorrowCount = isToday && tomorrow ? (mineOnly ? tomorrow.mine : tomorrow.all) : null;
  const firstLoad = list === null;
  const listReady = !firstLoad && ready;
  const firstLoadFailed = firstLoad && !loading && Boolean(error);

  const filterBar = listReady && rows.length > 0 && (showStatusFilter || showScopeFilter) ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-2.5">
      {showScopeFilter && (
        <ChoiceCards<ScopeKey>
          label="Kimin randevuları"
          labelHidden
          variant="pills"
          value={scope}
          onChange={setScopeChoice}
          options={[
            { value: "benim", label: "Benim" },
            { value: "tumu", label: "Tüm doktorlar" },
          ]}
        />
      )}
      {/* Telefonda durum çipleri tek satırda yana kayar (3-4 satıra yayılıp listeyi aşağı itmesin). */}
      {showStatusFilter && <ChoiceCards<StatusFilter>
        label="Duruma göre süz"
        labelHidden
        variant="pills"
        value={statusFilter}
        onChange={setStatusFilter}
        options={statusOptions}
        className="min-w-0 max-w-full max-sm:overflow-x-auto max-sm:pb-1 max-sm:[&_[role=radio]]:shrink-0 max-sm:[&_[role=radiogroup]]:flex-nowrap"
      />}
    </div>
  ) : undefined;

  return (
    <section aria-labelledby={headingId} className={`min-w-0 space-y-2 ${className}`}>
      {/* Başlık solda; gün düğmeleri sağda sabit kalır (başlık uzayıp kısalınca ‹ › imlecin altından kaymaz). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-extrabold text-slate-900">{headingOf(dayOffset)}</h2>
          {!isToday && dayKey && <p className="text-xs font-semibold text-slate-500">{dayLabelOf(dayKey)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {/* Gün düğmeleri çerçevesiz: başlık satırında üç ayrı kutu görünmesin. */}
          <div role="group" aria-label="Gün seçimi" className="flex items-center">
            <IconButton size="sm" tone="ghost" icon={ChevronLeft} title="Önceki gün" onClick={() => navigate(dayOffset - 1)} disabled={!todayKey} />
            <Button size="sm" variant="ghost" onClick={() => navigate(0)} disabled={isToday}>Bugün</Button>
            <IconButton size="sm" tone="ghost" icon={ChevronRight} title="Sonraki gün" onClick={() => navigate(dayOffset + 1)} disabled={!todayKey} />
          </div>
          <Button size="sm" variant="ghost" icon={CalendarDays} href={calendarHref}>Takvimde aç</Button>
        </div>
      </div>

      <AgendaList
        compact
        appointments={listReady ? visible : []}
        treatments={treatments}
        loading={!listReady && !firstLoadFailed}
        error={firstLoadFailed ? error : null}
        staleError={!firstLoad ? error : null}
        onRetry={() => setReloadKey((value) => value + 1)}
        canCreate={permissions.canCreate}
        canSeePhone={permissions.canSeePhone}
        hideDoctor={Boolean(mineOnly) || singleDoctor}
        highlightId={nextUpId}
        header={filterBar}
        emptyText={isToday ? "Bugün randevu yok" : "Bu gün için randevu yok"}
        onOpen={setDetail}
        onChanged={(updated) => {
          replaceRow(updated);
          onChanged();
        }}
      />

      {/* Yarının yükü (kendi randevuları ya da tümü); tıklayınca liste yarına geçer, "Bugün" geri getirir. */}
      {tomorrowCount !== null && (
        tomorrowCount > 0 ? (
          <Button size="sm" variant="ghost" icon={ChevronRight} iconPosition="right" onClick={() => navigate(1)} className="-ml-3">
            Yarın {tomorrowCount} randevu var
          </Button>
        ) : (
          <p className="text-xs text-slate-500">Yarın için randevu yok.</p>
        )
      )}

      {detail && (
        <AppointmentDetailModal
          key={detail.id}
          appointment={detail}
          treatments={treatments}
          permissions={permissions}
          multiBranch={Boolean(settings?.multiBranch)}
          settings={settings}
          waitlistCount={waitlistCount}
          onOpenWaitlist={() => {
            setDetail(null);
            router.push("/randevu?talepler=bekleme");
          }}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            if (updated) replaceRow(updated);
            onChanged();
          }}
          onEdit={(appointment) => {
            setDetail(null);
            onEdit(appointment);
          }}
          onNextAppointment={(appointment) => {
            setDetail(null);
            onNextAppointment(appointment);
          }}
        />
      )}
    </section>
  );
}
