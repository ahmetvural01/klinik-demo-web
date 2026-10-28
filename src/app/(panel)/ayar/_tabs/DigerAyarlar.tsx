"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { showToastSafe } from "@/lib/toast-client";
import type { ExpenseCategory } from "@/components/muhasebe/ExpenseTypesModal";

// Gider türleri penceresi yalnız açılınca indirilir.
const ExpenseTypesModal = dynamic(() => import("@/components/muhasebe/ExpenseTypesModal").then((mod) => mod.ExpenseTypesModal), { ssr: false });

type LinkItem = { label: string; description: string; href: string; visible: boolean };

const ITEM_CLASS = "group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/**
 * "İlgili ayarlar": işin yapıldığı ekranda duran ayarlara kısa yol (yalnız
 * Ayarlar > Klinik sekmesinin altında; önceden her sekmede tekrar ediyordu).
 * Yalnız kullanıcının açabileceği ekranlar listelenir; görünürlük o ekranın
 * kendi kuralıyla aynıdır.
 */
export function IlgiliAyarlar() {
  const { can, hasFeature, role } = usePermissions();
  const canReadWhatsapp = hasFeature("whatsapp") && can("whatsapp:read");
  const canWriteWhatsapp = hasFeature("whatsapp") && can("whatsapp:write");
  const canManageMessaging = (can("sms:write") && can("settings:read") && can("settings:write"))
    || (canWriteWhatsapp && (role === "YONETICI" || role === "SUPERADMIN"));
  const canExpenseTypes = can("finance:center") && can("finance:read") && can("finance:write");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const links: LinkItem[] = [
    {
      label: "Otomatik mesajlar",
      description: "Randevu, ödeme, doğum günü ve özel günler",
      href: "/sms?tab=otomatik",
      visible: can("sms:read") || canReadWhatsapp,
    },
    { label: "Mesaj kanalı ve kredi", description: "SMS / WhatsApp ve SMS kredisi", href: "/sms?tab=ayarlar", visible: canManageMessaging },
    { label: "Rol yetkileri", description: "Rol izinlerini platform ekibi değiştirir; Destek'e yazın", href: "/destek?yeni=1", visible: can("support:read") },
  ].filter((item) => item.visible);

  const loadCategories = async () => {
    const response = await fetch("/api/gider-kategorileri", { cache: "no-store" }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => null) : null;
    if (!Array.isArray(data)) {
      showToastSafe({ message: "Gider türleri yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
      return false;
    }
    setCategories(data);
    return true;
  };

  const openExpenseTypes = async () => {
    if (await loadCategories()) setExpenseOpen(true);
  };

  if (links.length === 0 && !canExpenseTypes) return null;

  return (
    <section aria-labelledby="ilgili-ayarlar-baslik" className="pt-1">
      <h2 id="ilgili-ayarlar-baslik" className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">İlgili ayarlar</h2>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={ITEM_CLASS}>
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 group-hover:text-primary">{item.label}</span>
                <span className="block text-xs text-slate-500">{item.description}</span>
              </span>
            </Link>
          </li>
        ))}
        {canExpenseTypes && (
          <li>
            {/* Önceden Muhasebe ana sayfasına gidip var olmayan "Türleri Yönet"
                düğmesini tarif ediyordu; pencere artık doğrudan burada açılır. */}
            <button type="button" className={ITEM_CLASS} onClick={() => void openExpenseTypes()}>
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 group-hover:text-primary">Gider türleri</span>
                <span className="block text-xs text-slate-500">Gider kaydındaki türler</span>
              </span>
            </button>
          </li>
        )}
      </ul>
      {expenseOpen && (
        <ExpenseTypesModal open={expenseOpen} onClose={() => setExpenseOpen(false)} categories={categories} onChanged={() => loadCategories()} />
      )}
    </section>
  );
}
