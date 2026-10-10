"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Send, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Callout } from "@/components/ui/Callout";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormModal } from "@/components/ui/FormModal";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type Provider = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  priority: number;
  sendUrl: string | null;
  balanceUrl: string | null;
  httpMethod: string;
  username: string | null;
  hasPassword: boolean;
  hasApiKey: boolean;
  sender: string | null;
  headersJson: string | null;
  bodyTemplate: string | null;
  successPattern: string | null;
};

const EMPTY = {
  code: "", name: "", sendUrl: "", balanceUrl: "", httpMethod: "POST",
  username: "", password: "", apiKey: "", sender: "", headersJson: "", bodyTemplate: "", successPattern: "",
};

const isMock = (provider: Provider) => provider.code === "MOCK";

/**
 * SMS sağlayıcısı: tüm kliniklerin SMS'i AKTİF sağlayıcı üzerinden gider
 * (aynı anda tek sağlayıcı aktif olabilir). Önceden "Aktif Et" onaysızdı ve
 * gönderim adresi/şifresi olmayan bir sağlayıcıyı da aktif edebiliyordu;
 * ekranda işlevsiz bir "Öncelik" alanı ve yazısız simge düğmeler vardı.
 */
export default function ProviderTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<Provider | null>(null);
  const [testForm, setTestForm] = useState({ phone: "", message: "CepKlinik deneme mesajı" });
  const [testError, setTestError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<{ providers: Provider[] }>("/api/superadmin/sms-provider", "SMS sağlayıcıları yüklenemedi.", controller.signal)
      .then((data) => setProviders(Array.isArray(data?.providers) ? data.providers : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "SMS sağlayıcıları yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const active = providers.find((item) => item.isActive) || null;
  const advancedFilled = [form.balanceUrl, form.headersJson, form.bodyTemplate, form.successPattern].some((value) => value.trim());
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (item: Provider) => {
    setEditing(item);
    setForm({
      code: item.code, name: item.name, sendUrl: item.sendUrl ?? "", balanceUrl: item.balanceUrl ?? "", httpMethod: item.httpMethod,
      username: item.username ?? "", password: "", apiKey: "", sender: item.sender ?? "", headersJson: item.headersJson ?? "",
      bodyTemplate: item.bodyTemplate ?? "", successPattern: item.successPattern ?? "",
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!editing && !/^[A-Za-z0-9_-]{2,40}$/.test(form.code.trim())) return setFormError("Kısa kod 2-40 harf/rakam olmalı (ör. NETGSM).");
    if (!form.name.trim()) return setFormError("Sağlayıcı adını yazın.");
    setSaving(true);
    setFormError(null);
    try {
      // Öncelik alanı ekrandan kaldırıldı (tek aktif sağlayıcı kuralıyla
      // işlevsizdi); düzenlemede mevcut değer korunur. Aktif etme yalnız
      // listedeki onaylı "Aktif et" ile yapılır.
      const { code, ...rest } = form;
      if (editing) await saSend("/api/superadmin/sms-provider", "PUT", { id: editing.id, ...rest }, "Sağlayıcı kaydedilemedi.");
      else await saSend("/api/superadmin/sms-provider", "POST", { code: code.trim(), ...rest, isActive: false }, "Sağlayıcı kaydedilemedi.");
      showToastSafe({ type: "success", message: `${form.name.trim()} kaydedildi.`, icon: "sms" });
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Sağlayıcı kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const activate = async (item: Provider) => {
    if (!isMock(item) && !item.sendUrl) {
      showToastSafe({ type: "error", message: `${item.name} için gönderim adresi tanımlı değil. Önce Düzenle'den ekleyin.` });
      return;
    }
    const missingCredentials = !isMock(item) && !item.hasPassword && !item.hasApiKey;
    const ok = await confirmDialog({
      title: `${item.name} aktif edilsin mi?`,
      message: [
        `Tüm kliniklerin SMS'leri (randevu hatırlatma, ödeme, kutlama) bundan sonra ${item.name} üzerinden gönderilecek.${active ? ` Şu anki sağlayıcı (${active.name}) kapanacak.` : ""}`,
        isMock(item) ? "Bu bir DENEME sağlayıcısıdır: mesajlar gerçekte gönderilmez." : "Önce “Deneme SMS” ile kendi telefonunuza mesaj geldiğini doğrulayın.",
        missingCredentials ? "Uyarı: şifre veya API anahtarı tanımlı değil; gönderimler başarısız olabilir." : "",
      ].filter(Boolean).join("\n\n"),
      confirmText: "Aktif et",
      cancelText: "Vazgeç",
      danger: isMock(item) || missingCredentials,
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await saSend("/api/superadmin/sms-provider", "PUT", { id: item.id, isActive: true }, "Sağlayıcı aktif edilemedi.");
      showToastSafe({ type: "success", message: `${item.name} artık aktif SMS sağlayıcısı.`, icon: "sms" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Sağlayıcı aktif edilemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const checkBalance = async (item: Provider) => {
    setBusyId(item.id);
    try {
      const result = await saSend<{ ok: boolean; balance?: string | null; raw?: string; error?: string }>("/api/superadmin/sms-provider/balance", "POST", { providerId: item.id }, "Bakiye sorgulanamadı.");
      if (result.ok) showToastSafe({ type: "success", message: `${item.name} bakiyesi: ${result.balance ?? result.raw ?? "—"}`, icon: "sms" });
      else showToastSafe({ type: "error", message: result.error || "Bakiye sorgulanamadı." });
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Bakiye sorgulanamadı.") });
    } finally {
      setBusyId(null);
    }
  };

  const sendTest = async () => {
    if (!testTarget) return;
    if (testForm.phone.replace(/\D/g, "").length < 10) return setTestError("Geçerli bir telefon numarası yazın.");
    if (!testForm.message.trim()) return setTestError("Mesaj yazın.");
    setSending(true);
    setTestError(null);
    try {
      const result = await saSend<{ ok: boolean; providerMessageId?: string; error?: string }>("/api/superadmin/sms-provider/test-send", "POST", { providerId: testTarget.id, phone: testForm.phone.trim(), message: testForm.message.trim() }, "Deneme SMS'i gönderilemedi.");
      if (!result.ok) {
        setTestError(result.error || "Deneme SMS'i gönderilemedi.");
        return;
      }
      showToastSafe({ type: "success", message: isMock(testTarget) ? "Deneme kaydedildi (deneme sağlayıcısı gerçek SMS göndermez)." : "Deneme SMS'i gönderildi. Telefonunuzu kontrol edin.", icon: "sms" });
      setTestTarget(null);
    } catch (error) {
      setTestError(errorMessage(error, "Deneme SMS'i gönderilemedi."));
    } finally {
      setSending(false);
    }
  };

  const credentialText = (item: Provider) => isMock(item)
    ? "Deneme sağlayıcısı — gerçek SMS göndermez"
    : [item.sendUrl ? "Gönderim adresi var" : "Gönderim adresi yok", item.hasPassword || item.hasApiKey ? "kimlik bilgisi var" : "şifre/anahtar yok", item.sender ? `başlık: ${item.sender}` : ""].filter(Boolean).join(" · ");

  // Satırda en sık iki iş görünür (Aktif et, Deneme SMS); bakiye ve düzenleme "…" menüsünde.
  const actions = (item: Provider) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {!item.isActive && <Button size="sm" variant="secondary" disabled={busyId === item.id} onClick={() => void activate(item)}>Aktif et</Button>}
      <Button size="sm" variant="ghost" icon={Send} onClick={() => { setTestTarget(item); setTestError(null); }}>Deneme SMS</Button>
      <ActionMenu
        label={item.name + " için diğer işlemler"}
        items={[
          { key: "balance", label: "Bakiye sorgula", icon: Wallet, disabled: busyId === item.id, onSelect: () => void checkBalance(item) },
          { key: "edit", label: "Düzenle", icon: Pencil, onSelect: () => openEdit(item) },
        ]}
      />
    </div>
  );

  const columns: ListTableColumn<Provider>[] = [
    {
      key: "name",
      header: "Sağlayıcı",
      render: (item) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{item.name} <span className="text-xs font-normal text-slate-500">({item.code})</span></p>
          <p className={`text-xs ${!isMock(item) && (!item.sendUrl || (!item.hasPassword && !item.hasApiKey)) ? "text-amber-700" : "text-slate-500"}`}>{credentialText(item)}</p>
        </div>
      ),
    },
    { key: "status", header: "Durum", render: (item) => (item.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Pasif</Badge>) },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  return (
    <section className="space-y-3">
      {!loading && !loadError && (!active || isMock(active)) && (
        <Callout tone="warning" title={active ? "SMS'ler hastalara gitmiyor" : "Aktif SMS sağlayıcısı yok"}>
          {active
            ? `Aktif sağlayıcı "${active.name}" bir deneme sağlayıcısı. Gerçek gönderim için bir sağlayıcı ekleyip test edin ve aktif edin.`
            : "Sistem sunucu ayarlarındaki varsayılan sağlayıcıyı dener. Bir sağlayıcı ekleyip aktif edin."}
        </Callout>
      )}

      <ListTable<Provider>
        subtitle="Tüm kliniklerin SMS'i aktif sağlayıcıdan gider; aynı anda tek sağlayıcı aktif olabilir."
        actions={<Button size="sm" variant="secondary" icon={Plus} onClick={openCreate}>Yeni sağlayıcı</Button>}
        columns={columns}
        rows={providers}
        rowKey={(item) => item.id}
        loading={loading}
        // Veri varken yenileme hatası listeyi silmez; üstte şerit olarak görünür.
        error={providers.length > 0 ? null : loadError}
        staleError={providers.length > 0 ? loadError : null}
        onRetry={reload}
        emptyText="Henüz sağlayıcı yok"
        emptyDescription="SMS gönderebilmek için sağlayıcınızın (ör. NetGSM) bilgilerini ekleyin."
        mobileCard={(item) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{item.name}</p>
              {item.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Pasif</Badge>}
            </div>
            <p className="text-xs text-slate-500">{credentialText(item)}</p>
            {actions(item)}
          </div>
        )}
      />

      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Sağlayıcıyı düzenle" : "Yeni SMS sağlayıcısı"}
        description="Bilgileri sağlayıcınızın entegrasyon belgesinden alın. Şifre ve anahtar şifreli saklanır, ekranda gösterilmez."
        size="lg"
        onSubmit={() => save()}
        submitting={saving}
        error={formError}
      >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Ad" htmlFor="provider-name" required>
              <Input id="provider-name" autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="NetGSM" />
            </FormField>
            <FormField label="Kısa kod" htmlFor="provider-code" required={!editing} hint={editing ? "Değiştirilemez" : "Harf/rakam, ör. NETGSM"}>
              <Input id="provider-code" value={form.code} disabled={Boolean(editing)} onChange={(event) => set("code", event.target.value.toUpperCase())} />
            </FormField>
            <FormField label="Gönderici başlığı" htmlFor="provider-sender" hint="Hastanın telefonunda görünen ad">
              <Input id="provider-sender" value={form.sender} onChange={(event) => set("sender", event.target.value)} />
            </FormField>
            <FormField label="Kullanıcı adı" htmlFor="provider-user">
              <Input id="provider-user" value={form.username} onChange={(event) => set("username", event.target.value)} autoComplete="off" />
            </FormField>
            <FormField label="Şifre" htmlFor="provider-password" hint={editing ? (editing.hasPassword ? "Kayıtlı; değiştirmek için yeni şifreyi yazın" : "Kayıtlı şifre yok") : undefined}>
              <Input id="provider-password" type="password" value={form.password} onChange={(event) => set("password", event.target.value)} autoComplete="new-password" />
            </FormField>
            <FormField label="API anahtarı" htmlFor="provider-key" hint={editing ? (editing.hasApiKey ? "Kayıtlı; değiştirmek için yeni anahtarı yazın" : "Kayıtlı anahtar yok") : undefined}>
              <Input id="provider-key" type="password" value={form.apiKey} onChange={(event) => set("apiKey", event.target.value)} autoComplete="new-password" />
            </FormField>
          </div>
          {/* Gönderim adresi aktif etmenin ön koşulu: her zaman görünür. Seyrek
              gereken teknik alanlar katlı "Gelişmiş bağlantı ayarları"nda. */}
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <FormField label="Gönderim adresi" htmlFor="provider-send-url">
                <Input id="provider-send-url" value={form.sendUrl} onChange={(event) => set("sendUrl", event.target.value)} placeholder="https://api.saglayici.com/sms/send" />
              </FormField>
              <FormField label="Yöntem" htmlFor="provider-method">
                <Select id="provider-method" value={form.httpMethod} onChange={(event) => set("httpMethod", event.target.value)}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </Select>
              </FormField>
          </div>
          <Disclosure
            key={editing?.id ?? "new"}
            title="Gelişmiş bağlantı ayarları"
            summary={advancedFilled ? "Dolu alan var" : "İsteğe bağlı"}
            defaultOpen={advancedFilled}
          >
            <div className="space-y-3">
            <FormField label="Bakiye sorgu adresi" htmlFor="provider-balance-url">
              <Input id="provider-balance-url" value={form.balanceUrl} onChange={(event) => set("balanceUrl", event.target.value)} placeholder="https://api.saglayici.com/sms/balance" />
            </FormField>
            <FormField label="Ek başlıklar (JSON)" htmlFor="provider-headers" hint="İsteğe bağlı">
              <Textarea id="provider-headers" rows={2} value={form.headersJson} onChange={(event) => set("headersJson", event.target.value)} placeholder='{"X-Api-Key": "..."}' />
            </FormField>
            <FormField label="İstek gövdesi şablonu" htmlFor="provider-body" hint="İsteğe bağlı; {{phone}} ve {{message}} yer tutucuları kullanılabilir">
              <Textarea id="provider-body" rows={2} value={form.bodyTemplate} onChange={(event) => set("bodyTemplate", event.target.value)} />
            </FormField>
            <FormField label="Başarılı yanıt deseni" htmlFor="provider-success" hint="İsteğe bağlı; yanıtta bu ifade varsa gönderim başarılı sayılır">
              <Input id="provider-success" value={form.successPattern} onChange={(event) => set("successPattern", event.target.value)} />
            </FormField>
            </div>
          </Disclosure>
      </FormModal>

      <FormModal
        open={Boolean(testTarget)}
        onClose={() => setTestTarget(null)}
        title="Deneme SMS'i gönder"
        description={testTarget ? `${testTarget.name} üzerinden kendi telefonunuza bir deneme mesajı gönderin.` : undefined}
        size="sm"
        onSubmit={() => sendTest()}
        submitting={sending}
        submitLabel="Gönder"
        error={testError}
        formClassName="space-y-3"
      >
          <FormField label="Telefon" htmlFor="provider-test-phone" required>
            <Input id="provider-test-phone" type="tel" inputMode="tel" value={testForm.phone} onChange={(event) => setTestForm((current) => ({ ...current, phone: event.target.value }))} placeholder="05xx xxx xx xx" />
          </FormField>
          <FormField label="Mesaj" htmlFor="provider-test-message" required>
            <Textarea id="provider-test-message" rows={3} value={testForm.message} onChange={(event) => setTestForm((current) => ({ ...current, message: event.target.value }))} />
          </FormField>
      </FormModal>
    </section>
  );
}
