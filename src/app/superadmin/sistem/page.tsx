"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import OnamTab from "./_tabs/OnamTab";
import TemaTab from "./_tabs/TemaTab";
import EpostaTab from "./_tabs/EpostaTab";

const TAB_KEYS = ["onam", "tema", "eposta"] as const;

export default function SistemPage() {
  const [tab, setTab] = useTabParam(TAB_KEYS, "onam");

  return (
    <section className="space-y-4">
      <PageHeader
        icon="settings"
        title="Sistem Ayarları"
        description="Tüm klinikler için geçerli onam metni, görünüm ve e-posta ayarları."
      />
      <Tabs
        ariaLabel="Sistem ayarları bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { key: "onam", label: "Onam paketi" },
          { key: "tema", label: "Tema" },
          { key: "eposta", label: "E-posta (SMTP)" },
        ]}
      />
      {tab === "onam" && <OnamTab />}
      {tab === "tema" && <TemaTab />}
      {tab === "eposta" && <EpostaTab />}
    </section>
  );
}
