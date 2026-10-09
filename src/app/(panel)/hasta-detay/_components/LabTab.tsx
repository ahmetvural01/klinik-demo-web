"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { LabOrderDetailPanel, type SharedLabOrder } from "@/components/lab/LabOrderDetailPanel";
import { LabStatusBadge } from "@/components/lab/LabStatusBadge";
import { useLabOrderActions } from "@/components/lab/useLabOrderActions";
import { normalizeLabOrder, type LabOrderView } from "@/components/lab/lab-order-model";
import { getOrderSummary, LAB_LABELS, stageDetail, teethList, type LabOrderSummary } from "@/lib/lab-workflow";
import { usePatientFile } from "./PatientFileContext";
import { money } from "./patient-file-shared";

type Row = { order: LabOrderView; summary: LabOrderSummary };

/**
 * Hastanın laboratuvar işleri. Laboratuvar sayfasıyla aynı durum adları, aynı
 * iş ekranı ve aynı eylem pencereleri kullanılır (bkz. src/components/lab):
 * bir işi burada "Laboratuvardan geldi" yapmak ile Laboratuvar sayfasında
 * yapmak aynı şeydir.
 */
export function LabTab({ labNames }: { labNames: string[] }) {
  const { data, reload, can, openLabCreate, hidePatientPhone } = usePatientFile();
  const canWrite = can("lab:write");
  const canComplete = can("lab:complete");
  const canCancel = can("lab:delete");
  const [detailId, setDetailId] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => data.labOrders
    .map((raw) => normalizeLabOrder({
      ...raw,
      patient: { id: data.id, fullName: data.fullName, phone: hidePatientPhone ? "***" : data.phone },
    }))
    .filter((order): order is LabOrderView => Boolean(order))
    .map((order) => ({ order, summary: getOrderSummary(order) }))
    .sort((a, b) => {
      const openDiff = Number(!b.summary.isDone && !b.summary.cancelled) - Number(!a.summary.isDone && !a.summary.cancelled);
      return openDiff || new Date(b.order.createdAt || 0).getTime() - new Date(a.order.createdAt || 0).getTime();
    }), [data.labOrders, data.id, data.fullName, data.phone, hidePatientPhone]);

  // Eylem kaydedilince iş sunucudan taze okunur; hasta dosyası da yenilenir.
  const actions = useLabOrderActions({ onChanged: () => { void reload(true); }, labNames });

  const detail = detailId ? rows.find((row) => row.order.id === detailId)?.order || null : null;
  const findOrder = (order: SharedLabOrder) => rows.find((row) => row.order.id === order.id)?.order || null;
  const withOrder = (fn: (order: LabOrderView) => void) => (order: SharedLabOrder) => {
    const found = findOrder(order);
    if (found) fn(found);
  };

  // Satırdaki tek eylem: işin sıradaki adımı (Laboratuvar sayfasıyla aynı kural).
  const rowAction = ({ order, summary }: Row): { label: string; run: () => void } | null => {
    if (summary.stage === "new") return canWrite ? { label: LAB_LABELS.send, run: () => actions.openSend(order) } : null;
    if (summary.stage === "atLab" || summary.stage === "late") {
      return canWrite && summary.pendingTrip ? { label: LAB_LABELS.receive, run: () => actions.openReceive(order) } : null;
    }
    if (summary.stage === "clinic") {
      const finished = summary.templateFinished || !summary.nextStep;
      if (finished && canComplete) return { label: LAB_LABELS.complete, run: () => actions.openComplete(order) };
      if (canWrite) return { label: LAB_LABELS.send, run: () => actions.openSend(order) };
      if (canComplete) return { label: LAB_LABELS.complete, run: () => actions.openComplete(order) };
    }
    return null;
  };

  const actionButton = (row: Row) => {
    const action = rowAction(row);
    return action ? <Button size="sm" variant="secondary" disabled={actions.busy} onClick={action.run}>{action.label}</Button> : null;
  };

  const workCell = ({ order }: Row) => {
    const teeth = teethList(order.teeth);
    return (
      <div className="min-w-0">
        <p className="font-semibold text-slate-800">{order.labType}</p>
        <p className="text-xs text-slate-500">{[teeth.length ? `Diş ${teeth.join(", ")}` : "", order.doctor.fullName].filter(Boolean).join(" · ")}</p>
      </div>
    );
  };

  const statusCell = ({ summary }: Row) => (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1">
        <LabStatusBadge stage={summary.stage} />
        {summary.rework && <Badge tone="neutral">Yeniden yapım</Badge>}
      </div>
      <p className={`text-xs ${summary.stage === "late" ? "font-semibold text-red-700" : "text-slate-500"}`}>{stageDetail(summary)}</p>
    </div>
  );

  const columns: ListTableColumn<Row>[] = [
    { key: "work", header: "İş", render: workCell },
    { key: "lab", header: "Laboratuvar", render: ({ order }) => order.labName || <EmptyValue /> },
    { key: "status", header: "Durum", render: statusCell },
    { key: "date", header: "Açılış", render: ({ order }) => (order.createdAt ? <span className="whitespace-nowrap">{formatDateText(order.createdAt)}</span> : <EmptyValue />) },
    { key: "cost", header: "Lab ücreti", align: "right", render: ({ summary }) => (summary.totalAmount > 0 ? <span className="tabular-nums">{money(summary.totalAmount)}</span> : <EmptyValue />) },
    ...(canWrite || canComplete ? [{ key: "actions", header: "", align: "right" as const, render: actionButton }] : []),
  ];

  const openCount = rows.filter((row) => !row.summary.isDone && !row.summary.cancelled).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {rows.length === 0 ? "Bu hasta için laboratuvar işi yok." : `${openCount} açık iş${rows.length > openCount ? ` · ${rows.length - openCount} kapanmış` : ""}. İşe tıklayınca adımları ve faturası açılır.`}
        </p>
        {canWrite && <Button variant="secondary" icon={Plus} onClick={openLabCreate}>{LAB_LABELS.newOrder}</Button>}
      </div>

      <ListTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.order.id}
        onRowClick={(row) => setDetailId(row.order.id)}
        getRowAriaLabel={(row) => `${row.order.labType} lab işinin ayrıntısı`}
        rowClassName={(row) => (row.summary.cancelled || row.summary.isDone ? "opacity-75" : "")}
        emptyIcon={FlaskConical}
        emptyText="Laboratuvar işi yok"
        emptyDescription={canWrite ? "Kron, protez, plak gibi işleri buradan laboratuvara gönderin ve takip edin." : undefined}
        emptyAction={canWrite ? <Button size="sm" variant="secondary" icon={Plus} onClick={openLabCreate}>{LAB_LABELS.newOrder}</Button> : undefined}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              {workCell(row)}
              <LabStatusBadge stage={row.summary.stage} />
            </div>
            <p className={`text-xs ${row.summary.stage === "late" ? "font-semibold text-red-700" : "text-slate-500"}`}>{[row.order.labName, stageDetail(row.summary)].filter(Boolean).join(" · ")}</p>
            {rowAction(row) && <div>{actionButton(row)}</div>}
          </div>
        )}
      />

      {/* İş ayrıntısı — bir eylem penceresi açıkken gizlenir; aynı anda tek pencere. */}
      <Modal
        open={Boolean(detail) && !actions.isOpen}
        onClose={() => setDetailId(null)}
        title={detail ? detail.labType : "Lab işi"}
        description={detail ? `${data.fullName} · ${detail.labName}` : undefined}
        size="lg"
        module="flask"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={() => setDetailId(null)}>Kapat</Button>}
      >
        {detail && (
          <LabOrderDetailPanel
            order={detail}
            canWrite={canWrite}
            canComplete={canComplete}
            showPatientLink={false}
            onAddTrip={withOrder(actions.openSend)}
            onReceive={(order, trip) => { const found = findOrder(order); if (found) actions.openReceive(found, found.trips.find((item) => item.id === trip.id)); }}
            onEditTrip={(order, trip) => { const found = findOrder(order); const target = found?.trips.find((item) => item.id === trip.id); if (found && target) actions.openEditTrip(found, target); }}
            onAddInvoice={withOrder((order) => actions.openInvoice(order, null))}
            onEditInvoice={(order, invoice) => { const found = findOrder(order); const target = found?.invoices.find((item) => item.id === invoice.id); if (found && target) actions.openInvoice(found, target); }}
            onDeleteInvoice={(order, invoice) => { const found = findOrder(order); const target = found?.invoices.find((item) => item.id === invoice.id); if (found && target) void actions.cancelInvoice(found, target); }}
            onComplete={canComplete ? withOrder(actions.openComplete) : undefined}
            onRpt={withOrder(actions.openRework)}
            onEditOrder={withOrder(actions.openEditOrder)}
            onCancel={canCancel ? withOrder(actions.openCancel) : undefined}
          />
        )}
      </Modal>

      {actions.modals}
    </div>
  );
}
