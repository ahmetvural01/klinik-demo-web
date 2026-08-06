/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BASE_URL = process.env.TENANT_TEST_BASE_URL || "http://127.0.0.1:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function api(cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Cookie: cookie,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

async function expectNotFound(cookie: string, label: string, path: string, init: RequestInit = {}) {
  const response = await api(cookie, path, init);
  assert(response.status === 404, `${label}: başka kuruma ait kayıt 404 dönmeliydi, gerçek ${response.status}.`);
}

async function expectRejected(cookie: string, label: string, path: string, init: RequestInit = {}) {
  const response = await api(cookie, path, init);
  assert([400, 403, 404].includes(response.status), `${label}: kurumlar arası ilişki reddedilmeliydi, gerçek ${response.status}.`);
}

async function main() {
  const health = await fetch(`${BASE_URL}/api/system/health`);
  assert(health.ok, `Sunucu hazır değil: ${health.status}`);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const injectionMarker = `CROSS_TENANT_CREATE_${suffix}`;
  const password = `Tenant!${suffix}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const identityNo = `TNT${suffix}`.slice(0, 20);
  const institutionIds: string[] = [];
  const userIds: string[] = [];
  const patientIds: string[] = [];
  const appointmentIds: string[] = [];
  const taskIds: string[] = [];
  const paymentIds: string[] = [];
  const stockIds: string[] = [];

  try {
    const [institutionA, institutionB] = await Promise.all([
      prisma.institution.create({ data: { name: `Tenant Audit A ${suffix}`, email: `tenant-a-${suffix}@example.invalid` } }),
      prisma.institution.create({ data: { name: `Tenant Audit B ${suffix}`, email: `tenant-b-${suffix}@example.invalid` } }),
    ]);
    institutionIds.push(institutionA.id, institutionB.id);

    const [userA, userB] = await Promise.all([
      prisma.user.create({ data: { institutionId: institutionA.id, identityNo, fullName: `Tenant A Yönetici ${suffix}`, passwordHash, role: "YONETICI" } }),
      prisma.user.create({ data: { institutionId: institutionB.id, identityNo, fullName: `Tenant B Yönetici ${suffix}`, passwordHash, role: "YONETICI" } }),
    ]);
    userIds.push(userA.id, userB.id);

    const [patientA, patientB] = await Promise.all([
      prisma.patient.create({ data: { institutionId: institutionA.id, fullName: `TENANT_A_PATIENT_${suffix}`, phone: "5551112233", gender: "ERKEK" } }),
      prisma.patient.create({ data: { institutionId: institutionB.id, fullName: `TENANT_B_PATIENT_${suffix}`, phone: "5559998877", gender: "KADIN" } }),
    ]);
    patientIds.push(patientA.id, patientB.id);

    const startAt = new Date(Date.now() + 14 * 86400000);
    startAt.setUTCHours(9, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 30 * 60000);
    const [appointmentA, appointmentB] = await Promise.all([
      prisma.appointment.create({ data: { patientId: patientA.id, doctorId: userA.id, startAt, endAt, note: `TENANT_A_APPOINTMENT_${suffix}` } }),
      prisma.appointment.create({ data: { patientId: patientB.id, doctorId: userB.id, startAt, endAt, note: `TENANT_B_APPOINTMENT_${suffix}` } }),
    ]);
    appointmentIds.push(appointmentA.id, appointmentB.id);

    const [taskA, taskB] = await Promise.all([
      prisma.clinicTask.create({ data: { institutionId: institutionA.id, title: `TENANT_A_TASK_${suffix}`, createdById: userA.id, assignedToId: userA.id } }),
      prisma.clinicTask.create({ data: { institutionId: institutionB.id, title: `TENANT_B_TASK_${suffix}`, createdById: userB.id, assignedToId: userB.id } }),
    ]);
    taskIds.push(taskA.id, taskB.id);

    const [paymentA, paymentB] = await Promise.all([
      prisma.payment.create({ data: { institutionId: institutionA.id, patientId: patientA.id, doctorId: userA.id, amount: 101, description: `TENANT_A_PAYMENT_${suffix}` } }),
      prisma.payment.create({ data: { institutionId: institutionB.id, patientId: patientB.id, doctorId: userB.id, amount: 202, description: `TENANT_B_PAYMENT_${suffix}` } }),
    ]);
    paymentIds.push(paymentA.id, paymentB.id);

    const [stockA, stockB] = await Promise.all([
      prisma.stockItem.create({ data: { institutionId: institutionA.id, name: `TENANT_A_STOCK_${suffix}`, quantity: 11 } }),
      prisma.stockItem.create({ data: { institutionId: institutionB.id, name: `TENANT_B_STOCK_${suffix}`, quantity: 22 } }),
    ]);
    stockIds.push(stockA.id, stockB.id);

    const login = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institution: institutionA.name.toLocaleLowerCase("tr-TR"), identityNo, password }),
    });
    assert(login.ok, `A kurumu girişi başarısız: ${login.status} ${await login.text()}`);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    assert(cookie, "Giriş çerezi alınamadı.");

    const listChecks = [
      ["hasta listesi", `/api/patients?q=${encodeURIComponent(`TENANT_B_PATIENT_${suffix}`)}&take=100`, patientB.id],
      ["randevu listesi", `/api/appointments?from=${encodeURIComponent(new Date(startAt.getTime() - 86400000).toISOString())}&to=${encodeURIComponent(new Date(endAt.getTime() + 86400000).toISOString())}`, appointmentB.id],
      ["görev listesi", "/api/clinic-tasks?scope=all&take=500", taskB.id],
      ["ödeme listesi", "/api/payments", paymentB.id],
      ["stok listesi", "/api/stock", stockB.id],
    ] as const;
    for (const [label, path, forbiddenId] of listChecks) {
      const response = await api(cookie, path);
      assert(response.ok, `${label} yüklenemedi: ${response.status}`);
      const text = await response.text();
      assert(!text.includes(forbiddenId), `${label}: B kurumunun kaydı A kurumuna sızdı.`);
    }

    await expectRejected(cookie, "Başka kurum hastasıyla randevu oluşturma", "/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        patientId: patientB.id,
        doctorId: userA.id,
        startAt: new Date(startAt.getTime() + 86400000).toISOString(),
        endAt: new Date(endAt.getTime() + 86400000).toISOString(),
        note: injectionMarker,
      }),
    });
    await expectRejected(cookie, "Başka kurum hastası/personeliyle görev oluşturma", "/api/clinic-tasks", {
      method: "POST",
      body: JSON.stringify({ patientId: patientB.id, assignedToIds: [userB.id], title: injectionMarker }),
    });
    await expectRejected(cookie, "Başka kurum hastasıyla tahsilat oluşturma", "/api/payments", {
      method: "POST",
      body: JSON.stringify({ patientId: patientB.id, doctorId: userA.id, method: "NAKIT", amount: 909, description: injectionMarker }),
    });

    const injectedCount = await Promise.all([
      prisma.appointment.count({ where: { note: injectionMarker } }),
      prisma.clinicTask.count({ where: { title: injectionMarker } }),
      prisma.payment.count({ where: { description: injectionMarker } }),
    ]);
    assert(injectedCount.every((count) => count === 0), "Kurumlar arası ilişki içeren bir kayıt veritabanına yazıldı.");

    await expectNotFound(cookie, "Hasta okuma", `/api/patients/${patientB.id}`);
    await expectNotFound(cookie, "Hasta güncelleme", `/api/patients/${patientB.id}`, { method: "PUT", body: JSON.stringify({ fullName: "CROSS_TENANT_MUTATION" }) });
    await expectNotFound(cookie, "Hasta silme", `/api/patients/${patientB.id}`, { method: "DELETE" });

    await expectNotFound(cookie, "Randevu okuma", `/api/appointments/${appointmentB.id}`);
    await expectNotFound(cookie, "Randevu güncelleme", `/api/appointments/${appointmentB.id}`, { method: "PUT", body: JSON.stringify({ note: "CROSS_TENANT_MUTATION" }) });
    await expectNotFound(cookie, "Randevu silme", `/api/appointments/${appointmentB.id}`, { method: "DELETE" });

    await expectNotFound(cookie, "Görev güncelleme", `/api/clinic-tasks/${taskB.id}`, { method: "PUT", body: JSON.stringify({ title: "CROSS_TENANT_MUTATION" }) });
    await expectNotFound(cookie, "Görev silme", `/api/clinic-tasks/${taskB.id}`, { method: "DELETE" });

    await expectNotFound(cookie, "Ödeme güncelleme", `/api/payments/${paymentB.id}`, { method: "PATCH", body: JSON.stringify({ amount: 303, reason: "tenant test" }) });
    await expectNotFound(cookie, "Ödeme iptali", `/api/payments/${paymentB.id}`, { method: "DELETE" });

    await expectNotFound(cookie, "Stok okuma", `/api/stock/${stockB.id}`);
    await expectNotFound(cookie, "Stok güncelleme", `/api/stock/${stockB.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: `CROSS_TENANT_STOCK_${suffix}`, unit: "adet", minQuantity: 5, unitPrice: null }),
    });
    await expectNotFound(cookie, "Stok silme", `/api/stock/${stockB.id}`, { method: "DELETE" });

    const [patientBAfter, appointmentBAfter, taskBAfter, paymentBAfter, stockBAfter] = await Promise.all([
      prisma.patient.findUniqueOrThrow({ where: { id: patientB.id } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: appointmentB.id } }),
      prisma.clinicTask.findUniqueOrThrow({ where: { id: taskB.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: paymentB.id } }),
      prisma.stockItem.findUniqueOrThrow({ where: { id: stockB.id } }),
    ]);
    assert(patientBAfter.fullName === patientB.fullName && !patientBAfter.archivedAt, "B kurumu hastası değiştirildi.");
    assert(appointmentBAfter.note === appointmentB.note && appointmentBAfter.status === appointmentB.status, "B kurumu randevusu değiştirildi.");
    assert(taskBAfter.title === taskB.title && taskBAfter.status === taskB.status, "B kurumu görevi değiştirildi.");
    assert(Number(paymentBAfter.amount) === 202 && paymentBAfter.status === "ACTIVE", "B kurumu ödemesi değiştirildi.");
    assert(stockBAfter.name === stockB.name && stockBAfter.isActive, "B kurumu stok kaydı değiştirildi.");

    console.log("✓ Liste, okuma, güncelleme ve silme denemelerinde iki kurum tamamen izole kaldı.");
  } finally {
    await prisma.appointment.deleteMany({ where: { note: injectionMarker } });
    await prisma.clinicTask.deleteMany({ where: { title: injectionMarker } });
    await prisma.payment.deleteMany({ where: { description: injectionMarker } });
    if (paymentIds.length) {
      await prisma.paymentRevision.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    if (appointmentIds.length) await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    if (taskIds.length) await prisma.clinicTask.deleteMany({ where: { id: { in: taskIds } } });
    if (stockIds.length) await prisma.stockItem.deleteMany({ where: { id: { in: stockIds } } });
    if (patientIds.length) {
      await prisma.patientAccessLog.deleteMany({ where: { patientId: { in: patientIds } } });
      await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    }
    if (userIds.length) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (institutionIds.length) await prisma.institution.deleteMany({ where: { id: { in: institutionIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
