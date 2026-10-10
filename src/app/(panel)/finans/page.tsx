import { redirect } from "next/navigation";
import { getFinanceAccess } from "@/app/(panel)/muhasebe/_lib/finance-access";
import { HakedisimView } from "./HakedisimView";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * "Hakedişim": doktorun kendi aylık hakediş dökümü. Muhasebe > Hakediş ile aynı
 * hesap (HakedisMonthlyPanel → /api/hakedis) kullanılır.
 *
 * Muhasebe yetkisi olan kullanıcı aynı bilgiyi ödeme düğmeleriyle birlikte
 * Muhasebe > Hakediş'te görür; bu adres onu SUNUCUDA oraya yönlendirir.
 * Önceden sayfa önce çizilip tarayıcıda yönlendiriliyor (çift geçiş), rol
 * için ayrıca /api/auth/me isteniyordu.
 */
export default async function FinansPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const doctorId = typeof params.doctorId === "string" ? params.doctorId : "";
  const access = await getFinanceAccess();
  if (access?.has("finance:center") && access.has("finance:read")) {
    redirect(`/muhasebe?tab=hakedis${doctorId ? `&doctorId=${encodeURIComponent(doctorId)}` : ""}`);
  }
  const isDoctor = access?.role === "DOKTOR";
  return (
    <HakedisimView
      isDoctor={isDoctor}
      initialDoctorId={isDoctor ? access?.userId || "" : doctorId}
    />
  );
}
