"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, Pencil, Printer, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { DateText, Money } from "@/components/ui/Money";
import { stripSystemTags } from "@/lib/format-text";
import {
  STOCK_STATUS_META,
  expiryState,
  formatQuantity,
  itemExpiry,
  lotGap,
  stockStatus,
  type StockItem,
} from "@/components/stock/stock-shared";

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

const LOT_STATUS: Record<LotRow["status"], { label: string; tone: "success" | "neutral" | "warning" | "critical" }> = {
  AKTIF: { label: "Kullanımda", tone: "success" },
  TUKENDI: { label: "Bitti", tone: "neutral" },
  KARANTINA: { label: "Karantina", tone: "warning" },
  IPTAL: { label: "İptal", tone: "critical" },
};

type StockItemDetailModalProps = {
  item: StockItem | null;
  onClose: () => void;
  canWrite: boolean;
  canDelete: boolean;
  canOrder: boolean;
  /** Maliyet alanları (finance:read). */
  canSeeCost: boolean;
  /** Liste yenilenince (hareket/düzenleme sonrası) detay da yeniden yüklensin diye artan sayaç. */
  refreshToken: number;
  onMove: (item: StockItem) => void;
  onEdit: (item: StockItem) => void;
  onArchive: (item: StockItem) => void;
  onOrder: (item: StockItem) => void;
  onPrintBarcode: (item: StockItem) => void;
};

/**
 * Ürünün TEK detay penceresi: üstte durum ve sayılar, altta Partiler /
 * Hareketler sekmeleri, altta eylemler. Önceden detay 3 sayı + 4 düğmeydi;
 * "Hareketler" detayı kapatıp başka pencere açıyor, partiler (lot, SKT)
 * hiç görünmüyor, barkod yalnız hareket geçmişinin altında duruyordu.
 */
