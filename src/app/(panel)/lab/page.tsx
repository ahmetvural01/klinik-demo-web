"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { ManagerRequestButton } from "@/components/takip/ManagerRequestButton";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { LabOrderDetailModal } from "@/components/lab/LabOrderDetailModal";
import { LabNewOrderModal } from "@/components/lab/LabNewOrderModal";
import { LabStatusBadge } from "@/components/lab/LabStatusBadge";
import { useLabOrderActions } from "@/components/lab/useLabOrderActions";
import { getLabRowAction, labStatusLine } from "@/components/lab/lab-row-action";
import { fetchJson, normalizeLabOrder, normalizeLabOrders, phoneSearchKey, type LabOrderView, type LabTripView } from "@/components/lab/lab-order-model";
import { cachedGet } from "@/lib/client-cache";
import type { StaffLike } from "@/lib/staff-roles";
import {
  LAB_LABELS,
  expectedReturnAt,
  getOrderSummary,
  stageDetail,
  summarizeLabOrders,
  teethList,
} from "@/lib/lab-workflow";

const LabEmptyIcon = createSceneIllustration("lab");

const TAB_KEYS = ["acik", "gonderilmedi", "laboratuvarda", "klinikte", "kapanan"] as const;
type TabKey = (typeof TAB_KEYS)[number];
type ClosedKind = "done" | "cancelled";
/** Eski bağlantılar (?tab=tamamlandi / ?tab=iptal) "Kapanan" sekmesine eşlenir. */
const LEGACY_CLOSED_TABS: Record<string, ClosedKind> = { tamamlandi: "done", iptal: "cancelled" };
const CLOSED_STATUS: Record<ClosedKind, string> = { done: "HASTAYA_TAKILDI", cancelled: "IPTAL" };

const TAB_EMPTY: Record<TabKey, { title: string; description: string }> = {
  acik: { title: "Açık lab işi yok", description: "Laboratuvara giden her iş hastaya takılana kadar burada görünür." },
  gonderilmedi: { title: "Gönderilecek iş yok", description: "Açılıp henüz laboratuvara gönderilmemiş işler burada görünür." },
  laboratuvarda: { title: "Laboratuvarda iş yok", description: "Laboratuvara gönderilen ve dönüşü beklenen işler burada görünür." },
  klinikte: { title: "Klinikte bekleyen iş yok", description: "Laboratuvardan gelen, prova veya takma bekleyen işler burada görünür." },
  kapanan: { title: "Kapanan iş yok", description: "Hastaya takılan ya da iptal edilen işler burada görünür." },
};

const PAGE_SIZE = 25;
/** Tamamlanan / iptal edilen işlerden ekrana getirilen en yeni kayıt sayısı. */
const CLOSED_LIMIT = 300;
/** Pencereye dönülünce en çok bu sıklıkla yenilenir (her odakta tam liste çekilmesin). */
const FOCUS_REFRESH_MS = 30_000;

type ViewSummary = ReturnType<typeof getOrderSummary<LabTripView>>;
type Row = { order: LabOrderView; summary: ViewSummary };

function matchesTab(tab: TabKey, summary: ViewSummary) {
  switch (tab) {
    case "acik": return summary.stage !== "done" && summary.stage !== "cancelled";
    case "gonderilmedi": return summary.stage === "new";
    case "laboratuvarda": return summary.stage === "atLab" || summary.stage === "late";
    case "klinikte": return summary.stage === "clinic";
    case "kapanan": return true;
  }
}

/** Önce geciken, sonra dönüşü en yakın olan; klinikte en uzun bekleyen; bitenlerde en yeni. */
function urgency(row: Row) {
  const { summary } = row;
  const pendingDue = summary.pendingTrip ? expectedReturnAt(summary.pendingTrip).getTime() : 0;
  const activity = summary.lastActivityAt ? new Date(summary.lastActivityAt).getTime() : new Date(row.order.createdAt || 0).getTime();
  switch (summary.stage) {
    case "late": return [0, pendingDue];
    case "atLab": return [1, pendingDue];
    case "clinic": return [2, activity];
    case "new": return [3, activity];
    case "done": return [4, -activity];
    default: return [5, -activity];
  }
}

const NO_ORDERS: LabOrderView[] = [];

