import { BrowserBar } from "./DeviceFrames";

/* eslint-disable @next/next/no-img-element */

const HERO_GRADIENT = "linear-gradient(120deg, rgb(7 64 57), rgb(13 125 111) 55%, rgb(56 189 168))";

function ModuleIconImg({ name, size = 18 }: { name: string; size?: number }) {
  return <img src={`/icons/modules/${name}.svg`} alt="" width={size} height={size} />;
}

function TopBar({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2 text-slate-800">
        <ModuleIconImg name={icon} size={20} />
        <span className="text-xs font-black">{title}</span>
      </div>
      <div className="flex items-center gap-2 text-slate-400">
        <span className="h-3 w-3 rounded-full bg-slate-200" />
        <span className="h-3 w-3 rounded-full bg-slate-200" />
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0d7d6f] text-[9px] font-black text-white">KY</span>
      </div>
    </div>
  );
}

/** Anasayfa — genel durum panosu. */
export function DashboardScreen() {
  return (
    <>
      <BrowserBar path="klinikmodern.app/anasayfa" />
      <div className="bg-slate-50 p-4">
        <TopBar icon="home" title="Anasayfa" />
        <div className="mt-3 rounded-xl p-4 text-white shadow-sm" style={{ background: HERO_GRADIENT }}>
          <p className="text-[10px] font-black uppercase tracking-wider text-white/80">Klinik Yönetim Paneli</p>
          <p className="mt-1 text-base font-black">Günlük görünüm</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Bugünkü Randevu", value: "18", tone: "from-sky-50 to-white text-sky-700" },
            { label: "İşlem Bekleyen", value: "5", tone: "from-amber-50 to-white text-amber-700" },
            { label: "Bugün Ciro", value: "₺24.600", tone: "from-emerald-50 to-white text-emerald-700" },
            { label: "Açık Uyarı", value: "1", tone: "from-rose-50 to-white text-rose-600" },
          ].map((tile) => (
            <div key={tile.label} className={`rounded-lg border border-slate-200 bg-gradient-to-br p-2.5 ${tile.tone}`}>
              <p className="text-[8px] font-black uppercase tracking-wide opacity-70">{tile.label}</p>
              <p className="mt-1 text-sm font-black">{tile.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-slate-800">Randevu Takvimi</p>
            <span className="text-[9px] font-bold text-slate-400">Bugün</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {[
              { time: "09:30", name: "A. Yılmaz", type: "Kontrol", tone: "bg-sky-100 text-sky-700" },
              { time: "10:15", name: "M. Kaya", type: "Dolgu", tone: "bg-teal-100 text-teal-700" },
              { time: "11:00", name: "E. Demir", type: "İmplant", tone: "bg-orange-100 text-orange-700" },
            ].map((row) => (
              <div key={row.time} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                <span className="w-10 flex-none text-[9px] font-black text-slate-500">{row.time}</span>
                <span className="flex-1 truncate text-[10px] font-bold text-slate-700">{row.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${row.tone}`}>{row.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Randevu takvimi — gün görünümü. */
export function CalendarScreen() {
  return (
    <>
      <BrowserBar path="klinikmodern.app/randevu" />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-800">
            <ModuleIconImg name="calendar" size={20} />
            <span className="text-xs font-black">Randevular</span>
          </div>
          <span className="rounded-md bg-[#0d7d6f] px-2.5 py-1 text-[9px] font-black text-white">+ Yeni Randevu</span>
        </div>
        <div className="mt-3 flex gap-2 text-[9px] font-bold text-slate-500">
          <span className="rounded-md bg-white px-2.5 py-1 text-[#0d7d6f] shadow-sm">Gün</span>
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
      <BrowserBar path="klinikmodern.app/hasta-detay" />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-800">
            <ModuleIconImg name="person" size={20} />
            <span className="text-xs font-black">Ahmet Yılmaz</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">Aktif Hasta</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Toplam Tedavi", value: "6" },
            { label: "Bakiye", value: "₺1.250" },
            { label: "Son Ziyaret", value: "3 gün önce" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{tile.label}</p>
              <p className="mt-1 text-xs font-black text-slate-800">{tile.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-black text-slate-800">Tedavi Geçmişi</p>
          <div className="mt-2 space-y-1.5">
            {[
              { name: "Kanal Tedavisi — 26", tone: "bg-teal-100 text-teal-700", status: "Tamamlandı" },
              { name: "Kompozit Dolgu — 14", tone: "bg-sky-100 text-sky-700", status: "Planlandı" },
              { name: "Diş Taşı Temizliği", tone: "bg-slate-100 text-slate-600", status: "Tamamlandı" },
            ].map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-700">{row.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${row.tone}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Muhasebe merkezi. */
export function FinanceScreen() {
  return (
    <>
      <BrowserBar path="klinikmodern.app/muhasebe" />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-700">
            <ModuleIconImg name="finance" size={18} />
            <span className="text-xs font-black">Muhasebe Merkezi</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">Canlı</span>
        </div>
        <div className="mt-3 flex gap-2 text-[10px] font-bold">
          <span className="rounded-md bg-[#0d7d6f] px-3 py-1.5 text-white">Muhasebe Defteri</span>
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
              <span className={`font-black ${row.tone}`}>{row.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Stok takibi. */
export function StockScreen() {
  return (
    <>
      <BrowserBar path="klinikmodern.app/stok" />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-700">
            <ModuleIconImg name="box" size={18} />
            <span className="text-xs font-black">Stok Takibi</span>
          </div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">1 kritik seviye</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { name: "Nitril Eldiven M", qty: "12 kutu", tone: "bg-emerald-100 text-emerald-700" },
            { name: "Artikain Anestezi Ampul", qty: "6 adet", tone: "bg-rose-100 text-rose-700" },
            { name: "Kompozit Refil A2", qty: "24 adet", tone: "bg-emerald-100 text-emerald-700" },
            { name: "Ölçü Silikonu Putty", qty: "9 takım", tone: "bg-emerald-100 text-emerald-700" },
          ].map((row) => (
            <div key={row.name} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px]">
              <span className="font-semibold text-slate-700">{row.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${row.tone}`}>{row.qty}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Laboratuvar sipariş takibi. */
export function LabScreen() {
  return (
    <>
      <BrowserBar path="klinikmodern.app/lab" />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-700">
            <ModuleIconImg name="flask" size={18} />
            <span className="text-xs font-black">Laboratuvar</span>
          </div>
          <span className="rounded-md bg-[#0d7d6f] px-2.5 py-1 text-[9px] font-black text-white">+ Yeni Sipariş</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { name: "A. Yılmaz — Zirkonyum Kron", firma: "Dental Lab A.Ş.", tone: "bg-sky-100 text-sky-700", status: "Provada" },
            { name: "M. Kaya — İmplant Üst Yapı", firma: "Prodenta Lab", tone: "bg-amber-100 text-amber-700", status: "Gönderildi" },
            { name: "E. Demir — Zirkonyum Kron", firma: "Dental Lab A.Ş.", tone: "bg-emerald-100 text-emerald-700", status: "Teslim Alındı" },
          ].map((row) => (
            <div key={row.name} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700">{row.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${row.tone}`}>{row.status}</span>
              </div>
              <span className="text-[9px] font-semibold text-slate-400">{row.firma}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** SMS / WhatsApp iletişim merkezi. */
export function MessagingScreen() {
  return (
    <>
      <BrowserBar path="klinikmodern.app/sms" />
      <div className="bg-slate-50 p-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-slate-700">
            <ModuleIconImg name="sms" size={18} />
            <span className="text-xs font-black">SMS / WhatsApp</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">240 kredi</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { name: "A. Yılmaz", msg: "Yarın 09:30 randevunuz onaylandı.", tone: "text-emerald-600", status: "İletildi" },
            { name: "M. Kaya", msg: "Ödeme hatırlatması gönderildi.", tone: "text-sky-600", status: "İletildi" },
            { name: "E. Demir", msg: "SMS onayı bekleniyor.", tone: "text-amber-600", status: "Beklemede" },
          ].map((row) => (
            <div key={row.name} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-700">{row.name}</span>
                <span className={`text-[8px] font-black ${row.tone}`}>{row.status}</span>
              </div>
              <p className="mt-0.5 text-[9px] text-slate-500">{row.msg}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Telefon çerçevesi içinde kullanılan sade mobil görünüm. */
export function MobileScreen() {
  return (
    <div className="bg-slate-50 pb-4 pt-6">
      <div className="px-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black text-slate-800">Anasayfa</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0d7d6f] text-[8px] font-black text-white">KY</span>
        </div>
        <div className="mt-2 rounded-lg p-3 text-white" style={{ background: HERO_GRADIENT }}>
          <p className="text-[8px] font-black uppercase tracking-wide text-white/80">Günlük görünüm</p>
          <p className="mt-0.5 text-xs font-black">18 randevu bugün</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {[
            { label: "Ciro", value: "₺24.6K", tone: "text-emerald-700 bg-emerald-50" },
            { label: "Bekleyen", value: "5", tone: "text-amber-700 bg-amber-50" },
          ].map((tile) => (
            <div key={tile.label} className={`rounded-md p-2 ${tile.tone}`}>
              <p className="text-[7px] font-black uppercase opacity-70">{tile.label}</p>
              <p className="text-[11px] font-black">{tile.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1">
          {["09:30 · A. Yılmaz", "10:15 · M. Kaya"].map((row) => (
            <div key={row} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-bold text-slate-600">{row}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
