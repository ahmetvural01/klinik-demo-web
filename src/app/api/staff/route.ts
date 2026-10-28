import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateWorkHoursRange } from "@/lib/working-hours-core";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { checkStaffLimit } from "@/lib/staff-limits";
import { TC_NO_REGEX, TC_NO_MESSAGE } from "@/lib/validators";
import { isValidTurkishIdentityNumber } from "@/lib/tc-kimlik";
import { requireActiveBranch } from "@/lib/branch-context";

const STAFF_ROLES = new Set<Role>(["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("staff:read");
    if (auth.error) return auth.error;
    const activeBranch = requireActiveBranch(auth.user.branchContext);
    if (!activeBranch.ok || !auth.user.institutionId) {
      return NextResponse.json({ message: activeBranch.ok ? "Kurum bilgisi bulunamadı." : activeBranch.message }, { status: 403 });
    }

    // Varsayılan yanıt seçiciler içindir (doktor seçici, görev/lab pencereleri,
    // hasta listesi süzgeci...): yalnız ad, rol ve mesai. Önceden her seçici
    // bütün personelin TC kimlik numarasını (KVKK) ve profil fotoğrafını
    // (kişi başı 15–35 KB) indiriyordu. Personel sayfası `?details=1` ister:
    // fotoğraf gelir; TC yalnız personel kaydı yazabilen (staff:write) kişiye
    // döner — TC ile arama ve düzenleme yalnız onun işidir.
    const details = request.nextUrl.searchParams.get("details") === "1";
    const includeIdentity = details && await hasEffectivePermission(auth.user, "staff:write");

    const staff = await prisma.user.findMany({
      where: {
        role: { not: "SUPERADMIN" },
        // Rol adına değil oturumun institutionId'sine göre kapsanır: bir SUPERADMIN
        // "gizli erişim" ile belirli bir kliniğe girdiğinde de token institutionId
        // taşır — sadece o kliniğin personeli görünmeli, tüm kurumlarınki değil.
        institutionId: auth.user.institutionId,
        branchMemberships: { some: { branchId: activeBranch.branchId, isActive: true } },
      },
      // passwordHash/twoFactorSecret/twoFactorBackupCodes ASLA client'a
      // gönderilmemeli — bunlar önceden `include` ile tüm User satırını
      // (hash dahil) döndürüyordu. Sadece personel ekranının gerçekten
      // kullandığı alanlar seçiliyor.
      select: {
        id: true,
        fullName: true,
        identityNo: includeIdentity,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        kkYuzde: true,
        genelYuzde: true,
        maasYuzde: true,
        profile: { select: { workStart: true, workEnd: true, photoUrl: details, hideAsDoctor: true } },
        branchMemberships: { where: { branchId: activeBranch.branchId, isActive: true }, select: { branchId: true, isPrimary: true, kkYuzde: true, genelYuzde: true, maasYuzde: true, branch: { select: { name: true, code: true } } } },
      },
      orderBy: { createdAt: "desc" }
    });

    // Komisyon oranları (kkYuzde/genelYuzde/maasYuzde) doktorların net
    // maaşını belirleyen hassas bilgidir — DOKTOR/ASISTAN/BANKO rolleri de
    // `staff:read` iznine sahip olduğundan bu alanlar önceden herkese
    // sızıyordu (bkz. denetim raporu). Yalnız hakediş özetini zaten gören
    // (finance:read; yönetici `*` ile dahil) görür. Önceden üst düzey alanlar
    // silinse de şube üyeliğindeki (branchMemberships[0]) aynı üç oran herkese
    // gidiyordu; artık oradan da çıkarılır.
    const canSeeRates = await hasEffectivePermission(auth.user, "finance:read");
    // Hakediş hesabı oranı önce dönem-damgalı geçmişten (DoctorRateHistory) okur;
    // personel ekranı da aynı kaynağa bakar. Önceden yalnız kişinin/şubenin
    // alanına bakılıyordu: hakedişi hesaplanan doktorda "oran girilmemiş" yazıyordu.
    const history = canSeeRates && staff.length > 0
      ? await prisma.doctorRateHistory.findMany({
          where: { institutionId: auth.user.institutionId || undefined, branchId: activeBranch.branchId, doctorId: { in: staff.map((person) => person.id) }, effectiveFrom: { lte: new Date() } },
          orderBy: { effectiveFrom: "desc" },
          select: { doctorId: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
        })
      : [];
    const latestRate = new Map<string, (typeof history)[number]>();
    for (const row of history) if (!latestRate.has(row.doctorId)) latestRate.set(row.doctorId, row);
    const result = canSeeRates
      ? staff.map((person) => {
          const fromHistory = latestRate.get(person.id);
          return {
            ...person,
            kkYuzde: person.branchMemberships[0]?.kkYuzde ?? person.kkYuzde ?? fromHistory?.kkYuzde ?? null,
            genelYuzde: person.branchMemberships[0]?.genelYuzde ?? person.genelYuzde ?? fromHistory?.genelYuzde ?? null,
            maasYuzde: person.branchMemberships[0]?.maasYuzde ?? person.maasYuzde ?? fromHistory?.maasYuzde ?? null,
          };
        })
      : staff.map(({ kkYuzde: _kkYuzde, genelYuzde: _genelYuzde, maasYuzde: _maasYuzde, branchMemberships, ...rest }) => ({
          ...rest,
          branchMemberships: branchMemberships.map(({ kkYuzde: _bkk, genelYuzde: _bgenel, maasYuzde: _bmaas, ...membership }) => membership),
        }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[staff GET] fallback:", error);
    return NextResponse.json({ message: "Personel listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("staff:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi olmadan personel oluşturulamaz." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const role = (body.role || "ASISTAN") as Role;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!STAFF_ROLES.has(role)) {
    return NextResponse.json({ message: "Geçersiz personel rolü." }, { status: 400 });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return NextResponse.json({ message: "Ad soyad 2-120 karakter olmalıdır." }, { status: 400 });
  }

  // Kimlik no daha önce hiç doğrulanmıyordu — 11 haneden farklı ya da harf
  // içeren bir değer sessizce kaydediliyordu (bkz. denetim raporu).
  if (typeof body.identityNo !== "string" || !TC_NO_REGEX.test(body.identityNo)) {
    return NextResponse.json({ message: TC_NO_MESSAGE }, { status: 400 });
  }
  // TC aynı zamanda giriş kimliği ve ilk şifredir: yanlış yazılmış bir numara
  // sonradan zor fark edilir (canlı H-4). Hasta formundaki algoritmayla aynı
  // kural; ekran da aynı kontrolü yapar.
  if (!isValidTurkishIdentityNumber(body.identityNo)) {
    return NextResponse.json({ message: "Geçerli bir TC kimlik no yazın; numarayı kimlikten kontrol edin.", field: "identityNo" }, { status: 400 });
  }

  // bkz. src/app/api/staff/[id]/route.ts PUT — YONETICI (tüm yetkiler) rolü
  // sadece zaten YONETICI/SUPERADMIN olan bir aktör tarafından atanabilir.
  if (role === "YONETICI" && auth.user.role !== "SUPERADMIN" && auth.user.role !== "YONETICI") {
    return NextResponse.json({ message: "Bu rol için yetkiniz yok" }, { status: 403 });
  }
  if (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 72)) {
    return NextResponse.json({ message: "Şifre 8-72 karakter olmalıdır." }, { status: 400 });
  }
  if (body.hideAsDoctor !== undefined && typeof body.hideAsDoctor !== "boolean") {
    return NextResponse.json({ message: "Doktor görünürlüğü geçersiz." }, { status: 400 });
  }
  // Hakediş oranları (isteğe bağlı) kayıtla birlikte şube üyeliğine yazılır.
  // Önceden pencere kaydın ardından ayrı bir PUT atıyor, oran geçmişine aynı
  // değerli iki satır (1970 ve bugün) düşüyordu. İlk oran geçmiş satırı
  // gerektirmez: geçmiş yoksa hakediş güncel oranı kullanır.
  const initialRates: { kkYuzde?: number; genelYuzde?: number; maasYuzde?: number } = {};
  for (const field of ["kkYuzde", "genelYuzde", "maasYuzde"] as const) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json({ message: "Komisyon oranları 0-100 arasında olmalıdır." }, { status: 400 });
    }
    initialRates[field] = value;
  }
  const workStart = typeof body.workStart === "string" ? body.workStart : "08:30";
  const workEnd = typeof body.workEnd === "string" ? body.workEnd : "18:00";
  const workHoursError = validateWorkHoursRange(workStart, workEnd, "Personel çalışma saatleri");
  if (workHoursError) {
    return NextResponse.json({ message: workHoursError }, { status: 400 });
  }

  const targetInstitutionId = auth.user.institutionId;

  // Personel eklerken şifre sorulmadan, sistem akıcı olsun diye varsayılan
  // şifre TC kimlik no olur — kullanıcı ilk girişte doğrudan şifre değiştirme
  // adımına yönlendirilir (bkz. kullanıcı geri bildirimi).
  const usingDefaultPassword = !body.password;
  const passwordHash = await bcrypt.hash(body.password || body.identityNo, 10);
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 409 });

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const institutions = await tx.$queryRaw<Array<{ id: string; isActive: boolean }>>`
        SELECT id, "isActive" FROM "Institution" WHERE id = ${targetInstitutionId} FOR UPDATE
      `;
      if (!institutions[0]?.isActive) throw new Error("INSTITUTION_INACTIVE");

      const limitError = await checkStaffLimit({
        institutionId: targetInstitutionId,
        role,
        isActive: true,
      }, tx);
      if (limitError) throw new Error(`STAFF_LIMIT:${limitError}`);

      return tx.user.create({
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
        fullName,
        role,
        passwordHash,
        mustChangePassword: usingDefaultPassword,
        profile: {
          create: {
            workStart,
            workEnd,
            // Yönetici rolündeki personel varsayılan olarak randevu ekranındaki
            // doktor listesinde görünmez; tedavi de veriyorsa formdan işaretlenerek gösterilebilir.
            hideAsDoctor: role === "YONETICI" ? (typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : true) : false,
          }
        },
        branchMemberships: {
          create: {
            branchId: activeBranch.branchId,
            isPrimary: true,
            ...initialRates,
          },
        },
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
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSTITUTION_INACTIVE") {
      return NextResponse.json({ message: "Kurum bulunamadı veya pasif durumda." }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("STAFF_LIMIT:")) {
      return NextResponse.json({ message: error.message.slice("STAFF_LIMIT:".length) }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      // İşten ayrılıp dönen personel yeni kayıt değil, eski kaydın geri açılmasıdır.
      return NextResponse.json({ message: "Bu TC kimlik numarası kurumda zaten kayıtlı. Kişi daha önce pasife alındıysa Personel listesinde \"Pasif\" süzgecinden yeniden aktif edin.", field: "identityNo" }, { status: 409 });
    }
    console.error("[staff POST] fallback:", error);
    return NextResponse.json({ message: "Personel oluşturulamadı." }, { status: 503 });
  }

  await writeAudit(auth.user.id, "STAFF_CREATE", `${created.fullName} eklendi`);
  return NextResponse.json(created, { status: 201 });
}
