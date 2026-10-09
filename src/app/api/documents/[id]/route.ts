import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { requireActiveBranch } from "@/lib/branch-context";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

/**
 * Belgeyi hasta dosyasından kaldırır. Röntgen, fotoğraf ve imzalı belgeler
 * klinik kaydıdır: önceden kayıt ve dosya kalıcı olarak siliniyordu (geri
 * dönüşü yoktu). Artık belge ARŞİVLENİR — listede görünmez, dosyası ve kim
 * ne zaman kaldırdı bilgisi saklanır (Document.archivedAt alanları zaten
 * şemada vardı ama kullanılmıyordu).
 */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  try {
    const document = await prisma.document.findFirst({
      where: {
        id: params.id,
        archivedAt: null,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        // Yalnız aktif şubedeki hastanın belgesi (hasta dosyasıyla aynı sınır).
        patient: { homeBranchId: branch.branchId },
      },
      select: { id: true, category: true, fileName: true, patientId: true },
    });
    if (!document) return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });

    const requiredPermission = permissionForCategory(document.category, "delete");
    if (!(await can(auth.user.role as Role, requiredPermission))) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const reasonHeader = req.headers.get("x-archive-reason")?.trim().slice(0, 300);
    await prisma.document.update({
      where: { id: document.id },
      data: {
        archivedAt: new Date(),
        archivedById: auth.user.id,
        archiveReason: reasonHeader || "Hasta dosyasından kaldırıldı.",
      },
    });

    await writeAudit(auth.user.id, "DOCUMENT_ARCHIVE", `${document.category}: ${document.fileName} hasta dosyasından kaldırıldı (arşivlendi) · Hasta: ${document.patientId}`);
    return NextResponse.json({ ok: true, archived: true });
  } catch (error) {
    console.error("[documents DELETE]", error);
    return NextResponse.json({ error: "Belge kaldırılamadı" }, { status: 503 });
  }
}
