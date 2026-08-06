import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { applyLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { formatZodError, labInvoiceCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function toPublicOrder(order: any) {
  if (!order) return order;
  const { requestKey: _requestKey, ...publicOrder } = order;
  return {
    ...publicOrder,
    invoices: Array.isArray(publicOrder.invoices)
      ? publicOrder.invoices.map((invoice: any) => {
          const { requestKey: _invoiceRequestKey, ...publicInvoice } = invoice;
          return publicInvoice;
        })
      : publicOrder.invoices,
  };
}

export const GET = withApiTiming("lab-orders", async function GET(req: NextRequest) {
  const auth = await requireAuth("lab:read");
  if (auth.error) return auth.error;
  const user = auth.user;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") || searchParams.get("take") || 0);
  if (status && !new Set(["BEKLIYOR", "DEVAM_EDIYOR", "HASTAYA_TAKILDI", "IPTAL"]).has(status)) {
    return NextResponse.json({ message: "Geçersiz laboratuvar durumu" }, { status: 400 });
  }

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
    return NextResponse.json(
      { message: "Laboratuvar işleri yüklenemedi. Lütfen sistem yöneticinize bildiriniz." },
      { status: 503 },
    );
  }

  const hidePhone = await shouldHidePatientPhoneForRole(user.role);
  const publicOrders = orders.map(toPublicOrder);
  const masked = hidePhone
    ? publicOrders.map((o: any) => ({ ...o, patient: o.patient ? { ...o.patient, phone: "***" } : o.patient }))
    : publicOrders;

  return NextResponse.json(masked);
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Laboratuvar işlemi için klinik bağlamı zorunlu." }, { status: 403 });
  }
  const rawRequestKey = req.headers.get("Idempotency-Key")?.trim() || null;
  if (rawRequestKey && (rawRequestKey.length < 8 || rawRequestKey.length > 180)) {
    return NextResponse.json({ error: "İşlem anahtarı geçersiz." }, { status: 400 });
  }
  const requestKey = rawRequestKey;

  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const { patientId, doctorId, labName, labType, teeth, notes, price, invoiceNo, firstTrip, firstInvoice } = body;

  const normalizedLabType = typeof labType === "string" ? labType.trim() : "";
  const normalizedTeeth = typeof teeth === "string" ? teeth.trim() : "";
  const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
  const normalizedInvoiceNo = typeof invoiceNo === "string" ? invoiceNo.trim() : "";

  if (typeof patientId !== "string" || !patientId.trim() || typeof doctorId !== "string" || !doctorId.trim() || typeof labName !== "string" || !labName.trim() || !normalizedLabType) {
    return NextResponse.json({ error: "Hasta, doktor, laboratuvar ve iş türü zorunludur." }, { status: 400 });
  }
  if (normalizedLabType.length > 180 || normalizedTeeth.length > 200 || normalizedNotes.length > 2000 || normalizedInvoiceNo.length > 80) {
    return NextResponse.json({ error: "Laboratuvar alanlarından biri izin verilen uzunluğu aşıyor." }, { status: 400 });
  }

  const normalizedPrice = price === undefined || price === null || price === "" ? null : Number(price);
  if (normalizedPrice !== null && (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0 || normalizedPrice > 100_000_000)) {
    return NextResponse.json({ error: "Geçerli bir laboratuvar tutarı girin." }, { status: 400 });
  }

  const hasFirstInvoice = Boolean(firstInvoice && typeof firstInvoice === "object" && (firstInvoice.item || firstInvoice.amount));
  const parsedFirstInvoice = hasFirstInvoice ? labInvoiceCreateSchema.safeParse(firstInvoice) : null;
  if (parsedFirstInvoice && !parsedFirstInvoice.success) {
    return NextResponse.json({ error: "İlk fatura bilgileri geçersiz.", errors: formatZodError(parsedFirstInvoice.error) }, { status: 400 });
  }
  const normalizedFirstInvoice = parsedFirstInvoice?.success ? parsedFirstInvoice.data : null;
  if (normalizedFirstInvoice && normalizedPrice !== null && Math.abs(normalizedFirstInvoice.amount - normalizedPrice) > 0.009) {
    return NextResponse.json({ error: "Sipariş tutarı ile ilk fatura tutarı aynı olmalı." }, { status: 400 });
  }

  let normalizedFirstTrip: { description: string; sentAt: Date; sentNote: string | null } | null = null;
  if (firstTrip !== undefined && firstTrip !== null) {
    if (!firstTrip || typeof firstTrip !== "object" || Array.isArray(firstTrip)) {
      return NextResponse.json({ error: "İlk gönderim bilgisi geçersiz." }, { status: 400 });
    }
    const description = typeof firstTrip.description === "string" ? firstTrip.description.trim() : "";
    const sentNote = typeof firstTrip.sentNote === "string" ? firstTrip.sentNote.trim() : "";
    const sentAt = firstTrip.sentAt ? new Date(firstTrip.sentAt) : new Date();
    if (!description || description.length > 180 || sentNote.length > 1000 || Number.isNaN(sentAt.getTime())) {
      return NextResponse.json({ error: "İlk gönderim açıklaması veya tarihi geçersiz." }, { status: 400 });
    }
    normalizedFirstTrip = { description, sentAt, sentNote: sentNote || null };
  }

  const labFirma = await prisma.firma.findFirst({
    where: {
      institutionId: auth.user.institutionId,
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

  if (requestKey) {
    const existingOrder = await (prisma as any).labOrder.findFirst({
      where: {
        requestKey,
        ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
      },
      include: {
        invoices: { orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
        trips: { orderBy: { order: "asc" } },
      },
    });
    if (existingOrder) {
      return NextResponse.json({ ...toPublicOrder(existingOrder), duplicateRequest: true }, { status: 200 });
    }
  }

  {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: patientId, institutionId: auth.user.institutionId, archivedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: doctorId, institutionId: auth.user.institutionId, isActive: true },
        select: { id: true, role: true, profile: { select: { hideAsDoctor: true } } },
      }),
    ]);
    const eligibleDoctor = doctor && (doctor.role === "DOKTOR" || (doctor.role === "YONETICI" && doctor.profile?.hideAsDoctor === false));
    if (!patient || !eligibleDoctor) {
      return NextResponse.json({ error: "Hasta veya doktor bu kuruma bağlı değil." }, { status: 403 });
    }
  }

  let order: any;
  let firmaIntegration: { firmaId: string; firmaName: string; error?: string } | null = null;
  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      const createdOrder = await tx.labOrder.create({
        data: {
          requestKey,
          patientId,
          doctorId,
          labName: normalizedLabName,
          firmaId: labFirma.id,
          labType: normalizedLabType,
          teeth: normalizedTeeth || null,
          notes: normalizedNotes || null,
          price: normalizedFirstInvoice?.amount ?? normalizedPrice,
          invoiceNo: normalizedFirstInvoice?.invoiceNo || normalizedInvoiceNo || null,
          invoices: normalizedFirstInvoice ? {
            create: [{
              requestKey: requestKey ? `${requestKey}:invoice` : null,
              item: normalizedFirstInvoice.item,
              amount: normalizedFirstInvoice.amount,
              invoiceNo: normalizedFirstInvoice.invoiceNo || null,
              issuedAt: normalizedFirstInvoice.issuedAt ? new Date(normalizedFirstInvoice.issuedAt) : new Date(),
              note: normalizedFirstInvoice.note || null,
            }],
          } : normalizedPrice !== null ? {
            create: [{
              requestKey: requestKey ? `${requestKey}:invoice` : null,
              item: normalizedLabType,
              amount: normalizedPrice,
              invoiceNo: normalizedInvoiceNo || null,
              issuedAt: new Date(),
              note: null,
            }],
          } : undefined,
          trips: normalizedFirstTrip ? {
            create: [{
              order:       1,
              description: normalizedFirstTrip.description,
              sentAt: normalizedFirstTrip.sentAt,
              sentNote: normalizedFirstTrip.sentNote,
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
          labType: normalizedLabType,
          patientName: createdOrder.patient?.fullName || null,
          item: firstCreatedInvoice.item || normalizedLabType,
          amount: Number(firstCreatedInvoice.amount),
          invoiceNo: firstCreatedInvoice.invoiceNo || normalizedInvoiceNo || null,
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
    if (
      requestKey
      && error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "P2002"
    ) {
      const existingOrder = await (prisma as any).labOrder.findFirst({
        where: {
          requestKey,
          ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
        },
        include: {
          invoices: { orderBy: { issuedAt: "asc" } },
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: { select: { id: true, fullName: true } },
          trips: { orderBy: { order: "asc" } },
        },
      });
      if (existingOrder) {
        return NextResponse.json({ ...toPublicOrder(existingOrder), duplicateRequest: true }, { status: 200 });
      }
    }
    console.error("[lab-orders POST] fallback:", error);
    return NextResponse.json({ error: "Laboratuvar kaydı oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "LAB_ORDER_CREATE", `${normalizedLabName} (${normalizedLabType}) laboratuvar siparişi oluşturuldu`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  return NextResponse.json({ ...toPublicOrder(order), firmaIntegration }, { status: 201 });
}
