"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { FormField } from "@/components/ui/FormField";
import { getAuditActionLabel } from "@/lib/audit-labels";
import BulkSendTab from "./_tabs/BulkSendTab";
import TemplatesTab from "./_tabs/TemplatesTab";

type SmsSettings = {
  smsEnabled: boolean;
  smsDefaultInfo: boolean;
  smsDefaultReminder: boolean;
  smsDefaultSurvey: boolean;
  paymentReminderSmsEnabled: boolean;
  paymentReminderWindowDays: number;
  reviewLink: string;
  birthdaySmsEnabled: boolean;
};

type SmsLog = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

type SmsLogRow = SmsLog & {
  isBulkPackage?: boolean;
  items?: SmsLog[];
  recipientCount?: number;
  failedCount?: number;
  packageId?: string;
};

function isSmsDeliveryAction(action: string) {
  return action.startsWith("SMS_") && !action.startsWith("SMS_TEMPLATE_");
}

function isFailed(action: string) {
  return action.endsWith("_FAILED");
}

function formatSmsAction(log: Pick<SmsLogRow, "action" | "detail" | "isBulkPackage">) {
  if (log.isBulkPackage) return "Toplu SMS Paketi";
  return getAuditActionLabel(log.action, log.detail);
}

function stripPackagePrefix(detail: string | null) {
  return (detail || "").replace(/^\[Paket:[^\]]+\]\s*/i, "");
}

function extractPackageId(detail: string | null) {
  const match = (detail || "").match(/^\[Paket:([^\]]+)\]/i);
  return match?.[1] || "";
}

function extractRecipient(detail: string | null) {
  if (!detail) return "-";
  const [recipient] = stripPackagePrefix(detail).split(" - ");
  return recipient?.trim() || detail;
}

function extractSmsTarget(log: SmsLogRow) {
  if (log.isBulkPackage) {
    const failed = log.failedCount || 0;
    const total = log.recipientCount || log.items?.length || 0;
    return failed ? `${total} alıcı · ${failed} başarısız` : `${total} alıcı`;
  }
  return extractRecipient(log.detail);
}

function extractProvider(detail: string | null) {
  if (!detail) return "-";
  const parts = stripPackagePrefix(detail).split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : "-";
}

function getSmsRowStatus(row: SmsLogRow) {
  if (!row.isBulkPackage) {
    return {
      tone: isFailed(row.action) ? "critical" as const : "success" as const,
      label: isFailed(row.action) ? "Başarısız" : "Başarılı",
    };
  }
  const total = row.recipientCount || row.items?.length || 0;
  const failed = row.failedCount || 0;
  if (failed === 0) return { tone: "success" as const, label: "Başarılı" };
  if (failed >= total) return { tone: "critical" as const, label: "Başarısız" };
  return { tone: "warning" as const, label: "Kısmi başarılı" };
}

function getBulkFallbackKey(log: SmsLog) {
  const date = new Date(log.createdAt);
  date.setSeconds(0, 0);
  return `eski-${date.toISOString()}`;
}

