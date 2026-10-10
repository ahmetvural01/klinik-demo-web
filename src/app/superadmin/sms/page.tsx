"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import PackagesTab from "./_tabs/PackagesTab";
import StockTab from "./_tabs/StockTab";
import TemplatesTab from "./_tabs/TemplatesTab";
import CelebrationDaysTab from "./_tabs/CelebrationDaysTab";
import ProviderTab from "./_tabs/ProviderTab";
import WhatsappProviderTab from "./_tabs/WhatsappProviderTab";

// "stok" eski bağlantılar için kabul edilir (Kontrol Paneli, yer imleri) ve
// "Satış ve stok" sekmesini açar.
const TAB_KEYS = ["paketler", "stok", "sablonlar", "kutlama", "saglayici", "whatsapp"] as const;
type VisibleTab = Exclude<(typeof TAB_KEYS)[number], "stok">;

/**
 * SMS Yönetimi. Sekme seçimi adres çubuğunda (?tab=). Paketler ve stok tek
 * sekmede ("Satış ve stok"): kliniğe SMS satmanın iki ön koşulu önceden iki
 * ayrı sekmedeydi. Sekme başlarındaki açıklama satırları kaldırıldı; her
 * listenin kendi başlığı ve tek satırlık alt başlığı var.
 */
export default function SmsPage() {
  const [tab, setTab] = useTabParam(TAB_KEYS, "paketler");
  const current: VisibleTab = tab === "stok" ? "paketler" : tab;

  return (
    <section className="space-y-4">
      <PageHeader
        icon="sms"
        title="SMS Yönetimi"
        description="SMS satışı ve stoğu, kliniklerin hazır mesajları ve gönderim altyapısı."
      />
      <Tabs<VisibleTab>
        ariaLabel="SMS yönetimi bölümleri"
        value={current}
        onChange={setTab}
        items={[
          { key: "paketler", label: "Satış ve stok" },
          { key: "sablonlar", label: "Şablonlar" },
          { key: "kutlama", label: "Kutlama günleri" },
          { key: "saglayici", label: "SMS sağlayıcısı" },
          { key: "whatsapp", label: "WhatsApp" },
        ]}
      />
      {current === "paketler" && (
        <div className="space-y-4">
          <StockTab />
          <PackagesTab />
        </div>
      )}
      {current === "sablonlar" && <TemplatesTab />}
      {current === "kutlama" && <CelebrationDaysTab />}
      {current === "saglayici" && <ProviderTab />}
      {current === "whatsapp" && <WhatsappProviderTab />}
    </section>
  );
}
