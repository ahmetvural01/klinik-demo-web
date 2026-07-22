import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { DocumentCategory, Role } from "@prisma/client";
import { deleteDocumentFile, DocumentUploadError, isAllowedDocumentFile, saveDocumentFile } from "@/lib/document-storage";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const canRead = (await can(auth.user.role as Role, "documents:read")) || (await can(auth.user.role as Role, "xray:read"));
  if (!canRead) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId zorunlu" }, { status: 400 });

  try {
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });

    const canReadDocuments = await can(auth.user.role as Role, "documents:read");
    const canReadXray = await can(auth.user.role as Role, "xray:read");
    const allowedCategories: DocumentCategory[] = [
      ...(canReadDocuments ? (["BELGE"] as DocumentCategory[]) : []),
      ...(canReadXray ? (["RONTGEN", "FOTOGRAF"] as DocumentCategory[]) : []),
    ];

    const documents = await prisma.document.findMany({
      where: { patientId, category: { in: allowedCategories } },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { fullName: true } } },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("[documents GET]", error);
    return NextResponse.json({ error: "Belgeler yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const patientId = String(formData.get("patientId") || "");
    const category = String(formData.get("category") || "BELGE");
    const toothNo = formData.get("toothNo") ? String(formData.get("toothNo")) : null;
    const note = formData.get("note") ? String(formData.get("note")) : null;
    const file = formData.get("file");

    if (!patientId) return NextResponse.json({ error: "patientId zorunlu" }, { status: 400 });
    if (!["BELGE", "RONTGEN", "FOTOGRAF"].includes(category)) {
      return NextResponse.json({ error: "Geçersiz kategori" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya zorunlu" }, { status: 400 });
    }

    const requiredPermission = permissionForCategory(category, "write");
    if (!(await can(auth.user.role as Role, requiredPermission))) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const validationError = isAllowedDocumentFile(file.type, file.size);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });

    const { storedName, fileSize } = await saveDocumentFile(file);

    let document;
    try {
      document = await prisma.document.create({
        data: {
          institutionId: auth.user.institutionId || null,
          patientId,
          uploadedById: auth.user.id,
          category: category as DocumentCategory,
          fileName: file.name,
          storedName,
          mimeType: file.type,
          fileSize,
          toothNo,
          note,
        },
        include: { uploadedBy: { select: { fullName: true } } },
      });
    } catch (dbError) {
      await deleteDocumentFile(storedName);
      throw dbError;
    }

    try {
      await writeAudit(auth.user.id, "DOCUMENT_CREATE", `${category}: ${file.name}`);
    } catch (auditError) {
      console.error("[documents POST audit]", auditError);
    }
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("[documents POST]", error);
    const message = error instanceof DocumentUploadError ? error.message : "Belge yüklenemedi. Dosya alanını ve yükleme klasörü izinlerini kontrol edin.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
