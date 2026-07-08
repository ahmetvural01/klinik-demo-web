import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

const ROLE_LABELS: Record<string, string> = {
  YONETICI: "Yönetici",
  DOKTOR: "Diş Hekimi",
  ASISTAN: "Asistan",
  BANKO: "Banko",
  MUHASEBE: "Muhasebe",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Aktif" : "Pasif";
  return String(v);
}

function roleLabel(v: unknown): string {
  const val = String(v || "");
  return ROLE_LABELS[val] || val || "-";
}

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: { profile: true }
  });

  if (!user || user.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Personel bulunamadı" }, { status: 404 });
  }

  if (auth.user.role !== "SUPERADMIN" && user.institutionId !== auth.user.institutionId) {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  return NextResponse.json(user);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await prisma.user.findUnique({ where: { id: params.id }, include: { profile: true } });
  if (!existing || existing.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Personel bulunamadı" }, { status: 404 });
  }

  if (auth.user.role !== "SUPERADMIN" && existing.institutionId !== auth.user.institutionId) {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  if (body.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Bu rol atanamaz" }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      institution: body.institution,
      identityNo: body.identityNo,
      fullName: body.fullName,
      role: (body.role || "ASISTAN") as Role,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
      ...(body.kkYuzde    !== undefined && { kkYuzde:    body.kkYuzde    }),
      ...(body.genelYuzde !== undefined && { genelYuzde: body.genelYuzde }),
      ...(body.maasYuzde  !== undefined && { maasYuzde:  body.maasYuzde  }),
      profile: {
        upsert: {
          update: {
            workStart: body.workStart || "08:30",
            workEnd: body.workEnd || "18:00"
          },
          create: {
            workStart: body.workStart || "08:30",
            workEnd: body.workEnd || "18:00"
          }
        }
      }
    },
    include: { profile: true }
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

  pushDiff("Ad Soyad", existing.fullName, updated.fullName);
  pushDiff("Kimlik No", existing.identityNo, updated.identityNo);
  pushDiff("Kurum", existing.institutionId, updated.institutionId);
  pushDiff("Rol", roleLabel(existing.role), roleLabel(updated.role));
  pushDiff("Durum", existing.isActive, updated.isActive);
  pushDiff("KK Yüzde", existing.kkYuzde, updated.kkYuzde);
  pushDiff("Genel Yüzde", existing.genelYuzde, updated.genelYuzde);
  pushDiff("Maaş Yüzde", existing.maasYuzde, updated.maasYuzde);
  pushDiff("Mesai Başlangıç", existing.profile?.workStart, updated.profile?.workStart);
  pushDiff("Mesai Bitiş", existing.profile?.workEnd, updated.profile?.workEnd);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ${updated.fullName} personel kaydı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "STAFF_UPDATE", detail);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Personel bulunamadı" }, { status: 404 });
  }

  if (auth.user.role !== "SUPERADMIN" && existing.institutionId !== auth.user.institutionId) {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const deleted = await prisma.user.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  await writeAudit(auth.user.id, "STAFF_DEACTIVATE", `${deleted.fullName} pasif yapildi`);
  return NextResponse.json({ ok: true });
}
