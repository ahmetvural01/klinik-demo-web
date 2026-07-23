import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildImportWorkbook } from "@/lib/patient-import";

// GET /api/superadmin/institutions/[id]/import/template
// Bu kurumun mevcut doktor listesiyle önceden doldurulmuş bir Excel şablonu üretir.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const institution = await prisma.institution.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!institution) return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });

  const doctors = await prisma.user.findMany({
    where: {
      institutionId: params.id,
      isActive: true,
      role: { in: ["DOKTOR", "YONETICI"] },
    },
    select: { fullName: true, role: true, profile: { select: { hideAsDoctor: true } } },
    orderBy: { fullName: "asc" },
  });
  const doctorNames = doctors
    .filter((d) => (d.role === "YONETICI" ? !d.profile?.hideAsDoctor : true))
    .map((d) => d.fullName);

  const buffer = await buildImportWorkbook(doctorNames);
  const fileName = `${institution.name.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ]+/g, "_")}_veri_aktarim_sablonu.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
