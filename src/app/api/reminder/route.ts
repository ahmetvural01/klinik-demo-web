import { NextRequest, NextResponse } from "next/server";
import type { Prisma, ReminderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

// Randevu açılınca sistemin kendisinin oluşturduğu SMS hatırlatma kayıtları
// ("[APPT_REMINDER]:<randevu>") personelin tahsilat hatırlatmaları değildir.
const SYSTEM_REMINDER_PREFIX = "[APPT_REMINDER]";

// GET hatırlatmalar, POST ekle
//
// Yetki: bu uçların tek ekranı Muhasebe › Taksitler'deki tahsilat
// hatırlatmalarıdır (ReminderModals). Okuma installments:read, yazma
// installments:write ister. Önceden randevu iznine bağlıydı: takvimi olmayan
// muhasebe hatırlatmaları göremiyor, finans yetkisi olmayan doktor ve asistan
// okuyup yazabiliyordu.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("installments:read");
    if (auth.error) return auth.error;
    // Liste kurum genelidir (hasta süzgeci yok) ve tek ekranı Muhasebe'dir:
    // kasa ve kurum geneli tahsilat listesi gibi finance:center ister. Asistanda
    // installments:read var (hasta dosyasında taksit görmek için); bu yetki tüm
    // kurumun ödeme hatırlatmalarını açmıyordu.
    if (!(await hasEffectivePermission(auth.user, "finance:center"))) {
      return NextResponse.json({ error: "Ödeme hatırlatmalarını görme yetkiniz yok." }, { status: 403 });
    }
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "AKTIF";
    if (!new Set(["HEPSI", "AKTIF", "GONDERILIYOR", "TAMAMLANDI", "BASARISIZ"]).has(status)) {
      return NextResponse.json({ error: "Geçersiz hatırlatma durumu" }, { status: 400 });
    }
    // kind=odeme: yalnız personelin tahsilat hatırlatmaları (sistemin randevu
    // SMS kayıtları hariç). count=1: liste yerine yalnız sayı ({ count }) —
    // "Hatırlatmalar (n)" düğmesi her açılışta bütün listeyi çekmesin.
    const paymentOnly = searchParams.get("kind") === "odeme";
    const countOnly = searchParams.get("count") === "1";
    if (!auth.user.institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    const where: Prisma.ReminderWhereInput = {
      ...(status !== "HEPSI" ? { status: status as ReminderStatus } : {}),
      OR: [
        { patient: { institutionId: auth.user.institutionId, homeBranchId: branch.branchId } },
        { plan: { institutionId: auth.user.institutionId, branchId: branch.branchId } },
      ],
      ...(paymentOnly ? { NOT: { note: { startsWith: SYSTEM_REMINDER_PREFIX } } } : {}),
    };

    if (countOnly) {
      const count = await prisma.reminder.count({ where });
      return NextResponse.json({ count });
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { reminderDate: "asc" }
    });
    return NextResponse.json(reminders);
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const { patientId, planId, reminderDate } = body;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const parsedReminderDate = typeof reminderDate === "string" ? new Date(reminderDate) : new Date(Number.NaN);
    if (!note || note.length > 1000 || Number.isNaN(parsedReminderDate.getTime())) {
      return NextResponse.json({ error: "Not 1-1000 karakter ve tarih geçerli olmalı" }, { status: 400 });
    }
    if (!patientId && !planId) return NextResponse.json({ error: "Hasta veya plan zorunlu" }, { status: 400 });

    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }
    const institutionId = auth.user.institutionId;
    if (!institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });

    const [patient, plan] = await Promise.all([
      patientId
        ? (prisma as any).patient.findFirst({
            where: { id: patientId, archivedAt: null, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}), homeBranchId: branch.branchId },
            select: { id: true },
          })
        : Promise.resolve(null),
      planId
        ? (prisma as any).taksitPlan.findFirst({
            where: { id: planId, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}), branchId: branch.branchId },
            select: { id: true, patientId: true },
          })
        : Promise.resolve(null),
    ]);
    if (patientId && !patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
    if (planId && !plan) return NextResponse.json({ error: "Plan bulunamadı" }, { status: 404 });
    if (patientId && plan?.patientId && plan.patientId !== patientId) {
      return NextResponse.json({ error: "Seçilen taksit planı bu hastaya ait değil" }, { status: 400 });
    }

    const r = await (prisma as any).reminder.create({
      data: {
        institutionId,
        branchId: branch.branchId,
        patientId: patientId || null,
        planId: planId || null,
        note, reminderDate: parsedReminderDate, status: "AKTIF"
      }
    });
    await writeAudit(auth.user.id, "REMINDER_CREATE", "Hatırlatma eklendi");
    return NextResponse.json(r, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
