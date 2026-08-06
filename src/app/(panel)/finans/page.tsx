"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HakedisMonthlyPanel } from "@/components/hakedis/HakedisMonthlyPanel";
import { cachedGet } from "@/lib/client-cache";
import { ModuleIcon } from "@/components/ui/ModuleIcon";

type CurrentUser = { id?: string; role?: string; fullName?: string };
type Doctor = { id: string; fullName: string; role: string; profile?: { hideAsDoctor?: boolean | null } | null };

const isEffectiveDoctor = (user: Doctor) =>
  user.role === "DOKTOR" || (user.role === "YONETICI" && user.profile?.hideAsDoctor === false);

/**
 * Doktorun ekranı, Muhasebe > Hakediş ile aynı aylık hesabı kullanır. Eski
 * finans özeti ayrı API hesaplarıyla tekrar üretildiği için iki ekranda farklı
 * bakiye görünebilirdi; burada tek kaynak HakedisMonthlyPanel'dir.
 */
export default function FinansPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      cachedGet<CurrentUser>("/api/auth/me", 60_000),
      cachedGet<Doctor[]>("/api/staff", 60_000),
    ])
      .then(([user, staff]) => {
        if (!active) return;
        setCurrentUser(user || null);
        const eligible = (Array.isArray(staff) ? staff : []).filter(isEffectiveDoctor);
        setDoctors(eligible);
        if (user?.role === "DOKTOR" && user.id) setSelectedDoctorId(user.id);
        else if (eligible.length === 1) setSelectedDoctorId(eligible[0].id);
      })
      .catch(() => {
        if (!active) return;
        setCurrentUser(null);
        setDoctors([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const isDoctorView = currentUser?.role === "DOKTOR";
  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === selectedDoctorId),
    [doctors, selectedDoctorId],
  );

  return (
    <section className="space-y-4" aria-busy={loading}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <ModuleIcon module="hakediş" size="lg" />
          <div>
            <h1 className="font-display text-xl font-black tracking-tight text-slate-900">{isDoctorView ? "Hakedişim" : "Doktor Hakedişi"}</h1>
            <p className="text-xs font-medium text-slate-500">Aylık üretim, tahsilat, laboratuvar gideri ve kurum ödemeleri aynı hesapta izlenir.</p>
          </div>
        </div>
        {!isDoctorView && (
          <Link href="/muhasebe?tab=hakedis" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            Muhasebe Hakedişlerine Git
          </Link>
        )}
      </header>

      {!isDoctorView && (
        <div className="max-w-md">
          <label className="mb-1 block text-xs font-bold text-slate-600">Doktor</label>
          <select
            value={selectedDoctorId}
            onChange={(event) => setSelectedDoctorId(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Doktor seçin</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">Hakediş bilgileri yükleniyor…</div>
      ) : selectedDoctorId ? (
        <HakedisMonthlyPanel doctorId={selectedDoctorId} canPay={false} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          {selectedDoctor ? "Hakediş kaydı bulunamadı." : "Hakediş dökümünü görmek için doktor seçin."}
        </div>
      )}
    </section>
  );
}
