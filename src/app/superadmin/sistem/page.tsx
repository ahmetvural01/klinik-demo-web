"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import OnamTab from "./_tabs/OnamTab";
import TemaTab from "./_tabs/TemaTab";
import EpostaTab from "./_tabs/EpostaTab";

// Teknik ölçümler yalnız sekme açılınca indirilir ve okunur.
const TeknikTab = dynamic(() => import("./_tabs/TeknikTab"), { ssr: false });

const TAB_KEYS = ["onam", "tema", "eposta", "teknik"] as const;

export default function SistemPage() {
  const [tab, setTab] = useTabParam(TAB_KEYS, "onam");

  return (
    <section className="space-y-4">
      <PageHeader
        icon="settings"
        title="Sistem Ayarları"
        description="Tüm klinikler için geçerli onam metni, görünüm, e-posta ayarları ve sunucu ölçümleri."
      />
      <Tabs
        ariaLabel="Sistem ayarları bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { key: "onam", label: "Onam paketi" },
          { key: "tema", label: "Tema" },
          { key: "eposta", label: "E-posta (SMTP)" },
          { key: "teknik", label: "Teknik ölçümler" },
        ]}
      />
      {tab === "onam" && <OnamTab />}
      {tab === "tema" && <TemaTab />}
      {tab === "eposta" && <EpostaTab />}
      {tab === "teknik" && <TeknikTab />}
    </section>
  );
}
