"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

type Log = {
  id: string;
  createdAt: string;
  user: { fullName: string; role?: string };
  action: string;
  detail: string | null;
  ip?: string | null;
};

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
  TAKSIT_MARK_OVERDUE: "Taksitleri Gecikmiş İşaretleme",
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
  SMS_TEMPLATE_UPDATE: "SMS Şablonu Güncelleme",
  SMS_TEMPLATE_SAVE: "SMS Şablonu Kaydetme",
  SMS_BILGI: "SMS Bilgilendirme",
  SMS_HATIRLATMA: "SMS Hatırlatma",
  SMS_ANKET: "SMS Değerlendirme",
  SMS_BILGI_FAILED: "SMS Bilgilendirme Başarısız",
  SMS_HATIRLATMA_FAILED: "SMS Hatırlatma Başarısız",
  SMS_ANKET_FAILED: "SMS Değerlendirme Başarısız",
  PATIENT_DATA_EXPORT: "Hasta Verisi Dışa Aktarma (KVKK)",
  APPOINTMENT_CANCEL: "Randevu İptali",
  BOOKING_REQUEST_UPDATE: "Online Randevu Talebi Güncelleme",
  PUBLIC_BOOKING_REQUEST_CREATE: "Online Randevu Talebi Oluşturma",
  WAITLIST_CREATE: "Bekleme Listesi Oluşturma",
  WAITLIST_UPDATE: "Bekleme Listesi Güncelleme",
  WAITLIST_DELETE: "Bekleme Listesi Silme",
  LAB_ORDER_CREATE: "Laboratuvar İşi Oluşturma",
  LAB_ORDER_UPDATE: "Laboratuvar İşi Güncelleme",
  LAB_ORDER_INVOICE_CREATE: "Laboratuvar Faturası Ekleme",
  LAB_TRIP_CREATE: "Laboratuvar Gönderimi Ekleme",
  LAB_TRIP_UPDATE: "Laboratuvar Gönderimi Güncelleme",
  PURCHASE_UPDATE: "Satın Alma Güncelleme",
  PURCHASE_CANCEL: "Satın Alma İptali",
  STOCK_ITEM_CREATE: "Stok Kartı Oluşturma",
  STOCK_ITEM_UPDATE: "Stok Kartı Güncelleme",
  STOCK_MOVEMENT: "Stok Hareketi",
  STOCK_ITEM_DELETE: "Stok Kartı Pasifleştirme",
  TREATMENT_TYPE_CREATE: "Tedavi Türü Oluşturma",
  TREATMENT_TYPE_UPDATE: "Tedavi Türü Güncelleme",
  TREATMENT_TYPE_DELETE: "Tedavi Türü Silme",
  PATIENT_CONSENT_CREATE: "Hasta Onamı Kaydetme",
  PATIENT_CONSENT_VOID: "Hasta Onamı İptali",
  DOCUMENT_CREATE: "Belge Yükleme",
  DOCUMENT_DELETE: "Belge Silme",
  PRESCRIPTION_CREATE: "Reçete Oluşturma",
  PRESCRIPTION_DELETE: "Reçete Silme",
  MESSAGE_CREATE: "Klinik İçi Mesaj",
  MESSAGE_UPDATE: "Klinik İçi Mesaj Güncelleme",
  MESSAGE_DELETE: "Klinik İçi Mesaj Silme",
  ANNOUNCEMENT_CREATE: "Duyuru Oluşturma",
  ANNOUNCEMENT_DELETE: "Duyuru Silme",
  TWO_FACTOR_ENABLE: "İki Aşamalı Doğrulama Açma",
  TWO_FACTOR_DISABLE: "İki Aşamalı Doğrulama Kapatma",
  PROFILE_2FA_SETUP_START: "İki Aşamalı Doğrulama Kurulum Başlatma",
  DEV_DEMO_LOAD: "Yerel Demo Veri Yükleme",
  DEV_DEMO_LOAD_SKIPPED: "Yerel Demo Veri Yükleme Atlandı",
  DEMO_REQUEST_CREATE: "Demo Kurum Oluşturma",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
}

