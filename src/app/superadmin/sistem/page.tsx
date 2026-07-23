"use client";

import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import OnamTab from "./_tabs/OnamTab";
import TemaTab from "./_tabs/TemaTab";

const TABS = [
  { id: "onam", label: "Onam Paketi", Component: OnamTab },
  { id: "tema", label: "Tema", Component: TemaTab },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SistemPage() {
  const [activeTab, setActiveTab] = useState<TabId>("onam");
  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.Component ?? OnamTab;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SettingsIcon className="h-4 w-4" />
        </span>
        <h1 className="text-lg font-black text-slate-900">Sistem Ayarları</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${
              activeTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ActiveComponent />
    </section>
  );
}
