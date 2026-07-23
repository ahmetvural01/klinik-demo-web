"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import BulkSendTab from "./_tabs/BulkSendTab";
import TemplatesTab from "./_tabs/TemplatesTab";
import SettingsTab from "./_tabs/SettingsTab";

// SMS gönderim geçmişi burada AYRICA listelenmiyor — İşlem Kayıtları
// (/log) sayfasında "SMS" kategori filtresiyle zaten tam karşılığı var,
// aynı veriyi burada tekrar göstermek gereksiz tekrar olurdu.
export default function SmsPage() {
  const [tab, setTab] = useState<"toplu" | "sablonlar" | "ayarlar">("toplu");
  const [isYonetici, setIsYonetici] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsYonetici(d?.role === "YONETICI"))
      .catch(() => setIsYonetici(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "toplu" ? "primary" : "secondary"} size="sm" onClick={() => setTab("toplu")}>
          Toplu Gönderim
        </Button>
        <Button variant={tab === "sablonlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("sablonlar")}>
          Şablonlar
        </Button>
        {isYonetici && (
          <Button variant={tab === "ayarlar" ? "primary" : "secondary"} size="sm" onClick={() => setTab("ayarlar")}>
            Ayarlar
          </Button>
        )}
      </div>
      {tab === "toplu" ? <BulkSendTab /> : tab === "sablonlar" ? <TemplatesTab /> : <SettingsTab />}
    </div>
  );
}
