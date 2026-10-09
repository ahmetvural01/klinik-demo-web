"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Switch } from "@/components/ui/Switch";

export type PrintRow = { id: string; date: ReactNode; label: ReactNode; meta?: ReactNode; amount?: ReactNode };

/**
 * Yazdırılacak satırları seçme penceresi (tedavi raporu, tahsilat dökümü).
 * Varsayılan olarak hepsi seçili gelir; satıra tıklamak seçimi değiştirir.
 */
export function PrintSelectModal({
  open,
  onClose,
  title,
  description,
  rows,
  itemLabel,
  priceToggle = false,
  onPrint,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  rows: PrintRow[];
  /** Seçim sayacında kullanılacak ad ("tedavi", "tahsilat"). */
  itemLabel: string;
  /** "Fiyatları göster" anahtarı gösterilsin mi? */
  priceToggle?: boolean;
  onPrint: (selectedIds: string[], showPrices: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showPrices, setShowPrices] = useState(true);
  // Pencere açılırken bir kez hepsi seçilir: satırlar arka planda yenilense de
  // kullanıcının seçimi korunur.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!open) return;
    setSelected(rowsRef.current.map((row) => row.id));
    setShowPrices(true);
  }, [open]);

  const columns: ListTableColumn<PrintRow>[] = [
    { key: "date", header: "Tarih", render: (row) => <span className="whitespace-nowrap text-slate-600">{row.date}</span> },
    { key: "label", header: "Kayıt", render: (row) => <span className="font-medium text-slate-800">{row.label}{row.meta ? <span className="ml-1.5 text-xs text-slate-500">{row.meta}</span> : null}</span> },
    { key: "amount", header: "Tutar", align: "right", render: (row) => <span className="tabular-nums">{row.amount}</span> },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      trackFormChanges={false}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button icon={Printer} disabled={selected.length === 0} onClick={() => { onPrint(selected, showPrices); onClose(); }}>
            Yazdır ({selected.length} {itemLabel})
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        {priceToggle && (
          <Switch checked={showPrices} onChange={setShowPrices} label="Fiyatları belgede göster" description="Kapatırsanız tutarlar ve toplamlar belgeye yazılmaz." />
        )}
        <ListTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyText="Yazdırılacak kayıt yok"
          getRowAriaLabel={(row) => (typeof row.label === "string" ? row.label : "Kayıt")}
          selection={{ selectedIds: selected, onChange: setSelected }}
          mobileCard={(row) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{row.label}</p>
                <p className="text-xs text-slate-500">{row.date}{row.meta ? <> · {row.meta}</> : null}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{row.amount}</span>
            </div>
          )}
        />
      </div>
    </Modal>
  );
}
