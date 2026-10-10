"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { LabOrderDetailModal } from "@/components/lab/LabOrderDetailModal";
import { LabStatusBadge } from "@/components/lab/LabStatusBadge";
import { getLabRowAction } from "@/components/lab/lab-row-action";
import { useLabOrderActions } from "@/components/lab/useLabOrderActions";
import { normalizeLabOrder, type LabOrderView } from "@/components/lab/lab-order-model";
import { getOrderSummary, LAB_LABELS, stageDetail, teethList, type LabOrderSummary } from "@/lib/lab-workflow";
import { usePatientFile } from "./PatientFileContext";

type Row = { order: LabOrderView; summary: LabOrderSummary };

/**
 * Hastanın laboratuvar işleri. Laboratuvar sayfasıyla aynı durum adları, aynı
 * iş ekranı ve aynı eylem pencereleri kullanılır (bkz. src/components/lab):
 * bir işi burada "Laboratuvardan geldi" yapmak ile Laboratuvar sayfasında
 * yapmak aynı şeydir. Lab ücreti (kliniğin gideri) listede değil, işin
 * ayrıntısındaki fatura bölümündedir: hasta yanındayken "hastanın ödeyeceği
 * tutar" gibi okunuyordu.
 */
export function LabTab() {
  const { data, reload, can, openLabCreate, hidePatientPhone, labNames, loadLabNames } = usePatientFile();
  const canWrite = can("lab:write");
  const canComplete = can("lab:complete");
  const canCancel = can("lab:delete");
  const [detailId, setDetailId] = useState<string | null>(null);

  // Laboratuvar adları yalnız bu sekme açılınca okunur (işi başka laboratuvara göndermek için).
  useEffect(() => { loadLabNames(); }, [loadLabNames]);

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

  // Satırdaki tek eylem: işin sıradaki adımı — Laboratuvar sayfasıyla AYNI
  // kural (components/lab/lab-row-action) ve aynı tek tık kaydı (gönder /
  // geldi). Önceden kural burada kopyaydı: son adımı gelmiş işte "Hastaya
  // takıldı" yetkisi olmayan kullanıcıya yanlışlıkla "Laboratuvara gönder"
  // öneriliyordu; artık Lab sayfasındaki gibi "Hekim takacak" yazar.
  const runRowAction = ({ order }: Row, kind: string) => {
    if (kind === "send") actions.quickSend(order);
    else if (kind === "receive") actions.quickReceive(order);
    else if (kind === "complete") actions.openComplete(order);
  };

  const actionButton = (row: Row) => {
    const action = getLabRowAction(row.summary, { canWrite, canComplete });
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
    ...(canWrite || canComplete ? [{ key: "actions", header: "", align: "right" as const, render: actionButton }] : []),
  ];

  return (
    <div className="space-y-4">
      <ListTable
        title="Laboratuvar işleri"
        actions={canWrite ? <Button size="sm" variant="secondary" icon={Plus} onClick={openLabCreate}>{LAB_LABELS.newOrder}</Button> : undefined}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.order.id}
        onRowClick={(row) => setDetailId(row.order.id)}
        getRowAriaLabel={(row) => `${row.order.labType} lab işinin ayrıntısı`}
        rowClassName={(row) => (row.summary.cancelled || row.summary.isDone ? "opacity-75" : "")}
        emptyIcon={FlaskConical}
        emptyText="Laboratuvar işi yok"
        emptyDescription={canWrite ? "Kron, protez, plak gibi işleri buradan laboratuvara gönderin ve takip edin." : undefined}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              {workCell(row)}
              <LabStatusBadge stage={row.summary.stage} />
            </div>
            <p className={`text-xs ${row.summary.stage === "late" ? "font-semibold text-red-700" : "text-slate-500"}`}>{[row.order.labName, stageDetail(row.summary)].filter(Boolean).join(" · ")}</p>
            {actionButton(row) && <div>{actionButton(row)}</div>}
          </div>
        )}
      />

      {/* İş ayrıntısı — Laboratuvar sayfasıyla aynı pencere ve aynı yetki
          kuralları; bir eylem penceresi açıkken gizlenir (aynı anda tek pencere). */}
      <LabOrderDetailModal
        order={detail}
        onClose={() => setDetailId(null)}
        actions={actions}
        canWrite={canWrite}
        canComplete={canComplete}
        canCancel={canCancel}
        showPatientLink={false}
      />

      {actions.modals}
    </div>
  );
}
