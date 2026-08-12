"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, Clock3, MessageCircle, RefreshCw, Unplug } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";

type Row = {
  institutionId: string;
  institutionName: string;
  institutionActive: boolean;
  providerId: string | null;
  connectionStatus: "NOT_CONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  connectedAt: string | null;
  lastSuccessfulSendAt: string | null;
  lastWebhookAt: string | null;
  updatedAt: string | null;
};

type PlatformStatus = { ready: boolean; missing: string[] };

const statusMap: Record<Row["connectionStatus"], { label: string; tone: BadgeTone; icon: typeof Clock3 }> = {
  NOT_CONNECTED: { label: "Bağlı değil", tone: "neutral", icon: Clock3 },
  CONNECTING: { label: "Bağlanıyor", tone: "info", icon: RefreshCw },
  CONNECTED: { label: "Bağlı", tone: "success", icon: CheckCircle2 },
  ERROR: { label: "Hata", tone: "critical", icon: AlertCircle },
  DISCONNECTED: { label: "Kesildi", tone: "neutral", icon: Unplug },
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

export default function WhatsappProviderTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [platform, setPlatform] = useState<PlatformStatus>({ ready: false, missing: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/whatsapp-provider", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Bağlantılar yüklenemedi.");
      setRows(data.providers || []);
      setPlatform(data.platform || { ready: false, missing: [] });
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Bağlantılar yüklenemedi", type: "error" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connectedCount = rows.filter((row) => row.connectionStatus === "CONNECTED").length;
  const errorCount = rows.filter((row) => row.connectionStatus === "ERROR").length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><MessageCircle className="h-5 w-5" /></span>
          <div><h2 className="text-base font-black text-slate-900">WhatsApp Bağlantı Sağlığı</h2><p className="text-xs text-slate-500">Kurum sırları gösterilmeden bağlantı ve gönderim durumu</p></div>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={() => void load()} loading={loading}>Yenile</Button>
      </div>

      <div className={`flex items-start gap-3 border p-4 ${platform.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        {platform.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
        <div>
          <p className={`text-sm font-black ${platform.ready ? "text-emerald-900" : "text-amber-900"}`}>{platform.ready ? "WhatsApp altyapısı kullanıma hazır" : "WhatsApp altyapısı henüz hazır değil"}</p>
          <p className={`mt-1 text-xs ${platform.ready ? "text-emerald-700" : "text-amber-800"}`}>
            {platform.ready ? "Klinikler kendi WhatsApp Business numaralarını bağlayabilir." : "Sistemin Meta uygulaması henüz bağlanmadı. Güvenli sunucu kurulumu tamamlanmadan klinikler numara bağlayamaz; klinik erişim hakları bu hazırlıktan bağımsızdır."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-400">Modülü açık kurum</p><p className="mt-1 text-2xl font-black text-slate-900">{rows.length}</p></div>
        <div className="border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">Bağlı</p><p className="mt-1 text-2xl font-black text-emerald-800">{connectedCount}</p></div>
        <div className="border border-red-200 bg-red-50 p-4"><p className="text-xs font-bold text-red-700">İnceleme gerekli</p><p className="mt-1 text-2xl font-black text-red-800">{errorCount}</p></div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-4 py-3">Kurum</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Doğrulanmış hesap</th><th className="px-4 py-3">Numara</th><th className="px-4 py-3">Bağlandı</th><th className="px-4 py-3">Son gönderim</th><th className="px-4 py-3">Son webhook</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const status = statusMap[row.connectionStatus];
              return <tr key={row.institutionId} className="hover:bg-slate-50/70"><td className="px-4 py-3"><span className="flex items-center gap-2 font-bold text-slate-900"><Building2 className="h-4 w-4 text-slate-400" />{row.institutionName}</span></td><td className="px-4 py-3"><Badge tone={status.tone} icon={status.icon}>{status.label}</Badge></td><td className="px-4 py-3 font-semibold text-slate-700">{row.verifiedName || "-"}</td><td className="px-4 py-3 text-slate-600">{row.displayPhoneNumber || "-"}</td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.connectedAt)}</td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.lastSuccessfulSendAt)}</td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.lastWebhookAt)}</td></tr>;
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">WhatsApp modülü açık kurum bulunmuyor.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
