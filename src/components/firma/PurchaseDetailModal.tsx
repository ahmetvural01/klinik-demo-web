"use client";

import { Ban, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { DateText, Money, formatDateText } from "@/components/ui/Money";
import { formatCurrency } from "@/lib/format";
import { paymentMethodLabel } from "@/components/firma/FirmaPaymentModal";
import {
  PAYMENT_STATUS_META,
  RECEIPT_STATUS_META,
  type Purchase,
  type PurchaseItemRow,
} from "@/components/firma/purchase-model";

type PurchaseDetailModalProps = {
  open: boolean;
  purchase: Purchase | null;
  loading: boolean;
  error: string | null;
  /** İptal edilemedi gibi işlem hataları — pencerede kalıcı görünür (kısa bildirimde kaybolmaz). */
  actionError: string | null;
  canWrite: boolean;
  cancelling?: boolean;
  onRetry: () => void;
  onClose: () => void;
  onEdit: (purchase: Purchase) => void;
  onReceive: (purchase: Purchase) => void;
  onPay: (purchase: Purchase) => void;
  onCancel: (purchase: Purchase) => void;
};

/**
 * Satın alma / sipariş ayrıntısı. Altta TEK birincil eylem (Teslim al ya da
 * Ödeme yap); Düzenle ve İptal "Diğer" menüsünde. Kalem tablosu pencereye
 * sığar (önceden "Tutar" sütunu kesiliyordu). İptal edilemeyen kayıtta neden
 * pencerede yazılı kalır.
 */
export function PurchaseDetailModal({
  open, purchase, loading, error, actionError, canWrite, cancelling = false,
  onRetry, onClose, onEdit, onReceive, onPay, onCancel,
}: PurchaseDetailModalProps) {
  const active = purchase?.status === "AKTIF";
  const delivered = purchase?.receiptStatus === "TESLIM_ALINDI";
  const remaining = purchase?.paymentSummary?.remaining ?? 0;
  const kind = delivered || !purchase ? "Satın alma" : "Sipariş";

  const itemColumns: ListTableColumn<PurchaseItemRow>[] = [
    {
      key: "urun",
      header: "Ürün",
      render: (item) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">
            {item.productName}
            {item.consumed && <Badge tone="neutral" className="ml-1.5 align-[1px]">Kullanıldı</Badge>}
          </p>
          {(item.lotNo || item.expiresAt) && (
            <p className="text-xs text-slate-500">
              {item.lotNo ? `Lot ${item.lotNo}` : "Lot yok"}{item.expiresAt ? ` · SKT ${formatDateText(item.expiresAt)}` : ""}
            </p>
          )}
        </div>
      ),
    },
    { key: "miktar", header: "Miktar", align: "right", render: (item) => <span className="whitespace-nowrap tabular-nums">{item.quantity} {item.unit}</span> },
    {
      key: "tutar",
      header: "Tutar",
      align: "right",
      render: (item) => (
        <div className="whitespace-nowrap">
          <Money value={Number(item.lineTotal)} className="font-semibold" />
          <p className="text-xs text-slate-500">× {formatCurrency(Number(item.unitPrice))}</p>
        </div>
      ),
    },
  ];

  const menuItems: ActionMenuItem[] = purchase && canWrite && active ? [
    { key: "edit", label: "Düzenle", icon: Pencil, onSelect: () => onEdit(purchase) },
    {
      key: "cancel",
      label: delivered ? "Satın almayı iptal et" : "Siparişi iptal et",
      icon: Ban,
      danger: true,
      separatorBefore: true,
      disabled: cancelling,
      onSelect: () => onCancel(purchase),
    },
  ] : [];

  const primary = purchase && canWrite && active
    ? !delivered
      ? <Button onClick={() => onReceive(purchase)}>Teslim al</Button>
      : remaining > 0
        ? <Button onClick={() => onPay(purchase)}>Ödeme yap</Button>
        : null
    : null;

  const footer = menuItems.length > 0 || primary ? (
    <>
      {menuItems.length > 0 && <ActionMenu items={menuItems} trigger="button" label="Diğer" align="start" className="mr-auto" />}
      {primary}
    </>
  ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      module="firma"
      trackFormChanges={false}
      title={purchase ? `${kind} · ${purchase.firma?.name || ""}` : "Satın alma"}
      description={purchase ? [
        formatDateText(purchase.tarih),
        purchase.faturaNo ? `Fatura ${purchase.faturaNo}` : "Fatura no yok",
        purchase.kdvOrani > 0 ? `KDV %${purchase.kdvOrani}` : "",
      ].filter(Boolean).join(" · ") : undefined}
      size="lg"
      // Yenilenirken (ödeme/teslim sonrası) düğmeler yerinde kalır; pencere zıplamaz.
      footer={purchase ? footer : undefined}
    >
      {loading && !purchase ? (
        <div aria-busy="true"><ListRowSkeleton rows={3} variant="row" /></div>
      ) : error && !purchase ? (
        <LoadErrorState message={error} onRetry={onRetry} />
      ) : purchase ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <Badge tone={RECEIPT_STATUS_META[purchase.receiptStatus].tone} size="md">
                {RECEIPT_STATUS_META[purchase.receiptStatus].label}{purchase.receivedAt ? ` · ${formatDateText(purchase.receivedAt)}` : ""}
              </Badge>
            ) : (
              <Badge tone="critical" size="md">İptal edildi</Badge>
            )}
            {active && delivered && purchase.paymentSummary && (
              <Badge tone={PAYMENT_STATUS_META[purchase.paymentSummary.status].tone} size="md">{PAYMENT_STATUS_META[purchase.paymentSummary.status].label}</Badge>
            )}
          </div>
          {actionError && <Callout tone="critical" role="alert">{actionError}</Callout>}
          {active && !delivered && (
            <Callout tone="info" compact>Ürünler gelince “Teslim al” ile onaylayın; stok ve firma borcu o zaman oluşur.</Callout>
          )}
          {purchase.aciklama && <p className="text-sm text-slate-600">{purchase.aciklama}</p>}
          <ListTable<PurchaseItemRow>
            columns={itemColumns}
            rows={purchase.items || []}
            rowKey={(item) => item.id}
            emptyText="Kalem yok"
            mobileCard={(item) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{item.productName}{item.consumed ? " · Kullanıldı" : ""}</p>
                  <p className="text-xs text-slate-500">{item.quantity} {item.unit} × {formatCurrency(Number(item.unitPrice))}{item.lotNo ? ` · Lot ${item.lotNo}` : ""}</p>
                </div>
                <Money value={Number(item.lineTotal)} className="shrink-0 font-semibold" />
              </div>
            )}
          />
          {purchase.paymentSummary && (
            <DescriptionList
              layout="rows"
              items={delivered ? [
                { key: "toplam", label: "Toplam", value: <Money value={purchase.paymentSummary.total} /> },
                { key: "odenen", label: "Ödenen", value: <Money value={purchase.paymentSummary.paidTotal} tone="positive" /> },
                { key: "kalan", label: "Kalan borç", value: <Money value={purchase.paymentSummary.remaining} />, emphasis: true },
              ] : [
                { key: "siparis", label: "Sipariş tutarı", value: <Money value={purchase.paymentSummary.total} />, emphasis: true },
              ]}
            />
          )}
          {purchase.paymentSummary && purchase.paymentSummary.payments.length > 0 && (
            <div>
              <p className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">Ödemeler</p>
              <DescriptionList
                layout="rows"
                items={purchase.paymentSummary.payments.map((payment) => ({
                  key: payment.id,
                  label: <><DateText value={payment.tarih} />{payment.yontem ? ` · ${paymentMethodLabel(payment.yontem)}` : ""}</>,
                  value: <Money value={payment.tutar} tone="positive" className="font-semibold" />,
                }))}
              />
            </div>
          )}
          {active && delivered && remaining > 0 && (
            <p className="text-xs text-slate-500">Buradan yapılan ödeme önce bu faturanın borcuna düşer.</p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