function getScopeLabel(action: string): string {
  if (action === "LOGIN" || action === "LOGOUT" || action.startsWith("PROFILE_") || action.startsWith("PASSWORD_")) return "Oturum";
  if (action.startsWith("PATIENT_") || action.startsWith("DOCUMENT_")) return "Hasta";
  if (action.startsWith("APPOINTMENT_") || action.startsWith("BOOKING_REQUEST_") || action.startsWith("PUBLIC_BOOKING_") || action.startsWith("WAITLIST_") || action.startsWith("DOCTOR_BLOCK_")) return "Randevu";
  if (action.startsWith("EXAM_") || action.startsWith("TREATMENT_") || action.startsWith("PRESCRIPTION_")) return "Tedavi";
  if (action.startsWith("PAYMENT_") || action.startsWith("KASA_") || action.startsWith("GIDER_") || action.startsWith("TAKSIT_") || action.startsWith("FIRMA_") || action.startsWith("PURCHASE_")) return "Finans";
  if (action.startsWith("LAB_")) return "Laboratuvar";
  if (action.startsWith("STOCK_")) return "Stok";
  if (action.startsWith("SMS_")) return "SMS";
  if (action.startsWith("SETTINGS_") || action.startsWith("POS_") || action.startsWith("PRICE_") || action.startsWith("SMS_TEMPLATE_") || action.startsWith("FOLLOW_UP_TYPES_")) return "Ayarlar";
  if (action.startsWith("SUPPORT_")) return "Destek";
  if (action.startsWith("MESSAGE_") || action.startsWith("ANNOUNCEMENT_")) return "İletişim";
  if (action.startsWith("DEV_") || action.startsWith("DEMO_")) return "Sistem";
  return "Genel";
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Tüm işlemler" },
  { value: "hasta", label: "Hasta" },
  { value: "randevu", label: "Randevu" },
  { value: "tedavi", label: "Tedavi / Reçete" },
  { value: "lab", label: "Laboratuvar" },
  { value: "finans", label: "Finans" },
  { value: "stok", label: "Stok" },
  { value: "sms", label: "SMS" },
  { value: "ayar", label: "Ayarlar" },
  { value: "sistem", label: "Sistem" },
];

