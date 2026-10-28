"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader, type PageHeaderStat } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/PageSkeleton";
import { cachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { selectDoctors } from "@/lib/staff-roles";
import {
  parseNoteFull,
  toTreatmentOptions,
  type Appointment,
  type AppointmentPermissions,
  type CalendarSettings,
  type ClinicUnit,
} from "@/components/randevu/appointment-utils";
import type { AppointmentFormInitial, AppointmentFormSaved } from "@/components/randevu/AppointmentFormModal";
import { useHomeSummary, useLiveRefresh } from "./_components/home-data";
import { dayLabelOf, msUntilNextTurkeyMidnight, shiftDateKey, todayKeyTR } from "./_components/home-utils";
import { TodoList } from "./_components/TodoList";
import { TodayAppointments } from "./_components/TodayAppointments";
import { OpenPastModal } from "./_components/OpenPastModal";
import { GettingStarted } from "./_components/GettingStarted";
import { HOME_GRID, HOME_MAIN, HOME_SIDE_PANEL, HOME_SIDE_SECTION, HOME_TODO_ORDER } from "./_components/home-layout";

// Randevu formu yalnız açılınca yüklenir (ilk açılışı ağırlaştırmasın).
const AppointmentFormModal = dynamic(
  () => import("@/components/randevu/AppointmentFormModal").then((mod) => mod.AppointmentFormModal),
  { ssr: false },
);

const CALENDAR_SETTINGS_URL = "/api/appointments/calendar-settings";
const CLINIC_UNITS_URL = "/api/clinic-units";

type FormState = { mode: "create" | "edit"; appointment?: Appointment | null; initial?: AppointmentFormInitial };

/**
 * Ana sayfa — "Bugün kim gelecek, kim bekliyor, benim ne yapmam gerekiyor?"
 * Başlık + Bekleyen işler + Bugünkü randevular. Klinik içi duyuru ve ekip
 * mesajları kaldırıldı (ürün sahibi: gereksiz); platform duyuruları (bakım vb.)
 * her sayfanın üstünde tek satır görünür (PlatformNotices).
 * Bölümler yetkiye göre: randevu listesi randevuları görebilenlere (eylemler
 * yalnız randevu verebilenlere), taksit ve
 * tahsilat finans merkezine erişenlere; doktor kendi randevularını ve lab
 * işlerini görür. Önceki degrade başlık, KPI kutuları, ayrı tarih kartı, Taksit
 * Takvimi ve tekrar eden sayaçlar kaldırıldı (bkz. DEGISIKLIKLER.md); gün
 * gezinmesi randevu bölümünün başlığında (‹ Bugün ›).
 */
export default function AnasayfaPage() {
  // Oturumdaki kullanıcı: panel düzeni verirse hemen (liste özet isteğini
  // beklemez), yoksa özet yanıtından.
  const { can, userId: contextUserId, scopeKey } = usePermissions();
  // Bugünkü randevu listesi randevuları GÖREBİLEN herkese (eski ana sayfa da
  // okuma iznine bakıyordu); "Yeni randevu", Geldi/Tamamlandı ve açık kalan
  // randevuları kapatma yalnız yazma izniyle. Salt okuyan rol listeyi
  // eylemsiz görür (AgendaList/AppointmentDetailModal canCreate=false).
  const canReadAppointments = can("appointments:read");
  const canWriteAppointments = can("appointments:write");
  const canSeeCollections = can("finance:center") && can("payments:read");

  const appointmentPermissions = useMemo<AppointmentPermissions>(() => ({
    canCreate: can("appointments:write"),
    canDelete: can("appointments:delete"),
    canApprove: can("appointments:approve"),
    canSeePhone: can("patients:phone"),
    canManageBlocks: false,
  }), [can]);

  const todoPermissions = useMemo(() => ({
    appointmentsWrite: can("appointments:write"),
    followUps: can("hastatracking:read"),
    tasks: can("clinictasks:read"),
    labWrite: can("lab:write"),
    installments: can("installments:read") && can("finance:center"),
    sms: can("sms:read"),
  }), [can]);

  // "Bugün" yalnız tarayıcıda hesaplanır (sunucu UTC'de; render sırasında
  // hesaplanınca gece yarısından sonra dünün tarihi basılıyor, #418 veriyordu).
  // Sayfa açık kalırsa gün değişince kendini yeniler.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setTodayKey(todayKeyTR());
    update();
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        update();
        schedule();
      }, msUntilNextTurkeyMidnight() + 5_000);
    };
    schedule();
    const onVisibility = () => {
      if (!document.hidden) update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Randevu bölümünde gösterilen gün: bugüne göre kaç gün ileri/geri. Yalnız bu
  // sayfada yaşar (tarayıcı deposuna yazılmaz): sayfa yeniden açılınca, başka
  // sayfadan dönülünce ya da gece yarısı gün değişince her zaman bugün açılır
  // (eski sayfa oturum önbelleği yüzünden "yarın"da takılı kalıyordu).
  const [dayNav, setDayNav] = useState<{ base: string | null; offset: number }>({ base: null, offset: 0 });
  const dayOffset = todayKey && dayNav.base === todayKey ? dayNav.offset : 0;
  const viewedDayKey = todayKey ? shiftDateKey(todayKey, dayOffset) : null;
  const navigateDay = useCallback((offset: number) => setDayNav({ base: todayKey, offset }), [todayKey]);

  const summary = useHomeSummary();
  const [agendaRefresh, setAgendaRefresh] = useState(0);
  const reloadSummary = summary.reload;

  // Gün değişti: sayılar yeniden (randevu listesi todayKey'e bağlı, kendisi yenilenir).
  const previousDayRef = useRef<string | null>(null);
  useEffect(() => {
    if (!todayKey) return;
    if (previousDayRef.current && previousDayRef.current !== todayKey) void reloadSummary();
    previousDayRef.current = todayKey;
  }, [reloadSummary, todayKey]);

  // Başka personelin kaydı: özet + bugünün listesi tek seferde (1,5 sn birleştirilir).
  useLiveRefresh(() => {
    void reloadSummary();
    setAgendaRefresh((value) => value + 1);
  });

  // Takvim ayarları: tedavi adları/renkleri, doktorlar, randevu süresi (Randevular sayfasıyla ortak önbellek).
  const [calendar, setCalendar] = useState<CalendarSettings | null>(null);
  const [calendarSettled, setCalendarSettled] = useState(false);
  useEffect(() => {
    if (!canReadAppointments) return undefined;
    let cancelled = false;
    cachedGet<CalendarSettings>(CALENDAR_SETTINGS_URL, 60_000, { throwOnError: true })
      .then((data) => {
        if (!cancelled) setCalendar(data);
      })
      .catch(() => {
        // Ayarlar alınamazsa liste varsayılan tedavi adlarıyla çizilir.
      })
      .finally(() => {
        if (!cancelled) setCalendarSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [canReadAppointments]);
  const treatments = useMemo(() => toTreatmentOptions(calendar?.treatments), [calendar?.treatments]);
  const doctors = useMemo(() => selectDoctors(calendar?.doctors || []), [calendar?.doctors]);
  const slotInterval = Math.max(5, Math.min(120, Number(calendar?.appointmentDuration) || 15));

  // Randevu formu bu sayfada açılır (yeni randevu, düzenle/taşı, sonraki randevu).
  const [form, setForm] = useState<FormState | null>(null);
  const [clinicUnits, setClinicUnits] = useState<ClinicUnit[]>([]);
  const openForm = useCallback((state: FormState) => {
    setForm(state);
    cachedGet<ClinicUnit[]>(CLINIC_UNITS_URL, 60_000)
      .then((units) => setClinicUnits(Array.isArray(units) ? units : []))
      .catch(() => undefined);
  }, []);

  const viewerId = contextUserId || summary.data?.viewer.id || null;
  const viewerIsDoctor = Boolean(viewerId) && doctors.some((doctor) => doctor.id === viewerId);
  // Yeni randevu, listede bakılan gün ileri bir günse o günle açılır (yarına bakarken "Yeni randevu" → yarın).
  const openNewAppointment = () => {
    const dateKey = (dayOffset > 0 ? viewedDayKey : todayKey) || undefined;
    openForm({ mode: "create", initial: { dateKey, doctorId: viewerIsDoctor && viewerId ? viewerId : undefined } });
  };
  const openNextAppointment = (appointment: Appointment) => {
    openForm({
      mode: "create",
      initial: {
        patient: appointment.patient
          ? { id: appointment.patient.id, fullName: appointment.patient.fullName, phone: appointment.patient.phone || null, tcNo: appointment.patient.tcNo || null }
          : null,
        doctorId: appointment.doctor?.id,
        treatment: parseNoteFull(appointment.note, treatments).treatment,
        dateKey: todayKey || undefined,
      },
    });
  };
  const onFormSaved = (result: AppointmentFormSaved) => {
    const mode = form?.mode;
    setForm(null);
    showToastSafe({
      title: mode === "edit" ? "Randevu güncellendi" : "Randevu oluşturuldu",
      message: result.message,
      type: result.tone,
    });
    setAgendaRefresh((value) => value + 1);
    void reloadSummary();
  };

  // "Açık kalan randevular" penceresi. Randevular sayfasındaki "Anasayfada kapat"
  // bağlantısı /anasayfa#acik-kalanlar ile gelir: pencere kendiliğinden açılır.
  const [openPastOpen, setOpenPastOpen] = useState(false);
  const openPastCount = summary.data?.appointments?.openPast;
  const [hashRequested, setHashRequested] = useState(false);
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#acik-kalanlar") setHashRequested(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  // Özet geldiğinde (ya da alınamadığında) karar verilir. Sayı bilinmiyorsa
  // (özet ya da randevu bölümü alınamadı) pencere yine açılır: kendi listesini
  // kendisi yükler, hata olursa orada gösterir — istek sessizce takılı kalmaz.
  const summarySettled = Boolean(summary.data) || Boolean(summary.error);
  useEffect(() => {
    if (!hashRequested || !summarySettled) return;
    setHashRequested(false);
    if (!canWriteAppointments) return;
    if (openPastCount === undefined || openPastCount > 0) {
      setOpenPastOpen(true);
      document.getElementById("acik-kalanlar")?.scrollIntoView({ block: "center" });
    } else {
      showToastSafe({ message: "Önceki günlerden açık kalan randevu yok.", type: "info" });
    }
  }, [canWriteAppointments, hashRequested, openPastCount, summarySettled]);

  // Bugünkü tahsilat: yüklenirken yer tutucu (başlık zıplamasın); alınamazsa hiç
  // gösterilmez — bilinmeyen tutar "₺0,00" yazılmaz.
  const collections = summary.data?.collectionsToday;
  const collectionsPending = !summary.data && !summary.error;
  // Yönetici günün özetini başlıkta görür (en çok 3 sayı): gelen / randevu, gelmeyen, tahsilat.
  const todayCounts = can("settings:write") ? summary.data?.appointments?.today : undefined;
  const statList: PageHeaderStat[] = [
    ...(todayCounts && todayCounts.total > 0 ? [
      { label: "Bugün gelen", value: `${todayCounts.arrived} / ${todayCounts.total}` },
      ...(todayCounts.noShow > 0 ? [{ label: "Gelmeyen", value: todayCounts.noShow, color: "text-red-700" }] : []),
    ] : []),
    ...(canSeeCollections && (collections !== undefined || collectionsPending)
      ? [{ label: "Bugünkü tahsilat", value: collections !== undefined ? <Money value={collections} /> : <Skeleton className="inline-block h-3.5 w-16 align-middle" /> }]
      : []),
  ];
  const stats: PageHeaderStat[] | undefined = statList.length > 0 ? statList : undefined;
  const tomorrow = summary.data?.appointments
    ? { all: summary.data.appointments.tomorrow, mine: summary.data.appointments.tomorrowMine }
    : null;
  // Liste; tedavi adları (takvim ayarları) ve oturumdaki kullanıcı bilinince
  // çizilir: doktorun listesi önce "Tüm doktorlar" sonra "Benim" olarak zıplamasın.
  const agendaReady = calendarSettled && (Boolean(viewerId) || Boolean(summary.data) || Boolean(summary.error));

  // Sağ sütun: Bekleyen işler (geniş ekranda randevuların yanında, dar ekranda üstünde).
  const sidePanel = (
    <div className={canReadAppointments ? HOME_SIDE_PANEL : "grid gap-4"}>
      <TodoList
        summary={summary.data}
        loading={summary.loading}
        error={summary.error}
        onRetry={() => void reloadSummary()}
        permissions={todoPermissions}
        onOpenPast={() => setOpenPastOpen(true)}
        className={canReadAppointments ? `${HOME_SIDE_SECTION} ${HOME_TODO_ORDER}` : ""}
      />
    </div>
  );

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        icon="home"
        title="Ana sayfa"
        description={todayKey ? dayLabelOf(todayKey) : <Skeleton className="inline-block h-3.5 w-44 align-middle" />}
        stats={stats}
        actions={canWriteAppointments ? <Button icon={Plus} onClick={openNewAppointment}>Yeni randevu</Button> : undefined}
      />

      {can("settings:write") && <GettingStarted scopeKey={scopeKey} />}

      {canReadAppointments ? (
        // Geniş ekranda (1360 px+, ör. 1366/1440/1920 klinik ekranları) randevular
        // solda, sağ sütun tek kart; daha dar ekranda tek sütun:
        // Bekleyen işler → randevular → duyurular ve mesajlar.
        <div className={HOME_GRID}>
          <TodayAppointments
            className={HOME_MAIN}
            todayKey={todayKey}
            dayKey={viewedDayKey}
            dayOffset={dayOffset}
            onNavigate={navigateDay}
            refreshToken={agendaRefresh}
            viewerId={viewerId}
            tomorrow={tomorrow}
            waitlistCount={summary.data?.appointments?.waitlist || 0}
            treatments={treatments}
            settings={calendar}
            ready={agendaReady}
            permissions={appointmentPermissions}
            onEdit={(appointment) => openForm({ mode: "edit", appointment })}
            onNextAppointment={openNextAppointment}
            onChanged={() => void reloadSummary()}
          />
          {sidePanel}
        </div>
      ) : sidePanel}

      {canWriteAppointments && (
        <OpenPastModal
          open={openPastOpen}
          onClose={() => setOpenPastOpen(false)}
          // Kapatılanlar önceki günlerin randevuları: bugünün listesi değişmez, yalnız sayılar.
          onChanged={() => void reloadSummary()}
        />
      )}

      {form && (
        <AppointmentFormModal
          mode={form.mode}
          appointment={form.appointment}
          initial={form.initial}
          settings={calendar}
          doctors={doctors}
          treatments={treatments}
          clinicUnits={clinicUnits}
          slotInterval={slotInterval}
          canSeePhone={appointmentPermissions.canSeePhone}
          onClose={() => setForm(null)}
          onSaved={onFormSaved}
        />
      )}
    </div>
  );
}
