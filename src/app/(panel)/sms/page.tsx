"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { CountUp } from "@/components/ui/CountUp";
import { CheckCircle2, XCircle, TriangleAlert, CircleDashed } from "lucide-react";
import type { BadgeTone } from "@/components/ui/Badge";

const TONE_ICON: Record<BadgeTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  critical: XCircle,
  warning: TriangleAlert,
  info: CircleDashed,
  neutral: CircleDashed,
};

const SmsEmptyIcon = createSceneIllustration("sms");
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsCard } from "@/components/ui/Premium";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { FormField } from "@/components/ui/FormField";
import { getAuditActionLabel } from "@/lib/audit-labels";
import { SMS_CONSENT_MESSAGE_TEMPLATE } from "@/lib/sms-consent-copy";
import BulkSendTab from "./_tabs/BulkSendTab";
import TemplatesTab from "./_tabs/TemplatesTab";
import CelebrationDaysTab from "./_tabs/CelebrationDaysTab";
import WhatsappMessagesTab from "./_tabs/WhatsappMessagesTab";
import WhatsappSettingsTab from "./_tabs/WhatsappSettingsTab";

type SmsSettings = {
  smsEnabled: boolean;
  paymentReminderSmsEnabled: boolean;
  paymentReminderWindowDays: number;
  reviewLink: string;
  birthdaySmsEnabled: boolean;
  defaultNotificationChannel: "SMS" | "WHATSAPP";
  whatsappEnabled: boolean;
  institutionName: string;
  appUrl: string;
};

const DEFAULT_SMS_SETTINGS: SmsSettings = {
  smsEnabled: true,
  paymentReminderSmsEnabled: false,
  paymentReminderWindowDays: 3,
  reviewLink: "",
  birthdaySmsEnabled: false,
  defaultNotificationChannel: "SMS",
  whatsappEnabled: false,
  institutionName: "",
  appUrl: "",
};

function parseSmsSettings(data: Record<string, unknown> | null): SmsSettings {
  return {
    smsEnabled: data?.smsEnabled !== undefined ? Boolean(data.smsEnabled) : true,
    paymentReminderSmsEnabled: Boolean(data?.paymentReminderSmsEnabled),
    paymentReminderWindowDays: Number(data?.paymentReminderWindowDays) || 3,
    reviewLink: typeof data?.reviewLink === "string" ? data.reviewLink : "",
    birthdaySmsEnabled: Boolean(data?.birthdaySmsEnabled),
    defaultNotificationChannel: data?.defaultNotificationChannel === "WHATSAPP" ? "WHATSAPP" : "SMS",
    whatsappEnabled: Boolean(data?.whatsappEnabled),
    institutionName: typeof data?.institutionName === "string" ? data.institutionName : "",
    appUrl: typeof data?.appUrl === "string" ? data.appUrl : "",
  };
}

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

type ConsentSummary = { ENABLED: number; DISABLED: number; PENDING: number; EXPIRED: number; SEND_FAILED: number };

const CONSENT_SUMMARY_ITEMS: { key: keyof ConsentSummary; label: string; tone: "success" | "warning" | "neutral" | "critical" }[] = [
  { key: "ENABLED", label: "Onaylandı", tone: "success" },
  { key: "PENDING", label: "Onay Bekliyor", tone: "warning" },
  { key: "DISABLED", label: "Reddedildi", tone: "neutral" },
  { key: "EXPIRED", label: "Süresi Doldu", tone: "critical" },
  { key: "SEND_FAILED", label: "İzin SMS'i Gönderilemedi", tone: "critical" },
];

