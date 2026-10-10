import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import type { DocumentCategory } from "@prisma/client";
import { deleteDocumentFile, documentContentMatchesType, DocumentUploadError, isAllowedDocumentFile, saveDocumentFile } from "@/lib/document-storage";
import { requireActiveBranch } from "@/lib/branch-context";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

// Belge ve röntgen yetkileri rol yetkisi VE aktif şubenin izin listesiyle
// birlikte değerlendirilir (hasEffectivePermission). Önceden yalnız rol
// bakılıyordu: şubede kısıtlanmış bir yetki belge uçlarında geçerli sayılıyordu.
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const [canReadDocuments, canReadXray] = await Promise.all([
    hasEffectivePermission(auth.user, "documents:read"),
    hasEffectivePermission(auth.user, "xray:read"),
  ]);
  if (!canReadDocuments && !canReadXray) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }
  // Hasta dosyasının kendisi yalnız aktif şubedeki hastayı açar; belgeleri de
  // aynı şube sınırıyla okunur (önceden yalnız kurum kontrol ediliyordu).
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId zorunlu" }, { status: 400 });

  try {
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        archivedAt: null,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        homeBranchId: branch.branchId,
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });

    const allowedCategories: DocumentCategory[] = [
      ...(canReadDocuments ? (["BELGE"] as DocumentCategory[]) : []),
      ...(canReadXray ? (["RONTGEN", "FOTOGRAF"] as DocumentCategory[]) : []),
    ];

    const documents = await prisma.document.findMany({
      // Arşivlenen (hasta dosyasından kaldırılan) belgeler listede görünmez.
      where: {
        patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        archivedAt: null,
        category: { in: allowedCategories },
      },
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
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Belge yüklemek için kurum bağlamı zorunlu" }, { status: 403 });
  }
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

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
    if (!(await hasEffectivePermission(auth.user, requiredPermission))) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const validationError = isAllowedDocumentFile(file.type, file.size);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    // Uzantı/tür değiştirilmiş dosya (ör. düz metni "x.png" diye yüklemek) kabul edilmez.
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (!documentContentMatchesType(file.type, head)) {
      return NextResponse.json({ error: "Dosya içeriği seçilen türle uyuşmuyor." }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        archivedAt: null,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        homeBranchId: branch.branchId,
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });

    const { storedName, storageProvider, fileSize, sha256 } = await saveDocumentFile(file);

    let document;
    try {
      document = await prisma.document.create({
        data: {
          institutionId: auth.user.institutionId,
          patientId,
          uploadedById: auth.user.id,
          category: category as DocumentCategory,
          fileName: file.name,
          storedName,
          storageProvider,
          sha256,
          mimeType: file.type,
          fileSize,
          toothNo,
          note,
        },
        include: { uploadedBy: { select: { fullName: true } } },
      });
    } catch (dbError) {
      await deleteDocumentFile(storedName, storageProvider);
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
