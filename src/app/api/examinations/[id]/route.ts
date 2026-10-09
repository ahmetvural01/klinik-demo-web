import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { examinationSchema } from "@/lib/validators";
import {
  EXAM_STATUS_CANCELLED,
  EXAM_STATUS_DIAGNOSIS,
  EXAM_STATUS_DONE,
  EXAM_STATUS_KIND_LABELS,
  EXAM_STATUS_LEGACY_DONE,
  EXAM_STATUS_VALUES,
  examStatusKind,
  isDiagnosisExamStatus,
} from "@/lib/examination-status";
import { requireAuth, writeAudit } from "@/lib/api";
import { effectiveDoctorWhere, isDoctorPeriodSettled } from "@/lib/hakedis";
import { requireActiveBranch } from "@/lib/branch-context";
import { turkeyYearMonth } from "@/lib/tz";

type Params = { params: Promise<{ id: string }> };

// Durum geçişleri kaydın TÜRÜNE göre denetlenir (bkz.
// src/lib/examination-status.ts). Önceden yalnız enum değerleri tanınıyordu:
// hasta dosyasının yazdığı "Diagnoz (Ön Teşhis)" kayıtları hiçbir geçişe
// uymadığı için "Tedaviye aktar" ve satır düzenleme 409 ile reddediliyordu.
const ALLOWED_TARGETS: Record<ReturnType<typeof examStatusKind>, ReadonlySet<string>> = {
  pending: new Set(["PLANLANDI", EXAM_STATUS_DIAGNOSIS, "DEVAM", EXAM_STATUS_DONE, EXAM_STATUS_CANCELLED]),
  in_progress: new Set(["DEVAM", EXAM_STATUS_DONE, EXAM_STATUS_CANCELLED]),
  done: new Set([EXAM_STATUS_DONE, EXAM_STATUS_LEGACY_DONE]),
  cancelled: new Set([EXAM_STATUS_CANCELLED]),
};

function canTransition(from: string, to: string) {
  // Aynı durumda kalan düzenleme (tutar/diş/doktor değişikliği) her zaman serbest.
  if (from === to) return true;
  return ALLOWED_TARGETS[examStatusKind(from)].has(to);
}

