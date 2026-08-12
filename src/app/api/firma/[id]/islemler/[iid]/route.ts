import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { reverseFirmaIslemIntegration } from "@/lib/firma-integration";
import { writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { publicErrorResponse } from "@/lib/public-error";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; iid: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
    const body = await req.json();
    if (body.status !== undefined && body.status !== "IPTAL") {
      return NextResponse.json({ error: "Bu uç noktada yalnızca işlem iptali yapılabilir" }, { status: 400 });
    }
    const existing = await (prisma as any).firmaIslem.findFirst({
      where: {
        id: params.iid,
        firmaId: params.id,
        branchId: branch.branchId,
        firma: {
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
      },
      include: { firma: { select: { name: true, institutionId: true } }, purchase: { select: { id: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });
    }

    if (body.status === "IPTAL" && existing.status === "IPTAL") {
      return NextResponse.json({
        islem: existing,
        duplicateRequest: true,
        message: "Bu işlem zaten iptal edilmiş",
      });
    }

    const isCancelling = body.status === "IPTAL" && existing.status !== "IPTAL";

    if (isCancelling && existing.purchase) {
      return NextResponse.json({
        error: "Bu işlem çok kalemli bir satın alma kaydına bağlı. Lütfen Satın Alımlar sekmesinden düzenleyin veya iptal edin.",
      }, { status: 400 });
    }

    // Lab faturasından otomatik oluşmuş işlemler bu uçtan iptal edilirse
    // FirmaIslem IPTAL olur ama LabOrder/LabOrderInvoice hâlâ "faturalanmış"
    // görünmeye devam eder — zincir kopar (bkz. denetim raporu Tema 3). Bu
    // kayıtlar yalnızca ilgili lab siparişi ekranından iptal edilebilir.
    if (isCancelling && String(existing.aciklama || "").includes("[SISTEM:LAB_FATURA:")) {
      return NextResponse.json({
        error: "Bu işlem bir laboratuvar faturasından otomatik oluşturuldu. Lütfen ilgili laboratuvar siparişinin ekranından iptal edin ki sipariş kaydı da güncellensin.",
      }, { status: 400 });
    }

    // Bu uç nokta yalnızca durum güncellemesini (şu an sadece iptal) destekliyor —
    // ham `body`yi olduğu gibi vermek firmaId gibi alanların dışarıdan
    // değiştirilebilmesine (başka bir cariye/kuruma taşınmasına) yol açardı.
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;

    const result = await (prisma as any).$transaction(async (tx: any) => {
      if (isCancelling) {
        // İki eşzamanlı iptal isteği, ikisi de transaction dışında okunan
        // `existing.status !== "IPTAL"` kontrolünü geçip stok/gider geri
        // alımını İKİ KEZ tetikleyebilirdi (bkz. denetim raporu). Durumu
        // burada, tek bir UPDATE ile atomik olarak "AKTIF -> IPTAL" şartıyla
        // talep ediyoruz — Postgres bu satırda ikinci eşzamanlı isteği
        // birincisi commit olana kadar bekletir, sonra WHERE'i tekrar
        // değerlendirip 0 satır etkiler.
        const claim = await tx.firmaIslem.updateMany({
          where: { id: params.iid, branchId: branch.branchId, status: { not: "IPTAL" } },
          data,
        });
        if (claim.count === 0) {
          return {
            islem: await tx.firmaIslem.findUniqueOrThrow({ where: { id: params.iid } }),
            duplicateRequest: true,
          };
        }
        await reverseFirmaIslemIntegration(tx, auth.user.id, params.iid);
        return {
          islem: await tx.firmaIslem.findUniqueOrThrow({ where: { id: params.iid } }),
          duplicateRequest: false,
        };
      }

      return {
        islem: await tx.firmaIslem.update({ where: { id: params.iid }, data }),
        duplicateRequest: false,
      };
    });

    if (!result.duplicateRequest) {
      if (isCancelling) {
        await writeAudit(
          auth.user.id,
          "FIRMA_ISLEM_CANCEL",
          `${existing.firma?.name || "Firma"} işlemi iptal edildi.\nOtomatik işlemler geri alındı.`
        );
      } else {
        await writeAudit(auth.user.id, "FIRMA_ISLEM_UPDATE", `${existing.firma?.name || "Firma"} cari işlemi güncellendi`);
      }
    }

    return NextResponse.json({
      islem: result.islem,
      duplicateRequest: result.duplicateRequest,
      message: result.duplicateRequest
        ? "Bu işlem zaten iptal edilmiş"
        : isCancelling
          ? "İşlem iptal edildi ve otomatik etkiler geri alındı"
          : "İşlem güncellendi",
    });
  } catch (e) {
    console.error("[firma/:id/islemler/:iid PATCH]", e);
    const publicError = publicErrorResponse(e, "İşlem güncellenemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
