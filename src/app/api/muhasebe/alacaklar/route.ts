import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";

/**
 * GET /api/muhasebe/alacaklar
 * Her hasta için: tedavi toplam, ödenen, bakiye (alacak)
 * Sadece pozitif bakiyeli (borçlu) hastaları döner.
 */
export const GET = withApiTiming("muhasebe-alacaklar", async function GET() {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const institutionId = auth.user.institutionId;

    const treatmentOnlyWhere = {
      NOT: [
        { status: { contains: "diagnoz", mode: "insensitive" as const } },
        { status: { contains: "ön teşhis", mode: "insensitive" as const } },
        { status: { contains: "on teshis", mode: "insensitive" as const } },
      ],
    };

    // Sadece ücretlendirmeye dahil tedaviler (diagnoz/muayene hariç)
    const examGroups = await prisma.examination.groupBy({
      by: ["patientId"],
      where: institutionId
        ? { ...treatmentOnlyWhere, patient: { institutionId } }
        : treatmentOnlyWhere,
      _sum: { amount: true },
    });

    // Tüm hasta ödemeleri
    const payGroups = await prisma.payment.groupBy({
      by: ["patientId"],
      _sum: { amount: true },
      where: institutionId
        ? {
            patientId: { not: null },
            patient: { institutionId },
          }
        : { patientId: { not: null } },
    });

    // Patient bilgileri
    const patientIds = [...new Set(examGroups.map((e) => e.patientId))];
    const patients = await prisma.patient.findMany({
      where: {
        id: { in: patientIds },
        ...(institutionId ? { institutionId } : {}),
      },
      select: { id: true, fullName: true, phone: true, discountRate: true },
    });

    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const payMap = new Map(
      payGroups.map((p) => [p.patientId as string, Number(p._sum.amount ?? 0)])
    );

    const rows = examGroups
      .map((e) => {
        const p = patientMap.get(e.patientId);
        if (!p) return null;

        const brutTedavi = Number(e._sum.amount ?? 0);
        const indirim    = brutTedavi * (Number(p.discountRate || 0) / 100);
        const netTedavi  = brutTedavi - indirim;
        const odenen     = payMap.get(e.patientId) ?? 0;
        const bakiye     = netTedavi - odenen;

        return {
          id: p.id,
          fullName: p.fullName,
          phone: p.phone,
          brutTedavi,
          indirim,
          netTedavi,
          odenen,
          bakiye,
          discountRate: p.discountRate,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.bakiye > 0.5)
      .sort((a, b) => b.bakiye - a.bakiye);

    const toplamAlacak = rows.reduce((s, r) => s + r.bakiye, 0);
    return NextResponse.json({ rows, toplamAlacak });
  } catch (error) {
    console.error("[muhasebe alacaklar GET]", error);
    return NextResponse.json({ message: "Hasta alacakları hesaplanamadı. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});
