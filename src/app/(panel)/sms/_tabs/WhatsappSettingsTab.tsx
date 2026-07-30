"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";

type Provider = {
  id: string;
  isActive: boolean;
  accountSid: string | null;
  whatsappNumber: string | null;
  hasAuthToken: boolean;
  updatedAt: string;
};

const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const emptyForm = {
  accountSid: "",
  authToken: "",
  whatsappNumber: "",
  isActive: true,
};

// Klinik kendi WhatsApp bağlantısını buradan tanımlar; süperadmin yalnızca
// modülü açar. Akış, teknik detayları mümkün olduğunca gizleyip klinik için
// tek ekrandan bağla / test et / yeniden bağla deneyimi sağlamayı hedefler.
export default function WhatsappSettingsTab() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Merhaba, bu bir test mesajıdır.");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const settingsData = await settingsRes.json().catch(() => null);
      const isEnabled = Boolean(settingsData?.whatsappEnabled);
      setEnabled(isEnabled);

      if (isEnabled) {
        const res = await fetch("/api/whatsapp/provider");
        const data = await res.json().catch(() => null);
        if (data?.provider) {
          setProvider(data.provider);
          setForm({
            accountSid: data.provider.accountSid || "",
            authToken: "",
            whatsappNumber: data.provider.whatsappNumber || "",
            isActive: data.provider.isActive,
          });
        }
      }
    } catch {
      showToastSafe({ message: "WhatsApp ayarları yüklenemedi", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.accountSid.trim()) {
      showToastSafe({ message: "Twilio Account SID zorunlu", type: "error" });
      return;
    }
    if (!form.whatsappNumber.trim()) {
      showToastSafe({ message: "WhatsApp numarası zorunlu", type: "error" });
      return;
    }
    if (!provider && !form.authToken.trim()) {
      showToastSafe({ message: "Twilio Auth Token zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Kaydedilemedi");
      showToastSafe({ message: "WhatsApp bağlantısı kaydedildi", type: "success" });
      void load();
    } catch (e) {
      showToastSafe({ message: e instanceof Error ? e.message : "Kaydedilemedi", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const submitTest = async () => {
    if (!testPhone.trim() || !testMessage.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/api/whatsapp/provider/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        showToastSafe({ message: `Test mesajı gönderildi (${data.providerMessageId ?? "-"})`, type: "success" });
        setTestOpen(false);
      } else {
        showToastSafe({ message: data.error || data.message || "Gönderilemedi", type: "error" });
      }
    } catch {
      showToastSafe({ message: "Bağlantı hatası", type: "error" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-700">WhatsApp modülü kliniğiniz için henüz açılmamış.</p>
        <p className="mt-1 text-xs text-slate-500">Bu özelliği açmak için sistem yöneticinizle iletişime geçin.</p>
      </div>
    );
  }

  const connectionStatus = provider
    ? provider.isActive
      ? { tone: "success" as const, label: "Bağlı ve aktif" }
      : { tone: "warning" as const, label: "Bağlı ama pasif" }
    : { tone: "neutral" as const, label: "Henüz bağlı değil" };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">WhatsApp Bağlantısı</h1>
            <p className="mt-1 text-sm text-slate-500">Klinik numaranızı bağlayın, test edin ve gerektiğinde yeniden yapılandırın.</p>
          </div>
          {provider && (
            <Badge tone={provider.isActive ? "success" : "neutral"} size="md">
              {provider.isActive ? "Aktif" : "Pasif"}
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Bağlantı Durumu</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{connectionStatus.label}</p>
            <p className="mt-1 text-xs text-slate-500">
              WhatsApp etkinse, randevu ve bilgilendirme mesajları SMS yerine burada seçilen bağlantı üzerinden gönderilmeye çalışılır.
            </p>
          </div>
          <Badge tone={connectionStatus.tone}>{connectionStatus.label}</Badge>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-xs leading-relaxed text-slate-600">
        <p className="font-bold text-slate-700">Nasıl bağlanırım?</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4">
          <li><a href="https://www.twilio.com/try-twilio" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">twilio.com</a> üzerinden ücretsiz bir hesap açın (birkaç dakika sürer).</li>
          <li>Twilio Console ana sayfasında <strong>Account SID</strong> ve <strong>Auth Token</strong> değerlerini kopyalayın.</li>
          <li>WhatsApp Sandbox ile test edin, sonra kendi onaylı WhatsApp gönderici numaranıza geçin.</li>
          <li>Aşağıya bilgileri girip kaydedin, ardından test mesajı gönderin.</li>
        </ol>
        <details className="mt-3 border-t border-primary/15 pt-3">
          <summary className="cursor-pointer font-bold text-primary hover:underline">Adım adım detaylı rehber (resimsiz, açıklamalı)</summary>
          <div className="mt-3 space-y-3">
            <div>
              <p className="font-bold text-slate-700">1) Twilio hesabı açın</p>
              <p className="mt-1"><a href="https://www.twilio.com/try-twilio" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">twilio.com/try-twilio</a> adresine gidin, e-posta ve telefon numaranızla ücretsiz kayıt olun. Kayıt sırasında sorulan &quot;ne için kullanacaksınız&quot; gibi sorularda herhangi bir seçenek işaretlemeniz yeterli, panele girişinizi etkilemez.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">2) Account SID ve Auth Token&apos;ı bulun</p>
              <p className="mt-1">Twilio Console&apos;a (console.twilio.com) giriş yaptığınızda ana sayfanın en üstünde &quot;Account Info&quot; kutucuğunda <strong>Account SID</strong> ve <strong>Auth Token</strong> yazar (Auth Token gizlidir, yanındaki göz simgesine tıklayınca görünür). İkisini de kopyalayıp bir kenara not edin — bu bilgiler şifreniz gibidir, kimseyle paylaşmayın.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">3) Ücretsiz Sandbox ile hemen test edin</p>
              <p className="mt-1">Twilio Console&apos;da sol menüden <strong>Messaging &gt; Try it out &gt; Send a WhatsApp message</strong> yolunu izleyin. Size özel bir Twilio WhatsApp numarası (genelde +1 415 523 8886) ve &quot;join kelime-kelime&quot; şeklinde bir kod gösterilir. Test etmek istediğiniz telefondan (kendi cep telefonunuzdan) o numaraya WhatsApp&apos;tan bu kodu gönderin — bu adım olmadan Sandbox size mesaj gönderemez, her test numarasının bu katılma mesajını bir kere göndermesi gerekir.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">4) Panelde bağlantıyı tanımlayın</p>
              <p className="mt-1">Az önce kopyaladığınız Account SID, Auth Token ve WhatsApp numarasını aşağıdaki forma girip <strong>Kaydet</strong>&apos;e basın. Ardından <strong>Bağlantıyı Test Et</strong> ile kendi telefonunuza bir deneme mesajı gönderin.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">5) Gerçek/onaylı numaraya geçiş (Sandbox&apos;tan çıkış)</p>
              <p className="mt-1">Sandbox yalnızca test amaçlıdır. Gerçek hastalara kesintisiz mesaj gönderebilmek için Twilio Console&apos;da <strong>Messaging &gt; Senders &gt; WhatsApp senders</strong> bölümünden kendi onaylı numaranız için başvuru yapmanız gerekir. Onaylandığında yalnızca yukarıdaki <strong>WhatsApp Numarası</strong> alanını güncellemeniz yeterlidir.</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">Sık karşılaşılan sorunlar</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li><strong>&quot;Bağlantıyı Test Et&quot; hata veriyor:</strong> Account SID/Auth Token&apos;ı yanlış kopyalamış olabilirsiniz (baştaki/sondaki boşluklara dikkat edin) ya da test ettiğiniz numara Sandbox&apos;a &quot;join&quot; mesajı göndermemiştir.</li>
                <li><strong>Hastalara mesaj gitmiyor ama size test mesajı gidiyor:</strong> Sandbox kullanıyorsanız bu normaldir — Sandbox yalnızca &quot;join&quot; mesajı gönderen numaralara ulaşır. Gerçek hastalara ulaşmak için 5. adımdaki onaylı numaraya geçiş gerekir.</li>
                <li><strong>Twilio hesabımda bakiye/kredi kartı istiyor:</strong> Ücretsiz deneme kredisi Sandbox testleri için genelde yeterlidir; onaylı numaraya geçtikten sonra gönderilen her mesaj Twilio tarafından ayrıca ücretlendirilir (bu, kliniğinizin panel içi SMS bakiyesinden ayrı, doğrudan Twilio&apos;ya ödenen bir ücrettir).</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Hesap SID" required hint="Bağlantı sağlayıcınızın hesap kimliği. Twilio kullanıyorsanız Console ana sayfasından kopyalanır.">
            <input className={inputClass} value={form.accountSid} onChange={(e) => setForm({ ...form, accountSid: e.target.value })} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          </FormField>
          <FormField label="Doğrulama Anahtarı" required={!provider} hint={provider ? "Değiştirmek istemiyorsanız boş bırakın" : "Hesap doğrulama anahtarını girin."}>
            <input type="password" className={inputClass} value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="••••••••" />
          </FormField>
          <FormField label="WhatsApp Numarası" required hint="WhatsApp üzerinden gönderim yapacak numara, ülke koduyla girilir.">
            <input className={inputClass} value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} placeholder="+14155238886" />
          </FormField>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span className="text-sm font-semibold text-slate-700">Bağlantı aktif</span>
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {provider && (
          <Button variant="secondary" icon={Send} onClick={() => setTestOpen(true)}>
            Bağlantıyı Test Et
          </Button>
        )}
        <Button variant="secondary" onClick={() => void load()} disabled={saving}>
          Yenile
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={saving}>
          Kaydet
        </Button>
      </div>

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test Mesajı Gönder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestOpen(false)}>İptal</Button>
            <Button loading={testing} onClick={submitTest} disabled={!testPhone.trim() || !testMessage.trim()}>Gönder</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Telefon">
            <input className={inputClass} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5xx xxx xx xx" />
          </FormField>
          <FormField label="Mesaj">
            <textarea className={inputClass} rows={3} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
