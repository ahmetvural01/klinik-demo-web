import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { documentFilePath } from "@/lib/document-storage";
import { decryptBuffer } from "@/lib/field-crypto";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    const rawBuffer = await readFile(documentFilePath(document.storedName));
    const buffer = decryptBuffer(rawBuffer);
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
