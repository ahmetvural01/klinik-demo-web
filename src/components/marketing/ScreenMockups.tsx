import Image from "next/image";
import { BrowserBar } from "./DeviceFrames";
import { BRAND_DOMAIN } from "@/lib/brand";

function ModuleIconImg({ name, size = 18 }: { name: string; size?: number }) {
  return <Image src={`/icons/modules/${name}.svg`} alt="" width={size} height={size} unoptimized />;
}

/** Randevu takvimi — gün görünümü. */
export function CalendarScreen() {
  return (
    <>
      <BrowserBar path={`${BRAND_DOMAIN}/randevu`} />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-800">
            <ModuleIconImg name="calendar" size={20} />
            <span className="text-xs font-extrabold">Randevular</span>
          </div>
          <span className="rounded-md bg-primary px-2.5 py-1 text-[9px] font-extrabold text-white">+ Yeni Randevu</span>
        </div>
        <div className="mt-3 flex gap-2 text-[9px] font-bold text-slate-500">
          <span className="rounded-md bg-white px-2.5 py-1 text-primary shadow-sm">Gün</span>
          <span className="rounded-md px-2.5 py-1">Hafta</span>
          <span className="rounded-md px-2.5 py-1">Ay</span>
          <span className="rounded-md px-2.5 py-1">Ajanda</span>
        </div>
        <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
          {[
            { time: "08:30", name: "—", tone: "bg-slate-50 text-slate-300" },
            { time: "09:00", name: "S. Aksoy · Kontrol", tone: "bg-sky-50 text-sky-700" },
            { time: "09:30", name: "A. Yılmaz · Kontrol", tone: "bg-sky-50 text-sky-700" },
            { time: "10:15", name: "M. Kaya · Dolgu", tone: "bg-teal-50 text-teal-700" },
            { time: "11:00", name: "E. Demir · İmplant", tone: "bg-orange-50 text-orange-700" },
            { time: "11:45", name: "—", tone: "bg-slate-50 text-slate-300" },
          ].map((row) => (
            <div key={row.time} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-bold ${row.tone}`}>
              <span className="w-10 flex-none text-slate-500">{row.time}</span>
              <span className="flex-1 truncate">{row.name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Hasta detay — hasta dosyası özeti. */
export function PatientScreen() {
  return (
    <>
      <BrowserBar path={`${BRAND_DOMAIN}/hasta-detay`} />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-800">
            <ModuleIconImg name="person" size={20} />
            <span className="text-xs font-extrabold">Ahmet Yılmaz</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700">Aktif Hasta</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Toplam Tedavi", value: "6" },
            { label: "Bakiye", value: "₺1.250" },
            { label: "Son Ziyaret", value: "3 gün önce" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">{tile.label}</p>
              <p className="mt-1 text-xs font-extrabold text-slate-800">{tile.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-extrabold text-slate-800">Tedavi Geçmişi</p>
          <div className="mt-2 space-y-1.5">
            {[
              { name: "Kanal Tedavisi — 26", tone: "bg-teal-100 text-teal-700", status: "Tamamlandı" },
              { name: "Kompozit Dolgu — 14", tone: "bg-sky-100 text-sky-700", status: "Planlandı" },
              { name: "Diş Taşı Temizliği", tone: "bg-slate-100 text-slate-600", status: "Tamamlandı" },
            ].map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-700">{row.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[8px] font-extrabold ${row.tone}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Muhasebe. */
export function FinanceScreen() {
  return (
    <>
      <BrowserBar path={`${BRAND_DOMAIN}/muhasebe`} />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-700">
            <ModuleIconImg name="finance" size={18} />
            <span className="text-xs font-extrabold">Muhasebe</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700">Canlı</span>
        </div>
        <div className="mt-3 flex gap-2 text-[10px] font-bold">
          <span className="rounded-md bg-primary px-3 py-1.5 text-white">Gelir ve gider</span>
          <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600">Alacaklar</span>
          <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600">Hakediş</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { name: "A. Yılmaz — Kanal Tedavisi", amount: "+ ₺4.500", tone: "text-emerald-600" },
            { name: "Medikal Sarf Deposu — Fatura Ödemesi", amount: "− ₺3.000", tone: "text-rose-600" },
            { name: "M. Kaya — İmplant Ön Ödeme", amount: "+ ₺12.000", tone: "text-emerald-600" },
          ].map((row) => (
            <div key={row.name} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px]">
              <span className="font-semibold text-slate-700">{row.name}</span>
              <span className={`font-extrabold ${row.tone}`}>{row.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** İletişim (SMS / WhatsApp). */
export function MessagingScreen() {
  return (
    <>
      <BrowserBar path={`${BRAND_DOMAIN}/sms`} />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-700">
            <ModuleIconImg name="sms" size={18} />
            <span className="text-xs font-extrabold">İletişim</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700">240 kredi</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { name: "A. Yılmaz", msg: "Yarın 09:30 randevunuz onaylandı.", tone: "text-emerald-600", status: "İletildi" },
            { name: "M. Kaya", msg: "Ödeme hatırlatması gönderildi.", tone: "text-sky-600", status: "İletildi" },
            { name: "E. Demir", msg: "SMS onayı bekleniyor.", tone: "text-amber-600", status: "Beklemede" },
          ].map((row) => (
            <div key={row.name} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-700">{row.name}</span>
                <span className={`text-[8px] font-extrabold ${row.tone}`}>{row.status}</span>
              </div>
              <p className="mt-0.5 text-[9px] text-slate-500">{row.msg}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

