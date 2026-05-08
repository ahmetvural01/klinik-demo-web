import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { examinationSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

const EXAM_STATUS_LABELS: Record<string, string> = {
  PLANLANDI: "Planlandı",
  DEVAM: "Devam Ediyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function fmtStatus(v: string): string {
  return EXAM_STATUS_LABELS[v] || v;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("examinations:read");
  if (auth.error) return auth.error;

  const examination = await prisma.examination.findUnique({
    where: { id: params.id },
    include: { patient: true, doctor: true }
  });

  if (!examination) {
    return NextResponse.json({ message: "Muayene kaydı bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(examination);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;

  const body = await request.json();

  // Mevcut kaydı al
  const existing = await prisma.examination.findUnique({ where: { id: params.id } });
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

  const parsed = examinationSchema.safeParse(merged);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz muayene verisi", errors: parsed.error.errors }, { status: 400 });
  }

  const examination = await prisma.examination.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      diagnosedAt: new Date(parsed.data.diagnosedAt)
    }
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
  ].join("\n");

  await writeAudit(auth.user.id, "EXAM_UPDATE", detail);
  return NextResponse.json(examination);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("examinations:write");
  if (auth.error) return auth.error;

  await prisma.examination.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "EXAM_DELETE", `Muayene kaydı silindi (${params.id})`);

  return NextResponse.json({ ok: true });
}
