import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { reverseLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { requireActiveBranch } from "@/lib/branch-context";

const VALID_LAB_ORDER_STATUSES = new Set(["DEVAM_EDIYOR", "HASTAYA_TAKILDI", "IPTAL"]);
const LAB_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  DEVAM_EDIYOR: new Set(["HASTAYA_TAKILDI", "IPTAL"]),
  HASTAYA_TAKILDI: new Set(["IPTAL"]),
  IPTAL: new Set(),
};

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

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  const user = auth.user;

  const order = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    include: {
      invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  const hidePhone = await shouldHidePatientPhoneForRole(user.role);
  if (hidePhone && order.patient) {
    return NextResponse.json(toPublicOrder({
      ...order,
      patient: { ...order.patient, phone: "***" },
    }));
  }

  return NextResponse.json(toPublicOrder(order));
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { status, price, invoiceNo, appendInvoice, action, reason, restartDescription } = body;
  if (status !== undefined && (typeof status !== "string" || !VALID_LAB_ORDER_STATUSES.has(status))) {
    return NextResponse.json({ error: "Geçersiz laboratuvar siparişi durumu" }, { status: 400 });
  }
  if (action !== undefined && action !== "RPT_REOPEN") {
    return NextResponse.json({ error: "Geçersiz laboratuvar işlemi" }, { status: 400 });
  }

  // Mevcut siparişi al — firma entegrasyonu için önceki fatura durumuna bakıyoruz
  const existing = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    select: { id: true, status: true, notes: true, labName: true, labType: true, invoiceNo: true, price: true, patient: { select: { fullName: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if (status && status !== existing.status && !LAB_TRANSITIONS[existing.status]?.has(status)) {
    return NextResponse.json({ error: `${existing.status} durumundaki sipariş ${status} durumuna geçirilemez.` }, { status: 409 });
  }

  if (appendInvoice !== undefined || price !== undefined || invoiceNo !== undefined) {
    return NextResponse.json(
      { error: "Fatura işlemleri yalnızca laboratuvar fatura formundan yapılabilir." },
      { status: 400 },
    );
  }

  // "Hastaya takıldı" (teslim/tamamlandı) durumuna geçerken hiçbir maliyet
  // kaydı yoksa, bu lab gideri hiçbir doktorun hakediş hesabına yansımadan
  // sessizce kaybolur — geçişi engelleyip fatura girilmesini zorunlu kılıyoruz.
  if (status === "HASTAYA_TAKILDI" && existing.status !== "HASTAYA_TAKILDI") {
    const invoiceCount = await (prisma as any).labOrderInvoice.count({
      where: { labOrderId: params.id, status: "ACTIVE" },
    });
    if (invoiceCount === 0 && !existing.price) {
      return NextResponse.json(
        { error: "Bu durumu \"Hastaya Takıldı\" yapmadan önce laboratuvar faturası/tutarı girmelisiniz — aksi halde bu maliyet hakediş hesabına hiç yansımaz." },
        { status: 400 },
      );
    }
  }

  if (action === "RPT_REOPEN") {
    if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 1000) {
      return NextResponse.json({ error: "RPT nedeni zorunludur" }, { status: 400 });
    }
    const timestamp = new Date().toISOString();
    const rptNote = `RPT yeniden açıldı (${timestamp}): ${reason.trim()}`;

    if (existing.status !== "HASTAYA_TAKILDI") {
      return NextResponse.json({ error: "RPT yalnızca hastaya takılmış/tamamlanmış bir laboratuvar işi için açılabilir." }, { status: 409 });
    }
    const reopened = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      const current = await tx.labOrder.findFirst({
        where: { id: params.id, institutionId: auth.user.institutionId, branchId: branch.branchId },
        select: { status: true, notes: true, invoiceNo: true, price: true, labType: true },
      });
      if (!current) throw new Error("LAB_ORDER_NOT_FOUND");
      if (current.status !== "HASTAYA_TAKILDI") throw new Error("INVALID_LAB_TRANSITION");
      const existingInvoices = await tx.labOrderInvoice.findMany({
        where: { labOrderId: params.id, status: "ACTIVE" },
        select: { id: true, item: true, amount: true, invoiceNo: true },
      });

      for (const invoice of existingInvoices) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          branchId: branch.branchId,
          labInvoiceId: invoice.id,
          labOrderId: params.id,
          invoiceNo: invoice.invoiceNo || null,
          item: invoice.item || null,
          amount: Number(invoice.amount || 0),
        });
      }

      if (existingInvoices.length > 0) {
        await tx.labOrderInvoice.updateMany({
          where: { labOrderId: params.id, status: "ACTIVE" },
          data: {
            status: "VOID",
            voidedAt: new Date(),
            voidedById: auth.user.id,
            voidReason: `RPT ile yeniden açıldı: ${reason.trim()}`,
          },
        });
      }

      if (current.invoiceNo || current.price) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          branchId: branch.branchId,
          labOrderId: params.id,
          invoiceNo: current.invoiceNo || null,
          item: current.labType,
          amount: Number(current.price || 0),
        });
      }

      const currentTrip = await tx.labTrip.findFirst({
        where: { labOrderId: params.id, status: "ACTIVE" },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const nextOrder = (currentTrip?.order || 0) + 1;

      await tx.labOrder.update({
        where: { id: params.id },
        data: {
          status: "DEVAM_EDIYOR",
          notes: current.notes ? `${current.notes}\n[RPT] ${rptNote}` : `[RPT] ${rptNote}`,
          price: null,
          invoiceNo: null,
        },
      });

      await tx.labTrip.create({
        data: {
          institutionId: auth.user.institutionId!,
          branchId: branch.branchId,
          labOrderId: params.id,
          order: nextOrder,
          description: typeof restartDescription === "string" && restartDescription.trim() ? restartDescription.trim().slice(0, 180) : "Ölçü",
          sentAt: new Date(),
          sentNote: `RPT_RESET_START | ${rptNote}`,
        },
      });

      return tx.labOrder.findUnique({
        where: { id: params.id },
        include: {
          invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
          patient: { select: { id: true, fullName: true } },
          doctor: { select: { id: true, fullName: true } },
          trips: { orderBy: { order: "asc" } },
        },
      });
    }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "LAB_ORDER_NOT_FOUND") return null;
      if (error instanceof Error && error.message === "INVALID_LAB_TRANSITION") return "INVALID_TRANSITION";
      throw error;
    });
    if (!reopened) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    if (reopened === "INVALID_TRANSITION") {
      return NextResponse.json({ error: "Sipariş durumu başka bir kullanıcı tarafından değiştirildi; RPT artık uygulanamaz." }, { status: 409 });
    }

    await writeAudit(auth.user.id, "LAB_ORDER_RPT_REOPEN", `Laboratuvar siparişi RPT ile yeniden açıldı (${params.id})`);
    await bumpRealtimeInstitution(auth.user.institutionId || null);
    return NextResponse.json(toPublicOrder(reopened));
  }

  // İptal edilmiş bir siparişi bu genel PATCH ile başka bir duruma taşımak,
  // firma cari hesabına hiç geri yansımadan (yalnızca RPT_REOPEN akışı eski
  // faturaları silip entegrasyonu doğru şekilde sıfırdan kuruyor) siparişi
  // "faturası var, borcu yok" bir hayalet duruma düşürüyordu (bkz. denetim
  // raporu). İptalden çıkış artık yalnızca RPT_REOPEN akışı üzerinden mümkün.
  if (existing.status === "IPTAL" && status !== undefined && status !== "IPTAL") {
    return NextResponse.json(
      { error: "İptal edilmiş bir sipariş yalnızca \"RPT ile yeniden aç\" işlemiyle tekrar aktif edilebilir." },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (status    !== undefined) data.status    = status;

  const updated = await (prisma as any).$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
    const current = await tx.labOrder.findFirst({
      where: { id: params.id, institutionId: auth.user.institutionId, branchId: branch.branchId },
      select: { status: true, invoiceNo: true, price: true, labType: true },
    });
    if (!current) throw new Error("LAB_ORDER_NOT_FOUND");
    if (status && status !== current.status && !LAB_TRANSITIONS[current.status]?.has(status)) {
      throw new Error("INVALID_LAB_TRANSITION");
    }
    if (status === "HASTAYA_TAKILDI" && current.status !== "HASTAYA_TAKILDI") {
      const invoiceCount = await tx.labOrderInvoice.count({ where: { labOrderId: params.id, status: "ACTIVE" } });
      if (invoiceCount === 0 && !current.price) throw new Error("LAB_INVOICE_REQUIRED");
    }
    if (status === "IPTAL" && current.status !== "IPTAL") {
      const existingInvoices = await tx.labOrderInvoice.findMany({
        where: { labOrderId: params.id, status: "ACTIVE" },
        select: { id: true, item: true, amount: true, invoiceNo: true },
      });

      for (const invoice of existingInvoices) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          branchId: branch.branchId,
          labInvoiceId: invoice.id,
          labOrderId: params.id,
          invoiceNo: invoice.invoiceNo || null,
          item: invoice.item || null,
          amount: Number(invoice.amount || 0),
        });
      }

      if (existingInvoices.length === 0 && (current.invoiceNo || current.price)) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          branchId: branch.branchId,
          labOrderId: params.id,
          invoiceNo: current.invoiceNo || null,
          item: current.labType,
          amount: Number(current.price || 0),
        });
      }
    }

    const order = await tx.labOrder.update({
      where: { id: params.id },
      data,
      include: {
        invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true } },
        doctor: { select: { id: true, fullName: true } },
        trips: { orderBy: { order: "asc" } },
      },
    });

    return order;
  }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "LAB_ORDER_NOT_FOUND") return null;
    if (error instanceof Error && error.message === "INVALID_LAB_TRANSITION") return "INVALID_TRANSITION";
    if (error instanceof Error && error.message === "LAB_INVOICE_REQUIRED") return "INVOICE_REQUIRED";
    throw error;
  });
  if (!updated) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if (updated === "INVALID_TRANSITION") {
    return NextResponse.json({ error: "Sipariş durumu başka bir kullanıcı tarafından değiştirildi. Listeyi yenileyip tekrar deneyin." }, { status: 409 });
  }
  if (updated === "INVOICE_REQUIRED") {
    return NextResponse.json({ error: "Hastaya takıldı durumundan önce laboratuvar faturası/tutarı girilmelidir." }, { status: 409 });
  }

  const fresh = await (prisma as any).labOrder.findFirst({
    where: { id: params.id, institutionId: auth.user.institutionId, branchId: branch.branchId },
    include: {
      invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  await writeAudit(auth.user.id, "LAB_ORDER_UPDATE", `Laboratuvar siparişi güncellendi (${params.id})`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  return NextResponse.json(toPublicOrder(fresh || updated));
}
