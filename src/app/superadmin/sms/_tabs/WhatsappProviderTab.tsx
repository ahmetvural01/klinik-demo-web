"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { TabIntro } from "@/components/superadmin/TabIntro";
import { WHATSAPP_STATUS_META } from "@/components/superadmin/sa-labels";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type Row = {
  institutionId: string;
  institutionName: string;
  institutionActive: boolean;
  whatsappEnabled: boolean;
  providerId: string | null;
  connectionStatus: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  connectedAt: string | null;
  lastSuccessfulSendAt: string | null;
  lastWebhookAt: string | null;
  todaySent: number;
  dailyLimit: number;
};

/**
 * WhatsApp: kliniklere WhatsApp kullanımı TEK yerden (burada) açılır ve
 * bağlantı durumları izlenir. Klinik numarasını kendi panelinden QR kod ile
 * bağlar. Erişimi kapatmak bağlantıyı kestiği için ayrıca onay istenir
 * (önceden düzenleme penceresindeki bir kutunun işaretini kaldırıp genel
 * "Kaydet"e basmak uyarısız siliyordu).
 */
export default function WhatsappProviderTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<{ providers: Row[] }>("/api/superadmin/whatsapp-provider", "WhatsApp bilgileri yüklenemedi.", controller.signal)
      .then((data) => {
        setRows(Array.isArray(data?.providers) ? data.providers : []);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "WhatsApp bilgileri yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => !q || row.institutionName.toLocaleLowerCase("tr-TR").includes(q));
  }, [rows, query]);

  const enabledCount = rows.filter((row) => row.whatsappEnabled).length;
  const connectedCount = rows.filter((row) => row.whatsappEnabled && row.connectionStatus === "CONNECTED").length;
  const errorCount = rows.filter((row) => row.whatsappEnabled && row.connectionStatus === "ERROR").length;

  const toggle = async (row: Row) => {
    const enabling = !row.whatsappEnabled;
    const ok = await confirmDialog(enabling ? {
      title: "WhatsApp kullanımı açılsın mı?",
      message: `${row.institutionName} kliniği kendi WhatsApp numarasını İletişim > Ayarlar'dan QR kod ile bağlayıp mesajlarını WhatsApp'tan gönderebilir.`,
      confirmText: "Aç",
      cancelText: "Vazgeç",
    } : {
      title: "WhatsApp kullanımı kapatılsın mı?",
      message: `${row.institutionName} kliniğinin WhatsApp bağlantısı kesilecek ve mesajları SMS ile gidecek. Yeniden açarsanız klinik numarasını tekrar bağlamalıdır.`,
      confirmText: "Kapat",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    setBusyId(row.institutionId);
    try {
      await saSend(`/api/superadmin/institutions/${row.institutionId}`, "PUT", { whatsappEnabled: enabling }, "WhatsApp erişimi değiştirilemedi.");
      showToastSafe({ type: "success", message: enabling ? `${row.institutionName} için WhatsApp açıldı.` : `${row.institutionName} için WhatsApp kapatıldı.`, icon: "sms" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "WhatsApp erişimi değiştirilemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (row: Row) => {
    if (!row.whatsappEnabled) return <span className="text-sm text-slate-400">Kapalı</span>;
    const meta = WHATSAPP_STATUS_META[row.connectionStatus] || { label: "Bilinmiyor", tone: "neutral" as const };
    return <Badge tone={meta.tone}>{meta.label}</Badge>;
  };

  const accessSwitch = (row: Row) => (
    <Switch
      checked={row.whatsappEnabled}
      onChange={() => void toggle(row)}
      disabled={busyId === row.institutionId || !row.institutionActive}
      label={<span className="sr-only">WhatsApp erişimi</span>}
      aria-label={`${row.institutionName} WhatsApp erişimi`}
      className="justify-end"
    />
  );

  const columns: ListTableColumn<Row>[] = [
    {
      key: "clinic",
      header: "Klinik",
      render: (row) => (
        <Link href={`/superadmin/institutions/${row.institutionId}`} className="font-semibold text-slate-900 hover:text-primary hover:underline">
          {row.institutionName}
        </Link>
      ),
    },
    { key: "access", header: "Erişim", render: accessSwitch },
    { key: "status", header: "Bağlantı", render: statusBadge },
    { key: "account", header: "Hesap / numara", render: (row) => (row.verifiedName || row.displayPhoneNumber ? <span className="text-sm text-slate-700">{[row.verifiedName, row.displayPhoneNumber].filter(Boolean).join(" · ")}</span> : <EmptyValue />) },
    { key: "lastSend", header: "Son gönderim", render: (row) => dateTime(row.lastSuccessfulSendAt) || <EmptyValue /> },
    { key: "today", header: "Bugün", align: "right", render: (row) => (row.whatsappEnabled && row.connectionStatus === "CONNECTED" ? <span className="tabular-nums text-sm text-slate-700">{row.todaySent} / {row.dailyLimit}</span> : <EmptyValue />) },
  ];

  return (
    <section className="space-y-3">
      <TabIntro text={`Kliniklere WhatsApp kullanımı buradan açılır; klinik numarasını kendi panelinden QR kod ile bağlar. Açık: ${enabledCount} · bağlı: ${connectedCount}${errorCount ? ` · sorunlu: ${errorCount}` : ""}`} />

      <ListTable<Row>
        header={
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Klinik adı" wrapperClassName="flex-1 min-w-[220px]" />
          </Toolbar>
        }
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.institutionId}
        loading={loading}
        error={loadError}
        onRetry={reload}
        rowClassName={(row) => (row.institutionActive ? "" : "opacity-60")}
        emptyText={query ? "Bu adla klinik yok" : "Klinik yok"}
        mobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/superadmin/institutions/${row.institutionId}`} className="min-w-0 truncate font-semibold text-slate-900">{row.institutionName}</Link>
              {accessSwitch(row)}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              {statusBadge(row)}
              <span>{row.displayPhoneNumber || ""}</span>
            </div>
          </div>
        )}
      />
    </section>
  );
}
