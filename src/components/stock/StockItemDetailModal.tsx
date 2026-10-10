"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Pencil, Printer, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Tabs } from "@/components/ui/Tabs";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money } from "@/components/ui/Money";
import { ManagerRequestButton } from "@/components/takip/ManagerRequestButton";
import { stripSystemTags } from "@/lib/format-text";
import {
  expiryState,
  formatQuantity,
  isCriticalStock,
  isLowStock,
  itemExpiry,
  lotGap,
  stockBadges,
  stockCategoryLabel,
  type StockItem,
} from "@/components/stock/stock-shared";
import type { StockLotPreview } from "@/components/stock/StockMovementModal";

type LotRow = {
  id: string;
  lotNo?: string | null;
  receivedAt: string;
  expiresAt?: string | null;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number | string | null;
  supplierName?: string | null;
  status: "AKTIF" | "TUKENDI" | "KARANTINA" | "IPTAL";
  /** Lot no ve SKT'si girilmemiş birden çok parti tek satırda toplandıysa parti sayısı. */
  mergedCount?: number;
};

type MovementRow = {
  id: string;
  type: "GIRIS" | "CIKIS";
  quantity: number;
  unitPrice?: number | string | null;
  supplier?: string | null;
  note?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  lotAllocations?: { quantity: number; lot?: { lotNo?: string | null; expiresAt?: string | null } | null }[];
};

type DetailTab = "partiler" | "hareketler";

type StockItemDetailModalProps = {
  item: StockItem | null;
  onClose: () => void;
  canWrite: boolean;
  canDelete: boolean;
  canOrder: boolean;
  /** Maliyet alanları (finance:read). */
  canSeeCost: boolean;
  /** Stok hareketi penceresi; yüklü partiler de verilir (ikinci kez istenmesin). */
  onMove: (item: StockItem, lots: StockLotPreview[] | null) => void;
  onEdit: (item: StockItem) => void;
  onArchive: (item: StockItem) => void;
  onOrder: (item: StockItem) => void;
  onPrintBarcode: (item: StockItem) => void;
};

/**
 * Lot no ve SKT'si girilmemiş aktif partiler (elle girişler, açılış stoku)
 * tek "Lot no girilmemiş" satırında toplanır; önceden her giriş ayrı ve
 * birbirinin aynısı bir satır açıyordu.
 */
function groupActiveLots(lots: LotRow[]): LotRow[] {
  const plain = lots.filter((lot) => !lot.lotNo && !lot.expiresAt);
  if (plain.length < 2) return lots;
  const received = plain.reduce((sum, lot) => sum + Number(lot.quantityReceived || 0), 0);
  const remaining = plain.reduce((sum, lot) => sum + Number(lot.quantityRemaining || 0), 0);
  // Ağırlıklı ortalama yalnız gösterim içindir (kuruşa yuvarlanır).
  const costCents = plain.reduce((sum, lot) => sum + Math.round(Number(lot.unitCost || 0) * 100) * Number(lot.quantityRemaining || 0), 0);
  const latest = [...plain].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  const merged: LotRow = {
    ...latest,
    id: "lot-no-girilmemis",
    quantityReceived: received,
    quantityRemaining: remaining,
    unitCost: plain.every((lot) => lot.unitCost === null) || remaining === 0 ? null : Math.round(costCents / remaining) / 100,
    supplierName: null,
    mergedCount: plain.length,
  };
  return [...lots.filter((lot) => lot.lotNo || lot.expiresAt), merged];
}

/**
 * Ürünün TEK detay penceresi: üstte durum ve sayılar, altta Partiler /
 * Hareketler. Altta yalnız sık iki eylem (Sipariş ver, Stok hareketi)
 * görünür; Düzenle, Barkod yazdır ve Arşivle "Diğer" menüsündedir. Önceden
 * beş düğme iki satıra taşıyor, tablolar pencereden sağa taşıp kesiliyordu.
 */