export function StockItemDetailModal({
  item, onClose, canWrite, canDelete, canOrder, canSeeCost, refreshToken, onMove, onEdit, onArchive, onOrder, onPrintBarcode,
}: StockItemDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>("partiler");
  const [lots, setLots] = useState<LotRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const itemId = item?.id || "";

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
    setLots([]);
    setMovements([]);
  }, [itemId]);

  // Ürün açılınca ve liste yenilenince (hareket/düzenleme sonrası) yeniden yükle.
  useEffect(() => {
    if (!itemId) return;
    void load();
  }, [itemId, refreshToken, load]);

  if (!item) return null;
  const status = stockStatus(item);
  const statusMeta = STOCK_STATUS_META[status];
  const gap = lotGap(item);
  const expiry = itemExpiry(item);
  const activeLots = lots.filter((lot) => lot.status === "AKTIF" && lot.quantityRemaining > 0);
  const pastLots = lots.filter((lot) => !(lot.status === "AKTIF" && lot.quantityRemaining > 0));

  const lotColumns: ListTableColumn<LotRow>[] = [
    {
      key: "lot",
      header: "Parti",
      render: (lot) => (
        <div>
          <p className="font-semibold text-slate-800">{lot.lotNo || "Lot no girilmemiş"}</p>
          <p className="text-xs text-slate-500">{lot.supplierName || "Tedarikçi yok"} · <DateText value={lot.receivedAt} /></p>
        </div>
      ),
    },
    {
      key: "skt",
      header: "SKT",
      render: (lot) => {
        if (!lot.expiresAt) return <EmptyValue />;
        const state = expiryState(lot.expiresAt);
        return (
          <span className={state === "expired" ? "font-semibold text-red-700" : state === "soon" ? "font-semibold text-amber-700" : "text-slate-700"}>
            <DateText value={lot.expiresAt} />
          </span>
        );
      },
    },
    { key: "kalan", header: "Kalan / gelen", align: "right", render: (lot) => <span className="tabular-nums">{lot.quantityRemaining} / {lot.quantityReceived}</span> },
    ...(canSeeCost ? [{ key: "maliyet", header: "Birim maliyet", align: "right" as const, render: (lot: LotRow) => <Money value={lot.unitCost === null ? null : Number(lot.unitCost)} /> }] : []),
    { key: "durum", header: "Durum", render: (lot) => <Badge tone={LOT_STATUS[lot.status]?.tone || "neutral"}>{LOT_STATUS[lot.status]?.label || lot.status}</Badge> },
  ];

  const movementColumns: ListTableColumn<MovementRow>[] = [
    { key: "tarih", header: "Tarih", render: (movement) => <DateText value={movement.createdAt} format="datetime" className="whitespace-nowrap text-slate-600" /> },
    {
      key: "miktar",
      header: "Hareket",
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
    { key: "kisi", header: "Kişi", render: (movement) => movement.user?.fullName || <EmptyValue /> },
  ];

  const summary: { label: string; value: ReactNode }[] = [
    { label: "Mevcut", value: <span className={status === "critical" || status === "onorder" ? "text-red-700" : ""}>{formatQuantity(item.quantity, item.unit)}</span> },
    { label: "Minimum", value: formatQuantity(item.minQuantity, item.unit) },
    { label: "Siparişte", value: item.onOrderQuantity ? formatQuantity(item.onOrderQuantity, item.unit) : <EmptyValue /> },
    { label: "En yakın SKT", value: expiry ? <DateText value={expiry} /> : <EmptyValue /> },
    ...(canSeeCost ? [
      { label: "Ort. maliyet", value: <Money value={item.averageUnitPrice ?? null} /> },
      { label: "Stok değeri", value: item.averageUnitPrice ? <Money value={item.quantity * item.averageUnitPrice} /> : <EmptyValue /> },
    ] : [
      { label: "Raf / konum", value: item.storageLocation || <EmptyValue /> },
    ]),
  ];

  const last = item.lastPurchase;

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      module="box"
      size="lg"
      trackFormChanges={false}
      title={item.name}
      description={[item.category, item.storageLocation ? `Raf ${item.storageLocation}` : "", item.barcode ? `Barkod ${item.barcode}` : ""].filter(Boolean).join(" · ")}
      footer={(
        <>
          {canDelete && (
            <Button variant="ghost" icon={Archive} className="mr-auto !text-red-700 hover:!bg-red-50" onClick={() => onArchive(item)}>
              Arşivle
            </Button>
          )}
          <Button variant="secondary" icon={Printer} onClick={() => onPrintBarcode(item)}>Barkod yazdır</Button>
          {canWrite && <Button variant="secondary" icon={Pencil} onClick={() => onEdit(item)}>Düzenle</Button>}
          {canOrder && (status === "critical" || status === "onorder") && (
            <Button variant="secondary" icon={ShoppingCart} onClick={() => onOrder(item)}>Sipariş ver</Button>
          )}
          {canWrite && <Button onClick={() => onMove(item)}>Stok hareketi</Button>}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusMeta.tone} size="md">{statusMeta.label}</Badge>
          {last ? (
            <span className="text-xs text-slate-500">
              Son alış{canSeeCost ? <> <Money value={last.unitPrice ?? null} className="font-semibold text-slate-700" />/{item.unit}</> : null}
              {last.supplier ? ` · ${last.supplier}` : ""}{last.date ? <> · <DateText value={last.date} /></> : null}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Henüz teslim alınmış satın alma yok</span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
          {summary.map((entry) => (
            <div key={entry.label} className="min-w-0">
              <dt className="text-xs text-slate-500">{entry.label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{entry.value}</dd>
            </div>
          ))}
        </dl>
        {gap > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {formatQuantity(gap, item.unit)} için parti (lot) kaydı yok; bu miktardan çıkış yapılamaz. Durumu sistem yöneticinize bildirin.
          </p>
        )}

        <Tabs<DetailTab>
          ariaLabel="Ürün geçmişi"
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { key: "partiler", label: "Partiler", count: activeLots.length },
            { key: "hareketler", label: "Hareketler" },
          ]}
        />
        {tab === "partiler" ? (
          <div className="space-y-2">
            <ListTable<LotRow>
              columns={lotColumns}
              rows={activeLots}
              rowKey={(lot) => lot.id}
              loading={loading}
              error={error}
              onRetry={() => void load()}
              skeletonRows={3}
              emptyText="Kullanımda parti yok"
              emptyDescription="Satın alma teslim alınınca lot ve SKT bilgisiyle burada görünür."
              mobileCard={(lot) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{lot.lotNo || "Lot no girilmemiş"}</p>
                    <p className="text-xs text-slate-500">SKT {lot.expiresAt ? <DateText value={lot.expiresAt} /> : "—"} · {lot.supplierName || "Tedarikçi yok"}</p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums">{lot.quantityRemaining} {item.unit}</span>
                </div>
              )}
            />
            {pastLots.length > 0 && !loading && (
              <p className="text-xs text-slate-500">{pastLots.length} parti bitti veya iptal edildi (Hareketler&apos;de görünür).</p>
            )}
          </div>
        ) : (
          <ListTable<MovementRow>
            columns={movementColumns}
            rows={movements}
            rowKey={(movement) => movement.id}
            loading={loading}
            error={error}
            onRetry={() => void load()}
            skeletonRows={4}
            emptyText="Henüz hareket yok"
            mobileCard={(movement) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{stripSystemTags(movement.note) || (movement.type === "GIRIS" ? "Giriş" : "Çıkış")}</p>
                  <p className="text-xs text-slate-500"><DateText value={movement.createdAt} format="datetime" />{movement.user?.fullName ? ` · ${movement.user.fullName}` : ""}</p>
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${movement.type === "GIRIS" ? "text-emerald-700" : "text-slate-800"}`}>
                  {movement.type === "GIRIS" ? "+" : "−"}{movement.quantity}
                </span>
              </div>
            )}
          />
        )}
        {movements.length >= 50 && tab === "hareketler" && <p className="text-xs text-slate-500">Son 50 hareket gösteriliyor.</p>}
      </div>
    </Modal>
  );
}
