import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { readDocumentFile } from "@/lib/document-storage";
import { requireActiveBranch } from "@/lib/branch-context";
import { getClientIpFromHeaders } from "@/lib/edge-rate-limit";

function permissionForCategory(category: string, action: "read" | "write" | "delete") {
  return category === "BELGE" ? `documents:${action}` : `xray:${action}`;
}

const VIEW_DEDUPE_MS = 10 * 60_000;
const recentFullViews = new Map<string, number>();
const recentPreviews = new Map<string, number>();

/** Anahtar son 10 dk içinde görüldüyse false; değilse işaretler ve true döner (süreç içi). */
function markFirstWithinWindow(store: Map<string, number>, key: string): boolean {
  const now = Date.now();
  const last = store.get(key);
  if (last !== undefined && now - last < VIEW_DEDUPE_MS) return false;
  if (store.size > 5000) {
    for (const [entry, at] of store) if (now - at >= VIEW_DEDUPE_MS) store.delete(entry);
  }
  store.set(key, now);
  return true;
}

/** Aynı kişi aynı belgeyi 10 dk içinde yeniden açtıysa ikinci denetim kaydı yazılmaz (süreç içi). */
function shouldRecordFullView(userId: string, documentId: string): boolean {
  return markFirstWithinWindow(recentFullViews, `${userId}:${documentId}`);
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  try {
    const document = await prisma.document.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        // Hasta dosyasıyla aynı sınır: yalnız aktif şubedeki hastanın belgesi.
        patient: { homeBranchId: branch.branchId },
      },
    });
    if (!document) return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });

    // Rol yetkisi VE aktif şubenin izin listesi (önceden yalnız rol bakılıyordu).
    const requiredPermission = permissionForCategory(document.category, "read");
    if (!(await hasEffectivePermission(auth.user, requiredPermission))) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    // Belgeler sekmesindeki küçük resimler (?view=thumb) KVKK erişim kaydına
    // (PatientAccessLog) yazılır. Denetim kaydı (writeAudit) klinikteki bütün
    // açık ekranlara "veri değişti" sinyali gönderdiği için 10 röntgenli bir
    // dosyayı açmak klinik genelinde 10 yenileme dalgası başlatıyordu; tam
    // görüntüleme (yeni sekmede aç) eskisi gibi denetim kaydına da yazılır.
    // Kim, hangi belgeyi, ne zaman gördü bilgisi iki durumda da tutulur.
    //
    // Tekrarlar yazılmaz (10 dk): Belgeler sekmesinin her açılışı belge sayısı
    // kadar önizleme kaydı, aynı belgeyi yeniden açmak yeni "Belge
    // görüntülendi" yazıyordu; gerçek erişimler gürültüde kayboluyordu.
    // Önizlemede kişi + hasta, tam görüntülemede kişi + belge başına tek kayıt.
    const isThumb = req.nextUrl.searchParams.get("view") === "thumb";
    if (isThumb) {
      // Sekme açılınca bütün küçük resimler aynı anda istenir: veritabanı
      // denetimi henüz yazılmamış kaydı göremediği için her biri ayrı kayıt
      // yazıyordu. Aynı süreçteki eşzamanlı istekler önce bellekte elenir.
      const tracked = auth.user.role !== "SUPERADMIN" && !auth.user.ghostSession;
      const previewKey = `${auth.user.id}:${document.patientId}`;
      if (tracked && markFirstWithinWindow(recentPreviews, previewKey)) {
        try {
          const recentPreview = await prisma.patientAccessLog.findFirst({
            where: {
              institutionId: document.institutionId,
              patientId: document.patientId,
              userId: auth.user.id,
              action: "BELGE_ONIZLEME",
              createdAt: { gte: new Date(Date.now() - VIEW_DEDUPE_MS) },
            },
            select: { id: true },
          });
          if (!recentPreview) {
            await prisma.patientAccessLog.create({
              data: {
                institutionId: document.institutionId,
                patientId: document.patientId,
                userId: auth.user.id,
                action: "BELGE_ONIZLEME",
                // Kayıt kişi + hasta başına tektir (10 dk): sekmedeki önizlemelerin tamamını kapsar.
                purpose: `Belgeler sekmesi önizlemesi (ilk: ${document.category}: ${document.fileName})`.slice(0, 250),
                route: req.nextUrl.pathname,
                ip: getClientIpFromHeaders(req.headers).slice(0, 100) || null,
              },
            });
          }
        } catch (error) {
          // Kayıt yazılamadıysa işaret kaldırılır: sonraki önizleme kaydı yeniden dener.
          recentPreviews.delete(previewKey);
          throw error;
        }
      }
    } else if (shouldRecordFullView(auth.user.id, document.id)) {
      await writeAudit(
        auth.user.id,
        "DOCUMENT_VIEW",
        `${document.category}: ${document.fileName} · Hasta: ${document.patientId}`,
      );
    }

    // İçerik değişmez (yeni sürüm yeni kayıttır): tarayıcı elindeki kopyayı
    // doğrulatırsa dosya veritabanından yeniden okunmadan 304 döner.
    const etag = document.sha256 ? `"${document.sha256}"` : null;
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "private, max-age=0, no-cache",
      ...(etag ? { ETag: etag } : {}),
    };
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const buffer = await readDocumentFile(
      document.storedName,
      document.storageProvider,
      document.sha256,
    );
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
        ...cacheHeaders,
      },
    });
  } catch (error) {
    console.error("[documents file GET]", error);
    return NextResponse.json({ error: "Dosya okunamadı" }, { status: 404 });
  }
}
