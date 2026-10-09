import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { reverseLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { requireActiveBranch } from "@/lib/branch-context";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import {
  CANCEL_NOTE_PREFIX,
  REWORK_NOTE_PREFIX,
  RPT_RESET_MARKER,
  getCurrentCycleTrips,
  isReworkOrder,
  mergeOrderNotes,
} from "@/lib/lab-workflow";
import { BusinessRuleError } from "@/lib/public-error";
import { LAB_ORDER_INCLUDE, assertDebtReductionAllowed, closeOpenLabFollowUps, toPublicLabOrder } from "@/app/api/lab-orders/lab-order-api";

const VALID_LAB_ORDER_STATUSES = new Set(["DEVAM_EDIYOR", "HASTAYA_TAKILDI", "IPTAL"]);
const LAB_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  DEVAM_EDIYOR: new Set(["HASTAYA_TAKILDI", "IPTAL"]),
  HASTAYA_TAKILDI: new Set(["IPTAL"]),
  IPTAL: new Set(),
};
/** Sunucu mesajlarında kod adı (DEVAM_EDIYOR) yerine ekrandaki ad görünsün. */
const STATUS_LABEL: Record<string, string> = {
  DEVAM_EDIYOR: "Devam ediyor",
  HASTAYA_TAKILDI: "Hastaya takıldı",
  IPTAL: "İptal edildi",
};
const EDIT_FIELDS = ["doctorId", "labName", "labType", "teeth", "notes"] as const;

export const dynamic = "force-dynamic";

class LabRuleError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

