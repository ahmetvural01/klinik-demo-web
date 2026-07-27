import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  const { id } = await params;

  const pkg = await prisma.patientPackage.findFirst({ where: { id, institutionId: auth.user.institutionId ?? undefined } });
  if (!pkg) return NextResponse.json({ message: "Paket bulunamadı" }, { status: 404 });
  if (pkg.status === "IPTAL") {
    return NextResponse.json({ message: "Paket zaten iptal edilmiş" }, { status: 400 });
  }

  // Bağlı ödeme/taksit planı burada dokunulmadan bırakılır — varsa iade,
  // muhasebe ekranındaki normal tahsilat/taksit iptal akışından ayrıca
  // yapılmalı (paket iptali tek başına parayı geri almaz).
  await prisma.patientPackage.update({ where: { id }, data: { status: "IPTAL" } });
  await writeAudit(auth.user.id, "PATIENT_PACKAGE_CANCEL", `${pkg.name} paketi iptal edildi (${pkg.sessionsUsed}/${pkg.sessionsTotal} seans kullanılmıştı)`);
  return NextResponse.json({ ok: true });
}
