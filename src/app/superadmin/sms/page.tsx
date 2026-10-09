"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import PackagesTab from "./_tabs/PackagesTab";
import StockTab from "./_tabs/StockTab";
import TemplatesTab from "./_tabs/TemplatesTab";
import CelebrationDaysTab from "./_tabs/CelebrationDaysTab";
import ProviderTab from "./_tabs/ProviderTab";
import WhatsappProviderTab from "./_tabs/WhatsappProviderTab";

const TAB_KEYS = ["paketler", "stok", "sablonlar", "kutlama", "saglayici", "whatsapp"] as const;

/**
 * SMS Yönetimi. Sekme seçimi adres çubuğunda (?tab=) tutulur; Kontrol
 * Paneli'ndeki "SMS stoğu" kartı doğrudan Stok sekmesini açar. Önceden
 * sekmeler dolu yeşil düğmelerdi, yenileyince hep ilk sekmeye dönülüyordu ve
 * her sekmenin üstünde aynı açıklama kartı tekrar ediyordu.
 */
export default function SmsPage() {
  const [tab, setTab] = useTabParam(TAB_KEYS, "paketler");

  return (
    <section className="space-y-4">
      <PageHeader
        icon="sms"
        title="SMS Yönetimi"
        description="Kliniklere satılan SMS paketleri, platform stoğu, mesaj şablonları ve gönderim altyapısı."
      />
      <Tabs
        ariaLabel="SMS yönetimi bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { key: "paketler", label: "Paketler" },
          { key: "stok", label: "Stok" },
          { key: "sablonlar", label: "Şablonlar" },
          { key: "kutlama", label: "Kutlama günleri" },
          { key: "saglayici", label: "SMS sağlayıcısı" },
          { key: "whatsapp", label: "WhatsApp" },
        ]}
      />
      {tab === "paketler" && <PackagesTab />}
      {tab === "stok" && <StockTab />}
      {tab === "sablonlar" && <TemplatesTab />}
      {tab === "kutlama" && <CelebrationDaysTab />}
      {tab === "saglayici" && <ProviderTab />}
      {tab === "whatsapp" && <WhatsappProviderTab />}
    </section>
  );
}
