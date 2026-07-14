import Link from "next/link";

export default function MuayenePage() {
  return (
    <section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Muayene Modülü Hasta Kartına Taşındı</h1>
        <p className="mt-1 text-sm text-slate-600">
          Klinik akışı sadeleştirildi. Diş şeması ve tedavi işlemleri artık her hastanın kartında, Tedavi sekmesinden yönetilir.
        </p>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary-strong">
        Hasta seçimi için önce Hastalar listesine gidin, sonra ilgili hastanın kartını açın.
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/hasta" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
          Hastalar Listesine Git
        </Link>
      </div>
    </section>
  );
}