export function StockItemDetailModal({
  item, onClose, canWrite, canDelete, canOrder, canSeeCost, onMove, onEdit, onArchive, onOrder, onPrintBarcode,
}: StockItemDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>("partiler");
  const [lots, setLots] = useState<LotRow[] | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const itemId = item?.id || "";
  // Yalnız bu ürünün stoğu değişince (hareket, satın alma, başka personelin
  // işlemi) geçmiş yeniden okunur; ilgisiz liste yenilemeleri istek atmaz.
  const signature = item
    ? [item.quantity, item.lotQuantity, item.activeLotCount, item.nearestExpiry, item.onOrderQuantity, item.minQuantity].join("|")
    : "";

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
      setLots(Array.isArray(body?.lots) ? body.lots : []);
      setMovements(Array.isArray(body?.movements) ? body.movements : []);
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Ürün geçmişi yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [itemId]);

  // Başka ürün açılınca sekme ve eski satırlar sıfırlanır.
  useEffect(() => {
    setTab("partiler");
    setLots(null);
    setMovements([]);
  }, [itemId]);

  useEffect(() => {
    if (!itemId) return;
    void load();
  }, [itemId, signature, load]);

  const activeLots = useMemo(
    () => groupActiveLots((lots || []).filter((lot) => lot.status === "AKTIF" && lot.quantityRemaining > 0)),
    [lots],
  );

  if (!item) return null;
  const badges = stockBadges(item);
  const gap = lotGap(item);
  const expiry = itemExpiry(item);
  const low = isLowStock(item);
  const pastLotCount = (lots || []).filter((lot) => !(lot.status === "AKTIF" && lot.quantityRemaining > 0)).length;
  const last = item.lastPurchase;

  const lotColumns: ListTableColumn<LotRow>[] = [
    {
      key: "lot",
      header: "Parti",
      render: (lot) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{lot.lotNo || "Lot no girilmemiş"}</p>
          <p className="text-xs text-slate-500">
            {lot.mergedCount ? `${lot.mergedCount} parti · son giriş ` : lot.supplierName ? `${lot.supplierName} · ` : ""}
            <DateText value={lot.receivedAt} />
          </p>
        </div>
      ),
    },
    {
      key: "skt",
      header: "SKT",
      render: (lot) => {
        if (!lot.expiresAt) return <EmptyValue />;
        const state = expiryState(lot.expiresAt);
        return <DateText value={lot.expiresAt} className={state === "expired" ? "font-semibold text-red-700" : state === "soon" ? "font-semibold text-amber-700" : "text-slate-700"} />;
      },
    },
    {
      key: "kalan",
      header: "Kalan / gelen",
      align: "right",
      render: (lot) => (
        <div className="whitespace-nowrap">
          <span className="font-semibold tabular-nums text-slate-900">{lot.quantityRemaining} / {lot.quantityReceived}</span>
          {canSeeCost && lot.unitCost !== null && (
            <p className="text-xs text-slate-500"><Money value={Number(lot.unitCost)} />/{item.unit}</p>
          )}
        </div>
      ),
    },
  ];

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
    {
      key: "aciklama",
      header: "Açıklama",
      render: (movement) => {
        const text = stripSystemTags(movement.note);
        const lotsUsed = (movement.lotAllocations || []).map((allocation) => allocation.lot?.lotNo).filter(Boolean);
        return (
          <div className="min-w-0">
            <p className="text-slate-700">{text || (movement.type === "GIRIS" ? "Giriş" : "Çıkış")}</p>
            {lotsUsed.length > 0 && <p className="text-xs text-slate-500">Parti: {lotsUsed.join(", ")}</p>}
          </div>
        );
      },
    },
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
          {canWrite && <Button onClick={() => onMove(item, lots ? lots.map(toPreview) : null)}>Stok hareketi</Button>}
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
          items={[
            { key: "mevcut", label: "Mevcut", value: <span className={`font-semibold tabular-nums ${low ? "text-red-700" : "text-slate-900"}`}>{formatQuantity(item.quantity, item.unit)}</span> },
            { key: "min", label: "Minimum", value: formatQuantity(item.minQuantity, item.unit) },
            { key: "skt", label: "En yakın SKT", value: expiry ? <DateText value={expiry} /> : null },
            { key: "ort", label: "Ort. maliyet", value: item.averageUnitPrice ? <Money value={item.averageUnitPrice} /> : null, hidden: !canSeeCost },
            { key: "deger", label: "Stok değeri", value: item.averageUnitPrice ? <Money value={item.quantity * item.averageUnitPrice} /> : null, hidden: !canSeeCost },
            {
              key: "son",
              label: "Son alış",
              full: true,
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
        {gap > 0 && (
          <Callout
            tone="warning"
            compact
            action={canWrite ? (
              <ManagerRequestButton
                label="Yöneticiye bildir"
                taskTitle={`Partisiz stok için açılış partisi gerekli: ${item.name}`}
                taskDetails={`${formatQuantity(gap, item.unit)} için parti (lot) kaydı yok; bu miktardan stok çıkışı yapılamıyor.`}
                taskType="PARCA_SIPARIS"
              />
            ) : undefined}
          >
            {formatQuantity(gap, item.unit)} için parti (lot) kaydı yok; bu miktardan çıkış yapılamaz. Partisiz stok için açılış partisi gerekli.
          </Callout>
        )}

        <Tabs<DetailTab>
          ariaLabel="Ürün geçmişi"
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { key: "partiler", label: "Partiler" },
            { key: "hareketler", label: "Hareketler" },
          ]}
        />
        {tab === "partiler" ? (
          <div className="space-y-2">
            <ListTable<LotRow>
              columns={lotColumns}
              rows={activeLots}
              rowKey={(lot) => lot.id}
              loading={loading && lots === null}
              error={lots === null ? error : null}
              staleError={lots !== null ? error : null}
              onRetry={() => void load()}
              skeletonRows={3}
              emptyText="Kullanımda parti yok"
              emptyDescription="Satın alma teslim alınınca lot ve SKT bilgisiyle burada görünür."
              mobileCard={(lot) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{lot.lotNo || "Lot no girilmemiş"}</p>
                    <p className="text-xs text-slate-500">
                      SKT {lot.expiresAt ? <DateText value={lot.expiresAt} /> : "—"}
                      {lot.mergedCount ? ` · ${lot.mergedCount} parti` : lot.supplierName ? ` · ${lot.supplierName}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums">{formatQuantity(lot.quantityRemaining, item.unit)}</span>
                </div>
              )}
            />
            {pastLotCount > 0 && !loading && (
              <p className="text-xs text-slate-500">{pastLotCount} parti bitti veya iptal edildi (Hareketler&apos;de görünür).</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <ListTable<MovementRow>
              columns={movementColumns}
              rows={movements}
              rowKey={(movement) => movement.id}
              loading={loading && lots === null}
              error={lots === null ? error : null}
              staleError={lots !== null ? error : null}
              onRetry={() => void load()}
              skeletonRows={4}
              emptyText="Henüz hareket yok"
              mobileCard={(movement) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{stripSystemTags(movement.note) || (movement.type === "GIRIS" ? "Giriş" : "Çıkış")}</p>
                    <p className="text-xs text-slate-500"><DateText value={movement.createdAt} format="datetime" />{movement.user?.fullName ? ` · ${movement.user.fullName}` : ""}</p>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap font-bold tabular-nums ${movement.type === "GIRIS" ? "text-emerald-700" : "text-slate-800"}`}>
                    {movement.type === "GIRIS" ? "+" : "−"}{formatQuantity(movement.quantity, item.unit)}
                  </span>
                </div>
              )}
            />
            {movements.length >= 50 && <p className="text-xs text-slate-500">Son 50 hareket gösteriliyor.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function toPreview(lot: LotRow): StockLotPreview {
  return { id: lot.id, lotNo: lot.lotNo, expiresAt: lot.expiresAt, receivedAt: lot.receivedAt, quantityRemaining: Number(lot.quantityRemaining), status: lot.status };
}
