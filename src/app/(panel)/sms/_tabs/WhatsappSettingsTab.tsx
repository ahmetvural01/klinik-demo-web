"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Link2, MessageCircle, RefreshCw, Send, ShieldCheck, Unplug } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";

type ConnectionStatus = "NOT_CONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
type Provider = {
  id: string;
  isActive: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastWebhookAt: string | null;
  lastSuccessfulSendAt: string | null;
  updatedAt: string;
};
type Preferences = {
  mode: "SMS" | "WHATSAPP" | "WHATSAPP_FALLBACK";
  appointment: boolean;
  payment: boolean;
  info: boolean;
};
type SignupStart = { appId: string; configId: string; apiVersion: string; state: string };
type SignupAccount = { businessAccountId: string; phoneNumberId: string; businessId?: string | null };

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string }; status?: string }) => void, options: Record<string, unknown>) => void;
    };
  }
}

const inputClass = "w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const defaultPreferences: Preferences = { mode: "SMS", appointment: true, payment: true, info: true };

function statusPresentation(status: ConnectionStatus | undefined): { label: string; tone: BadgeTone; icon: typeof Clock3 } {
  if (status === "CONNECTED") return { label: "Bağlı", tone: "success", icon: CheckCircle2 };
  if (status === "CONNECTING") return { label: "Bağlanıyor", tone: "info", icon: RefreshCw };
  if (status === "ERROR") return { label: "Bağlantı hatası", tone: "critical", icon: AlertCircle };
  if (status === "DISCONNECTED") return { label: "Bağlantı kesildi", tone: "neutral", icon: Unplug };
  return { label: "Bağlı değil", tone: "neutral", icon: Clock3 };
}

function loadFacebookSdk() {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Meta bağlantı penceresi yüklenemedi.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/tr_TR/sdk.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Meta bağlantı penceresi yüklenemedi."));
    document.body.appendChild(script);
  });
}