function ruleErrorResponse(error: unknown) {
  if (error instanceof LabRuleError || error instanceof BusinessRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
  return null;
}

function reasonText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const order = await prisma.labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    include: LAB_ORDER_INCLUDE,
  });

  if (!order) return NextResponse.json({ error: "Laboratuvar işi bulunamadı" }, { status: 404 });
  return NextResponse.json(await toPublicLabOrder(order, auth.user.role));
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Laboratuvar işlemi için klinik bağlamı zorunlu." }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { status, price, invoiceNo, appendInvoice, action, reason, restartDescription, keepInvoices } = body as Record<string, unknown>;
  if (status !== undefined && (typeof status !== "string" || !VALID_LAB_ORDER_STATUSES.has(status))) {
    return NextResponse.json({ error: "Geçersiz laboratuvar işi durumu" }, { status: 400 });
  }
  if (action !== undefined && action !== "RPT_REOPEN") {
    return NextResponse.json({ error: "Geçersiz laboratuvar işlemi" }, { status: 400 });
  }
  if (appendInvoice !== undefined || price !== undefined || invoiceNo !== undefined) {
    return NextResponse.json(
      { error: "Fatura işlemleri yalnızca laboratuvar fatura formundan yapılabilir." },
      { status: 400 },
    );
  }
  const editKeys = EDIT_FIELDS.filter((key) => key in body);
  if (editKeys.length > 0 && (status !== undefined || action !== undefined)) {
    return NextResponse.json({ error: "Bilgi düzeltme ile durum değişikliği aynı istekte yapılamaz." }, { status: 400 });
  }

  // Yetkiler arayüzle aynı: "Hastaya takıldı" lab:complete, iptal lab:delete
  // ister (rol ekranında tanımlı ama önceden hiçbir yerde uygulanmıyordu).
  if ((status === "HASTAYA_TAKILDI" || action === "RPT_REOPEN") && !(await hasEffectivePermission(auth.user, "lab:complete"))) {
    return NextResponse.json({ error: action === "RPT_REOPEN" ? "Yeniden yapım başlatma yetkiniz yok." : "Laboratuvar işini “Hastaya takıldı” olarak kapatma yetkiniz yok." }, { status: 403 });
  }
  if (status === "IPTAL" && !(await hasEffectivePermission(auth.user, "lab:delete"))) {
    return NextResponse.json({ error: "Laboratuvar işini iptal etme yetkiniz yok." }, { status: 403 });
  }

  const existing = await prisma.labOrder.findFirst({
    where: { id: params.id, institutionId, branchId: branch.branchId },
    select: { id: true, status: true, notes: true, doctorId: true, labName: true },
  });
  if (!existing) return NextResponse.json({ error: "Laboratuvar işi bulunamadı" }, { status: 404 });

  // ── Bilgi düzeltme (hekim, laboratuvar, iş türü, dişler, not) ──────────────
  if (editKeys.length > 0) {
    if (existing.status === "IPTAL") {
      return NextResponse.json({ error: "İptal edilmiş iş düzenlenemez." }, { status: 409 });
    }
    const data: { labType?: string; teeth?: string | null; notes?: string | null; doctorId?: string; labName?: string; firmaId?: string } = {};
    if ("labType" in body) {
      const labType = reasonText(body.labType);
      if (!labType || labType.length > 180) return NextResponse.json({ error: "İş türünü seçin." }, { status: 400 });
      data.labType = labType;
    }
    if ("teeth" in body) {
      if (body.teeth !== null && typeof body.teeth !== "string") return NextResponse.json({ error: "Diş bilgisi geçersiz." }, { status: 400 });
      const teeth = reasonText(body.teeth);
      if (teeth.length > 200) return NextResponse.json({ error: "Diş bilgisi çok uzun." }, { status: 400 });
      data.teeth = teeth || null;
    }
    if ("notes" in body) {
      if (body.notes !== null && typeof body.notes !== "string") return NextResponse.json({ error: "Not geçersiz." }, { status: 400 });
      const notes = reasonText(body.notes);
      if (notes.length > 2000) return NextResponse.json({ error: "Not en fazla 2000 karakter olabilir." }, { status: 400 });
      // Yeniden yapım/iptal kayıtları (sistem satırları) kullanıcı notuyla silinemez.
      data.notes = mergeOrderNotes(notes, existing.notes);
    }
    if ("doctorId" in body) {
      const doctorId = reasonText(body.doctorId);
      if (!doctorId) return NextResponse.json({ error: "Hekimi seçin." }, { status: 400 });
      if (doctorId !== existing.doctorId) {
        const doctor = await prisma.user.findFirst({
          where: { id: doctorId, ...effectiveDoctorWhere(institutionId, branch.branchId) },
          select: { id: true },
        });
        if (!doctor) return NextResponse.json({ error: "Seçilen hekim bu şubede bulunamadı." }, { status: 400 });
        data.doctorId = doctorId;
      }
    }
    if ("labName" in body) {
      const labName = reasonText(body.labName);
      if (!labName) return NextResponse.json({ error: "Laboratuvarı seçin." }, { status: 400 });
      if (labName.toLocaleLowerCase("tr-TR") !== existing.labName.toLocaleLowerCase("tr-TR")) {
        const firma = await prisma.firma.findFirst({
          where: {
            institutionId,
            branchId: branch.branchId,
            isActive: true,
            kategori: "LAB",
            name: { equals: labName, mode: "insensitive" },
          },
          select: { id: true, name: true },
        });
        if (!firma) return NextResponse.json({ error: "Seçilen laboratuvar firma listesinde bulunamadı." }, { status: 400 });
        data.labName = firma.name;
        data.firmaId = firma.id;
      }
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
        const current = await tx.labOrder.findFirst({
          where: { id: params.id, institutionId, branchId: branch.branchId },
          select: { status: true },
        });
        if (!current) throw new LabRuleError("Laboratuvar işi bulunamadı", 404);
        if (current.status === "IPTAL") throw new LabRuleError("İptal edilmiş iş düzenlenemez.");
        if (data.doctorId || data.firmaId) {
          // Fatura girilmişse borç firmaya, gider hekim hakedişine yazılmıştır;
          // sessizce başka hekime/laboratuvara taşınmasın.
          const invoiceCount = await tx.labOrderInvoice.count({ where: { labOrderId: params.id, status: "ACTIVE" } });
          if (invoiceCount > 0) {
            throw new LabRuleError("Faturası girilmiş işin hekimi veya laboratuvarı değiştirilemez. Önce faturayı iptal edin, sonra düzeltip faturayı yeniden girin.");
          }
        }
        await tx.labOrder.update({ where: { id: params.id }, data });
        return tx.labOrder.findFirst({ where: { id: params.id, institutionId, branchId: branch.branchId }, include: LAB_ORDER_INCLUDE });
      }, { isolationLevel: "Serializable" });

      const changed = Object.keys(data).filter((key) => key !== "firmaId").join(", ");
      await writeAudit(auth.user.id, "LAB_ORDER_EDIT", `Laboratuvar işi bilgileri düzeltildi (${params.id}): ${changed}`);
      await bumpRealtimeInstitution(institutionId);
      return NextResponse.json(await toPublicLabOrder(updated, auth.user.role));
    } catch (error) {
      const response = ruleErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }

  if (status && status !== existing.status && !LAB_TRANSITIONS[existing.status]?.has(status)) {
    return NextResponse.json(
      { error: `“${STATUS_LABEL[existing.status] || existing.status}” durumundaki iş “${STATUS_LABEL[status] || status}” yapılamaz.` },
      { status: 409 },
    );
  }

  // ── Yeniden yapım (ücretsiz tekrar) ────────────────────────────────────────
  if (action === "RPT_REOPEN") {
    const reworkReason = reasonText(reason);
    if (reworkReason.length < 3 || reworkReason.length > 1000) {
      return NextResponse.json({ error: "Yeniden yapım nedenini yazın (en az 3 harf)." }, { status: 400 });
    }
    if (existing.status !== "HASTAYA_TAKILDI") {
      return NextResponse.json({ error: "Yeniden yapım yalnız hastaya takılmış bir iş için başlatılabilir." }, { status: 409 });
    }
    // Varsayılan: laboratuvarın ilk iş için kestiği fatura ve firma borcu
    // korunur (yeniden yapım ücretsizdir). Kullanıcı "İptal edilsin" seçerse
    // faturalar iptal edilir, firma borcu ve hakediş gideri geri alınır.
    const voidInvoices = keepInvoices === false;
    const timestamp = new Date().toISOString();
    const rptNote = `RPT yeniden açıldı (${timestamp}): ${reworkReason}`;
    // Bu satır işin "yeniden yapım (ücretsiz)" olduğunu gösteren TEK işarettir
    // (bkz. lab-workflow isReworkNotes); kullanıcı notundaki "RPT" kelimesi sayılmaz.
    const reworkLine = `${REWORK_NOTE_PREFIX} (${timestamp}): ${reworkReason}`;
    const firstStep = typeof restartDescription === "string" && restartDescription.trim() ? restartDescription.trim().slice(0, 180) : "Ölçü";

    try {
      const reopened = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
        const current = await tx.labOrder.findFirst({
          where: { id: params.id, institutionId, branchId: branch.branchId },
          select: { status: true, notes: true, invoiceNo: true, price: true, labType: true },
        });
        if (!current) throw new LabRuleError("Laboratuvar işi bulunamadı", 404);
        if (current.status !== "HASTAYA_TAKILDI") {
          throw new LabRuleError("İşin durumu başka bir kullanıcı tarafından değiştirildi; yeniden yapım başlatılamadı. Listeyi yenileyin.");
        }

        if (voidInvoices) {
          const existingInvoices = await tx.labOrderInvoice.findMany({
            where: { labOrderId: params.id, status: "ACTIVE" },
            select: { id: true, item: true, amount: true, invoiceNo: true, labOrder: { select: { branchId: true, firmaId: true } } },
          });
          for (const invoice of existingInvoices) {
            await assertDebtReductionAllowed(tx, invoice, 0);
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
                voidReason: `Yeniden yapım başlatıldı: ${reworkReason}`,
              },
            });
          } else if (current.invoiceNo || current.price) {
            await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
              branchId: branch.branchId,
              labOrderId: params.id,
              invoiceNo: current.invoiceNo || null,
              item: current.labType,
              amount: Number(current.price || 0),
            });
          }
        }

        // LabTrip modelinde "status" alanı yoktur; önceden buradaki sorgu
        // status filtresiyle yazıldığı için yeniden yapım her seferinde 500
        // hatası veriyordu. Sıradaki adım numarası en büyük sıradan hesaplanır.
        const lastTrip = await tx.labTrip.aggregate({ where: { labOrderId: params.id }, _max: { order: true } });
        const nextOrder = (lastTrip._max.order || 0) + 1;

        await tx.labOrder.update({
          where: { id: params.id },
          data: {
            status: "DEVAM_EDIYOR",
            notes: current.notes ? `${current.notes}\n${reworkLine}` : reworkLine,
            ...(voidInvoices ? { price: null, invoiceNo: null } : {}),
          },
        });

        await tx.labTrip.create({
          data: {
            institutionId,
            branchId: branch.branchId,
            labOrderId: params.id,
            order: nextOrder,
            description: firstStep,
            sentAt: new Date(),
            sentNote: `${RPT_RESET_MARKER} | ${rptNote}`,
          },
        });
        await closeOpenLabFollowUps(tx, params.id, "Lab işi yeniden yapıma alındı.");

        return tx.labOrder.findFirst({ where: { id: params.id, institutionId, branchId: branch.branchId }, include: LAB_ORDER_INCLUDE });
      }, { isolationLevel: "Serializable" });

      await writeAudit(auth.user.id, "LAB_ORDER_RPT_REOPEN", `Laboratuvar işi yeniden yapım için açıldı (${params.id}); faturalar ${voidInvoices ? "iptal edildi" : "korundu"}`);
      await bumpRealtimeInstitution(institutionId);
      return NextResponse.json(await toPublicLabOrder(reopened, auth.user.role));
    } catch (error) {
      const response = ruleErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }

  if (status === undefined || status === existing.status) {
    const unchanged = await prisma.labOrder.findFirst({ where: { id: params.id, institutionId, branchId: branch.branchId }, include: LAB_ORDER_INCLUDE });
    return NextResponse.json(await toPublicLabOrder(unchanged, auth.user.role));
  }

  // ── Durum değişikliği: Hastaya takıldı / İptal ─────────────────────────────
  const cancelReason = reasonText(reason);
  if (status === "IPTAL" && (cancelReason.length < 3 || cancelReason.length > 500)) {
    return NextResponse.json({ error: "İptal nedenini yazın (en az 3 harf)." }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      const current = await tx.labOrder.findFirst({
        where: { id: params.id, institutionId, branchId: branch.branchId },
        select: { status: true, notes: true, invoiceNo: true, price: true, labType: true, trips: { select: { sentAt: true, order: true, receivedAt: true, sentNote: true, description: true } } },
      });
      if (!current) throw new LabRuleError("Laboratuvar işi bulunamadı", 404);
      if (status !== current.status && !LAB_TRANSITIONS[current.status]?.has(status)) {
        throw new LabRuleError("İşin durumu başka bir kullanıcı tarafından değiştirildi. Listeyi yenileyip tekrar deneyin.");
      }

      if (status === "HASTAYA_TAKILDI") {
        const trips = current.trips.map((trip) => ({ ...trip, sentAt: trip.sentAt.toISOString(), receivedAt: trip.receivedAt?.toISOString() || null }));
        if (getCurrentCycleTrips(trips).some((trip) => !trip.receivedAt)) {
          throw new LabRuleError("Laboratuvarda bekleyen adım var. Önce “Laboratuvardan geldi” kaydedin, sonra işi kapatın.");
        }
        // Fatura yoksa lab gideri hiçbir hekimin hakedişine yansımadan
        // kaybolur. Yeniden yapım (ücretsiz) işler bu kuraldan muaftır;
        // önceden ücretsiz işe fatura girilemediği için bu işler hiç
        // kapatılamıyordu.
        const invoiceCount = await tx.labOrderInvoice.count({ where: { labOrderId: params.id, status: "ACTIVE" } });
        if (invoiceCount === 0 && !(Number(current.price || 0) > 0) && !isReworkOrder({ notes: current.notes, trips })) {
          throw new LabRuleError("“Hastaya takıldı” için önce lab faturasını girin; aksi halde lab gideri hekim hakedişine yansımaz.");
        }
        await tx.labOrder.update({ where: { id: params.id }, data: { status: "HASTAYA_TAKILDI" } });
        await closeOpenLabFollowUps(tx, params.id, "Lab işi hastaya takıldı; prova randevusu araması kapatıldı.");
      }

      if (status === "IPTAL") {
        const existingInvoices = await tx.labOrderInvoice.findMany({
          where: { labOrderId: params.id, status: "ACTIVE" },
          select: { id: true, item: true, amount: true, invoiceNo: true, labOrder: { select: { branchId: true, firmaId: true } } },
        });
        for (const invoice of existingInvoices) {
          // Laboratuvara ödemesi yapılmış borç sessizce silinmesin.
          await assertDebtReductionAllowed(tx, invoice, 0);
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
        // Firma borcu geri alınan faturalar iş üzerinde "aktif" kalırsa hekim
        // hakedişinden lab gideri düşülmeye devam ediyordu; firma tarafıyla
        // aynı anda iptal edilir.
        if (existingInvoices.length > 0) {
          await tx.labOrderInvoice.updateMany({
            where: { labOrderId: params.id, status: "ACTIVE" },
            data: { status: "VOID", voidedAt: new Date(), voidedById: auth.user.id, voidReason: `Lab işi iptal edildi: ${cancelReason}` },
          });
        }
        const cancelLine = `${CANCEL_NOTE_PREFIX} (${new Date().toISOString()}): ${cancelReason}`;
        await tx.labOrder.update({
          where: { id: params.id },
          data: {
            status: "IPTAL",
            price: null,
            invoiceNo: null,
            notes: current.notes ? `${current.notes}\n${cancelLine}` : cancelLine,
          },
        });
        await closeOpenLabFollowUps(tx, params.id, "Lab işi iptal edildi.");
      }

      return tx.labOrder.findFirst({ where: { id: params.id, institutionId, branchId: branch.branchId }, include: LAB_ORDER_INCLUDE });
    }, { isolationLevel: "Serializable" });

    await writeAudit(
      auth.user.id,
      status === "IPTAL" ? "LAB_ORDER_CANCEL" : "LAB_ORDER_UPDATE",
      status === "IPTAL"
        ? `Laboratuvar işi iptal edildi (${params.id}): ${cancelReason}`
        : `Laboratuvar işi hastaya takıldı (${params.id})`,
    );
    await bumpRealtimeInstitution(institutionId);
    return NextResponse.json(await toPublicLabOrder(updated, auth.user.role));
  } catch (error) {
    const response = ruleErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
