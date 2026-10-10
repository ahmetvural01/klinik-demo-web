"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, FolderOpen, PauseCircle, PlayCircle, RotateCcw, XCircle } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Select } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { DueLabel, PriorityBadge, TASK_TYPE_LABELS, dueState, isOpenTask, type TaskStatus } from "@/components/takip/takip-labels";
import { TaskFormModal, type ClinicTask } from "@/components/takip/TaskFormModal";
import { confirmDialog } from "@/lib/confirm-client";
import { routes } from "@/lib/routes";
import { showToastSafe } from "@/lib/toast-client";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import { replaceQuery, type TaskView } from "./query-state";
import { useWorkListRefresh } from "./use-work-list-refresh";

const PAGE_SIZE = 50;
type Scope = "benim" | "ekip";

type ClosedPage = { items: ClinicTask[]; total: number; page: number; pageCount: number };
/** Kapanmış görev sayfası + hangi süzgeçle yüklendiği (süzgeç değişince eski satırlar gösterilmez). */
type ClosedState = ClosedPage & { key: string };

/**
 * Zamanı gelen görev: bana atanmış, açık ya da beklemede ve hatırlatma (yoksa
 * son tarih) zamanı geçmiş. Menü rozeti ve zildeki sayı (panel-summary
 * tasksDue) aynı kuralla sayar; bağlantı bu görünümü açar.
 */
function isDueForUser(task: ClinicTask, userId: string, now: Date) {
  if (!isOpenTask(task)) return false;
  const mine = task.assignedToId === userId || (task.assignees || []).some((row) => row.userId === userId);
  if (!mine) return false;
  const at = task.remindAt || task.dueAt;
  if (!at) return false;
  const time = new Date(at).getTime();
  return !Number.isNaN(time) && time <= now.getTime();
}

function assigneeNames(task: ClinicTask) {
  return (task.assignees || []).map((assignee) => (assignee.user.isActive === false ? `${assignee.user.fullName} (pasif)` : assignee.user.fullName));
}

function toClosedPage(body: unknown, wanted: TaskStatus, page: number): ClosedPage | null {
  // Sayfalı yanıt { items, total, page, pageCount }; eski/dizi yanıt da kabul edilir.
  const raw = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as ClosedPage).items) ? (body as ClosedPage).items : null;
  if (!raw) return null;
  const items = (raw as ClinicTask[]).filter((task) => task.status === wanted);
  if (Array.isArray(body)) return { items, total: items.length, page: 1, pageCount: 1 };
  const data = body as ClosedPage;
  return { items, total: Number(data.total) || items.length, page: Number(data.page) || page, pageCount: Math.max(1, Number(data.pageCount) || 1) };
}

export type TasksTabHandle = {
  openCreate: (prefill?: { patient?: PickedPatient | null }) => void;
};

type Props = {
  active: boolean;
  status: TaskView;
  onStatusChange: (status: TaskView) => void;
  /** Görev formunda "Hasta araması olarak aç": aynı sayfada Hasta aramaları'na geçer. */
  onConvertToFollowUp?: (patient: PickedPatient, note: string) => void;
};

/**
 * Yapılacaklar > Ekip görevleri: kişiye atanan iç işler (sipariş, evrak,
 * laboratuvar…). Doktor ve asistan kendi işlerini (bana atanan ya da benim
 * açtığım), yönetici ekibin tamamını görür ve tek seçimle kişiye süzer
 * (önceden kapsam sekmesi + ayrı sorumlu listesi vardı). Durum Hasta
 * aramaları'yla aynı kalıpta: Yapılacak · Tamamlanan · İptal edilen.
 * Açık görevler tek istekte gelir; kapanmış görevler sayfalı ve yalnız
 * seçilince yüklenir (önceden her açılışta kapanmışlar dahil 500 görev).
 */
