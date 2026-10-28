"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Pencil, Printer, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money } from "@/components/ui/Money";
import { ManagerRequestButton } from "@/components/takip/ManagerRequestButton";
import { stripSystemTags } from "@/lib/format-text";
import {
  formatQuantity,
  isCriticalStock,
  isLowStock,
  stockBadges,
  stockCategoryLabel,
  type StockItem,
} from "@/components/stock/stock-shared";

type MovementRow = {
  id: string;
  type: "GIRIS" | "CIKIS";
  quantity: number;
  note?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
};

type StockItemDetailModalProps = {
  item: StockItem | null;
  onClose: () => void;
  canWrite: boolean;
  canDelete: boolean;
  canOrder: boolean;
  /** Maliyet alanları (finance:read). */
  canSeeCost: boolean;
  onMove: (item: StockItem) => void;
  onEdit: (item: StockItem) => void;
  onArchive: (item: StockItem) => void;
  onOrder: (item: StockItem) => void;
  onPrintBarcode: (item: StockItem) => void;
};

const movementText = (movement: MovementRow) => stripSystemTags(movement.note) || (movement.type === "GIRIS" ? "Giriş" : "Çıkış");

/**
 * Ürünün TEK detay penceresi: üstte durum ve sayılar, altta hareket geçmişi.
 * Altta yalnız sık iki eylem (Sipariş ver, Stok hareketi) görünür; Düzenle,
 * Barkod yazdır ve Arşivle "Diğer" menüsündedir.
 */
