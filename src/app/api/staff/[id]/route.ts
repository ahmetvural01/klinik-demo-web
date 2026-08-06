import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateWorkHoursRange, parseTimeToMinutes } from "@/lib/working-hours-core";
import { turkeyTimeKey } from "@/lib/tz";
import { requireAuth, writeAudit } from "@/lib/api";
import { checkStaffLimit } from "@/lib/staff-limits";
import { TC_NO_REGEX, TC_NO_MESSAGE } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

const ROLE_LABELS: Record<string, string> = {
  YONETICI: "Yönetici",
  DOKTOR: "Diş Hekimi",
  ASISTAN: "Asistan",
  BANKO: "Banko",
  MUHASEBE: "Muhasebe",
};
const STAFF_ROLES = new Set<Role>(["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"]);

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Aktif" : "Pasif";
  return String(v);
}

function roleLabel(v: unknown): string {
  const val = String(v || "");
  return ROLE_LABELS[val] || val || "-";
}

export async function GET(_: NextRequest, props: Params) {
  const params = await props.params;
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

  // bkz. src/app/api/staff/route.ts — aynı komisyon oranı gizliliği kontrolü.
  const canSeeRates = auth.user.role === "YONETICI" || auth.user.role === "SUPERADMIN";
  if (!canSeeRates) {
    const { kkYuzde, genelYuzde, maasYuzde, ...rest } = user;
    return NextResponse.json(rest);
  }

  return NextResponse.json(user);
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("staff:write");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { id: params.id }, include: { profile: true } });
  if (!existing || existing.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Personel bulunamadı" }, { status: 404 });
  }

  if (auth.user.role !== "SUPERADMIN" && existing.institutionId !== auth.user.institutionId) {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  if (body.role !== undefined && !STAFF_ROLES.has(body.role as Role)) {
    return NextResponse.json({ message: "Geçersiz personel rolü." }, { status: 400 });
  }
  if (body.fullName !== undefined && (typeof body.fullName !== "string" || body.fullName.trim().length < 2 || body.fullName.trim().length > 120)) {
    return NextResponse.json({ message: "Ad soyad 2-120 karakter olmalıdır." }, { status: 400 });
  }
  for (const field of ["isActive", "force", "hideAsDoctor"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return NextResponse.json({ message: `${field} alanı geçersiz.` }, { status: 400 });
    }
  }
  for (const field of ["kkYuzde", "genelYuzde", "maasYuzde"] as const) {
    if (body[field] !== undefined) {
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return NextResponse.json({ message: "Komisyon oranları 0-100 arasında olmalıdır." }, { status: 400 });
      }
      body[field] = value;
    }
  }

  // İzin haritası kurum yöneticisi tarafından sonradan değiştirilebildiği için
  // (bkz. denetim raporu — ASISTAN/BANKO varsayılan olarak staff:write/delete
  // alabiliyordu), tek başına permission kontrolüne güvenmek yetersiz: rolünü
  // YONETICI'ye (tüm yetkiler) yükseltme işlemi burada ayrıca sabit olarak
  // sadece mevcut rolü zaten YONETICI/SUPERADMIN olanlara açık tutuluyor.
  if (body.role === "YONETICI" && existing.role !== "YONETICI" && auth.user.role !== "SUPERADMIN" && auth.user.role !== "YONETICI") {
    return NextResponse.json({ message: "Bu rol için yetkiniz yok" }, { status: 403 });
  }

  if (body.identityNo !== undefined) {
    body.identityNo = String(body.identityNo).trim();
    if (!TC_NO_REGEX.test(body.identityNo)) {
      return NextResponse.json({ message: TC_NO_MESSAGE }, { status: 400 });
    }
  }

  const workStart = body.workStart !== undefined ? body.workStart : (existing.profile?.workStart || "08:30");
  const workEnd = body.workEnd !== undefined ? body.workEnd : (existing.profile?.workEnd || "18:00");
  const workHoursError = validateWorkHoursRange(workStart, workEnd, "Personel çalışma saatleri");
  if (workHoursError) {
    return NextResponse.json({ message: workHoursError }, { status: 400 });
  }

  const newRole = (body.role || existing.role) as string;
  const newIsActive = typeof body.isActive === "boolean" ? body.isActive : existing.isActive;
  if (existing.id === auth.user.id && existing.isActive && !newIsActive) {
    return NextResponse.json({ message: "Kendi kullanıcı hesabınızı pasife alamazsınız." }, { status: 409 });
  }

  // Bir doktor/personel pasife alınırken, ona bağlı gelecek randevular/açık
  // planlar/açık takipler kimse fark etmeden "hayalet" bir kullanıcıya bağlı
  // kalmasın diye önce uyarıyoruz — kullanıcı `force:true` ile onaylarsa
  // pasifleştirme yine de gerçekleşir (kayıtlar silinmez/devredilmez, sadece
  // bilinçli bir kararla ilerlenmiş olur).
  const removesClinicalAccess = existing.isActive && (
    !newIsActive
    || (existing.role === "DOKTOR" && newRole !== "DOKTOR")
    || (!existing.profile?.hideAsDoctor && body.hideAsDoctor === true)
  );
  if (removesClinicalAccess && !body.force) {
    const [futureAppointments, openTreatmentPlans, openFollowUps] = await Promise.all([
      prisma.appointment.count({
        where: { doctorId: existing.id, startAt: { gte: new Date() }, status: { notIn: ["IPTAL", "GELMEDI"] } },
      }),
      (prisma as any).treatmentPlan.count({
        where: { doctorId: existing.id, status: { notIn: ["TAMAMLANDI", "IPTAL"] } },
      }),
      prisma.patientFollowUp.count({
        where: { doctorId: existing.id, status: "ACIK" },
      }),
    ]);
    if (futureAppointments > 0 || openTreatmentPlans > 0 || openFollowUps > 0) {
      const parts: string[] = [];
      if (futureAppointments > 0) parts.push(`${futureAppointments} gelecek randevu`);
      if (openTreatmentPlans > 0) parts.push(`${openTreatmentPlans} açık tedavi planı`);
      if (openFollowUps > 0) parts.push(`${openFollowUps} açık hasta takibi`);
      return NextResponse.json({
        message: `Bu personelin ${parts.join(", ")} var. Klinik görünürlüğünü kaldırmadan önce bunları başka bir doktora devredin ya da kapatın.`,
        requiresForce: true,
        counts: { futureAppointments, openTreatmentPlans, openFollowUps },
      }, { status: 409 });
    }
  }

  // Çalışma saatleri daraltılırken (mesai 08:30–18:00'den 08:30–13:00'e gibi),
  // yeni aralığın dışında kalan gelecekteki randevular kimse fark etmeden
  // takvimde asılı kalıyordu — hekim artık o saatte çalışmıyor gibi
  // görünmesine rağmen randevu iptal/uyarı olmadan duruyordu (bkz. denetim
  // raporu). `force:true` ile onaylanırsa değişiklik yine de uygulanır.
  const oldWorkStart = existing.profile?.workStart || "08:30";
  const oldWorkEnd = existing.profile?.workEnd || "18:00";
  const hoursNarrowed = (workStart > oldWorkStart || workEnd < oldWorkEnd) && (workStart !== oldWorkStart || workEnd !== oldWorkEnd);
  if (hoursNarrowed && !body.force) {
    const newStartMin = parseTimeToMinutes(workStart);
    const newEndMin = parseTimeToMinutes(workEnd);
    const futureAppts = await prisma.appointment.findMany({
      where: { doctorId: existing.id, startAt: { gte: new Date() }, status: { notIn: ["IPTAL", "GELMEDI"] } },
      select: { startAt: true },
    });
    const outsideCount = futureAppts.filter((a) => {
      const mins = parseTimeToMinutes(turkeyTimeKey(a.startAt));
      return newStartMin === null || newEndMin === null || mins === null || mins < newStartMin || mins >= newEndMin;
    }).length;
    if (outsideCount > 0) {
      return NextResponse.json({
        message: `Yeni çalışma saatleri dışında kalan ${outsideCount} gelecek randevu var. Devam etmek için onaylayın.`,
        requiresForce: true,
        counts: { outsideWorkingHoursAppointments: outsideCount },
      }, { status: 409 });
    }
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (existing.institutionId) {
        await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${existing.institutionId} FOR UPDATE`;
        const limitError = await checkStaffLimit({
          institutionId: existing.institutionId,
          role: newRole,
          isActive: newIsActive,
          excludeUserId: existing.id,
        }, tx);
        if (limitError) throw new Error(`STAFF_LIMIT:${limitError}`);
      }

      const result = await tx.user.update({
    where: { id: params.id },
    data: {
      identityNo: body.identityNo,
      ...(body.fullName !== undefined && { fullName: body.fullName.trim() }),
      role: newRole as Role,
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
            workStart,
            workEnd,
            ...(body.photoUrl !== undefined && { photoUrl: body.photoUrl || null }),
            ...(typeof body.hideAsDoctor === "boolean" && { hideAsDoctor: body.hideAsDoctor }),
          },
          create: {
            workStart,
            workEnd,
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

      const ratesChanged = String(existing.kkYuzde ?? "") !== String(result.kkYuzde ?? "")
        || String(existing.genelYuzde ?? "") !== String(result.genelYuzde ?? "")
        || String(existing.maasYuzde ?? "") !== String(result.maasYuzde ?? "");
      if (ratesChanged) {
        const hasHistory = await tx.doctorRateHistory.findFirst({ where: { doctorId: result.id }, select: { id: true } });
        if (!hasHistory) {
          await tx.doctorRateHistory.create({
            data: {
              doctorId: result.id,
              kkYuzde: existing.kkYuzde ?? 3,
              genelYuzde: existing.genelYuzde ?? 15,
              maasYuzde: existing.maasYuzde ?? 40,
              effectiveFrom: new Date(0),
            },
          });
        }
        await tx.doctorRateHistory.create({
          data: {
            doctorId: result.id,
            kkYuzde: result.kkYuzde ?? 3,
            genelYuzde: result.genelYuzde ?? 15,
            maasYuzde: result.maasYuzde ?? 40,
            effectiveFrom: new Date(),
          },
        });
      }
      return result;
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("STAFF_LIMIT:")) {
      return NextResponse.json({ message: error.message.slice("STAFF_LIMIT:".length) }, { status: 409 });
    }
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

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("staff:delete");
  if (auth.error) return auth.error;

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Personel bulunamadı" }, { status: 404 });
  }

  if (auth.user.role !== "SUPERADMIN" && existing.institutionId !== auth.user.institutionId) {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  if (existing.id === auth.user.id) {
    return NextResponse.json({ message: "Kendi kullanıcı hesabınızı pasife alamazsınız." }, { status: 409 });
  }
  if (!existing.isActive) {
    return NextResponse.json({ ok: true, alreadyInactive: true });
  }

  const [futureAppointments, openTreatmentPlans, openFollowUps] = await Promise.all([
    prisma.appointment.count({
      where: { doctorId: existing.id, startAt: { gte: new Date() }, status: { notIn: ["IPTAL", "GELMEDI"] } },
    }),
    (prisma as any).treatmentPlan.count({
      where: { doctorId: existing.id, status: { notIn: ["TAMAMLANDI", "IPTAL"] } },
    }),
    prisma.patientFollowUp.count({ where: { doctorId: existing.id, status: "ACIK" } }),
  ]);
  if (futureAppointments > 0 || openTreatmentPlans > 0 || openFollowUps > 0) {
    return NextResponse.json({
      message: "Bu personele bağlı aktif klinik kayıtları var. Önce kayıtları devredin veya kapatın.",
      requiresReassignment: true,
      counts: { futureAppointments, openTreatmentPlans, openFollowUps },
    }, { status: 409 });
  }

  const deleted = await prisma.user.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  await writeAudit(auth.user.id, "STAFF_DEACTIVATE", `${deleted.fullName} pasif yapildi`);
  return NextResponse.json({ ok: true });
}
