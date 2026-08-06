import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { deleteDocumentFile } from "@/lib/document-storage";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    const requiredPermission = permissionForCategory(document.category, "delete");
    if (!(await can(auth.user.role as Role, requiredPermission))) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    await prisma.document.delete({ where: { id: document.id } });
    try {
      await deleteDocumentFile(document.storedName, document.storageProvider);
    } catch (storageError) {
      // Veritabanındaki belge artık silinmiş durumda; depolama temizliğinin
      // başarısız olması kullanıcıya işlemin başarısız olduğu izlenimini
      // vermemeli ve tekrar denemede 404'e düşürmemeli. Artık dosya temizliği
      // operasyonel logdan takip edilir.
      console.error("[documents DELETE storage cleanup]", storageError);
    }

    await writeAudit(auth.user.id, "DOCUMENT_DELETE", `${document.category}: ${document.fileName}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[documents DELETE]", error);
    return NextResponse.json({ error: "Belge silinemedi" }, { status: 503 });
  }
}
