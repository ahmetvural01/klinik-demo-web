"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";

type SmsSettings = {
  smsEnabled: boolean;
  smsDefaultInfo: boolean;
  smsDefaultReminder: boolean;
  smsDefaultSurvey: boolean;
  paymentReminderSmsEnabled: boolean;
  birthdaySmsEnabled: boolean;
  paymentReminderWindowDays: number;
  reviewLink: string;
};

const DEFAULTS: SmsSettings = {
  smsEnabled: true,
  smsDefaultInfo: true,
  smsDefaultReminder: false,
  smsDefaultSurvey: false,
  paymentReminderSmsEnabled: false,
  birthdaySmsEnabled: false,
  paymentReminderWindowDays: 3,
  reviewLink: "",
};

const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function SettingsTab() {
  const [settings, setSettings] = useState<SmsSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings({
          smsEnabled: d?.smsEnabled ?? DEFAULTS.smsEnabled,
          smsDefaultInfo: d?.smsDefaultInfo ?? DEFAULTS.smsDefaultInfo,
          smsDefaultReminder: d?.smsDefaultReminder ?? DEFAULTS.smsDefaultReminder,
          smsDefaultSurvey: d?.smsDefaultSurvey ?? DEFAULTS.smsDefaultSurvey,
          paymentReminderSmsEnabled: d?.paymentReminderSmsEnabled ?? DEFAULTS.paymentReminderSmsEnabled,
          birthdaySmsEnabled: d?.birthdaySmsEnabled ?? DEFAULTS.birthdaySmsEnabled,
          paymentReminderWindowDays: d?.paymentReminderWindowDays || DEFAULTS.paymentReminderWindowDays,
          reviewLink: d?.reviewLink || "",
        });
      })
      .catch(() => showToastSafe({ title: "Hata", message: "Ayarlar yüklenemedi", type: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Kısmi gönderim yeterli — /api/settings PUT sadece gönderilen alanları
      // günceller, diğer ayarlara (çalışma saatleri, fiyat listesi vb.) dokunmaz.
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: "SMS ayarları güncellendi", type: "success" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-black text-slate-900">SMS Gönderim Tercihleri</h2>
          <p className="mt-1 text-sm text-slate-500">Bu seçimler yeni randevu oluştururken varsayılan olarak uygulanır.</p>
        </div>
        <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
          {([
            { key: "smsEnabled", label: "SMS gönderimi açık olsun" },
            { key: "smsDefaultInfo", label: "Randevu bilgilendirme SMS'i varsayılan açık olsun" },
            { key: "smsDefaultReminder", label: "Hatırlatma SMS'i varsayılan açık olsun" },
            { key: "smsDefaultSurvey", label: "Değerlendirme SMS'i varsayılan açık olsun" },
            { key: "paymentReminderSmsEnabled", label: "Ödeme vadesi yaklaşan/geciken hastalara otomatik SMS hatırlatması gönder" },
            { key: "birthdaySmsEnabled", label: "Doğum günü olan hastalara otomatik kutlama SMS'i gönder" },
          ] as const).map((item) => (
            <label key={item.key} className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={settings[item.key]}
                onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
              />
              {item.label}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ödeme Hatırlatması — Vadeden Kaç Gün Önce" hint="Vadeye kaç gün kala hatırlatma SMS'i gönderilsin">
            <input
              type="number"
              min={1}
              max={30}
              className={inputClass}
              value={settings.paymentReminderWindowDays}
              onChange={(e) => setSettings({ ...settings, paymentReminderWindowDays: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) })}
            />
          </FormField>
          <FormField label="Değerlendirme Bağlantısı (opsiyonel)" hint="Google yorum linki gibi bir bağlantı — Değerlendirme SMS şablonunda [Değerlendirme Bağlantısı] etiketiyle kullanılabilir">
            <input
              type="text"
              placeholder="https://g.page/r/..."
              className={inputClass}
              value={settings.reviewLink}
              onChange={(e) => setSettings({ ...settings, reviewLink: e.target.value })}
            />
          </FormField>
        </div>
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            SMS Ayarlarını Kaydet
          </Button>
        </div>
      </div>
    </section>
  );
}
