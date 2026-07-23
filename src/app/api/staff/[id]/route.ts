import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { checkStaffLimit } from "@/lib/staff-limits";

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
  const auth = await requireAuth("staff:read");
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    // passwordHash/twoFactorSecret/twoFactorBackupCodes client'a asla gönderilmez.
    select: {
      id: true,
      fullName: true,
      identityNo: true,
      email: true,
      role: true,
      isActive: true,
      institutionId: true,
      createdAt: true,
      kkYuzde: true,
      genelYuzde: true,
      maasYuzde: true,
      profile: { select: { workStart: true, workEnd: true, photoUrl: true, hideAsDoctor: true } },
    },
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
  const auth = await requireAuth("staff:write");
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

  const newRole = (body.role || existing.role) as string;
  const newIsActive = typeof body.isActive === "boolean" ? body.isActive : existing.isActive;
  if (existing.institutionId) {
    const limitError = await checkStaffLimit({
      institutionId: existing.institutionId,
      role: newRole,
      isActive: newIsActive,
      excludeUserId: existing.id,
    });
    if (limitError) {
      return NextResponse.json({ message: limitError }, { status: 409 });
    }
  }

  let updated;
  try {
    updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      identityNo: body.identityNo,
      fullName: body.fullName,
      role: (body.role || "ASISTAN") as Role,
      // Form bu alanı göndermiyorsa mevcut değeri korur — önceden eksik
      // gönderilen istek durumu sessizce "aktif"e, mesaiyi 08:30–18:00'e
      // sıfırlıyordu (bkz. Personel ekranı sadeleştirmesi).
      isActive: typeof body.isActive === "boolean" ? body.isActive : existing.isActive,
      ...(body.kkYuzde    !== undefined && { kkYuzde:    body.kkYuzde    }),
      ...(body.genelYuzde !== undefined && { genelYuzde: body.genelYuzde }),
      ...(body.maasYuzde  !== undefined && { maasYuzde:  body.maasYuzde  }),
      profile: {
        upsert: {
          update: {
            workStart: body.workStart !== undefined ? body.workStart : (existing.profile?.workStart || "08:30"),
            workEnd: body.workEnd !== undefined ? body.workEnd : (existing.profile?.workEnd || "18:00"),
            ...(body.photoUrl !== undefined && { photoUrl: body.photoUrl || null }),
            ...(typeof body.hideAsDoctor === "boolean" && { hideAsDoctor: body.hideAsDoctor }),
          },
          create: {
            workStart: body.workStart || "08:30",
            workEnd: body.workEnd || "18:00",
            photoUrl: body.photoUrl || null,
            hideAsDoctor: typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : false,
          }
        }
      }
    },
    select: {
      id: true,
      fullName: true,
      identityNo: true,
      email: true,
      role: true,
      isActive: true,
      institutionId: true,
      kkYuzde: true,
      genelYuzde: true,
      maasYuzde: true,
      profile: { select: { workStart: true, workEnd: true, photoUrl: true, hideAsDoctor: true } },
    },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu TC kimlik no bu kurumda zaten kayıtlı" }, { status: 409 });
    }
    console.error("[staff PUT] fallback:", error);
    return NextResponse.json({ message: "Personel güncellenemedi" }, { status: 503 });
  }

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
  pushDiff("Profil Fotoğrafı", existing.profile?.photoUrl, updated.profile?.photoUrl);
  pushDiff("Doktor Olarak Gizle", existing.profile?.hideAsDoctor, updated.profile?.hideAsDoctor);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ${updated.fullName} personel kaydı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "STAFF_UPDATE", detail);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("staff:delete");
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
