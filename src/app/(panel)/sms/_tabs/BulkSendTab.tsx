"use client";

import { useEffect, useState } from "react";
import { Search, Send, Users, UserCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { toStoredText, type SmsPlaceholder } from "@/lib/sms-template-placeholders";

type Patient = { id: string; fullName: string; phone: string };
type Audience = "SELECTED" | "ALL";

// Toplu gönderimde randevu/ödeme-özel alanlar (doktor, tutar, vade) anlamsız —
// sadece klinik/hasta adı ve klinik telefonu sunulur.
const BULK_PLACEHOLDERS: SmsPlaceholder[] = [
  { token: "institutionName", label: "Klinik Adı", sample: "Kliniğiniz" },
  { token: "patientName", label: "Hasta Adı", sample: "Ayşe Yılmaz" },
  { token: "institutionPhone", label: "Klinik Telefonu", sample: "0322 123 45 67" },
];

type HolidayTemplate = { key: string; label: string; buildText: (institutionName: string) => string };

const HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  { key: "23nisan", label: "23 Nisan", buildText: (n) => `Sayın [Hasta Adı], 23 Nisan Ulusal Egemenlik ve Çocuk Bayramımızı kutlar, mutluluk dolu bir gün dileriz. ${n} ailesi olarak sizi tebrik ederiz.` },
  { key: "19mayis", label: "19 Mayıs", buildText: (n) => `Sayın [Hasta Adı], 19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramımız kutlu olsun. ${n} ailesi olarak sizi tebrik ederiz.` },
  { key: "30agustos", label: "30 Ağustos", buildText: (n) => `Sayın [Hasta Adı], 30 Ağustos Zafer Bayramımız kutlu olsun. ${n} ailesi olarak sizi tebrik ederiz.` },
  { key: "29ekim", label: "29 Ekim", buildText: (n) => `Sayın [Hasta Adı], 29 Ekim Cumhuriyet Bayramımız kutlu olsun. ${n} ailesi olarak sizi tebrik ederiz.` },
  { key: "ramazan", label: "Ramazan Bayramı", buildText: (n) => `Sayın [Hasta Adı], Ramazan Bayramınızı en içten dileklerimizle kutlar, sağlık ve mutluluk dileriz. ${n} ailesi.` },
  { key: "kurban", label: "Kurban Bayramı", buildText: (n) => `Sayın [Hasta Adı], Kurban Bayramınızı en içten dileklerimizle kutlar, huzur dolu bir bayram geçirmenizi dileriz. ${n} ailesi.` },
  { key: "yilbasi", label: "Yılbaşı", buildText: (n) => `Sayın [Hasta Adı], yeni yılınızı kutlar, sağlık ve mutluluk dolu bir yıl dileriz. ${n} ailesi.` },
];

export default function BulkSendTab() {
  const [audience, setAudience] = useState<Audience>("SELECTED");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [totalPatients, setTotalPatients] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [institutionName, setInstitutionName] = useState("");
  const [institutionPhone, setInstitutionPhone] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setInstitutionName(d?.institutionName || "");
        setInstitutionPhone(d?.institutionPhone || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/patients?take=1")
      .then((r) => r.json())
      .then((d) => setTotalPatients(typeof d?.total === "number" ? d.total : null))
      .catch(() => setTotalPatients(null));
  }, []);

  useEffect(() => {
    if (audience !== "SELECTED") return;
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ take: "50" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/patients?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setPatients(Array.isArray(d?.patients) ? d.patients : []))
        .catch(() => setPatients([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, audience]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      patients.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const recipientCount = audience === "ALL" ? (totalPatients ?? 0) : selected.size;

  const applyHolidayTemplate = (t: HolidayTemplate) => {
    setMessage(t.buildText(institutionName || "Kliniğimiz"));
  };

  const send = async () => {
    if (recipientCount === 0 || !message.trim()) return;
    const ok = await confirmDialog({
      title: "Toplu SMS Gönder",
      message: `${recipientCount} hastaya SMS gönderilecek. Bu işlem SMS bakiyenizi tüketir ve geri alınamaz. Devam edilsin mi?`,
      confirmText: "Gönder",
      danger: true,
    });
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch("/api/sms/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          patientIds: audience === "SELECTED" ? Array.from(selected) : undefined,
          content: toStoredText(message),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Gönderilemedi");
      showToastSafe({ title: "Gönderildi", message: d.message, type: d.failed > 0 ? "error" : "success" });
      clearSelection();
      setMessage("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSending(false);
    }
  };

  const columns: ListTableColumn<Patient>[] = [
    {
      key: "select",
      header: "",
      headerClassName: "w-10",
      render: (p) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={selected.has(p.id)}
          onChange={() => toggleOne(p.id)}
        />
      ),
    },
    { key: "fullName", header: "Ad Soyad", render: (p) => <span className="font-bold text-slate-900">{p.fullName}</span> },
    { key: "phone", header: "Telefon", render: (p) => <span className="font-mono text-slate-600">{p.phone || "—"}</span> },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Toplu Gönderim</h2>
        <p className="mt-1 text-sm text-slate-500">
          Bayram, kampanya veya duyuru gibi özel günlerde hastalarınıza serbest metinli SMS gönderin. Bu özellik SMS bakiyenizi tüketir.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <Button
          variant={audience === "SELECTED" ? "primary" : "secondary"}
          size="sm"
          icon={UserCheck}
          onClick={() => setAudience("SELECTED")}
        >
          Seçili Hastalar
        </Button>
        <Button
          variant={audience === "ALL" ? "primary" : "secondary"}
          size="sm"
          icon={Users}
          onClick={() => setAudience("ALL")}
        >
          Tüm Hastalar{totalPatients !== null ? ` (${totalPatients})` : ""}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {audience === "SELECTED" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Hasta adı veya telefon ara..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={selectAllVisible}>Görünenleri Seç</Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>Seçimi Temizle</Button>
            </div>
            <p className="text-xs font-semibold text-slate-500">{selected.size} hasta seçildi</p>
            <ListTable
              columns={columns}
              rows={patients}
              rowKey={(p) => p.id}
              loading={loading}
              emptyText="Hasta bulunamadı"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-8 text-center">
            <Users className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-bold text-amber-800">
              Kliniğinizdeki {totalPatients ?? "…"} hastanın tamamına gönderilecek
            </p>
            <p className="text-xs text-amber-700">Telefon numarası olmayan hastalar otomatik olarak atlanır.</p>
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Hazır Şablonlar</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {HOLIDAY_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => applyHolidayTemplate(t)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <SmsMessageEditor
            value={message}
            onChange={setMessage}
            placeholders={BULK_PLACEHOLDERS}
            insertContext={{ institutionName: institutionName || undefined, institutionPhone: institutionPhone || undefined }}
            previewContext={{ institutionName: institutionName || undefined, institutionPhone: institutionPhone || undefined }}
            rows={5}
            label="Mesaj Metni"
          />
          <Button
            icon={Send}
            onClick={send}
            loading={sending}
            disabled={recipientCount === 0 || !message.trim()}
            fullWidth
          >
            {recipientCount > 0 ? `${recipientCount} Hastaya Gönder` : "Hasta Seçin"}
          </Button>
        </div>
      </div>
    </section>
  );
}
