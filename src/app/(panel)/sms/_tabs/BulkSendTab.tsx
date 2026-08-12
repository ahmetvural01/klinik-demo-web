"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Search, Send, Smartphone, Users, UserCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { toStoredText, type SmsPlaceholder } from "@/lib/sms-template-placeholders";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";

type Patient = { id: string; fullName: string; phone: string };
type Audience = "SELECTED" | "ALL";

// Toplu iletişimde randevu/ödeme-özel alanlar (doktor, tutar, vade) anlamsız —
// sadece klinik/hasta adı ve klinik telefonu sunulur.
const BULK_PLACEHOLDERS: SmsPlaceholder[] = [
  { token: "institutionName", label: "Klinik Adı", sample: "Kliniğiniz" },
  { token: "patientName", label: "Hasta Adı", sample: "Ayşe Yılmaz" },
  { token: "institutionPhone", label: "Klinik Telefonu", sample: "0322 123 45 67" },
];

type CelebrationTemplate = { code: string; title: string; category: string; targetProfessions: string[]; messageTemplate: string; whatsappMessageTemplate: string | null; enabled: boolean };

export default function BulkSendTab() {
  const { can, hasFeature } = usePermissions();
  const whatsappEnabled = hasFeature("whatsapp") && can("whatsapp:write");
  const [audience, setAudience] = useState<Audience>("SELECTED");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [totalPatients, setTotalPatients] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const beginPatientSearch = useLatestRequest();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [channelPreference, setChannelPreference] = useState<"AUTO" | "SMS" | "WHATSAPP">(
    whatsappEnabled ? "AUTO" : "SMS",
  );
  const [celebrationTemplates, setCelebrationTemplates] = useState<CelebrationTemplate[]>([]);
  const [celebrationLoadError, setCelebrationLoadError] = useState("");
  const [celebrationReloadKey, setCelebrationReloadKey] = useState(0);
  const [selectedCelebration, setSelectedCelebration] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const [institutionName, setInstitutionName] = useState("");
  const [institutionPhone, setInstitutionPhone] = useState("");
  const [patientLoadError, setPatientLoadError] = useState("");
  const [patientReloadKey, setPatientReloadKey] = useState(0);
  const channelOptions: Array<{ value: "AUTO" | "SMS" | "WHATSAPP"; label: string; icon: typeof Sparkles }> = whatsappEnabled
    ? [
        { value: "AUTO", label: "Otomatik", icon: Sparkles },
        { value: "SMS", label: "SMS", icon: Smartphone },
        { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
      ]
    : [{ value: "SMS", label: "SMS", icon: Smartphone }];

  useEffect(() => {
    if (!whatsappEnabled && channelPreference !== "SMS") setChannelPreference("SMS");
  }, [channelPreference, whatsappEnabled]);

  useEffect(() => {
    setCelebrationLoadError("");
    fetch("/api/celebration-days")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || "Hazır mesajlar yüklenemedi.");
        return data;
      })
      .then((data) => setCelebrationTemplates(Array.isArray(data?.days) ? data.days : []))
      .catch((error) => {
        setCelebrationTemplates([]);
        setCelebrationLoadError(error instanceof Error ? error.message : "Hazır mesajlar yüklenemedi.");
      });
  }, [celebrationReloadKey]);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || "Kurum bilgileri yüklenemedi.");
        return data;
      })
      .then((d) => {
        setInstitutionName(d?.institutionName || "");
        setInstitutionPhone(d?.institutionPhone || "");
      })
      .catch((error) => {
        showToastSafe({
          title: "Kurum bilgileri yüklenemedi",
          message: error instanceof Error ? error.message : "Lütfen sayfayı yenileyin.",
          type: "error",
        });
      });
  }, []);

  useEffect(() => {
    fetch("/api/patients?take=1")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || "Hasta sayısı yüklenemedi.");
        return data;
      })
      .then((d) => setTotalPatients(typeof d?.total === "number" ? d.total : null))
      .catch(() => {
        setTotalPatients(null);
        setPatientLoadError("Hasta bilgileri yüklenemedi. Lütfen yeniden deneyin.");
      });
  }, [patientReloadKey]);

  useEffect(() => {
    if (audience !== "SELECTED") return;
    const request = beginPatientSearch();
    setLoading(true);
    setPatientLoadError("");
    const t = setTimeout(() => {
      const params = new URLSearchParams({ take: "50" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/patients?${params.toString()}`, { signal: request.signal })
        .then(async (r) => {
          const data = await r.json().catch(() => null);
          if (!r.ok) throw new Error(data?.message || "Hasta listesi yüklenemedi.");
          return data;
        })
        .then((d) => { if (request.isLatest()) setPatients(Array.isArray(d?.patients) ? d.patients : []); })
        .catch((error) => {
          if (isAbortError(error)) return;
          setPatientLoadError(error instanceof Error ? error.message : "Hasta listesi yüklenemedi.");
        })
        .finally(() => { if (request.isLatest()) setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query, audience, patientReloadKey, beginPatientSearch]);

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

  const applyHolidayTemplate = (template: CelebrationTemplate) => {
    setSelectedCelebration(template.code);
    setMessage(template.messageTemplate.replaceAll("{{institutionName}}", institutionName || "Kliniğimiz"));
    setWhatsappMessage((template.whatsappMessageTemplate || template.messageTemplate).replaceAll("{{institutionName}}", institutionName || "Kliniğimiz"));
  };

  const send = async () => {
    if (recipientCount === 0 || !message.trim()) return;
    const ok = await confirmDialog({
      title: "Toplu İleti Gönder",
      message: `${recipientCount} hastaya ${channelPreference === "AUTO" ? "uygun kanal üzerinden" : channelPreference} ileti gönderilecek. İletişim izinleri her hasta için ayrı kontrol edilir.`,
      confirmText: "Gönder",
      danger: true,
    });
    if (!ok) return;

    setSending(true);
    requestIdRef.current ??= crypto.randomUUID();
    let responseReceived = false;
    try {
      const res = await fetch("/api/sms/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          patientIds: audience === "SELECTED" ? Array.from(selected) : undefined,
          content: toStoredText(message),
          whatsappContent: toStoredText(whatsappMessage || message),
          channelPreference,
          templateCode: selectedCelebration ? `KUTLAMA_${selectedCelebration}` : "TOPLU",
          celebrationCode: selectedCelebration || undefined,
          requestId: requestIdRef.current,
        }),
      });
      responseReceived = true;
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Gönderilemedi");
      const failedRecipients = Array.isArray(d.failedRecipients) ? d.failedRecipients : [];
      const failedCount = Number(d.failed) || 0;
      const skippedCount = Number(d.skippedNoPhone) || 0;
      const sentCount = Number(d.sent) || 0;
      if (failedCount > 0) {
        setAudience("SELECTED");
        setSelected(new Set(failedRecipients.map((item: { patientId: string }) => item.patientId)));
        showToastSafe({
          title: sentCount > 0 ? "Kısmen gönderildi" : "Gönderim tamamlanamadı",
          message: `${d.message}. Yalnızca başarısız alıcılar seçili bırakıldı; tekrar deneyebilirsiniz.`,
          type: "error",
          duration: 6000,
        });
      } else {
        showToastSafe({
          title: skippedCount > 0 ? "Kısmen gönderildi" : "Gönderildi",
          message: d.message,
          type: skippedCount > 0 ? "error" : "success",
        });
        clearSelection();
        setMessage("");
        setWhatsappMessage("");
        setSelectedCelebration(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      // Ağ cevabı hiç ulaşmadıysa aynı anahtar korunur; kullanıcı tekrar
      // denediğinde backend mevcut dispatch kayıtlarını yeniden kullanır.
      if (responseReceived) requestIdRef.current = null;
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
    // Telefon numarası burada gösterilmiyor — bu ekranın amacı SMS için hasta
    // seçmek, numarayı doğrulamak değil; kaldırılması aynı tabloya daha fazla
    // isim sığmasını sağlıyor (bkz. kullanıcı geri bildirimi).
    { key: "fullName", header: "Ad Soyad", render: (p) => <span className="font-bold text-slate-900">{p.fullName}</span> },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Toplu İletişim</h2>
        <p className="mt-1 text-sm text-slate-500">
          Bayram, kampanya veya duyuru gibi özel günlerde hastalarınıza toplu mesaj gönderin. Kanal, izin ve mevcut bağlantıya göre otomatik seçilir.
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
            {patientLoadError && <LoadErrorState compact message={patientLoadError} onRetry={() => setPatientReloadKey((value) => value + 1)} />}
            <ListTable
              columns={columns}
              rows={patients}
              rowKey={(p) => p.id}
              loading={loading}
              emptyText="Hasta bulunamadı"
            />
          </div>
        ) : (
          patientLoadError ? (
            <LoadErrorState message={patientLoadError} onRetry={() => setPatientReloadKey((value) => value + 1)} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-8 text-center">
              <Users className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-bold text-amber-800">
                Kliniğinizdeki {totalPatients ?? "…"} hastanın tamamına gönderilecek
              </p>
              <p className="text-xs text-amber-700">Telefon numarası olmayan hastalar otomatik olarak atlanır.</p>
            </div>
          )
        )}

        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div><p className="mb-2 text-xs font-bold uppercase text-slate-500">Gönderim kanalı</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{channelOptions.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setChannelPreference(value)} className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-bold transition ${channelPreference === value ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-600 hover:border-primary/30"}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Hazır Şablonlar</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {celebrationTemplates.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => applyHolidayTemplate(t)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedCelebration === t.code ? "border-primary bg-primary text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"}`}
                >
                  {t.title}{t.targetProfessions.length ? " · Mesleğe özel" : ""}
                </button>
              ))}
            </div>
            {celebrationLoadError && (
              <div className="mt-2">
                <LoadErrorState compact message={celebrationLoadError} onRetry={() => setCelebrationReloadKey((value) => value + 1)} />
              </div>
            )}
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
          {whatsappEnabled && channelPreference !== "SMS" && <SmsMessageEditor value={whatsappMessage} onChange={(value) => { setWhatsappMessage(value); setSelectedCelebration(null); }} placeholders={BULK_PLACEHOLDERS} insertContext={{ institutionName: institutionName || undefined, institutionPhone: institutionPhone || undefined }} previewContext={{ institutionName: institutionName || undefined, institutionPhone: institutionPhone || undefined }} rows={4} label="WhatsApp Metni" />}
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
