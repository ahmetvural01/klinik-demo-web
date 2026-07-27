import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateWorkHoursRange } from "@/lib/working-hours-core";
import { requireAuth, writeAudit } from "@/lib/api";
import { checkStaffLimit } from "@/lib/staff-limits";
import { TC_NO_REGEX, TC_NO_MESSAGE } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("staff:read");
    if (auth.error) return auth.error;

    const staff = await prisma.user.findMany({
      where: {
        role: { not: "SUPERADMIN" },
        // Rol adına değil oturumun institutionId'sine göre kapsanır: bir SUPERADMIN
        // "gizli erişim" ile belirli bir kliniğe girdiğinde de token institutionId
        // taşır — sadece o kliniğin personeli görünmeli, tüm kurumlarınki değil.
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      // passwordHash/twoFactorSecret/twoFactorBackupCodes ASLA client'a
      // gönderilmemeli — bunlar önceden `include` ile tüm User satırını
      // (hash dahil) döndürüyordu. Sadece personel ekranının gerçekten
      // kullandığı alanlar seçiliyor.
      select: {
        id: true,
        fullName: true,
        identityNo: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        kkYuzde: true,
        genelYuzde: true,
        maasYuzde: true,
        profile: { select: { workStart: true, workEnd: true, photoUrl: true, hideAsDoctor: true } },
      },
      orderBy: { createdAt: "desc" }
    });

    // Komisyon oranları (kkYuzde/genelYuzde/maasYuzde) doktorların net
    // maaşını belirleyen hassas bilgidir — DOKTOR/ASISTAN/BANKO rolleri de
    // `staff:read` iznine sahip olduğundan bu alanlar önceden herkese
    // sızıyordu (bkz. denetim raporu). Yalnızca YONETICI/SUPERADMIN görebilir.
    const canSeeRates = auth.user.role === "YONETICI" || auth.user.role === "SUPERADMIN";
    const result = canSeeRates
      ? staff
      : staff.map(({ kkYuzde, genelYuzde, maasYuzde, ...rest }) => rest);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[staff GET] fallback:", error);
    return NextResponse.json({ message: "Personel listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("staff:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId && auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Kurum bilgisi olmadan personel oluşturulamaz." }, { status: 403 });
  }

  const body = await request.json();
  if (body.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Bu rol oluşturulamaz." }, { status: 403 });
  }

  // Kimlik no daha önce hiç doğrulanmıyordu — 11 haneden farklı ya da harf
  // içeren bir değer sessizce kaydediliyordu (bkz. denetim raporu).
  if (typeof body.identityNo !== "string" || !TC_NO_REGEX.test(body.identityNo)) {
    return NextResponse.json({ message: TC_NO_MESSAGE }, { status: 400 });
  }

  // bkz. src/app/api/staff/[id]/route.ts PUT — YONETICI (tüm yetkiler) rolü
  // sadece zaten YONETICI/SUPERADMIN olan bir aktör tarafından atanabilir.
  if (body.role === "YONETICI" && auth.user.role !== "SUPERADMIN" && auth.user.role !== "YONETICI") {
    return NextResponse.json({ message: "Bu rol için yetkiniz yok" }, { status: 403 });
  }
  const workStart = typeof body.workStart === "string" ? body.workStart : "08:30";
  const workEnd = typeof body.workEnd === "string" ? body.workEnd : "18:00";
  const workHoursError = validateWorkHoursRange(workStart, workEnd, "Personel çalışma saatleri");
  if (workHoursError) {
    return NextResponse.json({ message: workHoursError }, { status: 400 });
  }

  const targetInstitutionId = auth.user.institutionId || body.institutionId || null;
  if (targetInstitutionId) {
    const limitError = await checkStaffLimit({
      institutionId: targetInstitutionId,
      role: body.role || "ASISTAN",
      isActive: true,
    });
    if (limitError) {
      return NextResponse.json({ message: limitError }, { status: 409 });
    }
  }

  // Personel eklerken şifre sorulmadan, sistem akıcı olsun diye varsayılan
  // şifre TC kimlik no olur — kullanıcı ilk girişte doğrudan şifre değiştirme
  // adımına yönlendirilir (bkz. kullanıcı geri bildirimi).
  const usingDefaultPassword = !body.password;
  const passwordHash = await bcrypt.hash(body.password || body.identityNo, 10);

  let created;
  try {
    created = await prisma.user.create({
      data: {
        // Oturumun kendi institutionId'si her zaman önceliklidir — bir SUPERADMIN
        // "gizli erişim" ile bir kliniğe girip personel eklerse token institutionId
        // taşır ve o kliniğe atanmalıdır. Sadece gerçekten kurum bağlamı olmayan
        // (institutionId null) durumda body.institutionId'ye düşülür.
        // ÖNCEKİ HATA: role==="SUPERADMIN" kontrolü, gizli erişimle kliniğe girmiş
        // bir superadmin'in eklediği personeli institutionId=null ile oluşturuyordu
        // — bu personel daha sonra o kliniğe giriş yapamıyordu ("Kullanıcı bulunamadı").
        institutionId: targetInstitutionId,
        identityNo: body.identityNo,
        fullName: body.fullName,
        role: (body.role || "ASISTAN") as Role,
        passwordHash,
        mustChangePassword: usingDefaultPassword,
        profile: {
          create: {
            workStart,
            workEnd,
            // Yönetici rolündeki personel varsayılan olarak randevu ekranındaki
            // doktor listesinde görünmez; tedavi de veriyorsa formdan işaretlenerek gösterilebilir.
            hideAsDoctor: body.role === "YONETICI" ? (typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : true) : false,
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
        createdAt: true,
        profile: { select: { workStart: true, workEnd: true, photoUrl: true, hideAsDoctor: true } },
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu TC kimlik numarası kurumda zaten kayıtlı." }, { status: 409 });
    }
    console.error("[staff POST] fallback:", error);
    return NextResponse.json({ message: "Personel oluşturulamadı." }, { status: 503 });
  }

  await writeAudit(auth.user.id, "STAFF_CREATE", `${created.fullName} eklendi`);
  return NextResponse.json(created, { status: 201 });
}