export function StockItemDetailModal({
  item, onClose, canWrite, canDelete, canOrder, canSeeCost, onMove, onEdit, onArchive, onOrder, onPrintBarcode,
}: StockItemDetailModalProps) {
  const [movements, setMovements] = useState<MovementRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const itemId = item?.id || "";
  // Yalnız bu ürünün stoğu değişince (hareket, satın alma, başka personelin
  // işlemi) geçmiş yeniden okunur; ilgisiz liste yenilemeleri istek atmaz.
  const signature = item ? [item.quantity, item.onOrderQuantity, item.minQuantity].join("|") : "";

  const load = useCallback(async () => {
    if (!itemId) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stock/${itemId}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.message || "Ürün geçmişi yüklenemedi.");
      if (sequence !== sequenceRef.current) return;
      setMovements(Array.isArray(body?.movements) ? body.movements : []);
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Ürün geçmişi yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [itemId]);

  // Başka ürün açılınca eski satırlar sıfırlanır.
  useEffect(() => { setMovements(null); }, [itemId]);

  useEffect(() => {
    if (!itemId) return;
    void load();
  }, [itemId, signature, load]);

  if (!item) return null;
  const badges = stockBadges(item);
  const low = isLowStock(item);
  const last = item.lastPurchase;
  const average = canSeeCost && item.averageUnitPrice ? item.averageUnitPrice : null;

  const movementColumns: ListTableColumn<MovementRow>[] = [
    {
      key: "tarih",
      header: "Tarih",
      render: (movement) => (
        <div className="whitespace-nowrap">
          <DateText value={movement.createdAt} format="datetime" className="text-slate-700" />
          {movement.user?.fullName && <p className="text-xs text-slate-500">{movement.user.fullName}</p>}
        </div>
      ),
    },
    {
      key: "miktar",
      header: "Hareket",
      align: "right",
      render: (movement) => (
        <span className={`whitespace-nowrap font-bold tabular-nums ${movement.type === "GIRIS" ? "text-emerald-700" : "text-slate-800"}`}>
          {movement.type === "GIRIS" ? "+" : "−"}{formatQuantity(movement.quantity, item.unit)}
        </span>
      ),
    },
    { key: "aciklama", header: "Açıklama", render: (movement) => <p className="min-w-0 text-slate-700">{movementText(movement)}</p> },
  ];

  const menuItems: ActionMenuItem[] = [
    ...(canWrite ? [{ key: "edit", label: "Düzenle", icon: Pencil, onSelect: () => onEdit(item) }] : []),
    { key: "barcode", label: "Barkod yazdır", icon: Printer, onSelect: () => onPrintBarcode(item) },
    ...(canDelete ? [{ key: "archive", label: "Arşivle", icon: Archive, danger: true, separatorBefore: true, onSelect: () => onArchive(item) }] : []),
  ];

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      module="box"
      size="lg"
      trackFormChanges={false}
      title={item.name}
      description={[stockCategoryLabel(item.category), item.storageLocation ? `Raf ${item.storageLocation}` : "", item.barcode ? `Barkod ${item.barcode}` : ""].filter(Boolean).join(" · ")}
      footer={(
        <>
          <ActionMenu items={menuItems} trigger="button" label="Diğer" align="start" className="mr-auto" />
          {canOrder && isCriticalStock(item) && (
            <Button variant="secondary" icon={ShoppingCart} onClick={() => onOrder(item)}>Sipariş ver</Button>
          )}
          {/* Sipariş veremeyen (satın alma yetkisi yok) stok personeli kritik ürünü yöneticiye iletir. */}
          {!canOrder && canWrite && isCriticalStock(item) && (
            <ManagerRequestButton
              size="md"
              label="Yöneticiden sipariş iste"
              taskTitle={`Sipariş gerekli: ${item.name}`}
              taskDetails={`Stok kritik: mevcut ${formatQuantity(item.quantity, item.unit)}, minimum ${formatQuantity(item.minQuantity, item.unit)}.`}
              taskType="PARCA_SIPARIS"
            />
          )}
          {canWrite && <Button onClick={() => onMove(item)}>Stok hareketi</Button>}
        </>
      )}
    >
      <div className="space-y-4">
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => <Badge key={badge.key} tone={badge.tone} size="md">{badge.label}</Badge>)}
          </div>
        )}
        <DescriptionList
          columns={3}
          // "Siparişte N" üstteki rozette yazılı; burada ikinci kez gösterilmez.
          // Boş ya da sıfır değerler yazılmaz (K5).
          items={[
            { key: "mevcut", label: "Mevcut", value: <span className={`font-semibold tabular-nums ${low ? "text-red-700" : "text-slate-900"}`}>{formatQuantity(item.quantity, item.unit)}</span> },
            { key: "min", label: "Minimum", value: formatQuantity(item.minQuantity, item.unit), hidden: item.minQuantity <= 0 },
            { key: "ort", label: "Ort. maliyet", value: average ? <Money value={average} /> : null, hidden: !average },
            { key: "deger", label: "Stok değeri", value: average ? <Money value={item.quantity * average} /> : null, hidden: !average || item.quantity <= 0 },
            {
              key: "son",
              label: "Son alış",
              full: true,
              hidden: !last,
              value: last ? (
                <span>
                  {canSeeCost && last.unitPrice ? <><Money value={last.unitPrice} />/{item.unit} · </> : null}
                  {last.supplier ? `${last.supplier} · ` : ""}
                  {last.date ? <DateText value={last.date} /> : null}
                </span>
              ) : null,
            },
          ]}
        />

        <div className="space-y-2">
          <ListTable<MovementRow>
            title="Hareketler"
            titleAs="h3"
            columns={movementColumns}
            rows={movements || []}
            rowKey={(movement) => movement.id}
            loading={loading && movements === null}
            error={movements === null ? error : null}
            staleError={movements !== null ? error : null}
            onRetry={() => void load()}
            skeletonRows={4}
            emptyText="Henüz hareket yok"
            mobileCard={(movement) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{movementText(movement)}</p>
                  <p className="text-xs text-slate-500"><DateText value={movement.createdAt} format="datetime" />{movement.user?.fullName ? ` · ${movement.user.fullName}` : ""}</p>
                </div>
                <span className={`shrink-0 whitespace-nowrap font-bold tabular-nums ${movement.type === "GIRIS" ? "text-emerald-700" : "text-slate-800"}`}>
                  {movement.type === "GIRIS" ? "+" : "−"}{formatQuantity(movement.quantity, item.unit)}
                </span>
              </div>
            )}
          />
          {(movements?.length || 0) >= 50 && <p className="text-xs text-slate-500">Son 50 hareket gösteriliyor.</p>}
        </div>
      </div>
    </Modal>
  );
}
