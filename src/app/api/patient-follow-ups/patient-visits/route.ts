import { NextRequest, NextResponse } from "next/server";
import { hasEffectivePermission, requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { loadPatientListExtras } from "@/lib/patient-list-extras";

const MAX_IDS = 300;

// Hasta Takip listesindeki hastalar için "sonraki randevu" ve "son ziyaret".
// Takip ekranı bununla (1) randevusu verilmiş hastanın satırında "Randevusu
// var" gösterip takibi tek tıkla kapatmayı önerir, (2) sonradan randevu almış
// ya da gelmiş hastanın eski "Gelmedi" kalemini listeden düşürür (bkz. denetim
// HL-06, HL-19). Yalnız aktif şubedeki randevular okunur; randevu okuma yetkisi
// olmayan rol boş yanıt alır.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("hastatracking:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
    if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

    const ids = Array.from(new Set(
      (request.nextUrl.searchParams.get("ids") || "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 100),
    )).slice(0, MAX_IDS);
    if (ids.length === 0) return NextResponse.json({ patients: {} });

    if (!(await hasEffectivePermission(auth.user, "appointments:read"))) {
      return NextResponse.json({ patients: {} });
    }

    const extras = await loadPatientListExtras({
      institutionId: auth.user.institutionId,
      branchId: branch.branchId,
      patients: ids.map((id) => ({ id })),
      includeVisits: true,
      includeBalance: false,
    });
    const patients: Record<string, { lastVisitAt: string | null; nextAppointment: { startAt: string; doctorName: string | null } | null }> = {};
    for (const [id, extra] of extras) {
      if (extra.lastVisitAt || extra.nextAppointment) {
        patients[id] = { lastVisitAt: extra.lastVisitAt, nextAppointment: extra.nextAppointment };
      }
    }
    return NextResponse.json({ patients });
  } catch (error) {
    console.error("[patient-follow-ups/patient-visits GET]", error);
    return NextResponse.json({ message: "Hastaların randevu bilgisi yüklenemedi." }, { status: 503 });
  }
}
