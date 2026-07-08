"use client";

import { useEffect, useState } from "react";

type ApptSms = {
  id: string;
  startAt: string;
  status: string;
  smsInfo: boolean;
  smsReminder: boolean;
  smsSurvey: boolean;
  patient: { fullName: string; phone: string };
  doctor: { fullName: string };
};

type SmsSettings = {
  smsEnabled: boolean;
  smsDefaultInfo: boolean;
  smsDefaultReminder: boolean;
  smsDefaultSurvey: boolean;
};

export default function SmsPage() {
  const [appointments, setAppointments] = useState<ApptSms[]>([]);
  const [settings, setSettings] = useState<SmsSettings>({
    smsEnabled: true,
    smsDefaultInfo: true,
    smsDefaultReminder: false,
    smsDefaultSurvey: false,
  });
  const [smsSentCount, setSmsSentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"upcoming" | "past">("upcoming");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [smsType, setSmsType] = useState<"BILGI" | "HATIRLATMA" | "ANKET">("HATIRLATMA");
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<{ id: string; action: string; detail: string | null; createdAt: string }[]>([]);
  const [tab, setTab] = useState<"send" | "log" | "ayar">("send");

  const load = async (t = type) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sms?type=${t}`);
      const data = await res.json();
      setAppointments(data.appointments || []);
      setSettings(data.settings || settings);
      setSmsSentCount(data.smsSentCount || 0);
    } catch {}
    setLoading(false);
  };

  const loadLogs = async () => {
    try {
      const res = await fetch("/api/logs?q=SMS_&limit=50");
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {}
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const changeType = (t: "upcoming" | "past") => {
    setType(t);
    setSelectedIds(new Set());
    void load(t);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === appointments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(appointments.map(a => a.id)));
    }
  };

  const sendSms = async () => {
    if (!selectedIds.size) { showToast("error", "En az bir randevu seçin"); return; }
    setSending(true);
    const res = await fetch("/api/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentIds: Array.from(selectedIds), smsType }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      showToast("success", data.message || "SMS gönderildi");
      setSelectedIds(new Set());
      void load();
    } else {
      showToast("error", data.message || "Hata oluştu");
    }
  };

  const smsTypeLabel: Record<string, string> = {
    BILGI: "Bilgi SMS",
    HATIRLATMA: "Hatırlatma SMS",
    ANKET: "Anket SMS",
  };

  const smsTypeBadge: Record<string, string> = {
    BILGI: "bg-blue-100 text-blue-800",
    HATIRLATMA: "bg-yellow-100 text-yellow-800",
    ANKET: "bg-purple-100 text-purple-800",
  };

  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text }); setTimeout(() => setToast(null), 3500);
  };

  return (
    <section className="space-y-5">
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>{toast.type === "success" ? "✓" : "✕"} {toast.text}</div>
      )}
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">SMS</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{appointments.length} randevu</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{selectedIds.size} seçili</span>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
            settings.smsEnabled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}>
            {settings.smsEnabled ? "SMS Aktif" : "SMS Pasif"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
            Toplam: <b>{smsSentCount}</b>
          </span>
        </div>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Toplam Randevu</p>
          <p className="mt-1 text-2xl font-black text-slate-800">{appointments.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">SMS Gönderilen</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{appointments.filter(a => a.smsInfo || a.smsReminder || a.smsSurvey).length}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Bekliyor</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{appointments.filter(a => !a.smsInfo && !a.smsReminder && !a.smsSurvey).length}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-400">Seçili</p>
          <p className="mt-1 text-2xl font-black text-blue-700">{selectedIds.size}</p>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 rounded-xl border border-slate-100 bg-white p-1 shadow-sm">
        {([["send", "SMS Gönder"], ["log", "SMS Geçmişi"], ["ayar", "SMS Ayarları"]] as [string, string][]).map(([k, lbl]) => (
          <button key={k} onClick={() => { setTab(k as typeof tab); if (k === "log") void loadLogs(); }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === k ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* SMS Gönder sekmesi */}
      {tab === "send" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Randevu tipi seç */}
            <div className="flex rounded-lg border overflow-hidden">
              <button onClick={() => changeType("upcoming")} className={"px-4 py-2 text-sm font-semibold " + (type === "upcoming" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
                Gelecek Randevular
              </button>
              <button onClick={() => changeType("past")} className={"px-4 py-2 text-sm font-semibold " + (type === "past" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
                Geçmiş Randevular
              </button>
            </div>
            {/* SMS tipi */}
            <select value={smsType} onChange={e => setSmsType(e.target.value as typeof smsType)}
              className="rounded-lg border px-3 py-2 text-sm">
              <option value="HATIRLATMA">Randevu Hatırlatma</option>
              <option value="BILGI">Bilgi SMS</option>
              <option value="ANKET">Anket SMS</option>
            </select>
            {/* Toplu seç */}
            <button onClick={selectAll} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
              {selectedIds.size === appointments.length && appointments.length > 0 ? "Seçimi Kaldır" : "Tümünü Seç"}
            </button>
            {/* SMS gönder */}
            <button onClick={sendSms} disabled={!selectedIds.size || sending || loading || !settings.smsEnabled}
              className="ml-auto rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {sending ? "Gönderiliyor..." : selectedIds.size > 0 ? `${selectedIds.size} Hastaya SMS Gönder` : "SMS Gönder"}
            </button>
          </div>

          {!settings.smsEnabled && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              SMS servisi devre dışı. Gönderim yapabilmek için SMS ayarlarını aktif edin.
            </div>
          )}

          {appointments.length === 0 ? (
            <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
              <p>Randevu bulunamadı</p>
            </div>
          ) : (
            <>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white md:hidden">
              {appointments.map(appt => {
                const selected = selectedIds.has(appt.id);
                return (
                  <label key={appt.id} className={`block p-4 ${selected ? "bg-blue-50" : ""}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selected} onChange={() => toggleSelect(appt.id)} className="mt-1 rounded" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{appt.patient.fullName}</p>
                        <p className="mt-1 text-sm text-slate-600">{appt.patient.phone}</p>
                        <p className="mt-1 text-xs text-slate-500">{appt.doctor.fullName} · {new Date(appt.startAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                          {appt.smsInfo && <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">Bilgi gönderildi</span>}
                          {appt.smsReminder && <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">Hatırlatma gönderildi</span>}
                          {appt.smsSurvey && <span className="rounded-full bg-purple-100 px-2 py-1 font-semibold text-purple-700">Anket gönderildi</span>}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 bg-white md:block">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" checked={selectedIds.size === appointments.length && appointments.length > 0}
                        onChange={selectAll} className="rounded" />
                    </th>
                    <th className="px-3 py-2 text-left">Hasta</th>
                    <th className="px-3 py-2 text-left">Telefon</th>
                    <th className="px-3 py-2 text-left">Doktor</th>
                    <th className="px-3 py-2 text-left">Tarih / Saat</th>
                    <th className="px-3 py-2 text-left">Durum</th>
                    <th className="px-3 py-2 text-center">Bilgi</th>
                    <th className="px-3 py-2 text-center">Hatırlatma</th>
                    <th className="px-3 py-2 text-center">Anket</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(appt => (
                    <tr key={appt.id} className={"border-t hover:bg-gray-50 " + (selectedIds.has(appt.id) ? "bg-blue-50" : "")}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selectedIds.has(appt.id)} onChange={() => toggleSelect(appt.id)} className="rounded" />
                      </td>
                      <td className="px-3 py-2 font-medium">{appt.patient.fullName}</td>
                      <td className="px-3 py-2 text-gray-600">{appt.patient.phone}</td>
                      <td className="px-3 py-2 text-gray-600">{appt.doctor.fullName}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {new Date(appt.startAt).toLocaleDateString("tr-TR")}
                        {" "}{new Date(appt.startAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          appt.status === "TAMAMLANDI" ? "bg-green-100 text-green-700" :
                          appt.status === "IPTAL" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>{appt.status}</span>
                      </td>
                      <td className="px-3 py-2 text-center">{appt.smsInfo ? "Gönderildi" : "—"}</td>
                      <td className="px-3 py-2 text-center">{appt.smsReminder ? "Gönderildi" : "—"}</td>
                      <td className="px-3 py-2 text-center">{appt.smsSurvey ? "Gönderildi" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {/* SMS Geçmişi sekmesi */}
      {tab === "log" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Son 50 SMS gönderim kaydı:</p>
          {logs.length === 0 ? (
            <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
              <p>Henüz SMS gönderimi yapılmadı</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">SMS Türü</th>
                    <th className="px-3 py-2 text-left">Alıcı / Detay</th>
                    <th className="px-3 py-2 text-left">Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${smsTypeBadge[log.action.replace("SMS_", "")] || "bg-gray-100 text-gray-700"}`}>
                          {smsTypeLabel[log.action.replace("SMS_", "")] || log.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{log.detail || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(log.createdAt).toLocaleString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SMS Ayarları sekmesi */}
      {tab === "ayar" && (
        <div className="max-w-2xl space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-gray-800">SMS Varsayılan Ayarları</h3>
          <p className="text-sm text-gray-500">Bu ayarlar yeni randevu oluşturulurken otomatik uygulanır. Detaylı ayarlar için Sistem Ayarları sayfasını kullanın.</p>
          <div className="space-y-3">
            {[
              { key: "smsEnabled", label: "SMS Servisi Aktif", desc: "Tüm SMS gönderimlerini açar/kapatır" },
              { key: "smsDefaultInfo", label: "Varsayılan: Bilgi SMS", desc: "Randevu onay SMS'i otomatik gönder" },
              { key: "smsDefaultReminder", label: "Varsayılan: Hatırlatma SMS", desc: "Randevu öncesi hatırlatma gönder" },
              { key: "smsDefaultSurvey", label: "Varsayılan: Anket SMS", desc: "Randevu sonrası memnuniyet anketi gönder" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
                <div className={`w-12 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${settings[key as keyof SmsSettings] ? "bg-primary justify-end" : "bg-gray-300 justify-start"}`}
                  onClick={() => setSettings(s => ({ ...s, [key]: !s[key as keyof SmsSettings] }))}>
                  <div className="w-4 h-4 rounded-full bg-white shadow" />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={async () => {
              const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
              if (res.ok) showToast("success", "SMS ayarları kaydedildi");
              else showToast("error", "Kayıt başarısız");
            }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
            Ayarları Kaydet
          </button>
        </div>
      )}
    </section>
  );
}