function ConsentSummaryCard() {
  const [summary, setSummary] = useState<ConsentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sms/consent-summary")
      .then((r) => r.json())
      .then((d) => setSummary(d?.summary || null))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ui-surface p-4">
      <div className="mb-3">
        <h3 className="text-sm font-black text-slate-900">SMS İzin Durumu Özeti</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Bir sayıya tıklayarak o durumdaki hastaları Hastalar listesinde görebilirsiniz. Toplu yeniden
          gönderim burada yapılmaz — tekrar gönderim hasta kartından, tek tek yapılır.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CONSENT_SUMMARY_ITEMS.map((item) => (
          <a
            key={item.key}
            href={`/hasta?smsConsent=${item.key}`}
            className="ui-interactive rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-center hover:border-primary/30 hover:bg-white"
          >
            <span className="block text-lg font-black text-slate-900">{loading ? "…" : (summary?.[item.key] ?? 0)}</span>
            <span className="mt-0.5 block text-[11px] font-bold uppercase text-slate-500">{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function SmsManagement({ onGoToSettings }: { onGoToSettings: () => void }) {
  const [settings, setSettings] = useState<SmsSettings>(DEFAULT_SMS_SETTINGS);
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

      if (settingsData) setSettings(parseSmsSettings(settingsData));
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
        return <Badge tone={rowStatus.tone} icon={TONE_ICON[rowStatus.tone]} className={rowStatus.tone === "critical" ? "ui-badge-pulse" : ""}>{rowStatus.label}</Badge>;
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
      <PageHeader
        icon="sms"
        title="SMS Kayıtları"
        description="Gönderim hareketlerini, izin durumlarını ve başarısız denemeleri tek yerden izleyin."
        actions={(
          <button onClick={onGoToSettings} title="Ayarlar sekmesine git" className="transition hover:opacity-80">
            <Badge tone={settings.smsEnabled ? "success" : "critical"} icon={settings.smsEnabled ? CheckCircle2 : XCircle} size="md">
              {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
            </Badge>
          </button>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatsCard icon={CircleDashed} label="Toplam Kayıt" value={<CountUp value={deliveryLogs.length} />} tone="neutral" description="Son 150 hareket" />
        <StatsCard icon={CheckCircle2} label="Başarılı" value={<CountUp value={successCount} />} tone="success" description="Teslim edilen kayıt" />
        <StatsCard icon={XCircle} label="Başarısız" value={<CountUp value={failedCount} />} tone={failedCount > 0 ? "critical" : "neutral"} badge={failedCount > 0 ? "Kontrol" : undefined} description="Aksiyon bekleyen" />
      </div>

      <ConsentSummaryCard />

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
          emptyAccent="emerald"
          emptyIcon={SmsEmptyIcon} emptyIllustrative
        />
      </div>
    </section>
  );
}

type WhatsappProviderStatus = "DISABLED" | "NO_PROVIDER" | "INACTIVE" | "ACTIVE";

function SmsSettingsPanel({ onGoToWhatsappSettings, onGoToRecords }: { onGoToWhatsappSettings: () => void; onGoToRecords: () => void }) {
  const [settings, setSettings] = useState<SmsSettings>(DEFAULT_SMS_SETTINGS);
  const [waStatus, setWaStatus] = useState<WhatsappProviderStatus>("DISABLED");
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
      const parsed = parseSmsSettings(data);
      setSettings(parsed);

      if (parsed.whatsappEnabled) {
        const providerRes = await fetch("/api/whatsapp/provider");
        const providerData = await providerRes.json().catch(() => null);
        if (!providerData?.provider) setWaStatus("NO_PROVIDER");
        else setWaStatus(providerData.provider.isActive ? "ACTIVE" : "INACTIVE");
      } else {
        setWaStatus("DISABLED");
      }
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

  const toggleItems: { key: keyof Pick<SmsSettings, "smsEnabled" | "paymentReminderSmsEnabled" | "birthdaySmsEnabled">; label: string; hint: string }[] = [
    { key: "smsEnabled", label: "SMS sistemi aktif", hint: "Kapalıysa otomatik ve manuel bütün SMS gönderimleri durdurulur (WhatsApp bundan etkilenmez)." },
    { key: "paymentReminderSmsEnabled", label: "Ödeme hatırlatma ayarları aktif", hint: "Vadesi yaklaşan veya geciken taksitlerde otomatik hatırlatma gönderilir." },
    { key: "birthdaySmsEnabled", label: "Doğum günü ayarları aktif", hint: "Doğum günü olan hastalara otomatik kutlama mesajı gönderilir. Meslek günü/resmi bayram gibi diğer kutlamalar ayrı ayrı Kutlama Günleri sekmesinden açılır." },
  ];

  const waStatusBadge: Record<WhatsappProviderStatus, { tone: "success" | "warning" | "neutral" | "critical"; label: string }> = {
    DISABLED: { tone: "neutral", label: "Kapalı" },
    NO_PROVIDER: { tone: "warning", label: "Açık, bağlantı tanımlı değil" },
    INACTIVE: { tone: "warning", label: "Açık, bağlantı pasif" },
    ACTIVE: { tone: "success", label: "Açık ve aktif" },
  };

  const previewMessage = SMS_CONSENT_MESSAGE_TEMPLATE
    .replace("{{institutionName}}", settings.institutionName || "Kliniğiniz")
    .replace("{{link}}", `${settings.appUrl || "https://uygulamanız.com"}/sms-onay/xxxxxxxx`);

  return (
    <section className="space-y-4" aria-busy={loading}>
      <PageHeader
        icon="settings"
        title="SMS Ayarları"
        description="Gönderim tercihleri, izin akışı ve WhatsApp bağlantı durumunu yönetin."
        actions={(
          <Badge tone={settings.smsEnabled ? "success" : "critical"} icon={settings.smsEnabled ? CheckCircle2 : XCircle} size="md">
            {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
          </Badge>
        )}
      />

      <div className="ui-surface p-4">
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
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          <strong className="font-bold text-slate-600">Randevu bilgilendirme, hatırlatma ve değerlendirme SMS&apos;leri</strong> kurum
          genelinde bir varsayılana bağlı değildir — personel bunları her randevu için ayrı ayrı işaretler
          (Randevu ekranındaki SMS onay kutuları). Buradaki ayarlar yalnızca ödeme hatırlatma ve doğum
          günü/özel gün gibi otomatik taramaları kapsar.
        </p>
      </div>

      <div className="ui-surface p-4">
        <p className="mb-1 text-sm font-bold text-slate-800">SMS Onay Metni Önizlemesi</p>
        <p className="mb-3 text-xs text-slate-500">
          Bu metin sabittir, klinikler değiştiremez — yalnızca klinik adı ve bağlantı otomatik doldurulur.
          Hasta oluşturulduğunda otomatik gönderilir.
        </p>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-700">
          {previewMessage}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Onay bağlantısının çalışma durumu:</span>
          {settings.appUrl ? (
            <Badge tone="success" size="sm">Yapılandırıldı ({settings.appUrl})</Badge>
          ) : (
            <Badge tone="critical" size="sm">APP_URL tanımlı değil — bağlantılar çalışmaz</Badge>
          )}
        </div>
      </div>

      {settings.whatsappEnabled && (
        <div className="ui-surface p-4">
          <p className="mb-3 text-sm font-bold text-slate-800">Varsayılan Bildirim Kanalı</p>
          <p className="mb-3 text-xs text-slate-500">
            Randevu oluşturma, hatırlatma, ödeme hatırlatma ve değerlendirme
            SMS&apos;lerinin hangi kanaldan gideceğini belirler. WhatsApp seçiliyken, WhatsApp izni
            olmayan hastalar için otomatik olarak SMS&apos;e düşülür.
          </p>
          <div className="flex flex-wrap gap-3">
            {(["SMS", "WHATSAPP"] as const).map((channel) => (
              <label
                key={channel}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                  settings.defaultNotificationChannel === channel
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="defaultNotificationChannel"
                  className="h-4 w-4 accent-primary"
                  checked={settings.defaultNotificationChannel === channel}
                  onChange={() => setSettings({ ...settings, defaultNotificationChannel: channel })}
                />
                {channel === "SMS" ? "SMS" : "WhatsApp"}
              </label>
            ))}
          </div>
        </div>
      )}

      {settings.whatsappEnabled && (
        <div className="ui-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800">WhatsApp Bağlantı Durumu</p>
              <p className="mt-0.5 text-xs text-slate-500">Sağlayıcı bağlantı testi ve tam ayarlar WhatsApp Ayarları sekmesindedir.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={waStatusBadge[waStatus].tone} icon={TONE_ICON[waStatusBadge[waStatus].tone]} size="md">{waStatusBadge[waStatus].label}</Badge>
              <Button variant="secondary" size="sm" onClick={onGoToWhatsappSettings}>
                {waStatus === "ACTIVE" ? "Bağlantıyı Yönet / Test Et" : "WhatsApp Ayarlarına Git"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="ui-surface p-4">
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

      <div className="ui-surface p-4">
        <p className="mb-2 text-sm font-bold text-slate-800">Gönderim Başarısızlıklarının Açıklaması</p>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li><strong className="font-bold text-slate-700">Hastanın SMS iletişim izni bulunmuyor</strong> — hasta henüz ONAYLIYORUM dememiş, reddetmiş ya da izin bağlantısı hiç gönderilememiş.</li>
          <li><strong className="font-bold text-slate-700">SMS bakiyesi yetersiz</strong> — kurumun SMS kredisi tükenmiş, Süperadmin&apos;den paket satın alınmalı.</li>
          <li><strong className="font-bold text-slate-700">Kurum SMS gönderimini kapatmış</strong> — yukarıdaki &quot;SMS sistemi aktif&quot; anahtarı kapalı.</li>
          <li><strong className="font-bold text-slate-700">WhatsApp denendi, başarısız oldu</strong> — sağlayıcı tanımlı değil/pasif ya da bağlantı hatası; sistem otomatik olarak SMS&apos;e düşer, bu düşüş kayıtta belirtilir.</li>
          <li>Geçersiz telefon numarası içeren gönderimler sağlayıcı tarafından reddedilir ve kayıtlarda hata mesajıyla görünür.</li>
        </ul>
        <button
          type="button"
          onClick={onGoToRecords}
          className="mt-2 text-xs font-bold text-primary hover:underline"
        >
          Detaylı kayıtlar için Kayıtlar sekmesine bakın →
        </button>
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
  type SmsTab = "kayitlar" | "whatsapp" | "whatsapp-ayarlar" | "ayarlar" | "sablonlar" | "kutlama-gunleri" | "toplu";
  const [tab, setTab] = useState<SmsTab>("kayitlar");
  const [mountedTabs, setMountedTabs] = useState<Set<SmsTab>>(() => new Set(["kayitlar"]));
  // WhatsApp sekmeleri, SuperAdmin kliniğe modülü açmadıkça hiç görünmez —
  // yalnızca "kapalı" bir ekran göstermek bile yanıltıcıydı: personel var
  // olmayan bir özelliğe tıklayıp boş/işlevsiz bir sekmeyle karşılaşıyordu
  // (bkz. kullanıcı geri bildirimi). null = henüz yüklenmedi (sekmeler
  // yanıp sönmesin diye bu sırada da gösterilmez).
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setWhatsappEnabled(Boolean(d?.whatsappEnabled)))
      .catch(() => setWhatsappEnabled(false));
  }, []);

  const activateTab = useCallback((nextTab: SmsTab) => {
    setMountedTabs((current) => {
      if (current.has(nextTab)) return current;
      const next = new Set(current);
      next.add(nextTab);
      return next;
    });
    setTab(nextTab);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-slate-100/80 p-1" role="tablist">
        {([
          { key: "kayitlar" as const, label: "Kayıtlar" },
          { key: "ayarlar" as const, label: "Ayarlar" },
          ...(whatsappEnabled ? [
            { key: "whatsapp" as const, label: "WhatsApp" },
            { key: "whatsapp-ayarlar" as const, label: "WhatsApp Ayarları" },
          ] : []),
          { key: "sablonlar" as const, label: "Şablonlar" },
          { key: "kutlama-gunleri" as const, label: "Kutlama Günleri" },
          { key: "toplu" as const, label: "Toplu Gönderim" },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => activateTab(t.key)}
            className={`ui-view-tab shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              tab === t.key ? "is-active bg-white text-primary shadow-[0_1px_3px_rgb(15_23_42/0.12)]" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Sekmeler DOM'dan tamamen kaldırılmak yerine gizleniyor — özellikle Toplu
          Gönderim'deki seçili hasta listesi gibi girilmiş verinin, kullanıcı
          başka bir sekmeye bakıp geri döndüğünde kaybolmaması için. */}
      {mountedTabs.has("kayitlar") && <div className={tab === "kayitlar" ? "" : "hidden"}><SmsManagement onGoToSettings={() => activateTab("ayarlar")} /></div>}
      {mountedTabs.has("ayarlar") && <div className={tab === "ayarlar" ? "" : "hidden"}><SmsSettingsPanel onGoToWhatsappSettings={() => activateTab("whatsapp-ayarlar")} onGoToRecords={() => activateTab("kayitlar")} /></div>}
      {whatsappEnabled && mountedTabs.has("whatsapp") && <div className={tab === "whatsapp" ? "" : "hidden"}><WhatsappMessagesTab /></div>}
      {whatsappEnabled && mountedTabs.has("whatsapp-ayarlar") && <div className={tab === "whatsapp-ayarlar" ? "" : "hidden"}><WhatsappSettingsTab /></div>}
      {mountedTabs.has("toplu") && <div className={tab === "toplu" ? "" : "hidden"}><BulkSendTab /></div>}
      {mountedTabs.has("sablonlar") && <div className={tab === "sablonlar" ? "" : "hidden"}><TemplatesTab /></div>}
      {mountedTabs.has("kutlama-gunleri") && <div className={tab === "kutlama-gunleri" ? "" : "hidden"}><CelebrationDaysTab /></div>}
    </div>
  );
}