function groupSmsLogs(items: SmsLog[]): SmsLogRow[] {
  const rows: SmsLogRow[] = [];
  const bulkMap = new Map<string, SmsLog[]>();

  items.forEach((log) => {
    if (!log.action.startsWith("SMS_TOPLU")) {
      rows.push(log);
      return;
    }
    const packageId = extractPackageId(log.detail);
    const key = packageId ? `paket-${packageId}` : getBulkFallbackKey(log);
    const current = bulkMap.get(key) || [];
    current.push(log);
    bulkMap.set(key, current);
  });

  bulkMap.forEach((bulkItems, key) => {
    const ordered = [...bulkItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = ordered[0];
    const failedCount = ordered.filter((log) => isFailed(log.action)).length;
    rows.push({
      ...latest,
      id: key,
      action: failedCount === ordered.length ? "SMS_TOPLU_FAILED" : "SMS_TOPLU",
      detail: ordered.map((log) => extractRecipient(log.detail)).join(", "),
      isBulkPackage: true,
      items: ordered,
      recipientCount: ordered.length,
      failedCount,
      packageId: extractPackageId(latest.detail),
    });
  });

  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function SmsManagement({ onGoToSettings }: { onGoToSettings: () => void }) {
  const [settings, setSettings] = useState<SmsSettings>({
    smsEnabled: true,
    smsDefaultInfo: true,
    smsDefaultReminder: false,
    smsDefaultSurvey: false,
    paymentReminderSmsEnabled: false,
    paymentReminderWindowDays: 3,
    reviewLink: "",
    birthdaySmsEnabled: false,
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
        fetch("/api/logs?category=sms-delivery&limit=150"),
      ]);
      const settingsData = await settingsRes.json().catch(() => null);
      const logsData = await logsRes.json().catch(() => null);

      if (settingsData) {
        setSettings({
          smsEnabled: settingsData.smsEnabled !== undefined ? settingsData.smsEnabled : true,
          smsDefaultInfo: settingsData.smsDefaultInfo !== undefined ? settingsData.smsDefaultInfo : true,
          smsDefaultReminder: settingsData.smsDefaultReminder !== undefined ? settingsData.smsDefaultReminder : false,
          smsDefaultSurvey: settingsData.smsDefaultSurvey !== undefined ? settingsData.smsDefaultSurvey : false,
          paymentReminderSmsEnabled: settingsData.paymentReminderSmsEnabled !== undefined ? settingsData.paymentReminderSmsEnabled : false,
          paymentReminderWindowDays: settingsData.paymentReminderWindowDays || 3,
          reviewLink: settingsData.reviewLink || "",
          birthdaySmsEnabled: settingsData.birthdaySmsEnabled !== undefined ? settingsData.birthdaySmsEnabled : false,
        });
      }
      setLogs(Array.isArray(logsData?.logs) ? logsData.logs.filter((log: SmsLog) => isSmsDeliveryAction(log.action)) : []);
    } catch {
      showToast("error", "SMS kayıtları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const deliveryLogs = useMemo(() => logs.filter((log) => isSmsDeliveryAction(log.action)), [logs]);

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = deliveryLogs.filter((log) => {
      const failed = isFailed(log.action);
      if (status === "success" && failed) return false;
      if (status === "failed" && !failed) return false;
      if (!needle) return true;
      return [log.action, log.detail, formatSmsAction(log), extractRecipient(log.detail), extractProvider(log.detail)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
    return groupSmsLogs(matched);
  }, [deliveryLogs, query, status]);

  const successCount = deliveryLogs.filter((log) => !isFailed(log.action)).length;
  const failedCount = deliveryLogs.filter((log) => isFailed(log.action)).length;

  const logColumns: ListTableColumn<SmsLogRow>[] = [
    { key: "createdAt", header: "Tarih", cellClassName: "whitespace-nowrap", render: (log) => <span className="text-slate-600">{new Date(log.createdAt).toLocaleString("tr-TR")}</span> },
    { key: "action", header: "Tür", render: (log) => <span className="font-semibold text-slate-800">{formatSmsAction(log)}</span> },
    { key: "recipient", header: "İlgili Kayıt", render: (log) => <span className="text-slate-700">{extractSmsTarget(log)}</span> },
    {
      key: "status",
      header: "Durum",
      render: (log) => {
        const rowStatus = getSmsRowStatus(log);
        return <Badge tone={rowStatus.tone}>{rowStatus.label}</Badge>;
      },
    },
    {
      key: "detail",
      header: "Detay",
      cellClassName: "max-w-[420px]",
      render: (log) => (
        <span className="block truncate text-slate-500">
          {log.isBulkPackage
            ? `${log.packageId ? `Paket ${log.packageId}` : "Toplu gönderim"} · ${log.detail || "-"}`
            : extractProvider(log.detail)}
        </span>
      ),
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
          <button onClick={onGoToSettings} title="Ayarlar sekmesine git" className="transition hover:opacity-80">
            <Badge tone={settings.smsEnabled ? "success" : "critical"} size="md">
              {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
            </Badge>
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400">Toplam Kayıt</p>
          <p className="mt-1 text-xl font-black text-slate-900">{deliveryLogs.length}</p>
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

        <ListTable<SmsLogRow>
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

function SmsSettingsPanel() {
  const [settings, setSettings] = useState<SmsSettings>({
    smsEnabled: true,
    smsDefaultInfo: true,
    smsDefaultReminder: false,
    smsDefaultSurvey: false,
    paymentReminderSmsEnabled: false,
    paymentReminderWindowDays: 3,
    reviewLink: "",
    birthdaySmsEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((type: "success" | "error", text: string) => {
    showToastSafe({ message: text, type });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error();
      setSettings({
        smsEnabled: data.smsEnabled !== undefined ? data.smsEnabled : true,
        smsDefaultInfo: data.smsDefaultInfo !== undefined ? data.smsDefaultInfo : true,
        smsDefaultReminder: data.smsDefaultReminder !== undefined ? data.smsDefaultReminder : false,
        smsDefaultSurvey: data.smsDefaultSurvey !== undefined ? data.smsDefaultSurvey : false,
        paymentReminderSmsEnabled: data.paymentReminderSmsEnabled !== undefined ? data.paymentReminderSmsEnabled : false,
        paymentReminderWindowDays: data.paymentReminderWindowDays || 3,
        reviewLink: data.reviewLink || "",
        birthdaySmsEnabled: data.birthdaySmsEnabled !== undefined ? data.birthdaySmsEnabled : false,
      });
    } catch {
      showToast("error", "SMS ayarları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      showToast("success", "SMS ayarları kaydedildi");
    } catch {
      showToast("error", "SMS ayarları kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const toggleItems: { key: keyof Pick<SmsSettings, "smsEnabled" | "smsDefaultInfo" | "smsDefaultReminder" | "smsDefaultSurvey" | "paymentReminderSmsEnabled" | "birthdaySmsEnabled">; label: string; hint: string }[] = [
    { key: "smsEnabled", label: "SMS gönderimi aktif", hint: "Kapalıysa otomatik ve manuel SMS gönderimleri durdurulur." },
    { key: "smsDefaultInfo", label: "Randevu bilgilendirme varsayılan açık", hint: "Yeni randevu oluştururken bilgilendirme seçeneği otomatik işaretlenir." },
    { key: "smsDefaultReminder", label: "Randevu hatırlatma varsayılan açık", hint: "Yeni randevularda hatırlatma görevi otomatik planlanır." },
    { key: "smsDefaultSurvey", label: "Değerlendirme SMS'i varsayılan açık", hint: "Randevu sonrası değerlendirme mesajı akışını varsayılan açar." },
    { key: "paymentReminderSmsEnabled", label: "Ödeme hatırlatmaları aktif", hint: "Vadesi yaklaşan veya geciken ödemelerde otomatik SMS akışı kullanılır." },
    { key: "birthdaySmsEnabled", label: "Doğum günü mesajları aktif", hint: "Doğum günü olan hastalara otomatik kutlama mesajı gönderilir." },
  ];

  return (
    <section className="space-y-4" aria-busy={loading}>
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">SMS Ayarları</h1>
            <p className="mt-1 text-sm text-slate-500">SMS gönderim tercihleri, otomatik mesajlar ve değerlendirme bağlantısı.</p>
          </div>
          <Badge tone={settings.smsEnabled ? "success" : "critical"} size="md">
            {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
          </Badge>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-2">
          {toggleItems.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 transition hover:border-primary/30 hover:bg-white"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={Boolean(settings[item.key])}
                onChange={(event) => setSettings({ ...settings, [item.key]: event.target.checked })}
              />
              <span>
                <span className="block text-sm font-bold text-slate-800">{item.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Ödeme Hatırlatması — Vadeden Kaç Gün Önce" hint="1-30 gün arası değer girilebilir.">
            <input
              type="number"
              min={1}
              max={30}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={settings.paymentReminderWindowDays}
              onChange={(event) => setSettings({
                ...settings,
                paymentReminderWindowDays: Math.max(1, Math.min(30, parseInt(event.target.value) || 1)),
              })}
            />
          </FormField>
          <FormField label="Değerlendirme Bağlantısı" hint="Google yorum linki gibi bir bağlantı; SMS şablonunda [Değerlendirme Bağlantısı] etiketiyle kullanılır.">
            <input
              type="url"
              placeholder="https://g.page/r/..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={settings.reviewLink}
              onChange={(event) => setSettings({ ...settings, reviewLink: event.target.value })}
            />
          </FormField>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => void load()} disabled={saving}>
          Yenile
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={saving}>
          Kaydet
        </Button>
      </div>
    </section>
  );
}

export default function SmsPage() {
  const [tab, setTab] = useState<"kayitlar" | "ayarlar" | "sablonlar" | "toplu">("kayitlar");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "kayitlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("kayitlar")}>
          Kayıtlar
        </Button>
        <Button variant={tab === "ayarlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("ayarlar")}>
          Ayarlar
        </Button>
        <Button variant={tab === "sablonlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("sablonlar")}>
          Şablonlar
        </Button>
        <Button variant={tab === "toplu" ? "primary" : "secondary"} size="sm" onClick={() => setTab("toplu")}>
          Toplu Gönderim
        </Button>
      </div>
      {/* Sekmeler DOM'dan tamamen kaldırılmak yerine gizleniyor — özellikle Toplu
          Gönderim'deki seçili hasta listesi gibi girilmiş verinin, kullanıcı
          başka bir sekmeye bakıp geri döndüğünde kaybolmaması için. */}
      <div className={tab === "kayitlar" ? "" : "hidden"}><SmsManagement onGoToSettings={() => setTab("ayarlar")} /></div>
      <div className={tab === "ayarlar" ? "" : "hidden"}><SmsSettingsPanel /></div>
      <div className={tab === "toplu" ? "" : "hidden"}><BulkSendTab /></div>
      <div className={tab === "sablonlar" ? "" : "hidden"}><TemplatesTab /></div>
    </div>
  );
}
