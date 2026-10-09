"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { CountUp } from "@/components/ui/CountUp";
import { CheckCircle2, XCircle, TriangleAlert, CircleDashed, MessageCircle, Smartphone, CalendarClock } from "lucide-react";
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
import { usePermissions } from "@/components/auth/PermissionProvider";

type SmsTab = "kayitlar" | "whatsapp" | "baglanti" | "ayarlar" | "sablonlar" | "kutlama-gunleri" | "toplu";

type SmsSettings = {
  smsEnabled: boolean;
  paymentReminderSmsEnabled: boolean;
  paymentReminderWindowDays: number;
  paymentReminderDaysBefore: number[];
  paymentReminderOnDueDate: boolean;
  paymentReminderOverdueEnabled: boolean;
  paymentReminderOverdueEveryDays: number;
  defaultNotificationChannel: "SMS" | "WHATSAPP";
  whatsappSmsFallback: boolean;
  reviewLink: string;
  birthdaySmsEnabled: boolean;
  institutionName: string;
  appUrl: string;
};

const DEFAULT_SMS_SETTINGS: SmsSettings = {
  smsEnabled: true,
  paymentReminderSmsEnabled: false,
  paymentReminderWindowDays: 3,
  paymentReminderDaysBefore: [3],
  paymentReminderOnDueDate: true,
  paymentReminderOverdueEnabled: true,
  paymentReminderOverdueEveryDays: 3,
  defaultNotificationChannel: "SMS",
  whatsappSmsFallback: true,
  reviewLink: "",
  birthdaySmsEnabled: false,
  institutionName: "",
  appUrl: "",
};

function parseSmsSettings(data: Record<string, unknown> | null): SmsSettings {
  return {
    smsEnabled: data?.smsEnabled !== undefined ? Boolean(data.smsEnabled) : true,
    paymentReminderSmsEnabled: Boolean(data?.paymentReminderSmsEnabled),
    paymentReminderWindowDays: Number(data?.paymentReminderWindowDays) || 3,
    paymentReminderDaysBefore: Array.isArray(data?.paymentReminderDaysBefore)
      ? data.paymentReminderDaysBefore.map(Number).filter((day) => day >= 1 && day <= 30)
      : [Number(data?.paymentReminderWindowDays) || 3],
    paymentReminderOnDueDate: data?.paymentReminderOnDueDate !== false,
    paymentReminderOverdueEnabled: data?.paymentReminderOverdueEnabled !== false,
    paymentReminderOverdueEveryDays: Number(data?.paymentReminderOverdueEveryDays) || 3,
    defaultNotificationChannel: data?.defaultNotificationChannel === "WHATSAPP" ? "WHATSAPP" : "SMS",
    whatsappSmsFallback: data?.whatsappSmsFallback !== false,
    reviewLink: typeof data?.reviewLink === "string" ? data.reviewLink : "",
    birthdaySmsEnabled: Boolean(data?.birthdaySmsEnabled),
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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/sms/consent-summary")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || "SMS izin özeti yüklenemedi.");
        return data;
      })
      .then((d) => {
        setSummary(d?.summary || null);
        setLoadError(false);
      })
      .catch(() => {
        setSummary(null);
        setLoadError(true);
      })
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
            <span className="block text-lg font-black text-slate-900">{loading ? "…" : loadError ? "—" : (summary?.[item.key] ?? 0)}</span>
            <span className="mt-0.5 block text-[11px] font-bold uppercase text-slate-500">{item.label}</span>
          </a>
        ))}
      </div>
      {loadError && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">SMS izin özeti yüklenemedi. Sayfayı yenileyerek tekrar deneyin.</p>}
    </div>
  );
}

