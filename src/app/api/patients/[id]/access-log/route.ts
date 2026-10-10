import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

export const dynamic = "force-dynamic";

/**
 * Hasta dosyasının KVKK erişim kaydı (kim, ne zaman, hangi amaçla açtı /
 * dışa aktardı). Personelin kimlerin hangi hastaya baktığını görmesi denetim
 * yetkisidir: önceden yalnız `patients:read` isteniyordu (her personel diğer
 * personelin erişimlerini okuyabiliyordu); artık Denetim Günlüğü yetkisi
 * (`audit:read`) ve hasta okuma yetkisi birlikte gerekir. Hasta dosyasındaki
 * "Erişim kaydı" penceresi de yalnız bu yetkiyle görünür.
 */
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const auth = await requireAuth("audit:read");
  if (auth.error) return auth.error;
  if (!(await hasEffectivePermission(auth.user, "patients:read"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId
        ? { institutionId: auth.user.institutionId }
        : {}),
      homeBranchId: branch.branchId,
    },
    select: { id: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
  }

  const records = await prisma.patientAccessLog.findMany({
    // Kurum süzgeci kayıtta da (savunma derinliği; hasta zaten kurumda doğrulandı).
    where: {
      patientId: patient.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json(records);
}