function parseDetail(detail: string | null | undefined) {
  const raw = (detail || "").trim();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      const flat = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([key, value]) => `${key}: ${String(value)}`);
      return {
        summary: flat[0] || "Detay bilgisi bulunmuyor",
        before: "",
        after: "",
        structured: flat.map(String),
        raw,
      };
    } catch {
      // Eski metin formatı olarak devam et
    }
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines[0] || "Detay bilgisi bulunmuyor";
  const beforeLine = lines.find((line) => /de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i.test(line));
  const afterLine = lines.find((line) => /de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i.test(line));

  return {
    summary,
    before: beforeLine ? beforeLine.replace(/de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i, "").trim() : "",
    after: afterLine ? afterLine.replace(/de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i, "").trim() : "",
    structured: lines.filter((line) => line !== summary && line !== beforeLine && line !== afterLine),
    raw,
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
  const [category, setCategory] = useState("");
  const [detailLog, setDetailLog] = useState<Log | null>(null);
  const [loadError, setLoadError] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fromDate && toDate) fetchLogs();
  }, [page, pageSize, fromDate, toDate, category]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        from: fromDate,
        to: toDate,
        q: search,
        category,
      });
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) { setLoadError(true); setLogs([]); setTotal(0); return; }
      const data = await res.json();
      setLoadError(false);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const roleLabel: Record<string,string> = { YONETICI:"Yönetici", DOKTOR:"Diş Hekimi", ASISTAN:"Asistan", BANKO:"Banko", MUHASEBE:"Muhasebe" };
  const selectedCategoryLabel = useMemo(
    () => CATEGORY_OPTIONS.find((item) => item.value === category)?.label || "Tüm işlemler",
    [category]
  );

  const logColumns: ListTableColumn<Log>[] = [
    {
      key: "date",
      header: "Tarih",
      cellClassName: "whitespace-nowrap",
      render: (l) => <span className="text-xs text-slate-600">{new Date(l.createdAt).toLocaleDateString("tr-TR")}</span>,
    },
    {
      key: "time",
      header: "Saat",
      render: (l) => <span className="font-mono text-xs text-slate-500">{new Date(l.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>,
    },
    {
      key: "user",
      header: "Personel",
      render: (l) => (
        <>
          <p className="text-sm font-medium text-slate-800">{l.user?.fullName || "-"}</p>
          {l.user?.role && <p className="text-xs text-slate-400">{roleLabel[l.user.role] || l.user.role}</p>}
        </>
      ),
    },
    {
      key: "action",
      header: "İşlem",
      render: (l) => (
        <>
          <p className="text-sm font-medium text-slate-800">{getActionLabel(l.action)}</p>
          <p className="max-w-lg truncate text-xs text-slate-500">{parseDetail(l.detail).summary}</p>
        </>
      ),
    },
    {
      key: "scope",
      header: "Kapsam",
      render: (l) => <Badge tone="neutral">{getScopeLabel(l.action)}</Badge>,
    },
    {
      key: "islem",
      header: "",
      render: (l) => <Button variant="secondary" size="sm" onClick={() => setDetailLog(l)}>Detay</Button>,
    },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">İşlem Kayıtları</h1>
        <p className="mt-0.5 text-sm text-slate-500">Kurum içindeki kritik işlemler, değişiklik detayları ve erişim kayıtları.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <span className="text-slate-400">—</span>
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <select value={category} onChange={e=>{ setCategory(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none">
          {CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{ if (e.key === "Enter") { setPage(1); void fetchLogs(); } }} placeholder="Personel, işlem veya detay ara…" className="flex-1 min-w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <Button size="sm" onClick={() => { setPage(1); void fetchLogs(); }}>Getir</Button>
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          Göster:
          <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}} className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:outline-none">
            {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-bold text-slate-900">{selectedCategoryLabel}</p>
            <p className="text-xs text-slate-500">{total} kayıt bulundu</p>
          </div>
          {loading && <Badge tone="neutral">Yükleniyor...</Badge>}
        </div>
        <ListTable<Log>
          columns={logColumns}
          rows={logs}
          rowKey={(l) => l.id}
          loading={loading}
          emptyText={loadError ? "İşlem kayıtları yüklenemedi. Lütfen tekrar deneyin." : "Kayıt bulunamadı"}
          pager={{
            page,
            pageCount: Math.max(1, totalPages),
            pageSize,
            total,
            onPageChange: setPage,
          }}
        />
      </div>

      <Modal
        open={Boolean(detailLog)}
        onClose={() => setDetailLog(null)}
        title="İşlem Detayı"
        description={detailLog?.id}
        size="lg"
      >
        {detailLog && (() => {
              const parsed = parseDetail(detailLog.detail);
              const beforeItems = parseDiffItems(parsed.before);
              const afterItems = parseDiffItems(parsed.after);
              return (
            <dl className="space-y-2.5 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Tarih</dt><dd className="text-slate-700">{new Date(detailLog.createdAt).toLocaleString("tr-TR")}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Personel</dt><dd className="text-slate-700">{detailLog.user?.fullName}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Rol</dt><dd className="text-slate-700">{roleLabel[detailLog.user?.role||""]||detailLog.user?.role}</dd></div>
              {detailLog.ip && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">IP</dt><dd className="text-slate-700">{detailLog.ip}</dd></div>
              )}
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">İşlem</dt><dd className="text-slate-700">{getActionLabel(detailLog.action)}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Özet</dt><dd className="text-slate-700 text-xs">{parsed.summary}</dd></div>
              {beforeItems.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Öncesi</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{beforeItems.map((item, idx) => <li key={`b-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              {afterItems.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Sonrası</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{afterItems.map((item, idx) => <li key={`a-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              {parsed.structured.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Ek Detay</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{parsed.structured.map((item, idx) => <li key={`s-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase text-slate-400">Ham Kayıt</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{parsed.raw || "-"}</pre>
              </div>
            </dl>
              );
            })()}
      </Modal>
    </section>
  );
}
