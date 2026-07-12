import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { reverseFirmaIslemIntegration } from "@/lib/firma-integration";
import { writeAudit } from "@/lib/api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; iid: string } }
) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const body = await req.json();
    const existing = await (prisma as any).firmaIslem.findFirst({
      where: {
        id: params.iid,
        firmaId: params.id,
        firma: {
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
      },
      include: { firma: { select: { name: true, institutionId: true } }, purchase: { select: { id: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });
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

    const islem = await (prisma as any).$transaction(async (tx: any) => {
      const updated = await tx.firmaIslem.update({
        where: { id: params.iid },
        data
      });

      if (isCancelling) {
        await reverseFirmaIslemIntegration(tx, auth.user.id, params.iid);
      }

      return updated;
    });

    if (isCancelling) {
      await writeAudit(
        auth.user.id,
        "FIRMA_ISLEM_CANCEL",
        `${existing.firma?.name || "Firma"} işlemi iptal edildi.\nOtomatik işlemler geri alındı.`
      );
    } else {
      await writeAudit(auth.user.id, "FIRMA_ISLEM_UPDATE", `${existing.firma?.name || "Firma"} cari işlemi güncellendi`);
    }

    return NextResponse.json({ islem, message: isCancelling ? "İşlem iptal edildi ve otomatik etkiler geri alındı" : "İşlem güncellendi" });
  } catch (e) {
    return NextResponse.json({ error: "Islem guncellenemedi" }, { status: 503 });
  }
}
