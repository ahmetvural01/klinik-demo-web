"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

type WalletEntry = {
  id: string;
  institution?: { name: string };
  balance: number;
  usedCount: number;
  updatedAt: string;
};

export default function SmsStockPage() {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/sms-wallet")
      .then((r) => r.json())
      .then((d) => setWallets(Array.isArray(d) ? d : d.wallets ?? []))
      .catch(() => setWallets([]))
      .finally(() => setLoading(false));
  }, []);

  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0);
  const totalUsed = wallets.reduce((sum, w) => sum + (w.usedCount ?? 0), 0);

  const columns: ListTableColumn<WalletEntry>[] = [
    { key: "institution", header: "Klinik", render: (w) => <span className="font-bold text-slate-900">{w.institution?.name ?? "—"}</span> },
    {
      key: "balance",
      header: "Kalan Kredi",
      align: "right",
      render: (w) => (
        <span className={`font-semibold ${w.balance < 50 ? "text-red-600" : "text-emerald-600"}`}>
          {w.balance.toLocaleString("tr-TR")}
        </span>
      ),
    },
    { key: "usedCount", header: "Kullanılan", align: "right", render: (w) => <span className="text-slate-600">{w.usedCount.toLocaleString("tr-TR")}</span> },
    { key: "updatedAt", header: "Güncelleme", render: (w) => <span className="text-slate-500">{new Date(w.updatedAt).toLocaleDateString("tr-TR")}</span> },
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-4 w-4" />
        </span>
        <h1 className="text-lg font-black text-slate-900">SMS Stok</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Kalan Kredi</p>
          <p className="mt-1 text-2xl font-black text-primary">{totalBalance.toLocaleString("tr-TR")}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Kullanılan</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{totalUsed.toLocaleString("tr-TR")}</p>
        </div>
      </div>

      <ListTable<WalletEntry>
        columns={columns}
        rows={wallets}
        rowKey={(w) => w.id}
        loading={loading}
        emptyText="Veri bulunamadı"
      />
    </section>
  );
}
