import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { readDocumentFile } from "@/lib/document-storage";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const document = await prisma.document.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!document) return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });

    const requiredPermission = permissionForCategory(document.category, "read");
    if (!(await can(auth.user.role as Role, requiredPermission))) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const buffer = await readDocumentFile(
      document.storedName,
      document.storageProvider,
      document.sha256,
    );
    await writeAudit(
      auth.user.id,
      "DOCUMENT_VIEW",
      `${document.category}: ${document.fileName} · Hasta: ${document.patientId}`,
    );
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
        "Cache-Control": "private, max-age=0, no-cache",
      },
    });
  } catch (error) {
    console.error("[documents file GET]", error);
    return NextResponse.json({ error: "Dosya okunamadı" }, { status: 404 });
  }
}