export default function WhatsappSettingsTab({ connectionOnly = false }: { connectionOnly?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [platformReady, setPlatformReady] = useState(false);
  const [canManageConnection, setCanManageConnection] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadSequenceRef = useRef(0);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Merhaba, WhatsApp bağlantınız başarıyla çalışıyor.");
  const [testing, setTesting] = useState(false);
  const signupRef = useRef<SignupStart | null>(null);
  const codeRef = useRef<string | null>(null);
  const accountRef = useRef<SignupAccount | null>(null);
  const completingRef = useRef(false);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/whatsapp/provider", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "WhatsApp ayarları yüklenemedi.");
      if (sequence !== loadSequenceRef.current) return;
      setEnabled(Boolean(data?.enabled));
      setPlatformReady(Boolean(data?.platformReady));
      setCanManageConnection(Boolean(data?.canManageConnection));
      setProvider(data?.provider || null);
      setPreferences(data?.preferences || defaultPreferences);
    } catch (error) {
      if (sequence !== loadSequenceRef.current) return;
      const message = error instanceof Error ? error.message : "WhatsApp ayarları yüklenemedi";
      setLoadError(message);
      showToastSafe({ message, type: "error" });
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cancelSignup = useCallback(() => {
    signupRef.current = null;
    codeRef.current = null;
    accountRef.current = null;
    return fetch("/api/whatsapp/embedded-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    }).catch(() => undefined);
  }, []);

  const completeConnection = useCallback(async () => {
    const signup = signupRef.current;
    const code = codeRef.current;
    const account = accountRef.current;
    if (!signup || !code || !account || completingRef.current) return;
    completingRef.current = true;
    try {
      const res = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", state: signup.state, code, ...account }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "WhatsApp bağlantısı tamamlanamadı.");
      showToastSafe({ message: "WhatsApp Business hesabınız bağlandı", type: "success", icon: "sms" });
      await load();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "WhatsApp bağlantısı tamamlanamadı", type: "error" });
      await load();
    } finally {
      completingRef.current = false;
      signupRef.current = null;
      codeRef.current = null;
      accountRef.current = null;
      setConnecting(false);
    }
  }, [load]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      try {
        const host = new URL(event.origin).hostname;
        if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      } catch { return; }
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      const message = payload as { type?: string; event?: string; data?: Record<string, string> };
      if (message.type !== "WA_EMBEDDED_SIGNUP") return;
      if (message.event === "FINISH" && message.data?.waba_id && message.data?.phone_number_id) {
        accountRef.current = {
          businessAccountId: message.data.waba_id,
          phoneNumberId: message.data.phone_number_id,
          businessId: message.data.business_id || null,
        };
        void completeConnection();
      } else if (message.event === "CANCEL" || message.event === "ERROR") {
        setConnecting(false);
        void cancelSignup();
        showToastSafe({ message: message.event === "CANCEL" ? "Meta bağlantı işlemi iptal edildi" : "Meta bağlantı işlemi tamamlanamadı", type: "error" });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cancelSignup, completeConnection]);

  const connect = async () => {
    if (!platformReady) {
      showToastSafe({ message: "WhatsApp numarası bağlama hizmeti şu anda kullanılamıyor.", type: "error" });
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json().catch(() => ({})) as SignupStart & { message?: string };
      if (!res.ok) throw new Error(data.message || "Meta bağlantısı başlatılamadı.");
      signupRef.current = data;
      await loadFacebookSdk();
      window.FB?.init({ appId: data.appId, autoLogAppEvents: true, xfbml: false, version: data.apiVersion });
      window.FB?.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setConnecting(false);
          void cancelSignup();
          showToastSafe({ message: "Meta bağlantı izni tamamlanmadı", type: "error" });
          return;
        }
        codeRef.current = code;
        void completeConnection();
      }, {
        config_id: data.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3" },
      });
    } catch (error) {
      setConnecting(false);
      if (signupRef.current) await cancelSignup();
      showToastSafe({ message: error instanceof Error ? error.message : "Meta bağlantısı başlatılamadı", type: "error" });
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Tercihler kaydedilemedi.");
      showToastSafe({ message: "Bildirim tercihleri kaydedildi", type: "success" });
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Tercihler kaydedilemedi", type: "error" });
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    const confirmed = await confirmDialog({
      title: "WhatsApp bağlantısını kes",
      message: "Yeni WhatsApp gönderimleri durur ve bildirim kanalı SMS'e alınır. Mesaj geçmişiniz korunur.",
      confirmText: "Bağlantıyı Kes",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/provider", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Bağlantı kesilemedi.");
      showToastSafe({ message: data.warning || "WhatsApp bağlantısı kesildi", type: data.warning ? "error" : "success" });
      await load();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Bağlantı kesilemedi", type: "error" });
    } finally { setDisconnecting(false); }
  };

  const submitTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/whatsapp/provider/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || data.message || "Test mesajı gönderilemedi.");
      showToastSafe({ message: "Test mesajı Meta tarafından kabul edildi", type: "success", icon: "sms" });
      setTestOpen(false);
      void load();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Test mesajı gönderilemedi", type: "error" });
    } finally { setTesting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><RefreshCw className="h-7 w-7 animate-spin text-primary" /></div>;
  if (loadError) return <LoadErrorState message={loadError} onRetry={() => void load()} />;
  if (!enabled) return null;

  const state = provider?.connectionStatus === "CONNECTED" && provider.isActive
    ? statusPresentation("CONNECTED")
    : platformReady
      ? statusPresentation(provider?.connectionStatus)
      : { label: "Bağlantı kullanılamıyor", tone: "neutral" as const, icon: Clock3 };
  const connected = provider?.connectionStatus === "CONNECTED" && provider.isActive;

  return (
    <section className="space-y-4">
      <div className="border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><MessageCircle className="h-6 w-6" /></span>
            <div><h1 className="text-base font-black text-slate-900">WhatsApp Business</h1><p className="text-xs text-slate-500">Kliniğinizin resmi mesajlaşma kanalı</p></div>
          </div>
          <Badge tone={state.tone} icon={state.icon} size="md">{state.label}</Badge>
        </div>

        {!connected && !canManageConnection ? (
          <div className="flex items-start gap-4 px-5 py-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-600"><ShieldCheck className="h-5 w-5" /></span>
            <div><h2 className="text-base font-black text-slate-900">Bağlantı yönetici yetkisi gerektirir</h2><p className="mt-1 text-sm text-slate-600">Bağlantı durumunu görebilirsiniz; kurulum ve bağlantı kesme işlemleri yöneticiye aittir.</p></div>
          </div>
        ) : !connected ? (
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-lg font-black text-slate-900">WhatsApp Business numaranızı bağlayın</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Güvenli Meta penceresinde klinik numaranızı girin veya seçin, telefonunuza gelen kodla doğrulayın. Bağlantı tamamlandığında mesajlar kliniğinizin kendi numarasından gönderilir.</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">API bilgisi, erişim anahtarı veya teknik kurulum gerekmez.</p>
              {!platformReady && (
                <div role="alert" className="mt-4 flex max-w-2xl items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-bold">Numara bağlama hizmeti şu anda kullanılamıyor.</p>
                    <p className="mt-0.5 text-xs leading-5 text-amber-800">Kliniğinizin WhatsApp yetkisi açık. Klinik hesabınızda ek bir ayar yapmanız gerekmiyor; sistem yöneticinizin bağlantı hizmetini etkinleştirmesi gerekiyor.</p>
                  </div>
                </div>
              )}
              {provider?.connectionError && <p className="mt-3 flex items-start gap-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{provider.connectionError}</p>}
            </div>
            {platformReady && <Button icon={Link2} onClick={connect} loading={connecting}>{provider ? "Yeniden Bağlan" : "Numaramı Bağla"}</Button>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-6">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-700">WhatsApp hesabınız kullanıma hazır.</p>
                <p className="mt-1 truncate text-base font-black text-slate-900">{provider.verifiedName || "WhatsApp Business"}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-600">{provider.displayPhoneNumber || "Numara doğrulandı"}</p>
              </div>
            </div>
            {connectionOnly && canManageConnection && <div className="flex flex-wrap gap-2"><Button variant="secondary" icon={Send} onClick={() => setTestOpen(true)}>Test Mesajı Gönder</Button><Button variant="ghost" icon={Unplug} onClick={disconnect} loading={disconnecting}>Bağlantıyı Kes</Button></div>}
          </div>
        )}
      </div>

      {!connectionOnly && (
      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-sm font-black text-slate-900">Gönderim politikası</h2></div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {([
            ["SMS", "Yalnız SMS", "Tüm bildirimler SMS üzerinden gider."],
            ["WHATSAPP", "Yalnız WhatsApp", "WhatsApp başarısızsa SMS gönderilmez."],
            ["WHATSAPP_FALLBACK", "WhatsApp, sonra SMS", "Teslim isteği başarısız olursa SMS denenir."],
          ] as const).map(([value, title, description]) => (
            <button key={value} type="button" onClick={() => setPreferences({ ...preferences, mode: value })} disabled={value !== "SMS" && !connected}
              className={`min-h-[92px] rounded-md border p-3 text-left transition ${preferences.mode === value ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 hover:border-slate-300"} disabled:cursor-not-allowed disabled:opacity-45`}>
              <span className="text-sm font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
          {([
            ["appointment", "Randevu bildirimleri", "Oluşturma, değişiklik, iptal ve hatırlatma mesajları"],
            ["payment", "Ödeme hatırlatmaları", "Yaklaşan ve geciken ödeme bildirimleri"],
            ["info", "Bilgilendirme mesajları", "Anket, kutlama ve genel klinik mesajları"],
          ] as const).map(([key, title, description]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3">
              <span><span className="block text-sm font-bold text-slate-800">{title}</span><span className="block text-xs text-slate-500">{description}</span></span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {connected && canManageConnection && <Button variant="secondary" icon={Send} onClick={() => setTestOpen(true)}>Test Mesajı Gönder</Button>}
            {connected && canManageConnection && <Button variant="ghost" icon={Unplug} onClick={disconnect} loading={disconnecting}>Bağlantıyı Kes</Button>}
          </div>
          <Button onClick={savePreferences} loading={saving}>Tercihleri Kaydet</Button>
        </div>
      </div>
      )}

      <Modal module="sms" open={testOpen} onClose={() => setTestOpen(false)} title="WhatsApp Test Mesajı" footer={<><Button variant="secondary" onClick={() => setTestOpen(false)}>İptal</Button><Button icon={Send} loading={testing} onClick={submitTest} disabled={!testPhone.trim() || !testMessage.trim()}>Gönder</Button></>}>
        <div className="space-y-4">
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Serbest metin testi için alıcı numara son 24 saat içinde kliniğin WhatsApp numarasına mesaj göndermiş olmalıdır. Diğer gönderimlerde Meta onaylı şablon kullanılır.</p>
          <FormField label="Alıcı telefon"><input className={inputClass} value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" /></FormField>
          <FormField label="Test mesajı"><textarea className={inputClass} rows={3} value={testMessage} onChange={(event) => setTestMessage(event.target.value)} /></FormField>
        </div>
      </Modal>
    </section>
  );
}
