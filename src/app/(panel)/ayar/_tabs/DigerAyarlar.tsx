"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";

type LinkItem = { label: string; description: string; href: string; visible: boolean };

/**
 * Bazı ayarlar işin yapıldığı ekranda duruyor (SMS otomasyonları İletişim'de,
 * gider türleri Muhasebe'de...). Kullanıcı onları Ayarlar'da arıyor; burada
 * nerede olduklarını gösteren kısa bağlantılar verilir. Yalnız açabileceği
 * ekranlar listelenir.
 */
export function DigerAyarlar() {
  const { can } = usePermissions();
  const canMessaging = can("sms:read") || can("whatsapp:read");
  const items: LinkItem[] = [
    {
      label: "SMS ve WhatsApp otomasyonları",
      description: "Randevu, ödeme ve doğum günü hatırlatmaları",
      href: "/sms?tab=ayarlar",
      visible: can("sms:write") && can("settings:write"),
    },
    { label: "Mesaj şablonları", description: "Hastaya giden mesajların metni", href: "/sms?tab=sablonlar", visible: canMessaging },
    { label: "Kutlama günleri", description: "Bayram ve özel gün mesajları", href: "/sms?tab=kutlama-gunleri", visible: canMessaging },
    { label: "Gider türleri", description: "Muhasebe'de gider eklerken \"Türleri Yönet\"", href: "/muhasebe", visible: can("finance:center") },
    { label: "Hasta takip türleri", description: "Hasta Takip ekranında", href: "/hasta-takip", visible: can("hastatracking:read") },
    { label: "Rol yetkileri", description: "Platform ekibi değiştirir; Destek'ten isteyin", href: "/destek", visible: can("support:read") },
  ].filter((item) => item.visible);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="diger-ayarlar-baslik" className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <h2 id="diger-ayarlar-baslik" className="text-sm font-bold text-slate-800">Başka ekranlardaki ayarlar</h2>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <Link href={item.href} className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 group-hover:text-primary">{item.label}</span>
                <span className="block text-xs text-slate-500">{item.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