const examinationUpdateSchema = examinationSchema.extend({
  status: z.enum(EXAM_STATUS_VALUES),
});

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function fmtStatus(v: string): string {
  return EXAM_STATUS_KIND_LABELS[examStatusKind(v)] || v;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function examinationTenantWhere(id: string, institutionId: string | null | undefined, branchId: string) {
  return {
    id,
    institutionId: institutionId || "__no_institution__",
    branchId,
  };
}

export async function GET(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("examinations:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const examination = await prisma.examination.findFirst({
    where: examinationTenantWhere(params.id, auth.user.institutionId, branch.branchId),
    include: { patient: true, doctor: { select: { id: true, fullName: true } } }
  });

  if (!examination) {
    return NextResponse.json({ message: "Muayene kaydı bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(examination);
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const body = await request.json();

  // Mevcut kaydı al
  const existing = await prisma.examination.findFirst({
    where: examinationTenantWhere(params.id, auth.user.institutionId, branch.branchId),
  });
  if (!existing) {
    return NextResponse.json({ message: "Muayene kaydı bulunamadı" }, { status: 404 });
  }

  // Gelen veriyi mevcut kayıtla birleştir (partial update desteği)
  const merged = {
    patientId: body.patientId ?? existing.patientId,
    doctorId: body.doctorId ?? existing.doctorId,
    treatmentName: body.treatmentName ?? existing.treatmentName,
    toothNo: body.toothNo !== undefined ? normalizeOptionalString(body.toothNo) : normalizeOptionalString(existing.toothNo),
    amount: body.amount !== undefined ? Number(body.amount) : Number(existing.amount),
    status: body.status ?? existing.status,
    diagnosedAt: body.diagnosedAt ? body.diagnosedAt : existing.diagnosedAt.toISOString(),
    note: body.note !== undefined ? normalizeOptionalString(body.note) : normalizeOptionalString(existing.note),
  };

  const parsed = examinationUpdateSchema.safeParse(merged);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz muayene verisi", errors: parsed.error.errors }, { status: 400 });
  }
  if (!canTransition(existing.status, parsed.data.status)) {
    return NextResponse.json({ message: "Bu muayene durum geçişine izin verilmiyor" }, { status: 409 });
  }

  // POST'ta yeni patientId/doctorId kurum kapsamına göre doğrulanıyordu, ama
  // burada (PUT) hiç doğrulanmıyordu — body.patientId/doctorId değiştirilerek
  // kaydın başka bir kurumun hastasına/doktoruna bağlanması mümkündü (bkz.
  // denetim raporu — kiracılar arası sessiz veri sızıntısı/bozulması).
  const [patient, doctor] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: parsed.data.patientId, institutionId: auth.user.institutionId as string, homeBranchId: branch.branchId, archivedAt: null },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { id: parsed.data.doctorId, ...effectiveDoctorWhere(auth.user.institutionId, branch.branchId) },
      select: { id: true },
    }),
  ]);
  if (!patient) return NextResponse.json({ message: "Hasta bu şubede bulunamadı" }, { status: 404 });
  if (!doctor) return NextResponse.json({ message: "Doktor bu şubenin kapsamı dışında" }, { status: 403 });

  // Muayene tutarı/tarihi/doktoru hakedişin (computeDoctorMonthlyHakedis)
  // ana kaynağıdır — ama bu uç, payments/[id]/route.ts'nin aksine dönem
  // kilidini hiç kontrol etmiyordu. Doktora Ocak hakedişi ödendikten sonra
  // Ocak'a ait bir muayenenin tutarı/tarihi sessizce değiştirilip zaten
  // ödenmiş hakediş geçmişe dönük bozulabiliyordu (bkz. denetim raporu).
  //
  // Hakediş sorgusu (src/lib/hakedis.ts) ön teşhis/diagnoz kayıtlarını
  // saymaz. Bu yüzden: kayıt önceden hakedişe girmiyorsa kaynak dönem kilidi
  // aranmaz (muayene listesindeki eski bir kaydı bugün "yapıldı" yapmak
  // mümkün olmalı); kayıt bu güncellemeyle hakedişe GİRİYORSA (ön teşhis →
  // yapıldı) hedef dönem kilitliyse reddedilir — önceden durum değişikliği hiç
  // kontrol edilmiyordu, ödenmiş bir döneme sessizce hakediş eklenebiliyordu.
  const amountChanged = Number(existing.amount) !== parsed.data.amount;
  const dateChanged = existing.diagnosedAt.toISOString() !== parsed.data.diagnosedAt;
  const doctorChangedForPeriod = existing.doctorId !== parsed.data.doctorId;
  const wasCounted = !isDiagnosisExamStatus(existing.status);
  const willBeCounted = !isDiagnosisExamStatus(parsed.data.status);
  const countChanged = wasCounted !== willBeCounted;
  let periodLockOverridden = false;
  if (existing.doctorId && (amountChanged || dateChanged || doctorChangedForPeriod || countChanged)) {
    const sourcePeriod = turkeyYearMonth(existing.diagnosedAt);
    const sourceSettled = wasCounted
      ? await isDoctorPeriodSettled(existing.doctorId, auth.user.institutionId ?? null, branch.branchId, sourcePeriod.year, sourcePeriod.month)
      : false;
    const targetPeriod = turkeyYearMonth(new Date(parsed.data.diagnosedAt));
    const targetChanged = doctorChangedForPeriod || targetPeriod.year !== sourcePeriod.year || targetPeriod.month !== sourcePeriod.month;
    const targetSettled = willBeCounted && (targetChanged || !wasCounted) && parsed.data.doctorId
      ? await isDoctorPeriodSettled(parsed.data.doctorId, auth.user.institutionId ?? null, branch.branchId, targetPeriod.year, targetPeriod.month)
      : false;
    if (sourceSettled || targetSettled) {
      if (!auth.user.ghost && auth.user.role !== "SUPERADMIN") {
        return NextResponse.json(
          { message: "Bu muayenenin ait olduğu dönem için doktora zaten hakediş ödemesi yapılmış; tutar/tarih/doktor değiştirilemez." },
          { status: 400 },
        );
      }
      periodLockOverridden = true;
    }
  }

  const changed = await prisma.examination.updateMany({
    where: {
      id: existing.id,
      institutionId: existing.institutionId,
      branchId: existing.branchId,
      status: existing.status,
    },
    data: {
      ...parsed.data,
      diagnosedAt: new Date(parsed.data.diagnosedAt)
    }
  });
  if (changed.count !== 1) {
    return NextResponse.json({ message: "Muayene başka bir işlem tarafından değiştirildi; listeyi yenileyin" }, { status: 409 });
  }
  const examination = await prisma.examination.findUniqueOrThrow({
    where: {
      id_institutionId_branchId: {
        id: existing.id,
        institutionId: existing.institutionId,
        branchId: existing.branchId,
      },
    },
  });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];

  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Tedavi", existing.treatmentName, parsed.data.treatmentName);
  pushDiff("Diş No", existing.toothNo, parsed.data.toothNo);
  pushDiff("Tutar", Number(existing.amount), Number(parsed.data.amount));
  pushDiff("Durum", fmtStatus(existing.status), fmtStatus(parsed.data.status));
  pushDiff("Not", existing.note, parsed.data.note);
  pushDiff("Tarih", existing.diagnosedAt.toISOString(), parsed.data.diagnosedAt);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından muayene kaydı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    periodLockOverridden ? "UYARI: Dönem kilidi SUPERADMIN tarafından atlandı." : "",
  ].filter(Boolean).join("\n");

  await writeAudit(auth.user.id, "EXAM_UPDATE", detail);
  return NextResponse.json(examination);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("examinations:delete");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const existing = await prisma.examination.findFirst({
    where: examinationTenantWhere(params.id, auth.user.institutionId, branch.branchId),
    include: {
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ message: "Muayene kaydı bulunamadı" }, { status: 404 });
  }

  let periodLockOverridden = false;
  // Ön teşhis (muayene listesi) kaydı hakedişe hiç girmediği için onu
  // listeden çıkarmak ödenmiş bir dönemi değiştirmez; kilit yalnız hakedişe
  // sayılan kayıtlar için aranır.
  if (existing.doctorId && !isDiagnosisExamStatus(existing.status) && existing.status !== EXAM_STATUS_CANCELLED) {
    const { year, month } = turkeyYearMonth(existing.diagnosedAt);
    const settled = await isDoctorPeriodSettled(existing.doctorId, auth.user.institutionId ?? null, branch.branchId, year, month);
    if (settled) {
      if (!auth.user.ghost && auth.user.role !== "SUPERADMIN") {
        return NextResponse.json(
          { message: "Bu muayenenin ait olduğu dönem için doktora zaten hakediş ödemesi yapılmış; kayıt silinemez." },
          { status: 400 },
        );
      }
      periodLockOverridden = true;
    }
  }

  if (existing.status !== "IPTAL") {
    await prisma.examination.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: {
        status: "IPTAL",
        note: [existing.note, "Kayıt iptal edildi; klinik geçmişi korunmuştur."].filter(Boolean).join("\n"),
      },
    });
  }
  await writeAudit(auth.user.id, "EXAM_CANCEL", [
    `${auth.user.fullName || "Personel"} tarafından tedavi/muayene kaydı iptal edildi.`,
    `Hasta: ${existing.patient?.fullName || "-"}`,
    `Doktor: ${existing.doctor?.fullName || "-"}`,
    `Tedavi: ${existing.treatmentName}`,
    `Diş/Alan: ${existing.toothNo || "-"}`,
    `Tutar: ${Number(existing.amount)} TL`,
    periodLockOverridden ? "UYARI: Dönem kilidi SUPERADMIN tarafından atlandı." : "",
  ].filter(Boolean).join("\n"));

  return NextResponse.json({ ok: true, status: "IPTAL" });
}
