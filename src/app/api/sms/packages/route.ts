import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyPlatformOwnersLater } from "@/lib/platform-notify";
import { SmsPackageSaleError, sellSmsPackage } from "@/lib/sms-package-sale";

// Kliniğin SMS paketi alırken göreceği vade (süperadmin satışındaki varsayılanla aynı).
const PURCHASE_DUE_DAYS = 7;

/** İletişim › Kanal ve kredi › "SMS paketi al": satın alınabilecek paketler. */
export async function GET() {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });

  const packages = await prisma.smsPackage.findMany({
    where: { isActive: true },
    orderBy: { smsCount: "asc" },
    select: { id: true, name: true, smsCount: true, price: true, description: true },
  });

  return NextResponse.json({
    packages: packages.map((item) => ({ ...item, price: Number(item.price) })),
    dueDays: PURCHASE_DUE_DAYS,
    // Süperadmin kliniğe gizli girişteyken satış klinik dosyasından yapılır.
    canBuy: !auth.user.ghostSession,
  });
}

/**
 * Klinik paketi kendisi alır: kredi hemen yüklenir, 7 gün vadeli fatura açılır
 * ve platform sahibine e-posta gider. Platform stoğu yetmezse istek destek
 * talebine dönüşür (kaybolmaz) ve sahibine bildirilir.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });
  if (auth.user.ghostSession) {
    return NextResponse.json({ message: "Süperadmin girişinde paket satışı Süperadmin › Klinik dosyasından yapılır." }, { status: 403 });
  }

  const rate = await checkRateLimit(`sms-package-purchase:${institutionId}`, 5, 10 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Kısa sürede çok fazla paket isteği yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { smsPackageId?: unknown } | null;
  const smsPackageId = typeof body?.smsPackageId === "string" ? body.smsPackageId : "";
  if (!smsPackageId) return NextResponse.json({ message: "Paket seçin" }, { status: 400 });

  const [smsPackage, clinic] = await Promise.all([
    prisma.smsPackage.findUnique({ where: { id: smsPackageId }, select: { id: true, name: true, smsCount: true, price: true, isActive: true } }),
    prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } }),
  ]);
  if (!smsPackage?.isActive) return NextResponse.json({ message: "Bu paket artık satışta değil" }, { status: 404 });
  const clinicName = clinic?.name ?? "Klinik";
  const priceText = `${Number(smsPackage.price).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;

  let result;
  try {
    result = await sellSmsPackage({ institutionId, smsPackageId, quantity: 1, dueDays: PURCHASE_DUE_DAYS });
  } catch (error) {
    if (error instanceof SmsPackageSaleError && error.code === "INSUFFICIENT_STOCK") {
      await prisma.supportTicket.create({
        data: {
          userId: auth.user.id,
          institutionId,
          subject: "SMS",
          message: `${smsPackage.name} (${smsPackage.smsCount.toLocaleString("tr-TR")} SMS, ${priceText}) almak istiyoruz. Platform stoğu yetmediği için otomatik yüklenemedi.`,
        },
      });
      notifyPlatformOwnersLater(
        `SMS stoğu yetmedi — ${clinicName}`,
        [`${clinicName} ${smsPackage.name} (${smsPackage.smsCount.toLocaleString("tr-TR")} SMS) almak istedi; platform stoğu ${error.available.toLocaleString("tr-TR")} SMS.`, "Stok ekleyip paketi klinik dosyasından satın; talep Destek'e düştü."],
        { path: "/superadmin/support", label: "Destek taleplerini aç" },
      );
      return NextResponse.json({ message: "Paket şu an yüklenemedi. İsteğiniz platform yöneticisine iletildi; yüklenince krediniz artar." }, { status: 409 });
    }
    if (error instanceof SmsPackageSaleError) {
      return NextResponse.json({ message: error.code === "TARGET_INACTIVE" ? "Bu paket artık satışta değil" : "İşlem başka bir işlemle çakıştı. Tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }

  invalidateInstitutionCache(institutionId);
  await writeAudit(auth.user.id, "SMS_PACKAGE_PURCHASE", `${result.packageName} alındı: ${result.smsToAdd} SMS, ${priceText}`);
  notifyPlatformOwnersLater(
    `SMS paketi alındı — ${clinicName}`,
    [`${clinicName} ${result.packageName} aldı: ${result.smsToAdd.toLocaleString("tr-TR")} SMS, ${priceText}.`, `Fatura ${result.invoice.invoiceNo}, ${PURCHASE_DUE_DAYS} gün vadeli.`],
    { path: "/superadmin/invoices", label: "Faturaları aç" },
  );

  return NextResponse.json({
    message: `${result.smsToAdd.toLocaleString("tr-TR")} SMS yüklendi`,
    balance: result.updatedInstitution.smsBalance,
    invoice: { amount: result.totalPrice, dueDate: result.invoice.dueDate },
  });
}
