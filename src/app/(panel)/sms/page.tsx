"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import BulkSendTab from "./_tabs/BulkSendTab";
import TemplatesTab from "./_tabs/TemplatesTab";
import SettingsTab from "./_tabs/SettingsTab";

type SmsSettings = {
  smsEnabled: boolean;
  smsDefaultInfo: boolean;
  smsDefaultReminder: boolean;
  smsDefaultSurvey: boolean;
};

type SmsLog = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  SMS_BILGI: "Bilgilendirme",
  SMS_HATIRLATMA: "Hatırlatma",
  SMS_ANKET: "Değerlendirme",
  SMS_BILGI_AUTO: "Otomatik bilgilendirme",
  SMS_REMINDER_AUTO: "Otomatik hatırlatma",
  SMS_TOPLU: "Toplu gönderim",
};

function formatSmsAction(action: string) {
  const clean = action.replace(/_FAILED$/, "");
  return ACTION_LABELS[clean] || clean.replace(/^SMS_/, "").replaceAll("_", " ");
}

function isFailed(action: string) {
  return action.endsWith("_FAILED");
}

function extractRecipient(detail: string | null) {
  if (!detail) return "-";
  const [recipient] = detail.split(" - ");
  return recipient?.trim() || detail;
}

function extractProvider(detail: string | null) {
  if (!detail) return "-";
  const parts = detail.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : "-";
}

function SmsManagement() {
  const [settings, setSettings] = useState<SmsSettings>({
    smsEnabled: true,
    smsDefaultInfo: true,
    smsDefaultReminder: false,
    smsDefaultSurvey: false,
  });
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "success" | "failed">("all");

  const showToast = useCallback((type: "success" | "error", text: string) => {
    showToastSafe({ message: text, type });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, logsRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/logs?q=SMS_&limit=150"),
      ]);
      const settingsData = await settingsRes.json().catch(() => null);
      const logsData = await logsRes.json().catch(() => null);

      if (settingsData) {
        setSettings({
          smsEnabled: settingsData.smsEnabled !== undefined ? settingsData.smsEnabled : true,
          smsDefaultInfo: settingsData.smsDefaultInfo !== undefined ? settingsData.smsDefaultInfo : true,
          smsDefaultReminder: settingsData.smsDefaultReminder !== undefined ? settingsData.smsDefaultReminder : false,
          smsDefaultSurvey: settingsData.smsDefaultSurvey !== undefined ? settingsData.smsDefaultSurvey : false,
        });
      }
      setLogs(Array.isArray(logsData?.logs) ? logsData.logs : []);
    } catch {
      showToast("error", "SMS kayıtları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      const failed = isFailed(log.action);
      if (status === "success" && failed) return false;
      if (status === "failed" && !failed) return false;
      if (!needle) return true;
      return [log.action, log.detail, formatSmsAction(log.action)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [logs, query, status]);

  const successCount = logs.filter((log) => !isFailed(log.action)).length;
  const failedCount = logs.filter((log) => isFailed(log.action)).length;

  const logColumns: ListTableColumn<SmsLog>[] = [
    { key: "createdAt", header: "Tarih", cellClassName: "whitespace-nowrap", render: (log) => <span className="text-slate-600">{new Date(log.createdAt).toLocaleString("tr-TR")}</span> },
    { key: "action", header: "Tür", render: (log) => <span className="font-semibold text-slate-800">{formatSmsAction(log.action)}</span> },
    { key: "recipient", header: "Alıcı", render: (log) => <span className="text-slate-700">{extractRecipient(log.detail)}</span> },
    {
      key: "status",
      header: "Durum",
      render: (log) => <Badge tone={isFailed(log.action) ? "critical" : "success"}>{isFailed(log.action) ? "Başarısız" : "Başarılı"}</Badge>,
    },
    {
      key: "detail",
      header: "Detay",
      cellClassName: "max-w-[420px]",
      render: (log) => <span className="block truncate text-slate-500">{extractProvider(log.detail)}</span>,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">SMS Kayıtları</h1>
            <p className="mt-1 text-sm text-slate-500">Gönderilen SMS hareketleri ve başarısız denemeler.</p>
          </div>
          <Badge tone={settings.smsEnabled ? "success" : "critical"} size="md">
            {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400">Toplam Kayıt</p>
          <p className="mt-1 text-xl font-black text-slate-900">{logs.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase text-emerald-700">Başarılı</p>
          <p className="mt-1 text-xl font-black text-emerald-800">{successCount}</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase text-red-700">Başarısız</p>
          <p className="mt-1 text-xl font-black text-red-800">{failedCount}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hasta, telefon, SMS türü veya detay ara..."
            className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">Tüm durumlar</option>
            <option value="success">Başarılı</option>
            <option value="failed">Başarısız</option>
          </select>
          <Button variant="secondary" onClick={() => void load()}>
            Yenile
          </Button>
        </div>

        <ListTable<SmsLog>
          columns={logColumns}
          rows={filteredLogs}
          rowKey={(log) => log.id}
          loading={loading}
          emptyText="SMS kaydı bulunamadı."
        />
      </div>
    </section>
  );
}

export default function SmsPage() {
  const [tab, setTab] = useState<"kayitlar" | "toplu" | "sablonlar" | "ayarlar">("kayitlar");
  const [isYonetici, setIsYonetici] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsYonetici(d?.role === "YONETICI"))
      .catch(() => setIsYonetici(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "kayitlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("kayitlar")}>
          Kayıtlar
        </Button>
        <Button variant={tab === "toplu" ? "primary" : "secondary"} size="sm" onClick={() => setTab("toplu")}>
          Toplu Gönderim
        </Button>
        <Button variant={tab === "sablonlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("sablonlar")}>
          Şablonlar
        </Button>
        {isYonetici && (
          <Button variant={tab === "ayarlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("ayarlar")}>
            Ayarlar
          </Button>
        )}
      </div>
      {tab === "kayitlar" ? <SmsManagement /> : tab === "toplu" ? <BulkSendTab /> : tab === "sablonlar" ? <TemplatesTab /> : <SettingsTab />}
    </div>
  );
}
