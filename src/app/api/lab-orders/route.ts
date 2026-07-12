import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { applyLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

export const dynamic = "force-dynamic";

export const GET = withApiTiming("lab-orders", async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const user = auth.user;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") || searchParams.get("take") || 0);

  // Yeni iş formlarında laboratuvar kaynağı geçmiş sipariş isimleri değil,
  // firma kartında Laboratuvar olarak işaretlenen aktif firmalardır.
  if (searchParams.get("namesOnly") === "true") {
    const rows = await prisma.firma.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        isActive: true,
        kategori: "LAB",
      },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 500,
    });
    const names: string[] = rows.map((r) => (r.name || "").trim()).filter(Boolean);
    const uniqueNames: string[] = Array.from(new Set(names));
    return NextResponse.json(uniqueNames.sort((a, b) => a.localeCompare(b, "tr")));
  }

  let orders: any[] = [];
  try {
    orders = await (prisma as any).labOrder.findMany({
      where: {
        ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
        ...(status === "BEKLIYOR"
          ? {
              status: { notIn: ["HASTAYA_TAKILDI", "IPTAL"] },
              trips: { some: { receivedAt: null } },
            }
          : {}),
        ...(status && status !== "BEKLIYOR" ? { status } : {}),
      },
      include: {
        invoices: { orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor:  { select: { id: true, fullName: true } },
        trips:   { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      // limit verilmezse de tek istek tüm laboratuvar geçmişini döndürmesin diye varsayılan sınır.
      take: limit > 0 ? Math.min(limit, 500) : 300,
    });
  } catch (error) {
    console.error("[lab-orders GET] fallback:", error);
    orders = [];
  }

  const hidePhone = shouldHidePatientPhone(user.role);
  const masked = hidePhone
    ? orders.map((o: any) => ({ ...o, patient: o.patient ? { ...o.patient, phone: "***" } : o.patient }))
    : orders;

  return NextResponse.json(masked);
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;
  const user = auth.user;

  const body = await req.json();
  const { patientId, doctorId, labName, labType, teeth, notes, price, invoiceNo, firstTrip, firstInvoice } = body;

  if (!patientId || !doctorId || !labName || !labType) {
    return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
  }

  const labFirma = await prisma.firma.findFirst({
    where: {
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      isActive: true,
      kategori: "LAB",
      name: { equals: String(labName).trim(), mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  if (!labFirma) {
    return NextResponse.json(
      { error: "Laboratuvar işi yalnızca firma kartında Laboratuvar olarak işaretlenen firmalara açılabilir." },
      { status: 400 },
    );
  }
  const normalizedLabName = labFirma.name;

  if (auth.user.institutionId) {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: patientId, institutionId: auth.user.institutionId },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: doctorId, institutionId: auth.user.institutionId, isActive: true },
        select: { id: true, role: true, profile: { select: { hideAsDoctor: true } } },
      }),
    ]);
    const eligibleDoctor = doctor && (doctor.role === "DOKTOR" || (doctor.role === "YONETICI" && doctor.profile?.hideAsDoctor === false));
    if (!patient || !eligibleDoctor) {
      return NextResponse.json({ error: "Hasta veya doktor kurum kapsamı disinda" }, { status: 403 });
    }
  }

  let order: any;
  let firmaIntegration: { firmaId: string; firmaName: string; error?: string } | null = null;
  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      const createdOrder = await tx.labOrder.create({
        data: {
          patientId,
          doctorId,
          labName: normalizedLabName,
          firmaId: labFirma.id,
          labType,
          teeth,
          notes,
          price:     price ? Number(price) : firstInvoice?.amount ? Number(firstInvoice.amount) : null,
          invoiceNo: invoiceNo || firstInvoice?.invoiceNo || null,
          invoices: firstInvoice?.item && firstInvoice?.amount ? {
            create: [{
              item: firstInvoice.item,
              amount: Number(firstInvoice.amount),
              invoiceNo: firstInvoice.invoiceNo || null,
              issuedAt: firstInvoice.issuedAt ? new Date(firstInvoice.issuedAt) : new Date(),
              note: firstInvoice.note || null,
            }],
          } : price ? {
            create: [{
              item: labType,
              amount: Number(price),
              invoiceNo: invoiceNo || null,
              issuedAt: new Date(),
              note: null,
            }],
          } : undefined,
          trips: firstTrip?.description ? {
            create: [{
              order:       1,
              description: firstTrip.description,
              sentAt:      firstTrip.sentAt     ? new Date(firstTrip.sentAt)     : new Date(),
              sentNote:    firstTrip.sentNote || null,
            }],
          } : undefined,
        },
        include: {
          invoices: { orderBy: { issuedAt: "asc" } },
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor:  { select: { id: true, fullName: true } },
          trips:   { orderBy: { order: "asc" } },
        },
      });

      let integration: { firmaId: string; firmaName: string; error?: string } | null = null;
      const firstCreatedInvoice = Array.isArray(createdOrder?.invoices) ? createdOrder.invoices[0] : null;
      if (firstCreatedInvoice?.amount && normalizedLabName) {
        const linked = await applyLabInvoiceFirmaIntegration({
          tx,
          userId: auth.user.id,
          institutionId: auth.user.institutionId || null,
          labName: normalizedLabName,
          labType,
          patientName: createdOrder.patient?.fullName || null,
          item: firstCreatedInvoice.item || labType,
          amount: Number(firstCreatedInvoice.amount),
          invoiceNo: firstCreatedInvoice.invoiceNo || invoiceNo || null,
          issuedAt: firstCreatedInvoice.issuedAt,
          note: firstCreatedInvoice.note || null,
          labOrderId: createdOrder.id,
          labInvoiceId: firstCreatedInvoice.id,
          firmaId: labFirma.id,
        });
        integration = linked ? { firmaId: linked.firmaId, firmaName: linked.firmaName } : null;
      }

      return { order: createdOrder, firmaIntegration: integration };
    });
    order = result.order;
    firmaIntegration = result.firmaIntegration;
  } catch (error) {
    console.error("[lab-orders POST] fallback:", error);
    return NextResponse.json({ error: "Laboratuvar kaydı oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "LAB_ORDER_CREATE", `${normalizedLabName} (${labType}) laboratuvar siparişi oluşturuldu`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  return NextResponse.json({ ...order, firmaIntegration }, { status: 201 });
}
