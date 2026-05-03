import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { reverseFirmaIslemIntegration } from "@/lib/firma-integration";
import { writeAudit } from "@/lib/api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; iid: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const body = await req.json();
    const existing = await (prisma as any).firmaIslem.findUnique({
      where: { id: params.iid },
      include: { firma: { select: { name: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "İşlem bulunamadı" }, { status: 404 });
    }

    const isCancelling = body.status === "IPTAL" && existing.status !== "IPTAL";

    const islem = await (prisma as any).$transaction(async (tx: any) => {
      const updated = await tx.firmaIslem.update({
        where: { id: params.iid },
        data: body
      });

      if (isCancelling) {
        await reverseFirmaIslemIntegration(tx, user.id, params.iid);
      }

      return updated;
    });

    if (isCancelling) {
      await writeAudit(
        user.id,
        "FIRMA_ISLEM_CANCEL",
        `${existing.firma?.name || "Firma"} işlemi iptal edildi.\nOtomatik işlemler geri alındı.`
      );
    }

    return NextResponse.json({ islem, message: isCancelling ? "İşlem iptal edildi ve otomatik etkiler geri alındı" : "İşlem güncellendi" });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
