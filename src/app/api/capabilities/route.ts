import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json({ features: { whatsapp: false } });

  const institution = await prisma.institution.findUnique({
    where: { id: auth.user.institutionId },
    select: { isActive: true, whatsappEnabled: true },
  });
  return NextResponse.json({
    features: {
      whatsapp: Boolean(institution?.isActive && institution.whatsappEnabled),
    },
  });
}