function SmsManagement({ onGoToSettings, canManage }: { onGoToSettings: () => void; canManage: boolean }) {
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
        canManage ? fetch("/api/settings") : Promise.resolve(null),
        fetch("/api/logs?category=sms-delivery&limit=150"),
      ]);
      const settingsData = settingsRes ? await settingsRes.json().catch(() => null) : null;
      const logsData = await logsRes.json().catch(() => null);

      if (!logsRes.ok) throw new Error("SMS kayıtları yüklenemedi");
      if (settingsData) setSettings(parseSmsSettings(settingsData));
      setLogs(Array.isArray(logsData?.logs) ? logsData.logs.filter((log: SmsLog) => isSmsDeliveryAction(log.action)) : []);
    } catch {
      showToast("error", "SMS kayıtları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

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
        actions={canManage ? (
          <button onClick={onGoToSettings} title="Otomasyonlar sekmesine git" className="transition hover:opacity-80">
            <Badge tone={settings.smsEnabled ? "success" : "critical"} icon={settings.smsEnabled ? CheckCircle2 : XCircle} size="md">
              {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
            </Badge>
          </button>
        ) : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatsCard icon={CircleDashed} label="Toplam Kayıt" value={<CountUp value={deliveryLogs.length} />} tone="neutral" description="Son 150 hareket" />
        <StatsCard icon={CheckCircle2} label="Başarılı" value={<CountUp value={successCount} />} tone="success" description="Teslim edilen kayıt" />
        <StatsCard icon={XCircle} label="Başarısız" value={<CountUp value={failedCount} />} tone={failedCount > 0 ? "critical" : "neutral"} badge={failedCount > 0 ? "Kontrol" : undefined} description="Aksiyon bekleyen" />
      </div>

      <ConsentSummaryCard />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <input aria-label={"Hasta, telefon, SMS türü veya detay ara..."}
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

function SmsSettingsPanel({
  onGoToRecords,
  whatsappAvailable,
}: {
  onGoToRecords: () => void;
  whatsappAvailable: boolean;
}) {
  const [settings, setSettings] = useState<SmsSettings>(DEFAULT_SMS_SETTINGS);
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
    } catch {
      showToast("error", "İletişim ayarları yüklenemedi");
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
      showToast("success", "İletişim otomasyonları kaydedildi");
    } catch {
      showToast("error", "İletişim ayarları kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const toggleItems: { key: keyof Pick<SmsSettings, "smsEnabled" | "paymentReminderSmsEnabled" | "birthdaySmsEnabled">; label: string; hint: string }[] = [
    { key: "smsEnabled", label: "SMS sistemi aktif", hint: "Kapalıysa otomatik ve manuel bütün SMS gönderimleri durdurulur." },
    { key: "paymentReminderSmsEnabled", label: "Ödeme hatırlatma ayarları aktif", hint: "Vadesi yaklaşan veya geciken taksitlerde otomatik hatırlatma gönderilir." },
    { key: "birthdaySmsEnabled", label: "Doğum günü ayarları aktif", hint: "Doğum günü olan hastalara otomatik kutlama mesajı gönderilir. Meslek günü/resmi bayram gibi diğer kutlamalar ayrı ayrı Kutlama Günleri sekmesinden açılır." },
  ];

  const previewMessage = SMS_CONSENT_MESSAGE_TEMPLATE
    .replace("{{institutionName}}", settings.institutionName || "Kliniğiniz")
    .replace("{{link}}", `${settings.appUrl || "https://uygulamanız.com"}/sms-onay/xxxxxxxx`);

  return (
    <section className="space-y-4" aria-busy={loading}>
      <PageHeader
        icon="settings"
        title="İletişim Otomasyonları"
        description="SMS ve WhatsApp için ortak kanal, zamanlama ve otomatik gönderim kurallarını yönetin."
        actions={(
          <Badge tone={settings.smsEnabled ? "success" : "critical"} icon={settings.smsEnabled ? CheckCircle2 : XCircle} size="md">
            {settings.smsEnabled ? "SMS aktif" : "SMS pasif"}
          </Badge>
        )}
      />

      <div className="ui-surface p-4">
        <div className="mb-3 flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /><h2 className="text-sm font-black text-slate-900">Kanal önceliği</h2></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["SMS", "Önce SMS", "Uygun gönderimler SMS üzerinden iletilir.", Smartphone],
            ["WHATSAPP", "Önce WhatsApp", "Hasta izni ve bağlantı uygunsa WhatsApp kullanılır.", MessageCircle],
          ] as const).map(([value, title, description, Icon]) => (
            <button key={value} type="button" disabled={value === "WHATSAPP" && !whatsappAvailable}
              onClick={() => setSettings({ ...settings, defaultNotificationChannel: value })}
              className={`flex min-h-[82px] items-start gap-3 rounded-lg border p-3 text-left transition ${settings.defaultNotificationChannel === value ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 hover:border-slate-300"} disabled:cursor-not-allowed disabled:opacity-40`}>
              <Icon className="mt-0.5 h-5 w-5 text-primary" /><span><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
            </button>
          ))}
        </div>
        {whatsappAvailable && settings.defaultNotificationChannel === "WHATSAPP" && (
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 border-t border-slate-100 pt-3">
            <span><span className="block text-sm font-bold text-slate-800">WhatsApp başarısızsa SMS dene</span><span className="block text-xs text-slate-500">Mesajın kaybolmaması için izin ve bakiye uygunsa otomatik yedek kanal kullanılır.</span></span>
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={settings.whatsappSmsFallback} onChange={(event) => setSettings({ ...settings, whatsappSmsFallback: event.target.checked })} />
          </label>
        )}
      </div>

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
            <Badge tone="critical" size="sm">Onay bağlantısı henüz kullanıma hazır değil</Badge>
          )}
        </div>
      </div>

      <div className="ui-surface p-4">
        <div className="mb-4 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-600" /><div><h2 className="text-sm font-black text-slate-900">Ödeme hatırlatma takvimi</h2><p className="text-xs text-slate-500">Birden fazla zaman seçilebilir; aynı taksit aynı gün içinde yalnızca bir kez işlenir.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Vadeden önce" hint="Hatırlatma gönderilecek günleri seçin.">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5, 7, 14].map((day) => {
                const active = settings.paymentReminderDaysBefore.includes(day);
                return <button key={day} type="button" aria-pressed={active} onClick={() => setSettings({ ...settings, paymentReminderDaysBefore: active ? settings.paymentReminderDaysBefore.filter((item) => item !== day) : [...settings.paymentReminderDaysBefore, day].sort((a, b) => a - b) })} className={`min-w-12 rounded-md border px-3 py-2 text-sm font-bold transition ${active ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:border-primary/40"}`}>{day} gün</button>;
              })}
            </div>
          </FormField>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><span className="text-sm font-bold text-slate-800">Ödeme gününde hatırlat</span><input type="checkbox" className="h-5 w-5 accent-primary" checked={settings.paymentReminderOnDueDate} onChange={(event) => setSettings({ ...settings, paymentReminderOnDueDate: event.target.checked })} /></label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><span><span className="block text-sm font-bold text-slate-800">Geciken ödemeleri tekrarla</span><span className="block text-xs text-slate-500">Belirlediğiniz aralıkta yeniden gönderilir.</span></span><input type="checkbox" className="h-5 w-5 accent-primary" checked={settings.paymentReminderOverdueEnabled} onChange={(event) => setSettings({ ...settings, paymentReminderOverdueEnabled: event.target.checked })} /></label>
            {settings.paymentReminderOverdueEnabled && <FormField label="Gecikmede tekrar aralığı"><div className="flex items-center gap-2"><input type="number" min={1} max={30} className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={settings.paymentReminderOverdueEveryDays} onChange={(event) => setSettings({ ...settings, paymentReminderOverdueEveryDays: Math.max(1, Math.min(30, Number(event.target.value) || 1)) })} /><span className="text-sm text-slate-600">günde bir</span></div></FormField>}
          </div>
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
          <li><strong className="font-bold text-slate-700">SMS bakiyesi yetersiz</strong> — kurumun SMS kredisi tükenmiş, sistem yöneticinizden paket satın alınmalı.</li>
          <li><strong className="font-bold text-slate-700">Kurum SMS gönderimini kapatmış</strong> — yukarıdaki &quot;SMS sistemi aktif&quot; anahtarı kapalı.</li>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, hasFeature, role } = usePermissions();
  const [tab, setTab] = useState<SmsTab>("kayitlar");
  const [mountedTabs, setMountedTabs] = useState<Set<SmsTab>>(() => new Set(["kayitlar"]));
  const whatsappEnabled = hasFeature("whatsapp");
  const canReadSms = can("sms:read");
  const canWriteSms = can("sms:write");
  const canReadWhatsapp = whatsappEnabled && can("whatsapp:read");
  const canWriteWhatsapp = whatsappEnabled && can("whatsapp:write");
  const canManageWhatsappConnection = canWriteWhatsapp && (role === "YONETICI" || role === "SUPERADMIN");
  const canWriteCommunication = canWriteSms || canWriteWhatsapp;
  const canManageAutomations = canWriteSms && can("settings:read") && can("settings:write");
  const canBulkSend = can("sms:bulk");

  const activateTab = useCallback((nextTab: SmsTab) => {
    setMountedTabs((current) => {
      if (current.has(nextTab)) return current;
      const next = new Set(current);
      next.add(nextTab);
      return next;
    });
    setTab(nextTab);
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "baglanti" && canManageWhatsappConnection) activateTab("baglanti");
    else if (requestedTab === "whatsapp" && canReadWhatsapp) activateTab("whatsapp");
    else if (requestedTab === "kayitlar" && canReadSms) activateTab("kayitlar");
    else if (requestedTab === "ayarlar" && canManageAutomations) activateTab("ayarlar");
    else if (requestedTab === "toplu" && canBulkSend) activateTab("toplu");
    else if (requestedTab === "sablonlar" || requestedTab === "kutlama-gunleri") activateTab(requestedTab);
  }, [activateTab, canBulkSend, canManageAutomations, canManageWhatsappConnection, canReadSms, canReadWhatsapp, searchParams]);

  useEffect(() => {
    const unavailable = (tab === "kayitlar" && !canReadSms)
      || (tab === "ayarlar" && !canManageAutomations)
      || (tab === "whatsapp" && !canReadWhatsapp)
      || (tab === "baglanti" && !canManageWhatsappConnection)
      || (tab === "toplu" && !canBulkSend);
    if (!unavailable) return;
    activateTab(canReadSms ? "kayitlar" : canReadWhatsapp ? "whatsapp" : "sablonlar");
  }, [activateTab, canBulkSend, canManageAutomations, canManageWhatsappConnection, canReadSms, canReadWhatsapp, tab]);

  return (
    <div className="space-y-4">
      <div className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-slate-100/80 p-1" role="tablist">
        {([
          ...(canReadSms ? [{ key: "kayitlar" as const, label: "Kayıtlar" }] : []),
          ...(canManageAutomations ? [{ key: "ayarlar" as const, label: "Otomasyonlar" }] : []),
          ...(canReadWhatsapp ? [
            { key: "whatsapp" as const, label: "Görüşmeler" },
          ] : []),
          ...(canManageWhatsappConnection ? [{ key: "baglanti" as const, label: "WhatsApp Bağlantısı" }] : []),
          { key: "sablonlar" as const, label: "Şablonlar" },
          { key: "kutlama-gunleri" as const, label: "Kutlama Günleri" },
          ...(canBulkSend ? [{ key: "toplu" as const, label: "Toplu Gönderim" }] : []),
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              activateTab(t.key);
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", t.key);
              router.replace(`/sms?${params.toString()}`, { scroll: false });
            }}
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
      {canReadSms && mountedTabs.has("kayitlar") && <div className={tab === "kayitlar" ? "" : "hidden"}><SmsManagement canManage={canManageAutomations} onGoToSettings={() => activateTab("ayarlar")} /></div>}
      {canManageAutomations && mountedTabs.has("ayarlar") && <div className={tab === "ayarlar" ? "" : "hidden"}><SmsSettingsPanel whatsappAvailable={canWriteWhatsapp} onGoToRecords={() => activateTab("kayitlar")} /></div>}
      {canReadWhatsapp && mountedTabs.has("whatsapp") && <div className={tab === "whatsapp" ? "" : "hidden"}><WhatsappMessagesTab /></div>}
      {canManageWhatsappConnection && mountedTabs.has("baglanti") && <div className={tab === "baglanti" ? "" : "hidden"}><WhatsappSettingsTab connectionOnly /></div>}
      {canBulkSend && mountedTabs.has("toplu") && <div className={tab === "toplu" ? "" : "hidden"}><BulkSendTab /></div>}
      {mountedTabs.has("sablonlar") && <div className={tab === "sablonlar" ? "" : "hidden"}><TemplatesTab readOnly={!canWriteCommunication} /></div>}
      {mountedTabs.has("kutlama-gunleri") && <div className={tab === "kutlama-gunleri" ? "" : "hidden"}><CelebrationDaysTab readOnly={!canWriteCommunication} /></div>}
    </div>
  );
}
