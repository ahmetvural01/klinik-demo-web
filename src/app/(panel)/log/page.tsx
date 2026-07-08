"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";

type Log = { id: string; createdAt: string; user: { fullName: string; role?: string }; action: string; detail: string };

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Sisteme Giriş",
  LOGOUT: "Sistemden Çıkış",
  PATIENT_CREATE: "Hasta Kaydı Oluşturma",
  PATIENT_UPDATE: "Hasta Bilgisi Güncelleme",
  PATIENT_DELETE: "Hasta Kaydı Silme",
  APPOINTMENT_CREATE: "Randevu Oluşturma",
  APPOINTMENT_UPDATE: "Randevu Güncelleme",
  APPOINTMENT_DELETE: "Randevu Silme",
  APPOINTMENT_STATUS: "Randevu Durumu Güncelleme",
  EXAM_CREATE: "Muayene Kaydı Oluşturma",
  EXAM_UPDATE: "Muayene Kaydı Güncelleme",
  EXAM_DELETE: "Muayene Kaydı Silme",
  PAYMENT_CREATE: "Ödeme Kaydı Oluşturma",
  PAYMENT_UPDATE: "Ödeme Kaydı Güncelleme",
  PAYMENT_DELETE: "Ödeme Kaydı Silme",
  FIRMA_ISLEM_CREATE: "Firma İşlemi Oluşturma",
  FIRMA_ISLEM_CANCEL: "Firma İşlemi İptali",
  PRICE_CREATE: "Fiyat Olusturma",
  PRICE_UPDATE: "Fiyat Güncelleme",
  PRICE_DELETE: "Fiyat Silme",
  PROFILE_UPDATE: "Profil Güncelleme",
  PASSWORD_CHANGE: "Şifre Değiştirme",
  SETTINGS_UPDATE: "Sistem Ayarı Güncelleme",
  STAFF_CREATE: "Personel Ekleme",
  STAFF_UPDATE: "Personel Güncelleme",
  STAFF_DEACTIVATE: "Personel Pasife Alma",
  POS_UPDATE: "POS Cihazı Güncelleme",
  SUPPORT_UPDATE: "Destek Talebi Güncelleme",
  SUPERADMIN_UPDATE: "Superadmin Güncelleme",
  SMS_TEMPLATE_UPDATE: "SMS Şablonu Güncelleme",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
}

function parseDetail(detail: string | undefined) {
  const raw = (detail || "").trim();
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines[0] || "Detay bilgisi bulunmuyor";
  const beforeLine = lines.find((line) => /de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i.test(line));
  const afterLine = lines.find((line) => /de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i.test(line));

  return {
    summary,
    before: beforeLine ? beforeLine.replace(/de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i, "").trim() : "",
    after: afterLine ? afterLine.replace(/de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i, "").trim() : "",
  };
}

function parseDiffItems(text: string): string[] {
  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function LogPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return from.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState("");
  const [detailLog, setDetailLog] = useState<Log | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fromDate && toDate) fetchLogs();
  }, [page, pageSize, fromDate, toDate]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/logs?page=${page}&limit=${pageSize}&from=${fromDate}&to=${toDate}&q=${encodeURIComponent(search)}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const roleLabel: Record<string,string> = { YONETICI:"Yönetici", DOKTOR:"Diş Hekimi", ASISTAN:"Asistan", BANKO:"Banko", MUHASEBE:"Muhasebe" };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">İşlem Kayıtları</h1>
        <p className="mt-0.5 text-sm text-slate-500">Sistemde yapılan tüm işlemlerin kaydı</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <span className="text-slate-400">—</span>
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <button onClick={() => { setPage(1); fetchLogs(); }} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700">İşlemleri Getir</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Personel veya işlem ara…" className="flex-1 min-w-36 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          Göster:
          <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}} className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:outline-none">
            {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <>
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden" aria-busy={loading}>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="text-left px-4 py-3">Tarih</th>
                <th className="text-left px-4 py-3">Saat</th>
                <th className="text-left px-4 py-3">Personel</th>
                <th className="text-left px-4 py-3">İşlem</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(l => {
                  const dt = new Date(l.createdAt);
                  const detailInfo = parseDetail(l.detail);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{dt.toLocaleDateString("tr-TR")}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{dt.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{l.user?.fullName || "-"}</p>
                        {l.user?.role && <p className="text-xs text-slate-400">{roleLabel[l.user.role]||l.user.role}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{getActionLabel(l.action)}</p>
                        <p className="max-w-lg truncate text-xs text-slate-500">{detailInfo.summary}</p>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={()=>setDetailLog(l)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">Detay</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {logs.length === 0 && <p className="py-8 text-center text-slate-400">Kayıt bulunamadı</p>}
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">Sayfa {page} / {totalPages} &nbsp;&middot;&nbsp; Toplam {total} kayıt</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">← Önceki</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">Sonraki →</button>
            </div>
            </div>
          </>

      {detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-bold text-slate-800">İşlem Detayı</h3>
            {(() => {
              const parsed = parseDetail(detailLog.detail);
              const beforeItems = parseDiffItems(parsed.before);
              const afterItems = parseDiffItems(parsed.after);
              return (
            <dl className="space-y-2.5 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Tarih</dt><dd className="text-slate-700">{new Date(detailLog.createdAt).toLocaleString("tr-TR")}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Personel</dt><dd className="text-slate-700">{detailLog.user?.fullName}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Rol</dt><dd className="text-slate-700">{roleLabel[detailLog.user?.role||""]||detailLog.user?.role}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">İşlem</dt><dd className="text-slate-700">{getActionLabel(detailLog.action)}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Özet</dt><dd className="text-slate-700 text-xs">{parsed.summary}</dd></div>
              {beforeItems.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Öncesi</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{beforeItems.map((item, idx) => <li key={`b-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              {afterItems.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Sonrası</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{afterItems.map((item, idx) => <li key={`a-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              {beforeItems.length === 0 && afterItems.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Bu kayıt eski formatta tutulmuş. Öncesi/sonrası detayları sadece yeni güncelleme loglarında görünür.
                </div>
              )}
            </dl>
              );
            })()}
            <button onClick={()=>setDetailLog(null)} className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Kapat</button>
          </div>
        </div>
      )}
    </section>
  );
}
