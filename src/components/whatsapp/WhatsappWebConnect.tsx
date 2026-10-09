"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Info, Link2Off, QrCode, RefreshCw, Send, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import type { WhatsappWebStatusResponse } from "@/lib/whatsapp-web/types";

type Method = "qr" | "code";

const POLL_PAIRING_MS = 2_500;
const POLL_IDLE_MS = 30_000;

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("tr-TR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

/**
 * Kliniğin kendi WhatsApp numarasını "bağlı cihaz" olarak bağladığı kart
 * (WhatsApp Web gibi QR kod ya da telefon numarasıyla eşleştirme kodu).
 * Bağlanınca hatırlatma, ödeme, kutlama ve randevu mesajları bu numaradan
 * gider; bağlantı koparsa mesajlar SMS ile gider. Panelde sohbet ekranı yok:
 * gelen mesajlar sisteme alınmaz.
 */
export function WhatsappWebConnect({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<WhatsappWebStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [blockedMessage, setBlockedMessage] = useState("");
  const [method, setMethod] = useState<Method>("qr");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"" | "connect" | "test" | "disconnect">("");
  const previousState = useRef<string | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/web", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 403) {
        setBlockedMessage(data?.message || "WhatsApp kullanımı bu klinik için açık değil.");
        setStatus(null);
        setLoadError("");
        return;
      }
      if (!response.ok || !data) throw new Error(data?.message || "WhatsApp bağlantı durumu okunamadı.");
      setBlockedMessage("");
      setLoadError("");
      setStatus(data as WhatsappWebStatusResponse);
    } catch (error) {
      if (!quiet) setLoadError(error instanceof Error ? error.message : "WhatsApp bağlantı durumu okunamadı.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Eşleştirme sırasında QR/kod birkaç saniyede bir yenilenir; bağlıyken seyrek.
  const pairing = status?.state === "QR" || status?.state === "CONNECTING";
  useEffect(() => {
    if (!status) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, pairing ? POLL_PAIRING_MS : POLL_IDLE_MS);
    return () => window.clearInterval(timer);
  }, [load, pairing, status]);

  useEffect(() => {
    const state = status?.state ?? null;
    if (previousState.current && previousState.current !== "CONNECTED" && state === "CONNECTED") {
      showToastSafe({ type: "success", message: "WhatsApp numaranız bağlandı. Mesajlar artık bu numaradan gidecek." });
      onChangedRef.current?.();
    }
    previousState.current = state;
  }, [status?.state]);

  const startPairing = async () => {
    if (busy) return;
    if (method === "code" && phone.replace(/\D/g, "").length < 10) {
      showToastSafe({ type: "error", message: "WhatsApp kullandığınız telefon numarasını yazın (ör. 0532 123 45 67)." });
      return;
    }
    setBusy("connect");
    try {
      const response = await fetch("/api/whatsapp/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "code" ? { action: "connect", method: "code", phone } : { action: "connect", method: "qr" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Bağlantı başlatılamadı.");
      setStatus(data as WhatsappWebStatusResponse);
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Bağlantı başlatılamadı." });
    } finally {
      setBusy("");
    }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy("test");
    try {
      const response = await fetch("/api/whatsapp/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Test mesajı gönderilemedi.");
      showToastSafe({ type: "success", message: data?.message || "Test mesajı kendi numaranıza gönderildi." });
      void load(true);
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Test mesajı gönderilemedi." });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async (askFirst: boolean) => {
    if (busy) return;
    if (askFirst) {
      const ok = await confirmDialog({
        title: "WhatsApp bağlantısı kesilsin mi?",
        message: "Bağlantı kesilince mesajlar SMS ile gider. Numaranızı istediğiniz zaman yeniden bağlayabilirsiniz.",
        confirmText: "Bağlantıyı kes",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy("disconnect");
    try {
      const response = await fetch("/api/whatsapp/web", { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Bağlantı kesilemedi.");
      setStatus(data as WhatsappWebStatusResponse);
      if (askFirst) showToastSafe({ type: "success", message: "WhatsApp bağlantısı kesildi. Mesajlar SMS ile gidecek." });
      onChangedRef.current?.();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Bağlantı kesilemedi." });
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Spinner className="h-4 w-4" /> WhatsApp bağlantı durumu kontrol ediliyor…
      </div>
    );
  }
  if (blockedMessage) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <p>WhatsApp ile mesaj göndermek için platform yöneticinizden kliniğinize WhatsApp kullanımını açmasını isteyin. Açılana kadar mesajlar SMS ile gider.</p>
      </div>
    );
  }
  if (loadError || !status) {
    return <LoadErrorState message={loadError || "WhatsApp bağlantı durumu okunamadı."} onRetry={() => void load()} />;
  }

  const restrictedUntil = formatDateTime(status.restrictedUntil);
  const infoBox = (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <p>
        Bu bağlantı WhatsApp&apos;ın &quot;bağlı cihaz&quot; özelliğini kullanır. Numaranızı korumak için mesajlar kısa aralıklarla ve
        günde en fazla {status.dailyLimit} adet gönderilir. Gelen mesajlarınız ve sohbetleriniz sisteme alınmaz. Telefonunuz en az
        14 günde bir internete bağlanmalıdır. Bağlantı koparsa, kanal ayarı “Önce WhatsApp, olmazsa SMS” ise mesajlar SMS ile gider.
      </p>
    </div>
  );

  // ── Bağlı ────────────────────────────────────────────────────────────────
  if (status.state === "CONNECTED") {
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900">{status.phone || "WhatsApp numaranız"}</p>
                <Badge tone="success">Bağlı</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {status.name ? `${status.name} · ` : ""}
                {status.connectedAt ? `${formatDateTime(status.connectedAt)} tarihinden beri bağlı` : "Bağlı"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Bugün gönderilen: <span className="font-bold tabular-nums">{status.dailySentCount}</span> / {status.dailyLimit}
              </p>
            </div>
          </div>
          {status.canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={Send} loading={busy === "test"} onClick={() => void sendTest()}>Test mesajı gönder</Button>
              <Button variant="ghost" size="sm" icon={Link2Off} loading={busy === "disconnect"} onClick={() => void disconnect(true)}>Bağlantıyı kes</Button>
            </div>
          )}
        </div>
        {restrictedUntil && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            WhatsApp bu numaranın gönderimini {restrictedUntil} tarihine kadar sınırladı. Bu sürede mesajlar SMS ile gider.
          </p>
        )}
        {status.notice && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{status.notice}</p>}
        {infoBox}
      </div>
    );
  }

  // ── Eşleştirme sürüyor ───────────────────────────────────────────────────
  if (status.state === "QR" && (status.qrDataUrl || status.pairingCode)) {
    const byCode = Boolean(status.pairingCode);
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="grid gap-5 rounded-lg border border-slate-200 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="flex justify-center">
            {byCode ? (
              <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-6 py-5 text-center">
                <p className="text-xs font-semibold text-slate-500">Eşleştirme kodu</p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em] text-slate-900">{status.pairingCode}</p>
              </div>
            ) : (
              // QR sunucuda üretilen data URL'dir; optimize edilmeden gösterilir.
              <Image src={status.qrDataUrl || ""} unoptimized alt="WhatsApp bağlantı QR kodu" width={232} height={232} className="h-[232px] w-[232px] rounded-lg border border-slate-200 bg-white p-2" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{byCode ? "Kodu telefonunuzdaki WhatsApp'a yazın" : "QR kodu telefonunuzla okutun"}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>Telefonunuzda WhatsApp&apos;ı açın.</li>
              <li><strong>Android:</strong> sağ üstteki ⋮ menü · <strong>iPhone:</strong> Ayarlar</li>
              <li><strong>Bağlı cihazlar</strong> → <strong>Cihaz bağla</strong> seçin.</li>
              {byCode
                ? <li><strong>Bunun yerine telefon numarasıyla bağla</strong>&apos;ya dokunup yukarıdaki kodu yazın.</li>
                : <li>Telefonu bu ekrandaki QR koda tutun.</li>}
            </ol>
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Spinner className="h-3.5 w-3.5" /> {byCode ? "Kod yazılınca bağlantı kendiliğinden tamamlanır." : "Kod birkaç saniyede bir yenilenir; okutunca bağlantı kendiliğinden tamamlanır."}
            </p>
            {status.canManage && (
              <div className="mt-3">
                <Button variant="ghost" size="sm" loading={busy === "disconnect"} onClick={() => void disconnect(false)}>Vazgeç</Button>
              </div>
            )}
          </div>
        </div>
        {infoBox}
      </div>
    );
  }

  if (status.state === "CONNECTING") {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-4 text-sm text-slate-700">
        <Spinner className="h-4 w-4" /> WhatsApp&apos;a bağlanılıyor…
      </div>
    );
  }

  // ── Bağlı değil / hata ───────────────────────────────────────────────────
  return (
    <div className="space-y-4" aria-live="polite">
      {status.state === "ERROR" && status.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{status.error}</p>
      )}
      {status.pairingExpired && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Kodun süresi doldu. Yeniden başlatıp tekrar deneyin.</p>
      )}
      {status.notice && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{status.notice}</p>}

      {!status.canManage ? (
        <p className="text-sm text-slate-600">WhatsApp numarası bağlı değil. Bağlantıyı klinik yöneticisi kurabilir; o zamana kadar mesajlar SMS ile gider.</p>
      ) : (
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <div>
            <p className="text-sm font-bold text-slate-900">WhatsApp numaranızı bağlayın</p>
            <p className="mt-0.5 text-sm text-slate-600">Hatırlatma ve bilgilendirme mesajları kendi WhatsApp numaranızdan gider. Kurumsal numara gerekmez.</p>
          </div>
          <Tabs<Method>
            ariaLabel="Bağlama yöntemi"
            size="sm"
            value={method}
            onChange={setMethod}
            items={[
              { key: "qr", label: "QR kodu okut" },
              { key: "code", label: "Telefon numarasıyla bağla" },
            ]}
          />
          {method === "code" && (
            <FormField label="WhatsApp kullandığınız numara" htmlFor="wa-pair-phone" hint="Bu paneli WhatsApp'ın yüklü olduğu telefondan açıyorsanız bu yolu kullanın.">
              <Input id="wa-pair-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0532 123 45 67" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </FormField>
          )}
          <Button
            icon={method === "qr" ? QrCode : Smartphone}
            loading={busy === "connect"}
            onClick={() => void startPairing()}
          >
            {method === "qr" ? "QR kodu göster" : "Eşleştirme kodunu al"}
          </Button>
          {status.state === "ERROR" && (
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => void load()}>Durumu yenile</Button>
          )}
        </div>
      )}
      {infoBox}
    </div>
  );
}
