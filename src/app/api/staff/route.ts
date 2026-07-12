import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("patients:read");
    if (auth.error) return auth.error;

    const staff = await prisma.user.findMany({
      where: {
        role: { not: "SUPERADMIN" },
        // Rol adına değil oturumun institutionId'sine göre kapsanır: bir SUPERADMIN
        // "gizli erişim" ile belirli bir kliniğe girdiğinde de token institutionId
        // taşır — sadece o kliniğin personeli görünmeli, tüm kurumlarınki değil.
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      include: { profile: true },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(staff);
  } catch (error) {
    console.error("[staff GET] fallback:", error);
    return NextResponse.json({ message: "Personel listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId && auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Kurum bilgisi olmadan personel olusturulamaz" }, { status: 403 });
  }

  const body = await request.json();
  if (body.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Bu rol olusturulamaz" }, { status: 403 });
  }
  const passwordHash = await bcrypt.hash(body.password || "12345678", 10);

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
        institutionId: auth.user.institutionId || body.institutionId || null,
        identityNo: body.identityNo,
        fullName: body.fullName,
        role: (body.role || "ASISTAN") as Role,
        passwordHash,
        profile: {
          create: {
            workStart: "08:30",
            workEnd: "18:00",
            // Yönetici rolündeki personel varsayılan olarak randevu ekranındaki
            // doktor listesinde görünmez; tedavi de veriyorsa formdan işaretlenerek gösterilebilir.
            hideAsDoctor: body.role === "YONETICI" ? (typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : true) : false,
          }
        }
      }
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu TC kimlik no bu kurumda zaten kayıtlı" }, { status: 409 });
    }
    console.error("[staff POST] fallback:", error);
    return NextResponse.json({ message: "Personel oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "STAFF_CREATE", `${created.fullName} eklendi`);
  return NextResponse.json(created, { status: 201 });
}