export const TasksTab = forwardRef<TasksTabHandle, Props>(function TasksTab({ active, status, onStatusChange, onConvertToFollowUp }, ref) {
  const { can, userId } = usePermissions();
  const searchParams = useSearchParams();
  const canSeeAll = can("clinictasks:read-all");
  const canWriteTasks = can("clinictasks:write");
  const canCancelTasks = can("clinictasks:delete");
  const canOpenPatient = can("patients:read");
  const startOpenRequest = useLatestRequest();
  const startClosedRequest = useLatestRequest();

  // Yönetici açınca ekibin tüm işlerini görür; diğer roller kendi işlerini (HL-05).
  const [scope, setScope] = useState<Scope>(() => {
    const fromUrl = searchParams.get("kapsam");
    return fromUrl === "benim" || fromUrl === "ekip" ? fromUrl : canSeeAll ? "ekip" : "benim";
  });
  const [assignee, setAssignee] = useState(() => searchParams.get("sorumlu") || "");
  // Sayfa açıkken adres değişirse (ör. zildeki "?kapsam=benim" bağlantısı) seçim adresi izler.
  const urlScope = searchParams.get("kapsam");
  const urlAssignee = searchParams.get("sorumlu") || "";
  useEffect(() => {
    if (urlScope === "benim" || urlScope === "ekip") setScope(urlScope);
    setAssignee(urlAssignee);
  }, [urlScope, urlAssignee]);
  const effectiveScope: Scope = canSeeAll ? scope : "benim";
  const apiScope = effectiveScope === "ekip" ? "all" : "involved";
  const effectiveAssignee = canSeeAll ? assignee : "";

  const [openTasks, setOpenTasks] = useState<ClinicTask[]>([]);
  const [openLoaded, setOpenLoaded] = useState(false);
  const [openLoading, setOpenLoading] = useState(true);
  const [openError, setOpenError] = useState("");
  const [closedData, setClosedData] = useState<ClosedState | null>(null);
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedError, setClosedError] = useState("");
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const [query, setQuery] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [form, setForm] = useState<{ task: ClinicTask | null; patient: PickedPatient | null } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const closedStatus: TaskStatus | null = status === "tamamlanan" ? "TAMAMLANDI" : status === "iptal" ? "IPTAL" : null;
  // Süzgeç ya da durum değişince sayfa başa döner ve eski listenin satırları gösterilmez.
  const closedKey = closedStatus ? `${closedStatus}|${apiScope}|${effectiveAssignee}|${serverQuery}` : "";
  const closedPage = pageState.key === closedKey ? pageState.page : 1;
  const setClosedPage = (page: number) => setPageState({ key: closedKey, page });
  const closed = closedData && closedData.key === closedKey ? closedData : null;

  const loadOpen = useCallback(async () => {
    const request = startOpenRequest();
    setOpenLoading(true);
    try {
      const response = await fetch(`/api/clinic-tasks?scope=${apiScope}&status=ACIK,BEKLEMEDE&take=500`, { cache: "no-store", signal: request.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error((body as { message?: string } | null)?.message || "Görevler yüklenemedi.");
      const rows = Array.isArray(body) ? body : Array.isArray((body as ClosedPage | null)?.items) ? (body as ClosedPage).items : null;
      if (!rows) throw new Error("Görev listesi beklenmeyen biçimde döndü.");
      if (!request.isLatest()) return;
      setOpenTasks((rows as ClinicTask[]).filter(isOpenTask));
      setOpenLoaded(true);
      setOpenError("");
      setNowTick(Date.now());
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      setOpenError(loadError instanceof Error ? loadError.message : "Görevler yüklenemedi.");
    } finally {
      if (request.isLatest()) setOpenLoading(false);
    }
  }, [apiScope, startOpenRequest]);

  const loadClosed = useCallback(async () => {
    if (!closedStatus) return;
    const request = startClosedRequest();
    setClosedLoading(true);
    try {
      const params = new URLSearchParams({ scope: apiScope, status: closedStatus, paged: "1", page: String(closedPage), take: String(PAGE_SIZE) });
      if (serverQuery) params.set("q", serverQuery);
      if (effectiveAssignee) params.set("assignedToId", effectiveAssignee);
      const response = await fetch(`/api/clinic-tasks?${params.toString()}`, { cache: "no-store", signal: request.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error((body as { message?: string } | null)?.message || "Görevler yüklenemedi.");
      const next = toClosedPage(body, closedStatus, closedPage);
      if (!next) throw new Error("Görev listesi beklenmeyen biçimde döndü.");
      if (!request.isLatest()) return;
      setClosedData({ ...next, key: closedKey });
      setClosedError("");
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      setClosedError(loadError instanceof Error ? loadError.message : "Görevler yüklenemedi.");
    } finally {
      if (request.isLatest()) setClosedLoading(false);
    }
  }, [apiScope, closedKey, closedPage, closedStatus, effectiveAssignee, serverQuery, startClosedRequest]);

  const refresh = useWorkListRefresh(() => {
    void loadOpen();
    if (closedStatus) void loadClosed();
  }, active);

  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  useEffect(() => {
    if (closedStatus) void loadClosed();
  }, [closedStatus, loadClosed]);

  // Kapanmış listelerde arama sunucuda yapılır; yazarken her tuşta istek atılmasın.
  useEffect(() => {
    const timer = window.setTimeout(() => setServerQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useImperativeHandle(ref, () => ({
    openCreate: (prefill) => {
      if (!canWriteTasks) return;
      setForm({ task: null, patient: prefill?.patient || null });
    },
  }), [canWriteTasks]);

  const markBusy = (id: string, busy: boolean) => setBusyIds((current) => {
    const next = new Set(current);
    if (busy) next.add(id);
    else next.delete(id);
    return next;
  });

  /** Görevi listelere yerleştirir: açıksa yapılacaklara, kapandıysa açık listeden çıkar. */
  const applyLocal = (task: ClinicTask) => {
    setOpenTasks((current) => {
      const without = current.filter((row) => row.id !== task.id);
      return isOpenTask(task) ? [task, ...without] : without;
    });
    setClosedData((current) => current
      ? { ...current, items: current.items.flatMap((row) => (row.id !== task.id ? [row] : task.status === row.status ? [task] : [])) }
      : current);
  };

  /** Durum değişikliği; başarılıysa true. İptal onay ister. Kilit yalnız o satırdadır (canlı test H10). */
  const changeStatus = async (task: ClinicTask, next: TaskStatus): Promise<boolean> => {
    if (busyIds.has(task.id)) return false;
    if (next === "IPTAL") {
      if (!canCancelTasks) return false;
      const confirmed = await confirmDialog({
        title: `"${task.title}" iptal edilsin mi?`,
        message: "Görev yapılmayacak olarak işaretlenir; geçmişi korunur.",
        danger: true,
        confirmText: "İptal et",
      });
      if (!confirmed) return false;
    }
    markBusy(task.id, true);
    // İyimser güncelleme; tamamlanma saati de hemen yazılır (önceden "—" görünüyordu).
    applyLocal({ ...task, status: next, completedAt: next === "TAMAMLANDI" ? new Date().toISOString() : next === "ACIK" || next === "BEKLEMEDE" ? null : task.completedAt });
    try {
      const response = await fetch(`/api/clinic-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Görev güncellenemedi.");
      applyLocal(data as ClinicTask);
      showToastSafe({
        title: next === "TAMAMLANDI" ? "Görev tamamlandı" : next === "IPTAL" ? "Görev iptal edildi" : next === "BEKLEMEDE" ? "Görev beklemeye alındı" : "Görev yeniden açıldı",
        message: task.title,
        type: "success",
        icon: "clipboard",
      });
      return true;
    } catch (statusError) {
      applyLocal(task);
      showToastSafe({ title: "Görev güncellenemedi", message: statusError instanceof Error ? statusError.message : "Lütfen tekrar deneyin.", type: "error" });
      return false;
    } finally {
      markBusy(task.id, false);
    }
  };

  const onSaved = (saved: ClinicTask, mode: "create" | "edit") => {
    const previous = form?.task;
    setForm(null);
    applyLocal(saved);
    if (mode === "create") {
      const names = assigneeNames(saved);
      showToastSafe({
        title: "Görev kaydedildi",
        message: names.length > 0 ? `Sorumlu: ${names.join(", ")}` : "Kimseye atanmadı; görev sizin listenizde duruyor.",
        type: "success",
        icon: "clipboard",
      });
      if (status !== "yapilacak") onStatusChange("yapilacak");
    } else {
      const statusChanged = previous && previous.status !== saved.status;
      showToastSafe({ title: statusChanged ? `Görev kaydedildi · ${saved.status === "TAMAMLANDI" ? "tamamlandı" : saved.status === "IPTAL" ? "iptal edildi" : "durumu değişti"}` : "Görev güncellendi", message: saved.title, type: "success", icon: "clipboard" });
    }
  };

  const changeOwner = (value: string) => {
    if (value.startsWith("kisi:")) {
      const id = value.slice(5);
      setScope("ekip");
      setAssignee(id);
      replaceQuery({ kapsam: null, sorumlu: id });
      return;
    }
    const nextScope: Scope = value === "benim" ? "benim" : "ekip";
    setScope(nextScope);
    setAssignee("");
    replaceQuery({ kapsam: nextScope === (canSeeAll ? "ekip" : "benim") ? null : nextScope, sorumlu: null });
  };

  // Açık görevler istemcide süzülür (anında); sayaç ve liste aynı süzgeçten geçer.
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredOpen = useMemo(() => openTasks.filter((task) => {
    if (effectiveAssignee && !(task.assignees || []).some((row) => row.userId === effectiveAssignee)) return false;
    if (normalizedQuery) {
      const haystack = [task.title, task.details, task.vendorName, task.patient?.fullName, ...assigneeNames(task), TASK_TYPE_LABELS[task.type]]
        .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  }), [openTasks, effectiveAssignee, normalizedQuery]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const openRows = useMemo(() => {
    const rank = (task: ClinicTask) => {
      const state = dueState(task.dueAt, true, now);
      return state === "overdue" ? 0 : state === "today" ? 1 : 2;
    };
    const due = (task: ClinicTask) => (task.dueAt ? new Date(task.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
    return [...filteredOpen].sort((a, b) => rank(a) - rank(b) || b.priority - a.priority || due(a) - due(b));
  }, [filteredOpen, now]);
  const overdueCount = useMemo(() => filteredOpen.filter((task) => dueState(task.dueAt, true, now) === "overdue").length, [filteredOpen, now]);
  const dueRows = useMemo(() => (userId ? openRows.filter((task) => isDueForUser(task, userId, now)) : []), [now, openRows, userId]);
  // Açık görev listesini kullanan görünümler (Yapılacak ve Zamanı gelen).
  const isOpenView = status === "yapilacak" || status === "zamani-gelen";

  // "Kimin işleri" seçimindeki kişiler eldeki görevlerden (ayrı personel isteği yok).
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of [...openTasks, ...(closed?.items || [])]) {
      for (const row of task.assignees || []) map.set(row.userId, row.user.fullName);
    }
    if (assignee && !map.has(assignee)) map.set(assignee, "Seçili kişi");
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [openTasks, closed, assignee]);

  const rows = status === "yapilacak" ? openRows : status === "zamani-gelen" ? dueRows : closed?.items || [];
  const listLoading = isOpenView ? openLoading && !openLoaded : closedLoading && !closed;
  const listError = isOpenView ? openError : closedError;
  const listLoaded = isOpenView ? openLoaded : Boolean(closed);

  const rowActions = (task: ClinicTask) => {
    const busy = busyIds.has(task.id);
    const open = isOpenTask(task);
    const primary = !canWriteTasks ? null : open
      ? <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busy} onClick={() => void changeStatus(task, "TAMAMLANDI")}>Tamamla</Button>
      : <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy} onClick={() => void changeStatus(task, "ACIK")}>Yeniden aç</Button>;
    const menu: ActionMenuItem[] = [
      ...(canWriteTasks && open ? [task.status === "BEKLEMEDE"
        ? { key: "devam", label: "Devam et", description: "Beklemeden çıkar", icon: PlayCircle, disabled: busy, onSelect: () => void changeStatus(task, "ACIK") }
        : { key: "beklet", label: "Beklemeye al", description: "Dışarıdan yanıt bekleniyor", icon: PauseCircle, disabled: busy, onSelect: () => void changeStatus(task, "BEKLEMEDE") }] : []),
      ...(canOpenPatient && task.patient?.id ? [{ key: "dosya", label: "Hasta dosyası", icon: FolderOpen, href: routes.patient(task.patient.id) }] : []),
      ...(canCancelTasks && open ? [{ key: "iptal", label: "Görevi iptal et", icon: XCircle, danger: true, separatorBefore: true, disabled: busy, onSelect: () => void changeStatus(task, "IPTAL") }] : []),
    ];
    return (
      <div className="flex items-center justify-end gap-1.5">
        {primary}
        <ActionMenu items={menu} label={`${task.title}: diğer işlemler`} />
      </div>
    );
  };

  // Hasta, firma ve tür ikinci satırda (önceden "Hasta" ayrı sütundu ve çoğu satırda boştu; firma hiç görünmüyordu).
  const titleCell = (task: ClinicTask) => {
    const meta = [TASK_TYPE_LABELS[task.type], task.patient ? `Hasta: ${task.patient.fullName}` : null, task.vendorName ? `Firma: ${task.vendorName}` : null].filter(Boolean).join(" · ");
    return (
      <div className="min-w-0 max-w-[420px]">
        <p className={`font-semibold ${task.status === "IPTAL" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span className="min-w-0 truncate" title={meta}>{meta}</span>
          {task.status === "BEKLEMEDE" && <Badge tone="warning">Beklemede</Badge>}
          <PriorityBadge value={task.priority} />
        </div>
        {task.details && <p className="mt-0.5 truncate text-xs text-slate-500" title={task.details}>{task.details}</p>}
      </div>
    );
  };

  const assigneeCell = (task: ClinicTask) => {
    const names = assigneeNames(task);
    return names.length > 0
      ? <span className="block max-w-[220px] truncate text-sm text-slate-700" title={names.join(", ")}>{names.join(", ")}</span>
      : <span className="text-xs text-slate-400">Atanmadı</span>;
  };

  const dateCell = (task: ClinicTask) => {
    if (isOpenView) return <DueLabel at={task.dueAt} open now={now} />;
    const at = status === "tamamlanan" ? task.completedAt : task.updatedAt;
    return at ? <span className="text-sm tabular-nums text-slate-600">{formatDateText(at, "datetime")}</span> : <EmptyValue />;
  };

  // Salt okuyan rolde (ör. muhasebe) satırda yapılacak bir şey yoksa boş "İşlem" sütunu da yok.
  const hasRowActions = canWriteTasks || canCancelTasks || canOpenPatient;
  const columns: ListTableColumn<ClinicTask>[] = [
    { key: "title", header: "Görev", render: titleCell },
    { key: "assignees", header: "Sorumlu", render: assigneeCell },
    { key: "due", header: isOpenView ? "Son tarih" : status === "tamamlanan" ? "Tamamlandı" : "İptal", render: dateCell },
    ...(hasRowActions ? [{ key: "islem", header: "İşlem", align: "right" as const, render: rowActions }] : []),
  ];

  const mobileCard = (task: ClinicTask) => (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className={`min-w-0 font-semibold ${task.status === "IPTAL" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
        <PriorityBadge value={task.priority} />
      </div>
      {/* Telefonda hasta ile sorumlu aynı biçimde yazılınca karışıyordu (canlı mobil U13): önekli. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{TASK_TYPE_LABELS[task.type]}</span>
        {task.patient && <span>Hasta: <span className="font-semibold text-slate-700">{task.patient.fullName}</span></span>}
        {task.vendorName && <span>Firma: {task.vendorName}</span>}
        <span>Sorumlu: {assigneeNames(task).length > 0 ? assigneeNames(task).join(", ") : "atanmadı"}</span>
        {task.status === "BEKLEMEDE" && <Badge tone="warning">Beklemede</Badge>}
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-xs">{dateCell(task)}</span>
        <span className="flex-1" />
        {rowActions(task)}
      </div>
    </div>
  );

  const ownerValue = effectiveAssignee ? `kisi:${effectiveAssignee}` : effectiveScope;
  const ownerName = people.find((person) => person.id === effectiveAssignee)?.name;
  const defaultScope: Scope = canSeeAll ? "ekip" : "benim";
  const activeFilters: ActiveFilter[] = [
    ...(effectiveAssignee ? [{ key: "assignee", label: `Sorumlu: ${ownerName || "Seçili kişi"}`, onRemove: () => changeOwner(defaultScope) }] : []),
    ...(canSeeAll && !effectiveAssignee && effectiveScope !== defaultScope ? [{ key: "scope", label: "Benim işlerim", onRemove: () => changeOwner(defaultScope) }] : []),
  ];
  const isFiltered = Boolean(query.trim() || effectiveAssignee);
  const resetFilters = () => {
    setQuery("");
    changeOwner(defaultScope);
  };

  const emptyText = isFiltered
    ? "Aramanıza uyan görev yok"
    : status === "yapilacak" ? "Yapılacak görev yok"
      : status === "zamani-gelen" ? "Zamanı gelen göreviniz yok"
        : status === "tamamlanan" ? "Tamamlanan görev yok" : "İptal edilen görev yok";

  return (
    <div className="space-y-3">
      <Toolbar
        filters={canSeeAll ? (
          <Select aria-label="Kimin işleri" value={ownerValue} onChange={(event) => changeOwner(event.target.value)} className="sm:w-52">
            <option value="ekip">Tüm ekip</option>
            <option value="benim">Benim işlerim</option>
            {people.length > 0 && <option disabled value="__ayrac">──────────</option>}
            {people.map((person) => <option key={person.id} value={`kisi:${person.id}`}>{person.name}</option>)}
          </Select>
        ) : undefined}
        filterCount={activeFilters.length}
      >
        <ChoiceCards
          label="Görev durumu"
          labelHidden
          variant="pills"
          value={status}
          onChange={onStatusChange}
          options={[
            { value: "yapilacak", label: "Yapılacak", count: openLoaded ? filteredOpen.length : undefined, countTone: overdueCount > 0 ? "critical" : "neutral" },
            // Yalnız size atanmış ve zamanı gelmiş görev varken (ya da bağlantıyla açılınca) görünür.
            ...(dueRows.length > 0 || status === "zamani-gelen"
              ? [{ value: "zamani-gelen" as const, label: "Zamanı gelen", count: openLoaded ? dueRows.length : undefined, countTone: "warning" as const }]
              : []),
            { value: "tamamlanan", label: "Tamamlanan" },
            { value: "iptal", label: "İptal edilen" },
          ]}
        />
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Görev, hasta, firma ya da kişi ara"
          wrapperClassName="flex-1 min-w-[200px]"
        />
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={resetFilters} />

      <ListTable<ClinicTask>
        columns={columns}
        rows={rows}
        rowKey={(task) => task.id}
        loading={listLoading}
        error={!listLoaded ? listError || null : null}
        staleError={listLoaded ? listError || null : null}
        onRetry={refresh}
        onRowClick={(task) => setForm({ task, patient: null })}
        getRowAriaLabel={(task) => `${task.title} görevini aç`}
        mobileCard={mobileCard}
        emptyText={emptyText}
        emptyDescription={isFiltered ? "Arama metnini ya da kişiyi değiştirin." : undefined}
        emptyAction={isFiltered ? <Button size="sm" variant="secondary" onClick={resetFilters}>Filtreleri temizle</Button> : undefined}
        pager={closedStatus && closed && closed.total > PAGE_SIZE ? {
          page: closed.page,
          pageCount: closed.pageCount,
          pageSize: PAGE_SIZE,
          total: closed.total,
          onPageChange: setClosedPage,
          loading: closedLoading,
        } : undefined}
      />

      {form && (
        <TaskFormModal
          key={form.task?.id || "yeni"}
          open
          task={form.task}
          initialPatient={form.patient}
          onClose={() => setForm(null)}
          onSaved={onSaved}
          onStatusChange={changeStatus}
          canCancel={canCancelTasks}
          readOnly={!canWriteTasks}
          onConvertToFollowUp={onConvertToFollowUp ? (patient, note) => { setForm(null); onConvertToFollowUp(patient, note); } : undefined}
        />
      )}
    </div>
  );
});
