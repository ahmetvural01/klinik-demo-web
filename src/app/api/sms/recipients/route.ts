import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// Toplu mesajda alıcı seçme listesi: hasta adı + SMS/WhatsApp izin durumu.
// Hasta listesi API'si izin durumunu döndürmediği için alıcı seçerken kime
// mesaj GİTMEYECEĞİ görünmüyordu. Telefon numarası bilerek dönmez (seçim
// ekranında gösterilmemesi kullanıcı geri bildirimiyle kararlaştırıldı);
// yalnız "telefonu var mı" bilgisi döner. Aktif şube + arşivlenmemiş hastalar.
export async function GET(request: NextRequest) {
  const auth = await requireAuth("sms:bulk");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları erişebilir." }, { status: 403 });
  }
  if (!(await hasEffectivePermission(auth.user, "patients:read"))) {
    return NextResponse.json({ message: "Hasta listesini görme yetkiniz yok." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const take = parsePositiveInt(sp.get("take"), 25, 100);
  const page = parsePositiveInt(sp.get("page"), 1, 100000);
  const q = (sp.get("q") || "").trim().slice(0, 80);
  const consent = sp.get("consent") || "all";
  if (!["all", "sms", "none"].includes(consent)) {
    return NextResponse.json({ message: "Geçersiz izin filtresi." }, { status: 400 });
  }
  const digits = q.replace(/\D/g, "");

  const conditions: Prisma.PatientWhereInput[] = [
    { institutionId: auth.user.institutionId, homeBranchId: activeBranch.branchId, archivedAt: null },
  ];
  if (q) {
    conditions.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  if (consent === "sms") conditions.push({ smsPreference: { is: { status: "ENABLED" } } });
  if (consent === "none") {
    conditions.push({ OR: [{ smsPreference: { is: null } }, { smsPreference: { is: { status: { not: "ENABLED" } } } }] });
  }
  const finalWhere: Prisma.PatientWhereInput = { AND: conditions };

  const [rows, total] = await Promise.all([
    prisma.patient.findMany({
      where: finalWhere,
      select: {
        id: true,
        fullName: true,
        phone: true,
        whatsappOptInAt: true,
        whatsappOptOutAt: true,
        birthDate: true,
        smsPreference: { select: { status: true } },
      },
      orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * take,
      take,
    }),
    prisma.patient.count({ where: finalWhere }),
  ]);

  return NextResponse.json({
    patients: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      // Aynı adlı hastaları ayırmak için yalnız doğum yılı (telefon gösterilmez).
      birthYear: row.birthDate ? row.birthDate.getFullYear() : null,
      hasPhone: Boolean(row.phone),
      smsConsent: row.smsPreference?.status || "NONE",
      whatsappConsent: canMessageOnWhatsapp(row),
    })),
    total,
    page,
    take,
    pageCount: Math.max(1, Math.ceil(total / take)),
  });
}
