"use client";

import { Modal } from "@/components/ui/Modal";
import { LabOrderDetailPanel } from "@/components/lab/LabOrderDetailPanel";
import type { LabOrderActions } from "@/components/lab/useLabOrderActions";
import type { LabOrderView } from "@/components/lab/lab-order-model";

/**
 * Lab işi ayrıntı penceresi — ayrıntı paneli ile eylem pencerelerinin
 * (useLabOrderActions) bağlantısı TEK yerde. Önceden Laboratuvar sayfası ve
 * hasta dosyası 13 geri çağırmayı ayrı ayrı bağlıyordu; pencere başlığı ve
 * yetki kuralları ekrandan ekrana farklıydı. Bir eylem penceresi açıkken bu
 * pencere gizlenir (aynı anda tek pencere); kapatma "×" ya da Esc ile.
 */
export function LabOrderDetailModal({
  order,
  onClose,
  actions,
  canWrite,
  canComplete,
  canCancel,
  showPatientLink = true,
}: {
  order: LabOrderView | null;
  onClose: () => void;
  actions: LabOrderActions;
  canWrite: boolean;
  canComplete: boolean;
  canCancel: boolean;
  /** Hasta dosyası içinde açıldığında hasta bağlantısı gösterilmez. */
  showPatientLink?: boolean;
}) {
  const tripOf = (tripId: string) => order?.trips.find((trip) => trip.id === tripId);
  const invoiceOf = (invoiceId: string) => order?.invoices.find((invoice) => invoice.id === invoiceId);

  return (
    <Modal
      open={Boolean(order) && !actions.isOpen}
      onClose={onClose}
      title={order ? order.labType : "Lab işi"}
      size="lg"
      module="flask"
      trackFormChanges={false}
    >
      {order && (
        <LabOrderDetailPanel
          order={order}
          canWrite={canWrite}
          canComplete={canComplete}
          showPatientLink={showPatientLink}
          onAddTrip={() => actions.openSend(order)}
          onReceive={(_, trip) => actions.openReceive(order, tripOf(trip.id))}
          onEditTrip={(_, trip) => { const target = tripOf(trip.id); if (target) actions.openEditTrip(order, target); }}
          onAddInvoice={() => actions.openInvoice(order, null)}
          onEditInvoice={(_, invoice) => { const target = invoiceOf(invoice.id); if (target) actions.openInvoice(order, target); }}
          onDeleteInvoice={(_, invoice) => { const target = invoiceOf(invoice.id); if (target) void actions.cancelInvoice(order, target); }}
          onComplete={canComplete ? () => actions.openComplete(order) : undefined}
          onRpt={canComplete ? () => actions.openRework(order) : undefined}
          onEditOrder={() => actions.openEditOrder(order)}
          onCancel={canCancel ? () => actions.openCancel(order) : undefined}
        />
      )}
    </Modal>
  );
}
