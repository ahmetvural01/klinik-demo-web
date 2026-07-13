import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

const DEMO_DAYS = 14;

function digits(input: string) {
  return input.replace(/\D/g, "");
}

function makeIdentity(seed: string, offset: number) {
  const raw = digits(seed).slice(-9).padStart(9, "0");
  return `79${raw}`.slice(0, 9) + String(offset).padStart(2, "0");
}

function makePassword() {
  return `Kp${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "demo-klinik";
}

export async function POST(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`demo-request:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ message: "Kısa sürede çok fazla demo talebi alındı. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({})) as {
    institutionName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };

  const institutionName = String(body.institutionName || "").trim();
  const contactName = String(body.contactName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const notes = String(body.notes || "").trim();

  if (!institutionName || !contactName || !email) {
    return NextResponse.json({ message: "Klinik adı, yetkili kişi ve e-posta zorunlu." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const now = new Date();
  const demoExpiresAt = new Date(now.getTime() + DEMO_DAYS * 24 * 60 * 60 * 1000);
  const seed = String(Date.now()).slice(-9);
  const slug = `${normalizeSlug(institutionName)}-demo-${seed.slice(-4)}`;
  const password = makePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const managerIdentityNo = makeIdentity(seed, 1);
  const doctorIdentityNo = makeIdentity(seed, 2);
  const bankoIdentityNo = makeIdentity(seed, 3);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.demoRequest.create({
        data: {
          institutionName,
          contactName,
          email,
          phone: phone || null,
          notes: notes || null,
          status: "DEMO_CREATED",
          demoExpiresAt,
        },
      });

      const institution = await tx.institution.create({
        data: {
          name: slug,
          email: `demo-${seed}@klinik.local`,
          phone: phone || null,
          address: "Geçici test ortamı - gerçek hasta verisi içermez",
          subscriptionPlan: "PROFESYONEL",
          isDemo: true,
          demoExpiresAt,
          demoSourceRequestId: requestRecord.id,
        },
      });

      const users = await Promise.all([
        tx.user.create({
          data: {
            institutionId: institution.id,
            identityNo: managerIdentityNo,
            fullName: contactName,
            email: `demo-yonetici-${seed}@klinik.local`,
            passwordHash,
            role: "YONETICI",
          },
        }),
        tx.user.create({
          data: {
            institutionId: institution.id,
            identityNo: doctorIdentityNo,
            fullName: "Dr. Elif Karaca",
            email: `demo-doktor-${seed}@klinik.local`,
            passwordHash,
            role: "DOKTOR",
          },
        }),
        tx.user.create({
          data: {
            institutionId: institution.id,
            identityNo: bankoIdentityNo,
            fullName: "Sibel Yalçın",
            email: `demo-banko-${seed}@klinik.local`,
            passwordHash,
            role: "BANKO",
          },
        }),
      ]);

      await tx.setting.create({
        data: {
          institutionId: institution.id,
          institutionName,
          institutionPhone: phone || null,
          institutionWebsite: "https://klinik.local",
        },
      });

      const demoPatients = [
        { fullName: "Ayşe Yılmaz", phone: "05550000101", gender: "K", referrer: "Instagram" },
        { fullName: "Mehmet Kaya", phone: "05550000102", gender: "E", referrer: "Tavsiye" },
        { fullName: "Elif Demir", phone: "05550000103", gender: "K", referrer: "Google" },
        { fullName: "Kerem Aydın", phone: "05550000104", gender: "E", referrer: "Tabela" },
        { fullName: "Zeynep Arslan", phone: "05550000105", gender: "K", referrer: "Web sitesi" },
        { fullName: "Burak Şahin", phone: "05550000106", gender: "E", referrer: "Hasta yakını" },
      ];

      const patients = await Promise.all(demoPatients.map((patient, index) =>
        tx.patient.create({
          data: {
            institutionId: institution.id,
            tcNo: makeIdentity(seed, 11 + index),
            fullName: patient.fullName,
            phone: patient.phone,
            gender: patient.gender,
            insurance: index % 2 === 0 ? "SGK" : "Özel Sigorta",
            notes: "Test ortamı için oluşturulmuş örnek hasta kaydı.",
            referrer: patient.referrer,
          },
        })
      ));

      await tx.priceItem.createMany({
        data: [
          { institutionId: institution.id, code: "MUAYENE", treatment: "İlk Muayene", amount: 750, isFavorite: true, isCustom: false },
          { institutionId: institution.id, code: "DOLGU", treatment: "Kompozit Dolgu", amount: 2500, isFavorite: true, isCustom: false },
          { institutionId: institution.id, code: "KANAL", treatment: "Kanal Tedavisi", amount: 4500, isFavorite: false, isCustom: false },
        ],
      });

      const stockItems = await Promise.all([
        tx.stockItem.create({
          data: { institutionId: institution.id, name: "Nitril Eldiven M", category: "SARF", unit: "kutu", quantity: 12, minQuantity: 5, unitPrice: 350, supplier: "Medikal Sarf Deposu" },
        }),
        tx.stockItem.create({
          data: { institutionId: institution.id, name: "Artikain Anestezi Ampul", category: "MEDIKAL", unit: "adet", quantity: 20, minQuantity: 8, unitPrice: 120, supplier: "Aydın Dental Tedarik" },
        }),
      ]);

      await Promise.all(stockItems.map((item) =>
        tx.stockMovement.create({
          data: {
            stockItemId: item.id,
            type: "GIRIS",
            quantity: item.quantity,
            note: "Açılış stok girişi",
            userId: users[0].id,
          },
        })
      ));

      await Promise.all(patients.slice(0, 5).map((patient, index) => {
        const startAt = new Date(now.getTime() + (index + 1) * 24 * 60 * 60 * 1000 + (9 + index) * 60 * 60 * 1000);
        return tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: users[1].id,
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
            status: index === 1 ? "GELDI" : "BEKLIYOR",
            type: index % 2 === 0 ? "KONTROL" : "STANDART",
            note: index === 0 ? "İlk muayene randevusu" : "Kontrol randevusu",
          },
        });
      }));

      const pos = await tx.posDevice.create({
        data: { institutionId: institution.id, name: "Klinik POS", isActive: true },
      });

      await tx.payment.create({
        data: {
          patientId: patients[0].id,
          posId: pos.id,
          method: "KREDI_KARTI",
          amount: 1250,
          description: "Muayene tahsilatı",
        },
      });

      const treatmentPlan = await tx.treatmentPlan.create({
        data: {
          patientId: patients[0].id,
          doctorId: users[1].id,
          title: "Tedavi Planı",
          status: "DEVAM_EDIYOR",
          totalCost: 8750,
          notes: "Plan: muayene, dolgu ve kontrol adımları.",
        },
      });

      await tx.treatmentStep.createMany({
        data: [
          { planId: treatmentPlan.id, order: 1, treatmentName: "İlk Muayene", amount: 750, status: "TAMAMLANDI", doneAt: now },
          { planId: treatmentPlan.id, order: 2, treatmentName: "Kompozit Dolgu", toothNo: "16", amount: 2500, status: "BEKLIYOR" },
          { planId: treatmentPlan.id, order: 3, treatmentName: "Kanal Tedavisi", toothNo: "26", amount: 4500, status: "BEKLIYOR" },
        ],
      });

      const taksitPlan = await tx.taksitPlan.create({
        data: {
          patientId: patients[1].id,
          doctorId: users[1].id,
          baslik: "İmplant ödeme planı",
          toplamBorc: 12000,
          pesnat: 3000,
          taksitSayisi: 3,
          startDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          notes: "Taksit planı",
        },
      });

      await tx.taksit.createMany({
        data: [1, 2, 3].map((siraNo) => ({
          planId: taksitPlan.id,
          siraNo,
          vadeDate: new Date(now.getTime() + (siraNo * 30 + 7) * 24 * 60 * 60 * 1000),
          tutar: 3000,
          kalan: 3000,
        })),
      });

      const labOrder = await tx.labOrder.create({
        data: {
          patientId: patients[2].id,
          doctorId: users[1].id,
          labName: "Marmara Dental Lab",
          labType: "Zirkonyum",
          teeth: "11,12",
          notes: "Laboratuvar işi",
          price: 4200,
          invoiceNo: `DLAB-${seed}`,
        },
      });

      await tx.labTrip.create({
        data: {
          labOrderId: labOrder.id,
          order: 1,
          description: "Ölçü gönderildi",
          expectedAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          sentNote: "Kurye teslimi",
        },
      });

      await tx.labOrderInvoice.create({
        data: {
          labOrderId: labOrder.id,
          item: "Zirkonyum laboratuvar ücreti",
          amount: 4200,
          invoiceNo: `DLAB-F-${seed}`,
        },
      });

      const firma = await tx.firma.create({
        data: {
          institutionId: institution.id,
          name: "Medikal Sarf Deposu",
          phone: "02120000000",
          kategori: "TEDARICI",
          notes: "Stok ve sarf tedarikçisi",
          vendorScore: 82,
        },
      });

      await tx.firmaIslem.create({
        data: {
          firmaId: firma.id,
          tarih: now,
          islemTipi: "ALIM",
          urunHizmet: "Eldiven ve anestezi alımı",
          aciklama: "Tedarikçi siparişi",
          tutar: 4800,
          faturaNo: `DF-${seed}`,
          yontem: "HAVALE_EFT",
          kdvOrani: 20,
        },
      });

      await tx.firmaKontakt.create({
        data: {
          firmaId: firma.id,
          ad: "Merve Çetin",
          unvan: "Satış Temsilcisi",
          telefon: "02120000001",
          rol: "Sipariş",
          isPrimary: true,
        },
      });

      await tx.clinicTask.create({
        data: {
          institutionId: institution.id,
          patientId: patients[3].id,
          title: "Hasta geri arama",
          details: "Tedavi planı onayı için hastayı arayın.",
          type: "ARAMA",
          priority: 1,
          dueAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
          assignedToId: users[2].id,
          createdById: users[0].id,
        },
      });

      await tx.announcement.create({
        data: {
          institutionId: institution.id,
          text: "Test ortamınız hazır. Bu alandaki veriler gerçek müşteri verileriyle karışmaz.",
          createdById: users[0].id,
          endsAt: demoExpiresAt,
        },
      });

      await tx.demoRequest.update({
        where: { id: requestRecord.id },
        data: { demoInstitutionId: institution.id },
      });

      return { institution, requestRecord };
    });

    return NextResponse.json({
      ok: true,
      message: "Demo erişimi oluşturuldu.",
      demo: {
        institution: result.institution.name,
        identityNo: managerIdentityNo,
        password,
        expiresAt: demoExpiresAt.toISOString(),
        loginUrl: "/klinik/giris",
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[demo-requests POST]", error);
    return NextResponse.json({ message: "Demo erişimi oluşturulamadı. Lütfen daha sonra tekrar deneyin." }, { status: 503 });
  }
}
