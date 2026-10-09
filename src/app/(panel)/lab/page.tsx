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
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { LabOrderDetailPanel, type SharedLabOrder } from "@/components/lab/LabOrderDetailPanel";
import { LabNewOrderModal } from "@/components/lab/LabNewOrderModal";
import { LabStatusBadge } from "@/components/lab/LabStatusBadge";
import { useLabOrderActions } from "@/components/lab/useLabOrderActions";
import { fetchJson, normalizeLabOrders, type LabOrderView, type LabTripView } from "@/components/lab/lab-order-model";
import { formatPhoneNumber } from "@/lib/format";
import {
  LAB_LABELS,
  expectedReturnAt,
  getOrderSummary,
  stageDetail,
  summarizeLabOrders,
  teethList,
  type LabOrderSummary,
} from "@/lib/lab-workflow";

const LabEmptyIcon = createSceneIllustration("lab");

const TAB_KEYS = ["acik", "gonderilmedi", "laboratuvarda", "klinikte", "tamamlandi", "iptal"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_EMPTY: Record<TabKey, { title: string; description: string }> = {
  acik: { title: "Açık lab işi yok", description: "Laboratuvara gönderilen her iş hastaya takılana kadar burada görünür." },
  gonderilmedi: { title: "Gönderilmeyi bekleyen iş yok", description: "Açılıp henüz laboratuvara gönderilmemiş işler burada görünür." },
  laboratuvarda: { title: "Laboratuvarda iş yok", description: "Laboratuvara gönderilen ve dönüşü beklenen işler burada görünür." },
  klinikte: { title: "Klinikte bekleyen iş yok", description: "Laboratuvardan gelen, prova veya takma bekleyen işler burada görünür." },
  tamamlandi: { title: "Tamamlanan iş yok", description: "Hastaya takılan işler burada görünür." },
  iptal: { title: "İptal edilen iş yok", description: "İptal edilen işler nedeniyle birlikte burada görünür." },
};

const PAGE_SIZE = 25;
/** Tamamlanan / iptal edilen işlerden ekrana getirilen en yeni kayıt sayısı. */
const CLOSED_LIMIT = 300;

type ViewSummary = ReturnType<typeof getOrderSummary<LabTripView>>;
type Row = { order: LabOrderView; summary: ViewSummary };

function matchesTab(tab: TabKey, summary: ViewSummary) {
  switch (tab) {
    case "acik": return summary.stage !== "done" && summary.stage !== "cancelled";
    case "gonderilmedi": return summary.stage === "new";
    case "laboratuvarda": return summary.stage === "atLab" || summary.stage === "late";
    case "klinikte": return summary.stage === "clinic";
    case "tamamlandi": return summary.stage === "done";
    case "iptal": return summary.stage === "cancelled";
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

export default function LabPage() {
  const { can } = usePermissions();
  const canWriteLab = can("lab:write");
  const canCompleteLab = can("lab:complete");
  const canCancelLab = can("lab:delete");
  const canAddLab = can("finance:write");
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<LabOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closedCapped, setClosedCapped] = useState(false);
  const loadSequenceRef = useRef(0);
  const [labNames, setLabNames] = useState<string[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [labsError, setLabsError] = useState("");
  const [labsReloadKey, setLabsReloadKey] = useState(0);

  const [tab, setTab] = useTabParam(TAB_KEYS, "acik");
  const [search, setSearch] = useState("");
  const [labFilter, setLabFilter] = useState(() => searchParams.get("labName") || "");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [doctorFilterName, setDoctorFilterName] = useState("");
  const [page, setPage] = useState(1);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newPatient, setNewPatient] = useState<PickedPatient | null>(null);
  const [newLabName, setNewLabName] = useState("");
  const deepLinkHandledRef = useRef(false);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoadError(null);
    setLoading(true);
    try {
      // Açık işlerin hepsi; biten ve iptal edilenlerden en yenileri. Önceden tek
      // istekte en yeni 300 iş geliyordu; eski ama hâlâ açık iş listeden düşebiliyordu.
      const [openPayload, donePayload, cancelledPayload] = await Promise.all([
        fetchJson("/api/lab-orders?status=DEVAM_EDIYOR&limit=2000", undefined, "Laboratuvar işleri yüklenemedi."),
        fetchJson(`/api/lab-orders?status=HASTAYA_TAKILDI&limit=${CLOSED_LIMIT}`, undefined, "Laboratuvar işleri yüklenemedi."),
        fetchJson(`/api/lab-orders?status=IPTAL&limit=${CLOSED_LIMIT}`, undefined, "Laboratuvar işleri yüklenemedi."),
      ]);
      if (sequence !== loadSequenceRef.current) return;
      const done = normalizeLabOrders(donePayload);
      const cancelled = normalizeLabOrders(cancelledPayload);
      setClosedCapped(done.length >= CLOSED_LIMIT || cancelled.length >= CLOSED_LIMIT);
      setOrders([...normalizeLabOrders(openPayload), ...done, ...cancelled]);
    } catch (error) {
      if (sequence === loadSequenceRef.current) setLoadError(error instanceof Error ? error.message : "Laboratuvar işleri yüklenemedi.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, []);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => { void load(); }, [load]);

  // Laboratuvar listesi: "Satın Alma" ekranında Laboratuvar türündeki firmalar.
  // lab:read yetkisiyle okunur (önceden firma ekranının yetkisi gerekiyordu).
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

  // Başka bir personel iş ekleyip güncellediğinde ve sekmeye dönülünce listeyi tazele.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void loadRef.current(); }, 150);
    };
    window.addEventListener("ks:realtime-sync", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const replaceOrder = useCallback((next: LabOrderView) => {
    loadSequenceRef.current += 1;
    setLoading(false);
    setOrders((current) => (current.some((order) => order.id === next.id)
      ? current.map((order) => (order.id === next.id ? next : order))
      : [next, ...current]));
  }, []);

  const actions = useLabOrderActions({ onChanged: replaceOrder, labNames });

  // Derin bağlantılar: ?yeni=1 (üst bardaki "Yeni" menüsü), ?new=1&patientId=…
  // (hasta dosyası, firma ekranı), ?orderId=… (bildirim/hasta dosyası).
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const wantsNew = searchParams.get("yeni") === "1" || searchParams.get("new") === "1";
    const orderId = searchParams.get("orderId");
    if (!wantsNew && !orderId) return;
    deepLinkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    ["yeni", "new", "patientId", "patientName", "orderId"].forEach((key) => params.delete(key));
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);

    if (orderId) setDetailOrderId(orderId);
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

  const rows = useMemo<Row[]>(() => orders.map((order) => ({ order, summary: getOrderSummary(order) })), [orders]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter(({ order }) => {
      if (labFilter && order.labName !== labFilter) return false;
      if (doctorFilter && order.doctor.id !== doctorFilter) return false;
      if (!query) return true;
      return [order.patient.fullName, order.labName, order.labType, order.doctor.fullName, order.patient.phone || "", order.teeth || ""]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [doctorFilter, labFilter, rows, search]);

  const counts = useMemo(() => summarizeLabOrders(filteredRows.map((row) => row.order)), [filteredRows]);

  const tabRows = useMemo(() => filteredRows
    .filter((row) => matchesTab(tab, row.summary))
    .sort((a, b) => {
      const [ga, va] = urgency(a);
      const [gb, vb] = urgency(b);
      return ga - gb || va - vb;
    }), [filteredRows, tab]);

  useEffect(() => { setPage(1); }, [tab, search, labFilter, doctorFilter]);
  const pageCount = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));
  const pageRows = tabRows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  const labOptions = useMemo(() => {
    const map = new Map<string, { open: number; late: number }>();
    for (const name of labNames) map.set(name, { open: 0, late: 0 });
    for (const { order, summary } of rows) {
      const entry = map.get(order.labName) || { open: 0, late: 0 };
      if (summary.stage !== "done" && summary.stage !== "cancelled") entry.open += 1;
      if (summary.stage === "late") entry.late += 1;
      map.set(order.labName, entry);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [labNames, rows]);

  const detailOrder = detailOrderId ? orders.find((order) => order.id === detailOrderId) || null : null;
  const findOrder = (order: SharedLabOrder) => orders.find((item) => item.id === order.id) || null;
  const withOrder = (fn: (order: LabOrderView) => void) => (order: SharedLabOrder) => {
    const found = findOrder(order);
    if (found) fn(found);
  };

  const openNew = () => {
    setNewPatient(null);
    setNewLabName(labFilter);
    setNewOpen(true);
  };

  // Satırdaki tek eylem: işin sıradaki adımı.
  const rowAction = ({ order, summary }: Row): { label: string; run: () => void } | null => {
    if (summary.stage === "new") return canWriteLab ? { label: LAB_LABELS.send, run: () => actions.openSend(order) } : null;
    if (summary.stage === "atLab" || summary.stage === "late") {
      return canWriteLab && summary.pendingTrip ? { label: LAB_LABELS.receive, run: () => actions.openReceive(order, summary.pendingTrip || undefined) } : null;
    }
    if (summary.stage === "clinic") {
      const finished = summary.templateFinished || !summary.nextStep;
      if (finished && canCompleteLab) return { label: LAB_LABELS.complete, run: () => actions.openComplete(order) };
      if (canWriteLab) return { label: LAB_LABELS.send, run: () => actions.openSend(order) };
      if (canCompleteLab) return { label: LAB_LABELS.complete, run: () => actions.openComplete(order) };
    }
    return null;
  };

  const stageLine = (summary: LabOrderSummary) => (
    <span className={summary.stage === "late" ? "font-semibold text-red-700" : "text-slate-600"}>{stageDetail(summary)}</span>
  );

  const workLine = (order: LabOrderView) => {
    const teeth = teethList(order.teeth);
    return [teeth.length ? `Diş ${teeth.join(", ")}` : "", order.labName, order.doctor.fullName].filter(Boolean).join(" · ");
  };

  const statusCell = ({ summary }: Row) => (
    <div className="flex flex-wrap items-center gap-1">
      <LabStatusBadge stage={summary.stage} />
      {summary.rework && <Badge tone="neutral" size="sm">Yeniden yapım</Badge>}
    </div>
  );

  const actionButton = (row: Row) => {
    const action = rowAction(row);
    if (!action) return null;
    return <Button size="sm" variant="secondary" onClick={action.run}>{action.label}</Button>;
  };

  const columns: ListTableColumn<Row>[] = [
    {
      key: "patient",
      header: "Hasta",
      render: ({ order }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{order.patient.fullName}</p>
          {order.patient.phone && order.patient.phone !== "***" && <p className="text-xs tabular-nums text-slate-500">{formatPhoneNumber(order.patient.phone)}</p>}
        </div>
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
    { key: "now", header: "Şu an", render: ({ summary }) => <p className="max-w-[320px] text-sm">{stageLine(summary)}</p> },
    { key: "status", header: "Durum", render: statusCell },
    { key: "actions", header: "", align: "right", render: actionButton },
  ];

  const filters: ActiveFilter[] = [
    ...(labFilter ? [{ key: "lab", label: labFilter, onRemove: () => setLabFilter("") }] : []),
    ...(doctorFilter ? [{ key: "doctor", label: doctorFilterName || "Hekim", onRemove: () => { setDoctorFilter(""); setDoctorFilterName(""); } }] : []),
  ];

  const empty = TAB_EMPTY[tab];
  const filtered = Boolean(search || labFilter || doctorFilter);

  return (
    <div className="mx-auto max-w-7xl space-y-3 pb-8">
      <PageHeader
        icon="flask"
        title="Laboratuvar"
        description="Laboratuvara giden işler: ne gönderildi, ne zaman dönecek, sıradaki adım ne."
        actions={canWriteLab ? <Button icon={Plus} onClick={openNew}>{LAB_LABELS.newOrder}</Button> : undefined}
      />

      {labsError && <LoadErrorState compact message={labsError} onRetry={() => setLabsReloadKey((value) => value + 1)} />}
      {canWriteLab && !labsLoading && !labsError && labNames.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            Henüz tanımlı laboratuvar yok. {canAddLab
              ? "“Yeni lab işi” penceresinde laboratuvarı ekleyebilir ya da “Satın Alma” ekranında Laboratuvar türünde firma tanımlayabilirsiniz."
              : "Yöneticiniz “Satın Alma” ekranında Laboratuvar türünde firma tanımlamalı."}
          </span>
          {can("finance:read") && <Button href="/firma" variant="secondary" size="sm">{"Satın Alma'ya git"}</Button>}
        </div>
      )}

      <Tabs<TabKey>
        ariaLabel="Lab işi durumu"
        value={tab}
        onChange={setTab}
        items={[
          { key: "acik", label: "Açık işler", count: counts.open },
          { key: "gonderilmedi", label: "Gönderilmedi", count: counts.notSent },
          { key: "laboratuvarda", label: "Laboratuvarda", count: counts.atLab, countTone: counts.late > 0 ? "critical" : "neutral" },
          { key: "klinikte", label: "Klinikte", count: counts.clinic },
          { key: "tamamlandi", label: "Tamamlandı" },
          { key: "iptal", label: "İptal edildi" },
        ]}
      />

      <div className="ui-surface overflow-hidden">
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Hasta, telefon, hekim, laboratuvar veya iş türü ara"
            slashShortcut
            wrapperClassName="flex-1 min-w-[220px]"
          />
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
        </Toolbar>
        {filters.length > 0 && (
          <div className="border-t border-slate-100 px-3 py-2">
            <ActiveFilters filters={filters} onClearAll={() => { setLabFilter(""); setDoctorFilter(""); setDoctorFilterName(""); }} />
          </div>
        )}
      </div>

      {counts.late > 0 && tab !== "laboratuvarda" && tab !== "tamamlandi" && tab !== "iptal" && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-red-700">
          <span className="font-semibold">{counts.late} iş laboratuvardan zamanında dönmedi.</span>
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setTab("laboratuvarda")}>Laboratuvarda sekmesini aç</button>
        </p>
      )}

      {closedCapped && (tab === "tamamlandi" || tab === "iptal") && (
        <p className="text-xs text-slate-500">Son {CLOSED_LIMIT} kayıt gösteriliyor. Daha eski bir işi hastanın dosyasındaki Laboratuvar bölümünden açabilirsiniz.</p>
      )}

      <ListTable<Row>
        columns={columns}
        rows={pageRows}
        rowKey={({ order }) => order.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        emptyText={filtered ? "Aramaya uyan iş yok" : empty.title}
        emptyDescription={filtered ? "Aramayı veya filtreleri değiştirin." : empty.description}
        emptyIcon={filtered ? undefined : LabEmptyIcon}
        emptyIllustrative={!filtered}
        emptyAction={!filtered && canWriteLab && (tab === "acik" || tab === "gonderilmedi") ? <Button icon={Plus} onClick={openNew}>{LAB_LABELS.newOrder}</Button> : undefined}
        onRowClick={({ order }) => setDetailOrderId(order.id)}
        getRowAriaLabel={({ order }) => `${order.patient.fullName} — ${order.labType} işinin ayrıntısını aç`}
        rowClassName={({ summary }) => (summary.stage === "late" ? "bg-red-50/40" : "")}
        mobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{row.order.patient.fullName}</p>
                <p className="truncate text-xs text-slate-500">{row.order.labType} · {row.order.labName}</p>
              </div>
              <LabStatusBadge stage={row.summary.stage} />
            </div>
            <p className="text-xs">{stageLine(row.summary)}</p>
            {rowAction(row) && <div className="pt-0.5">{actionButton(row)}</div>}
          </div>
        )}
        pager={tabRows.length > PAGE_SIZE ? { page: Math.min(page, pageCount), pageCount, pageSize: PAGE_SIZE, total: tabRows.length, onPageChange: setPage } : undefined}
      />

      {/* İş ayrıntısı — bir eylem penceresi açıkken gizlenir; aynı anda tek pencere. */}
      <Modal
        open={Boolean(detailOrder) && !actions.isOpen}
        onClose={() => setDetailOrderId(null)}
        title={detailOrder ? detailOrder.labType : "Lab işi"}
        size="lg"
        module="flask"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={() => setDetailOrderId(null)}>Kapat</Button>}
      >
        {detailOrder && (
          <LabOrderDetailPanel
            order={detailOrder}
            canWrite={canWriteLab}
            canComplete={canCompleteLab}
            onAddTrip={withOrder(actions.openSend)}
            onReceive={(order, trip) => { const found = findOrder(order); if (found) actions.openReceive(found, found.trips.find((item) => item.id === trip.id)); }}
            onEditTrip={(order, trip) => { const found = findOrder(order); const target = found?.trips.find((item) => item.id === trip.id); if (found && target) actions.openEditTrip(found, target); }}
            onAddInvoice={withOrder((order) => actions.openInvoice(order, null))}
            onEditInvoice={(order, invoice) => { const found = findOrder(order); const target = found?.invoices.find((item) => item.id === invoice.id); if (found && target) actions.openInvoice(found, target); }}
            onDeleteInvoice={(order, invoice) => { const found = findOrder(order); const target = found?.invoices.find((item) => item.id === invoice.id); if (found && target) void actions.cancelInvoice(found, target); }}
            onComplete={canCompleteLab ? withOrder(actions.openComplete) : undefined}
            onRpt={withOrder(actions.openRework)}
            onEditOrder={withOrder(actions.openEditOrder)}
            onCancel={canCancelLab ? withOrder(actions.openCancel) : undefined}
          />
        )}
      </Modal>

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
        canAddLab={canAddLab}
        onLabCreated={(name) => setLabNames((current) => Array.from(new Set([...current, name])).sort((a, b) => a.localeCompare(b, "tr")))}
      />
    </div>
  );
}
