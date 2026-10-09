import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;
const MAX_TEXT = 2000;

async function platformAuthorIds(): Promise<{ ids: string[]; names: Map<string, string> }> {
  const admins = await prisma.user.findMany({ where: { role: "SUPERADMIN" }, select: { id: true, fullName: true } });
  return { ids: admins.map((admin) => admin.id), names: new Map(admins.map((admin) => [admin.id, admin.fullName])) };
}

/**
 * GET ?scope=platform (varsayılan): platform yöneticilerinin yayınladığı
 * duyurular, aynı anda birçok kliniğe gönderilen tek duyuru TEK satır olarak
 * (hedef klinikleriyle) döner. Önceden aynı metin klinik sayısı kadar satır
 * olarak listeleniyor, 20 kayıtta kesiliyor ve kliniklerin kendi iç
 * duyurularıyla karışıyordu.
 * GET ?scope=clinic: kliniklerin kendi personeline yazdığı iç duyurular.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const scope = searchParams.get("scope") === "clinic" ? "clinic" : "platform";
  const { ids: adminIds, names } = await platformAuthorIds();

  if (scope === "clinic") {
    const where: Prisma.AnnouncementWhereInput = { OR: [{ createdById: null }, { createdById: { notIn: adminIds } }] };
    const [total, announcements] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { institution: { select: { id: true, name: true } } },
      }),
    ]);
    return NextResponse.json({ announcements, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  }

  const rows = await prisma.announcement.findMany({
    where: { createdById: { in: adminIds } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { institution: { select: { id: true, name: true } } },
  });

  type Group = {
    key: string;
    ids: string[];
    text: string;
    startsAt: Date | null;
    endsAt: Date | null;
    createdAt: Date;
    createdBy: string | null;
    targets: { id: string; name: string; active: boolean }[];
    activeCount: number;
  };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    // Tek bir "yayınla" işlemi aynı metin, aynı yazar, aynı oluşturma anı ve
    // aynı yayın aralığıyla klinik başına bir kayıt üretir.
    const key = [row.text, row.createdById, row.createdAt.toISOString(), row.startsAt?.toISOString() ?? "", row.endsAt?.toISOString() ?? ""].join("|");
    let group = groups.get(key);
    if (!group) {
      group = {
        key: row.id,
        ids: [],
        text: row.text,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        createdAt: row.createdAt,
        createdBy: row.createdById ? names.get(row.createdById) ?? null : null,
        targets: [],
        activeCount: 0,
      };
      groups.set(key, group);
    }
    group.ids.push(row.id);
    group.targets.push({ id: row.institution?.id ?? "", name: row.institution?.name ?? "Silinmiş klinik", active: row.isActive });
    if (row.isActive) group.activeCount += 1;
  }

  const all = [...groups.values()];
  const total = all.length;
  const list = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((group) => ({
    ...group,
    targets: group.targets.sort((a, b) => a.name.localeCompare(b.name, "tr")),
  }));
  const activeClinicCount = await prisma.institution.count({ where: { isActive: true } });

  return NextResponse.json({ groups: list, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), activeClinicCount });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json().catch(() => null) as { text?: unknown; institutionIds?: unknown; allInstitutions?: unknown; startsAt?: string | null; endsAt?: string | null } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ message: "Duyuru metnini yazın" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ message: `Duyuru en fazla ${MAX_TEXT} karakter olabilir` }, { status: 400 });

  const requestedIds = Array.isArray(body.institutionIds) ? body.institutionIds.filter((value): value is string => typeof value === "string") : [];
  const targetInstitutions = body.allInstitutions === true
    ? await prisma.institution.findMany({ where: { isActive: true }, select: { id: true } })
    : await prisma.institution.findMany({ where: { id: { in: requestedIds }, isActive: true }, select: { id: true } });

  const uniqueInstitutions = targetInstitutions.filter((institution, index, list) =>
    list.findIndex((item) => item.id === institution.id) === index,
  );

  if (uniqueInstitutions.length === 0) {
    return NextResponse.json({ message: "En az bir açık klinik seçin" }, { status: 400 });
  }

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.startsAt && Number.isNaN(startsAt?.getTime())) {
    return NextResponse.json({ message: "Başlangıç tarihi geçersiz" }, { status: 400 });
  }
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (body.endsAt && Number.isNaN(endsAt?.getTime())) {
    return NextResponse.json({ message: "Bitiş tarihi geçersiz" }, { status: 400 });
  }
  if (startsAt && endsAt && startsAt > endsAt) {
    return NextResponse.json({ message: "Başlangıç tarihi bitiş tarihinden sonra olamaz" }, { status: 400 });
  }

  const result = await prisma.announcement.createMany({
    data: uniqueInstitutions.map((institution) => ({
      institutionId: institution.id,
      text,
      createdById: auth.user.id,
      startsAt,
      endsAt,
    })),
  });

  const skipped = body.allInstitutions === true ? 0 : Math.max(0, new Set(requestedIds).size - uniqueInstitutions.length);
  await writeAudit(auth.user.id, "SUPERADMIN_ANNOUNCEMENT_CREATE", `${result.count} kliniğe duyuru yayınlandı: ${text.slice(0, 120)}`);
  return NextResponse.json({ ok: true, created: result.count, skipped }, { status: 201 });
}

/** DELETE ?ids=a,b,c (bir duyurunun tüm hedefleri) veya ?id=a — kayıt silinmez, yayından kaldırılır. */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const ids = [
    ...(searchParams.get("ids") || "").split(","),
    searchParams.get("id") || "",
  ].map((value) => value.trim()).filter(Boolean).slice(0, 1000);
  if (ids.length === 0) return NextResponse.json({ message: "Duyuru seçilmedi" }, { status: 400 });

  const sample = await prisma.announcement.findFirst({ where: { id: { in: ids } }, select: { text: true } });
  const result = await prisma.announcement.updateMany({ where: { id: { in: ids }, isActive: true }, data: { isActive: false } });
  await writeAudit(auth.user.id, "SUPERADMIN_ANNOUNCEMENT_DELETE", `Duyuru ${result.count} klinikte yayından kaldırıldı: ${sample?.text?.slice(0, 120) || ids[0]}`);
  return NextResponse.json({ ok: true, deactivated: result.count });
}
