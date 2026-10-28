"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Section } from "@/components/ui/Section";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { scopedStorageKey } from "@/lib/scoped-client-storage";

type StepKey = "klinik" | "saatler" | "ekip" | "fiyat" | "lab" | "mesaj" | "hasta" | "randevu";

const STEPS: Record<StepKey, { title: string; description: string; href: string; action: string }> = {
  klinik: { title: "Klinik bilgileri", description: "Hastaya giden mesajlarda ve belgelerde görünen ad, telefon ve adres", href: "/ayar?tab=klinik", action: "Ayarlar" },
  saatler: { title: "Çalışma saatleri", description: "Kapalı günlere ve saat dışına randevu verilmez", href: "/ayar?tab=calisma", action: "Saatleri gir" },
  ekip: { title: "Ekip", description: "Doktor, asistan ve banko hesapları", href: "/personel", action: "Personel ekle" },
  fiyat: { title: "Fiyat listesi", description: "Tedavi eklerken ücret kendiliğinden gelir", href: "/ayar?tab=fiyat", action: "Fiyatları gir" },
  lab: { title: "Laboratuvar", description: "Çalıştığınız diş laboratuvarı; lab işi açarken seçilir, lab ücreti hekimin hakedişine yansır", href: "/firma?yeni=lab", action: "Laboratuvar ekle" },
  mesaj: { title: "SMS ya da WhatsApp", description: "Randevu hatırlatmaları için SMS paketi alın ya da WhatsApp'ı bağlayın", href: "/sms?tab=ayarlar", action: "Kanal ve kredi" },
  hasta: { title: "İlk hasta", description: "Hasta kartını açın; eski hasta listeniz varsa Destek'e gönderin, sizin için aktarılır", href: "/hasta?yeni=1", action: "Hasta ekle" },
  randevu: { title: "İlk randevu", description: "Takvimden randevu verin", href: "/randevu", action: "Takvim" },
};

/**
 * Ana sayfa › Başlarken (klinik yöneticisi): kliniği kullanıma hazırlayan
 * adımlar. Her adım kaydından anlaşılır (ayrıca işaretlenmez); hepsi bitince
 * ya da "Gizle" denince görünmez.
 */
export function GettingStarted({ scopeKey }: { scopeKey: string }) {
  const [steps, setSteps] = useState<{ key: StepKey; done: boolean }[] | null>(null);
  const storageKey = scopedStorageKey("home-getting-started-hidden", scopeKey);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setHidden(false);
    }
    let cancelled = false;
    fetch("/api/onboarding", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (!cancelled && Array.isArray(json?.steps)) setSteps(json.steps); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [storageKey]);

  if (hidden || !steps || steps.length === 0) return null;
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  const hide = () => {
    setHidden(true);
    try { window.localStorage.setItem(storageKey, "1"); } catch { /* yok sayılır */ }
  };

  return (
    <Section
      title="Başlarken"
      description="Kliniği kullanıma hazırlayan adımlar; yaptıkça kendiliğinden işaretlenir."
      actions={<Button size="sm" variant="ghost" onClick={hide}>Gizle</Button>}
      padding="none"
    >
      <div className="px-4 pb-3 pt-3">
        <ProgressBar value={doneCount} max={steps.length} label="Hazırlık" valueLabel={`${doneCount} / ${steps.length} adım`} />
      </div>
      <SettingsList aria-label="Başlarken adımları">
        {steps.map((step) => {
          const meta = STEPS[step.key];
          if (!meta) return null;
          return (
            <SettingsRow
              key={step.key}
              icon={step.done ? CheckCircle2 : Circle}
              // Yapılan adım üstü çizili ve onay işaretli (ayrıca "Tamam" rozeti tekrar etmez).
              title={<span className={step.done ? "text-slate-500 line-through" : ""}>{meta.title}</span>}
              description={step.done ? undefined : meta.description}
              actions={step.done ? undefined : <Button size="sm" variant="secondary" href={meta.href}>{meta.action}</Button>}
              muted={step.done}
            />
          );
        })}
      </SettingsList>
    </Section>
  );
}