function toRows(orders: LabOrderView[]): Row[] {
  return orders.map((order) => ({ order, summary: getOrderSummary(order) }));
}

function upsert(list: LabOrderView[], next: LabOrderView) {
  return list.some((order) => order.id === next.id) ? list.map((order) => (order.id === next.id ? next : order)) : [next, ...list];
}

export default function LabPage() {
  const { can, role, userId } = usePermissions();
  const canWriteLab = can("lab:write");
  const canCompleteLab = can("lab:complete");
  const canCancelLab = can("lab:delete");
  const canAddLab = can("finance:write");
  const searchParams = useSearchParams();

  // Açık işler — sayfanın asıl listesi. Kapanan işler yalnız o sekme açılınca çekilir
  // (önceden her açılışta ve her yenilemede 300 + 300 kapanan iş de geliyordu).
  const [openOrders, setOpenOrders] = useState<LabOrderView[]>([]);
  const [openLoaded, setOpenLoaded] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);
  const [closedOrders, setClosedOrders] = useState<Partial<Record<ClosedKind, LabOrderView[]>>>({});
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedError, setClosedError] = useState<string | null>(null);
  const openSeqRef = useRef(0);
  const closedSeqRef = useRef(0);
  const lastLoadAtRef = useRef(0);
  const openLoadedRef = useRef(false);
  const [labNames, setLabNames] = useState<string[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [labsError, setLabsError] = useState("");
  const [labsReloadKey, setLabsReloadKey] = useState(0);

  const legacyClosed = LEGACY_CLOSED_TABS[searchParams.get("tab") || ""];
  const [tabParam, setTab] = useTabParam(TAB_KEYS, "acik");
  const tab: TabKey = legacyClosed ? "kapanan" : tabParam;
  const [closedKind, setClosedKind] = useState<ClosedKind>(legacyClosed || "done");
  const [search, setSearch] = useState("");
  const [labFilter, setLabFilter] = useState(() => searchParams.get("labName") || "");
  // ?doktor=<id>: ana sayfadaki "lab işiniz klinikte" satırı hekimin kendi listesine açılır.
  const [doctorParam] = useState(() => searchParams.get("doktor") || "");
  const [doctorFilter, setDoctorFilter] = useState(doctorParam);
  const [doctorFilterName, setDoctorFilterName] = useState("");
  const [page, setPage] = useState(1);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [linkedOrder, setLinkedOrder] = useState<LabOrderView | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newPatient, setNewPatient] = useState<PickedPatient | null>(null);
  const [newLabName, setNewLabName] = useState("");
  const deepLinkHandledRef = useRef(false);

  // Eski "Tamamlandı / İptal edildi" bağlantısı: adres yeni sekmeye çevrilir.
  useEffect(() => {
    if (legacyClosed) setTab("kapanan");
  }, [legacyClosed, setTab]);

  const loadOpen = useCallback(async () => {
    const sequence = ++openSeqRef.current;
    try {
      const payload = await fetchJson("/api/lab-orders?status=DEVAM_EDIYOR&limit=2000", undefined, "Laboratuvar işleri yüklenemedi.");
      if (sequence !== openSeqRef.current) return;
      setOpenOrders(normalizeLabOrders(payload));
      setOpenError(null);
      setStaleError(null);
      openLoadedRef.current = true;
      setOpenLoaded(true);
      lastLoadAtRef.current = Date.now();
    } catch (error) {
      if (sequence !== openSeqRef.current) return;
      const message = error instanceof Error ? error.message : "Laboratuvar işleri yüklenemedi.";
      // Liste ekrandaysa kaybolmaz; üstünde "yenilenemedi" şeridi görünür.
      if (openLoadedRef.current) setStaleError(message);
      else setOpenError(message);
    }
  }, []);

  const loadClosed = useCallback(async (kind: ClosedKind) => {
    const sequence = ++closedSeqRef.current;
    setClosedLoading(true);
    setClosedError(null);
    try {
      const payload = await fetchJson(`/api/lab-orders?status=${CLOSED_STATUS[kind]}&limit=${CLOSED_LIMIT}`, undefined, "Kapanan işler yüklenemedi.");
      if (sequence !== closedSeqRef.current) return;
      setClosedOrders((current) => ({ ...current, [kind]: normalizeLabOrders(payload) }));
    } catch (error) {
      if (sequence === closedSeqRef.current) setClosedError(error instanceof Error ? error.message : "Kapanan işler yüklenemedi.");
    } finally {
      if (sequence === closedSeqRef.current) setClosedLoading(false);
    }
  }, []);

  useEffect(() => { void loadOpen(); }, [loadOpen]);

  const closedLoaded = Boolean(closedOrders[closedKind]);
  useEffect(() => {
    if (tab === "kapanan" && !closedLoaded) void loadClosed(closedKind);
  }, [closedKind, closedLoaded, loadClosed, tab]);

  // Laboratuvar listesi: "Satın alma" ekranında Laboratuvar türündeki firmalar (lab:read ile okunur).
  useEffect(() => {
    let active = true;
    setLabsLoading(true);
    setLabsError("");
    fetchJson("/api/lab-orders?namesOnly=true", undefined, "Laboratuvar listesi yüklenemedi.")
      .then((payload) => {
        if (!active) return;
        setLabNames(Array.isArray(payload) ? payload.filter((name): name is string => typeof name === "string") : []);
      })
      .catch((error) => { if (active) setLabsError(error instanceof Error ? error.message : "Laboratuvar listesi yüklenemedi."); })
      .finally(() => { if (active) setLabsLoading(false); });
    return () => { active = false; };
  }, [labsReloadKey]);

  // Doktor kendi hastalarının işleriyle başlar (filtre etiketinden kaldırılabilir).
  // Kimlik kabuktan (layout) gelir; ad, hekim seçicisinin zaten okuduğu personel
  // listesinden (aynı önbellekli istek). Önceden ayrıca /api/auth/me isteniyordu.
  // Adreste ?doktor= varsa o süzgeç geçerlidir (etiket adı aşağıdaki efektten).
  const doctorDefaultRef = useRef(false);
  useEffect(() => {
    if (role !== "DOKTOR" || doctorDefaultRef.current || doctorParam) return;
    doctorDefaultRef.current = true;
    let active = true;
    const apply = (id: string, name: string) => {
      if (!active || !id) return;
      setDoctorFilter((current) => current || id);
      setDoctorFilterName((current) => current || name);
    };
    if (userId) {
      apply(userId, "");
      // Yalnız etiket adı yazılır; kullanıcı bu arada filtreyi kaldırdıysa geri gelmez.
      cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true })
        .then((staff) => {
          const name = (staff || []).find((member) => member.id === userId)?.fullName || "";
          if (active && name) setDoctorFilterName((current) => current || name);
        })
        .catch(() => undefined);
    } else {
      cachedGet<{ id?: string; fullName?: string } | null>("/api/auth/me", 60_000)
        .then((me) => apply(me?.id || "", me?.fullName || ""))
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [doctorParam, role, userId]);

  // Adresten gelen hekim süzgecinin etiket adı (aynı önbellekli personel listesi).
  useEffect(() => {
    if (!doctorParam) return;
    let active = true;
    cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true })
      .then((staff) => {
        const name = (staff || []).find((member) => member.id === doctorParam)?.fullName || "";
        if (active && name) setDoctorFilterName((current) => current || name);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [doctorParam]);

  // Başka bir personel iş ekleyip güncellediğinde (sunucu olayı) ve sekmeye
  // dönülünce liste sessizce tazelenir: eldeki liste ekranda kalır.
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    refreshRef.current = () => {
      void loadOpen();
      if (tab === "kapanan") void loadClosed(closedKind);
    };
  }, [closedKind, loadClosed, loadOpen, tab]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 400);
    };
    const onRealtime = () => { if (!document.hidden) schedule(); };
    const onReturn = () => {
      if (document.hidden || Date.now() - lastLoadAtRef.current < FOCUS_REFRESH_MS) return;
      schedule();
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);

  // Eylemden sonra sunucunun döndürdüğü güncel iş yerine yazılır; iş hangi
  // listeye aitse oraya taşınır. Eşzamanlı eski yükleme sonucu bunu ezmesin.
  const replaceOrder = useCallback((next: LabOrderView) => {
    openSeqRef.current += 1;
    closedSeqRef.current += 1;
    setClosedLoading(false);
    setOpenOrders((current) => (next.status === "DEVAM_EDIYOR" ? upsert(current, next) : current.filter((order) => order.id !== next.id)));
    setClosedOrders((current) => ({
      done: current.done && (next.status === "HASTAYA_TAKILDI" ? upsert(current.done, next) : current.done.filter((order) => order.id !== next.id)),
      cancelled: current.cancelled && (next.status === "IPTAL" ? upsert(current.cancelled, next) : current.cancelled.filter((order) => order.id !== next.id)),
    }));
    setLinkedOrder((current) => (current && current.id === next.id ? next : current));
  }, []);

  const actions = useLabOrderActions({ onChanged: replaceOrder, labNames });

  // Derin bağlantılar: ?yeni=1 (üst bardaki "Yeni" menüsü), ?new=1&patientId=…
  // (hasta dosyası, tedarikçi ekranı), ?orderId=… (bildirim/hasta dosyası).
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const wantsNew = searchParams.get("yeni") === "1" || searchParams.get("new") === "1";
    const orderId = searchParams.get("orderId");
    if (!wantsNew && !orderId) return;
    deepLinkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    ["yeni", "new", "patientId", "patientName", "orderId"].forEach((key) => params.delete(key));
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);

    if (orderId) {
      setDetailOrderId(orderId);
      // Kapanmış bir iş açık listede yoktur; tek başına okunur.
      fetchJson(`/api/lab-orders/${encodeURIComponent(orderId)}`, undefined, "Lab işi açılamadı.")
        .then((payload) => setLinkedOrder(normalizeLabOrder(payload)))
        .catch(() => undefined);
    }
    if (!wantsNew || !canWriteLab) return;
    const patientId = searchParams.get("patientId") || "";
    const patientName = searchParams.get("patientName") || "";
    setNewLabName(searchParams.get("labName") || "");
    setNewPatient(patientId && patientName ? { id: patientId, fullName: patientName } : null);
    setNewOpen(true);
    if (patientId && !patientName) {
      fetchJson(`/api/patients?id=${encodeURIComponent(patientId)}&take=1&summary=false`, undefined, "Hasta bilgisi yüklenemedi.")
        .then((payload) => {
          const patient = payload && typeof payload === "object" && "patients" in payload && Array.isArray(payload.patients) ? payload.patients[0] : null;
          if (patient && typeof patient.id === "string") setNewPatient({ id: patient.id, fullName: patient.fullName, phone: patient.phone, tcNo: patient.tcNo });
        })
        .catch(() => undefined);
    }
  }, [canWriteLab, searchParams]);

  const closedList = closedOrders[closedKind] ?? NO_ORDERS;
  const openRows = useMemo<Row[]>(() => toRows(openOrders), [openOrders]);
  const listRows = useMemo<Row[]>(() => (tab === "kapanan" ? toRows(closedList) : openRows), [closedList, openRows, tab]);

  const matchesFilters = useCallback(({ order }: Row) => {
    if (labFilter && order.labName !== labFilter) return false;
    if (doctorFilter && order.doctor.id !== doctorFilter) return false;
    const query = search.trim().toLocaleLowerCase("tr-TR");
    if (!query) return true;
    // Telefon, ekranda görünen biçimden bağımsız aranır: "(0555) 100-0105" = "5551000105".
    const phoneQuery = phoneSearchKey(search);
    if (phoneQuery.length >= 3 && phoneSearchKey(order.patient.phone).includes(phoneQuery)) return true;
    return [order.patient.fullName, order.labName, order.labType, order.doctor.fullName, order.teeth || ""]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
  }, [doctorFilter, labFilter, search]);

  // Sekme sayıları açık işlerden, aynı filtrelerle (menü rozeti ve ana sayfa aynı sayımı kullanır).
  const counts = useMemo(() => summarizeLabOrders(openRows.filter(matchesFilters).map((row) => row.order)), [matchesFilters, openRows]);

  const tabRows = useMemo(() => listRows
    .filter((row) => matchesFilters(row) && matchesTab(tab, row.summary))
    .sort((a, b) => {
      const [ga, va] = urgency(a);
      const [gb, vb] = urgency(b);
      return ga - gb || va - vb;
    }), [listRows, matchesFilters, tab]);

  useEffect(() => { setPage(1); }, [tab, closedKind, search, labFilter, doctorFilter]);
  const pageCount = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));
  const pageRows = tabRows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  const labOptions = useMemo(() => {
    const map = new Map<string, { open: number; late: number }>();
    for (const name of labNames) map.set(name, { open: 0, late: 0 });
    for (const { order, summary } of openRows) {
      const entry = map.get(order.labName) || { open: 0, late: 0 };
      entry.open += 1;
      if (summary.stage === "late") entry.late += 1;
      map.set(order.labName, entry);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [labNames, openRows]);

  const detailOrder = detailOrderId
    ? [...openOrders, ...(closedOrders.done || []), ...(closedOrders.cancelled || [])].find((order) => order.id === detailOrderId)
      || (linkedOrder?.id === detailOrderId ? linkedOrder : null)
    : null;

  const openNew = () => {
    setNewPatient(null);
    setNewLabName(labFilter);
    setNewOpen(true);
  };

  // "Laboratuvardan geldi" tek tıkla kaydeder (geri alınabilir); "Laboratuvara
  // gönder" şablondan dolu pencereyi açar (gönderim adımı silinemez — Enter ile
  // kaydedilir); "Hastaya takıldı" fatura ve onay gerektirdiği için pencere açar.
  const runRowAction = ({ order }: Row, kind: string) => {
    if (kind === "send") actions.quickSend(order);
    else if (kind === "receive") actions.quickReceive(order);
    else if (kind === "complete") actions.openComplete(order);
  };

  const actionCell = (row: Row) => {
    const action = getLabRowAction(row.summary, { canWrite: canWriteLab, canComplete: canCompleteLab });
    if (!action) return null;
    if (action.kind === "awaitComplete") return <span className="text-xs font-semibold text-slate-500">{action.label}</span>;
    return (
      <Button
        size="sm"
        variant="secondary"
        loading={actions.quickBusyId === row.order.id}
        disabled={actions.busy && actions.quickBusyId !== row.order.id}
        onClick={() => runRowAction(row, action.kind)}
      >
        {action.label}
      </Button>
    );
  };

  // Rozetin altındaki TEK kısa satır ("Zirkonyum Alt Yapı · dönüş 14.10").
  // Satır hiçbir zaman ikinciye taşmaz: uzun iş adı kesilir, tarih kesilmez;
  // cümlenin tamamı (kaçıncı gün dahil) ipucunda ve iş ayrıntısında. Rozetle
  // aynı anlamı taşıyan metin ("Henüz gönderilmedi", "İş iptal edildi") yazılmaz.
  const stageLine = (summary: ViewSummary, className = "") => {
    const line = labStatusLine(summary);
    if (!line) return null;
    return (
      <p title={stageDetail(summary)} className={`flex min-w-0 text-xs ${summary.stage === "late" ? "font-semibold text-red-700" : "text-slate-500"} ${className}`}>
        {line.what && <span className="truncate">{line.what}</span>}
        {line.when && <span className="shrink-0 whitespace-nowrap">{line.what ? ` · ${line.when}` : line.when}</span>}
      </p>
    );
  };

  // Hekim süzgeci seçiliyken ya da listede tek hekim varken her satırda aynı hekim adı yazılmaz.
  const singleDoctor = new Set(listRows.map(({ order }) => order.doctor.id)).size <= 1;
  const workLine = (order: LabOrderView) => {
    const teeth = teethList(order.teeth);
    return [teeth.length ? `Diş ${teeth.join(", ")}` : "", order.labName, doctorFilter || singleDoctor ? "" : order.doctor.fullName].filter(Boolean).join(" · ");
  };

  // Durum tek sütunda, en fazla iki satır: rozet + "sıradaki adım · tarih".
  const statusCell = ({ summary }: Row) => (
    <div className="min-w-0 max-w-[320px] space-y-0.5">
      <div className="flex items-center gap-1">
        <LabStatusBadge stage={summary.stage} />
        {summary.rework && <Badge tone="neutral" size="sm">Yeniden yapım</Badge>}
      </div>
      {stageLine(summary)}
    </div>
  );

  const columns: ListTableColumn<Row>[] = [
    {
      key: "patient",
      header: "Hasta",
      render: ({ order }) => (
        // Lab listesinde telefon gerekmez (arama hasta dosyasından); satır tek bilgiye iner.
        <p className="truncate text-sm font-semibold text-slate-900">{order.patient.fullName}</p>
      ),
    },
    {
      key: "work",
      header: "İş",
      render: ({ order }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{order.labType}</p>
          <p className="truncate text-xs text-slate-500">{workLine(order)}</p>
        </div>
      ),
    },
    { key: "status", header: "Durum", render: statusCell },
    { key: "actions", header: "", align: "right", render: actionCell },
  ];

  const filters: ActiveFilter[] = [
    ...(labFilter ? [{ key: "lab", label: labFilter, onRemove: () => setLabFilter("") }] : []),
    ...(doctorFilter ? [{ key: "doctor", label: doctorFilterName || "Hekim", onRemove: () => { setDoctorFilter(""); setDoctorFilterName(""); } }] : []),
  ];

  const empty = TAB_EMPTY[tab];
  const filtered = Boolean(search.trim() || labFilter || doctorFilter);
  const isClosedTab = tab === "kapanan";
  const listLoading = isClosedTab ? closedLoading && !closedLoaded : !openLoaded && !openError;
  const listError = isClosedTab ? (closedLoaded ? null : closedError) : openError;
  const listStaleError = isClosedTab ? (closedLoaded ? closedError : null) : staleError;
  const closedCapped = isClosedTab && (closedOrders[closedKind]?.length || 0) >= CLOSED_LIMIT;

  return (
    <div className="mx-auto max-w-7xl space-y-3 pb-8">
      <PageHeader
        icon="flask"
        title="Laboratuvar"
        actions={canWriteLab ? <Button icon={Plus} onClick={openNew}>{LAB_LABELS.newOrder}</Button> : undefined}
      />

      <Tabs<TabKey>
        ariaLabel="Lab işi durumu"
        value={tab}
        onChange={setTab}
        items={[
          { key: "acik", label: "Açık işler" },
          { key: "gonderilmedi", label: "Gönderilecek", count: counts.notSent, countLabel: "gönderilecek iş" },
          { key: "laboratuvarda", label: "Laboratuvarda", count: counts.atLab, countTone: counts.late > 0 ? "critical" : "neutral", countLabel: "laboratuvardaki iş" },
          { key: "klinikte", label: "Klinikte", count: counts.clinic, countLabel: "klinikteki iş" },
          { key: "kapanan", label: "Kapanan" },
        ]}
      />

      {labsError && <LoadErrorState compact message={labsError} onRetry={() => setLabsReloadKey((value) => value + 1)} />}
      {/* Laboratuvar "Yeni lab işi" penceresinde eklenebildiği için uyarı yalnız
          ekleyemeyen kişiye çıkar (yöneticiden istemesi için). */}
      {canWriteLab && !canAddLab && !labsLoading && !labsError && labNames.length === 0 && (
        <Callout
          tone="warning"
          compact
          inline
          title="Tanımlı laboratuvar yok"
          action={<ManagerRequestButton label="Yöneticiden iste" taskTitle="Laboratuvar tanımlanmalı" taskDetails="Yeni lab işi açılamıyor: tanımlı laboratuvar yok." taskType="LAB" />}
        >
          Yöneticiniz ilk lab işini girerken laboratuvarı ekleyebilir.
        </Callout>
      )}
      {/* Tek satırlık şerit (K7): eylem telefonda da metnin yanında kalır. */}
      {tab === "acik" && counts.late > 0 && (
        <Callout
          tone="critical"
          compact
          inline
          action={<Button size="sm" variant="ghost" onClick={() => setTab("laboratuvarda")}>Gecikenleri göster</Button>}
        >
          <span className="font-semibold">{counts.late} iş</span> zamanında dönmedi.
        </Callout>
      )}

      <ListTable<Row>
        // Arama + süzgeçler listenin kartının üst şeridi (K1: ayrı kart değil).
        toolbar={(
          <>
            <Toolbar
              filterCount={filters.length}
              filters={(
                <>
                  <Select aria-label="Laboratuvar" value={labFilter} onChange={(event) => setLabFilter(event.target.value)} className="sm:w-56">
                    <option value="">Tüm laboratuvarlar</option>
                    {labOptions.map(([name, info]) => (
                      <option key={name} value={name}>
                        {name}{info.open ? ` — ${info.open} açık` : ""}{info.late ? `, ${info.late} gecikmiş` : ""}
                      </option>
                    ))}
                  </Select>
                  <DoctorSelect
                    value={doctorFilter}
                    onChange={(doctorId, doctor) => { setDoctorFilter(doctorId); setDoctorFilterName(doctor?.fullName || ""); }}
                    emptyLabel="Tüm hekimler"
                    aria-label="Hekim"
                    className="sm:w-52"
                  />
                </>
              )}
            >
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Hasta, telefon, hekim, laboratuvar veya iş türü ara"
                slashShortcut
                wrapperClassName="flex-1 min-w-[220px]"
              />
              {/* Kapanan sekmesinde hangi kapanış türü gösterilsin — telefonda da görünür kalır. */}
              {isClosedTab && (
                <ChoiceCards<ClosedKind>
                  label="Kapanan işler"
                  labelHidden
                  variant="pills"
                  value={closedKind}
                  onChange={setClosedKind}
                  options={[{ value: "done", label: "Hastaya takılan" }, { value: "cancelled", label: "İptal edilen" }]}
                />
              )}
            </Toolbar>
            <ActiveFilters filters={filters} onClearAll={() => { setLabFilter(""); setDoctorFilter(""); setDoctorFilterName(""); }} />
          </>
        )}
        header={closedCapped ? (
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Son {CLOSED_LIMIT} kayıt gösteriliyor. Daha eski bir işi hastanın dosyasındaki Laboratuvar bölümünden açabilirsiniz.
          </p>
        ) : undefined}
        columns={columns}
        rows={pageRows}
        rowKey={({ order }) => order.id}
        loading={listLoading}
        error={listError}
        staleError={listStaleError}
        onRetry={() => (isClosedTab ? void loadClosed(closedKind) : void loadOpen())}
        emptyText={filtered ? "Aramaya uyan iş yok" : empty.title}
        emptyDescription={filtered ? "Aramayı veya filtreleri değiştirin." : empty.description}
        emptyIcon={filtered ? undefined : LabEmptyIcon}
        emptyIllustrative={!filtered}
        emptyAction={!filtered && canWriteLab && (tab === "acik" || tab === "gonderilmedi") ? <Button icon={Plus} onClick={openNew}>{LAB_LABELS.newOrder}</Button> : undefined}
        onRowClick={({ order }) => setDetailOrderId(order.id)}
        getRowAriaLabel={({ order }) => `${order.patient.fullName} — ${order.labType} işinin ayrıntısını aç`}
        rowClassName={({ summary }) => (summary.stage === "late" ? "bg-red-50/40" : summary.stage === "cancelled" ? "opacity-75" : "")}
        // Telefon kartı: ad + rozet, iş, ve "sıradaki adım · tarih" ile aynı
        // satırda tek eylem — eylem ayrı bir sıra oluşturmaz (K9).
        mobileCard={(row) => {
          const action = actionCell(row);
          const line = stageLine(row.summary, "min-w-0 flex-1");
          return (
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.order.patient.fullName}</p>
                  <p className="truncate text-xs text-slate-500">{row.order.labType} · {row.order.labName}</p>
                </div>
                <LabStatusBadge stage={row.summary.stage} />
              </div>
              {(line || action) && (
                <div className={`flex items-center justify-between gap-2 ${action ? "min-h-9" : ""}`}>
                  {line || <span />}
                  {action && <div className="shrink-0">{action}</div>}
                </div>
              )}
            </div>
          );
        }}
        pager={tabRows.length > PAGE_SIZE ? { page: Math.min(page, pageCount), pageCount, pageSize: PAGE_SIZE, total: tabRows.length, onPageChange: setPage } : undefined}
      />

      <LabOrderDetailModal
        order={detailOrder}
        onClose={() => { setDetailOrderId(null); setLinkedOrder(null); }}
        actions={actions}
        canWrite={canWriteLab}
        canComplete={canCompleteLab}
        canCancel={canCancelLab}
      />

      {actions.modals}

      <LabNewOrderModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(order) => {
          replaceOrder(order);
          setTab(getOrderSummary(order).stage === "new" ? "gonderilmedi" : "acik");
        }}
        initialPatient={newPatient}
        initialLabName={newLabName}
        labNames={labNames}
        labsLoading={labsLoading}
        labsError={labsError}
        onRetryLabs={() => setLabsReloadKey((value) => value + 1)}
        canAddLab={canAddLab}
        onLabCreated={(name) => setLabNames((current) => Array.from(new Set([...current, name])).sort((a, b) => a.localeCompare(b, "tr")))}
      />
    </div>
  );
}
