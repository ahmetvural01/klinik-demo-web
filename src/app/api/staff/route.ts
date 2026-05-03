import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const staff = await prisma.user.findMany({
    where: {
      role: { not: "SUPERADMIN" },
      ...(auth.user.role !== "SUPERADMIN" && auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    include: { profile: true },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(staff);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  if (body.role === "SUPERADMIN") {
    return NextResponse.json({ message: "Bu rol olusturulamaz" }, { status: 403 });
  }
  const passwordHash = await bcrypt.hash(body.password || "12345678", 10);

  const created = await prisma.user.create({
    data: {
      institution: body.institution,
      identityNo: body.identityNo,
      fullName: body.fullName,
      role: (body.role || "ASISTAN") as Role,
      passwordHash,
      profile: {
        create: {
          workStart: "08:30",
          workEnd: "18:00"
        }
      }
    }
  });

  await writeAudit(auth.user.id, "STAFF_CREATE", `${created.fullName} eklendi`);
  return NextResponse.json(created, { status: 201 });
}
