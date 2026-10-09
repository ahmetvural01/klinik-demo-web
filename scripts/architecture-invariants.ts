import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const root = process.cwd();
const prisma = new PrismaClient();
const failures: string[] = [];

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return [absolute];
  });
}

function relative(file: string) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function fail(message: string) {
  failures.push(message);
}

function requireSource(file: string, markers: string[]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${file}: eksik mimari işaret: ${marker}`);
  }
}

function enforceMutationBoundary(
  sourceFiles: string[],
  model: string,
  allowedFiles: Set<string>,
) {
  const mutationPattern = new RegExp(`\\.${model}\\.(?:create|createMany|update|updateMany|delete|deleteMany)\\s*\\(`);
  for (const file of sourceFiles) {
    const name = relative(file);
    if (mutationPattern.test(fs.readFileSync(file, "utf8")) && !allowedFiles.has(name)) {
      fail(`${name}: ${model} kaydı tanımlı muhasebe sınırı dışında değiştiriliyor`);
    }
  }
}

function scanSourceContracts() {
  const sourceFiles = walk(path.join(root, "src")).filter((file) => /\.(ts|tsx)$/.test(file));
  const routeFiles = sourceFiles.filter((file) => relative(file).startsWith("src/app/api/") && relative(file).endsWith("/route.ts"));

  const unauthenticatedRoutePrefixes = [
    "src/app/api/auth/",
    "src/app/api/public/",
    "src/app/api/webhooks/",
  ];
  const unauthenticatedRoutes = new Set([
    "src/app/api/demo-requests/route.ts",
    "src/app/api/system/health/route.ts",
  ]);
  for (const file of routeFiles) {
    const name = relative(file);
    const source = fs.readFileSync(file, "utf8");
    const mayBePublic = unauthenticatedRoutes.has(name)
      || unauthenticatedRoutePrefixes.some((prefix) => name.startsWith(prefix));
    if (!mayBePublic && !/require(?:Auth|AnyAuth|AllAuth|Superadmin)\s*\(/.test(source)) {
      fail(`${name}: API giriş noktası merkezi kimlik doğrulamayı kullanmıyor`);
    }
  }

  const branchOwnedClientModels = Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "branchId"))
    .map((model) => model.name[0].toLowerCase() + model.name.slice(1));
  const branchOwnedAlternation = branchOwnedClientModels.join("|");
  const branchOwnedModelPattern = new RegExp(
    `(?:\\bprisma|\\(prisma as any\\))\\.(?:${branchOwnedAlternation})\\b`,
  );
  const unscopedUniqueReadPattern = new RegExp(
    `(?:\\bprisma|\\(prisma as any\\))\\.(?:${branchOwnedAlternation})\\.findUnique\\s*\\(\\s*\\{\\s*where:\\s*\\{\\s*id\\s*:\\s*[^,}]+\\s*\\}`,
    "s",
  );
  const unscopedMutationPattern = new RegExp(
    `(?:\\bprisma|\\(prisma as any\\))\\.(?:${branchOwnedAlternation})\\.(?:update|delete)\\s*\\(\\s*\\{\\s*where:\\s*\\{\\s*id\\s*:\\s*[^,}]+\\s*\\}`,
    "s",
  );
  const branchContextRouteExceptions = new Set([
    "src/app/api/branches/route.ts",
    // Kurum geneli ayarlar bütün şubeler için geçerlidir; bu uçlar şube
    // kaydını yalnız kurum filtresiyle SAYAR (kişisel veri dönmez): mesai
    // daraltılınca kaç gelecek randevunun dışarıda kalacağı, tedavi türünün
    // kaç randevuda kullanıldığı, hekimin kendi gelecek randevuları.
    "src/app/api/settings/route.ts",
    "src/app/api/profile/route.ts",
    "src/app/api/treatment-types/route.ts",
    "src/app/api/treatment-types/[id]/route.ts",
  ]);
  for (const file of routeFiles) {
    const name = relative(file);
    if (name.startsWith("src/app/api/superadmin/") || name.startsWith("src/app/api/webhooks/")) continue;
    const source = fs.readFileSync(file, "utf8");
    const publicRoute = name.startsWith("src/app/api/public/");
    if (!publicRoute && !branchContextRouteExceptions.has(name)
        && branchOwnedModelPattern.test(source) && !/requireActiveBranch\s*\(/.test(source)) {
      fail(`${name}: şubeye ait model aktif şube sözleşmesi olmadan kullanılıyor`);
    }
    if (!name.startsWith("src/app/api/superadmin/") && unscopedUniqueReadPattern.test(source)) {
      fail(`${name}: şubeye ait kayıt yalnız id ile okunuyor`);
    }
    if (!name.startsWith("src/app/api/superadmin/") && unscopedMutationPattern.test(source)) {
      fail(`${name}: şubeye ait kayıt yalnız id ile değiştiriliyor`);
    }
  }

  const providerAllowlist = new Set([
    "src/lib/notification-dispatch.ts",
    "src/lib/billing-reminders.ts",
    "src/app/api/public/booking/send-code/route.ts",
  ]);
  const providerPattern = /import\s*\{[^}]*(?:sendSms|sendWhatsapp)[^}]*\}\s*from\s*["']@\/lib\/(?:sms|whatsapp)["']/s;
  for (const file of sourceFiles) {
    const name = relative(file);
    const source = fs.readFileSync(file, "utf8");
    if (providerPattern.test(source) && !providerAllowlist.has(name) &&
        !["src/lib/sms.ts", "src/lib/whatsapp.ts"].includes(name)) {
      fail(`${name}: hasta mesajı sağlayıcıya merkezi dispatch dışında erişiyor`);
    }
  }

  const historicalModels = [
    "appointment", "examination", "payment", "prescription", "taksitPlan",
    "taksit", "taksitOdeme", "stockMovement", "firmaIslem", "labOrder", "labOrderInvoice",
    "treatmentPlan", "patientPackageUsage", "patientFollowUp", "patientFollowUpEvent",
    "message", "supportTicket", "document", "treatmentStep", "purchaseItem", "reminder",
  ];
  const destructivePattern = new RegExp(`\\.(?:${historicalModels.join("|")})\\.delete(?:Many)?\\s*\\(`);
  for (const file of sourceFiles.filter((item) => !relative(item).includes("/__tests__/"))) {
    const name = relative(file);
    const source = fs.readFileSync(file, "utf8");
    if (destructivePattern.test(source)) fail(`${name}: geçmiş kaydında fiziksel silme kullanıyor`);
  }

  enforceMutationBoundary(sourceFiles, "payment", new Set([
    "src/lib/payment-ledger.ts",
    "src/app/api/demo-requests/route.ts",
    "src/app/api/superadmin/institutions/[id]/import/commit/route.ts",
  ]));
  enforceMutationBoundary(sourceFiles, "stockMovement", new Set([
    "src/lib/stock-ledger.ts",
    "src/app/api/demo-requests/route.ts",
  ]));
  enforceMutationBoundary(sourceFiles, "firmaIslem", new Set([
    "src/lib/lab-firma-integration.ts",
    "src/app/api/demo-requests/route.ts",
    "src/app/api/firma/[id]/islemler/route.ts",
    "src/app/api/firma/[id]/islemler/[iid]/route.ts",
    "src/app/api/purchases/route.ts",
    "src/app/api/purchases/[id]/route.ts",
    "src/app/api/purchases/[id]/receive/route.ts",
    "src/app/api/purchases/[id]/cancel/route.ts",
  ]));

  // Süperadmin'in kliniğe gizli girişi klinik personeline (yönetici dahil)
  // görünmemeli. Kliniğin ekranlarına giden her işlem kaydı (AuditLog) okuması
  // ortak filtreyi kullanır (src/lib/audit-visibility.ts); platform uçları
  // (src/app/api/superadmin/) bilerek filtresiz okur.
  const auditReadPattern = /\.auditLog\.(?:findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/;
  const auditReadAllowlist = new Set([
    "src/app/api/sms/route.ts", // yalnız gönderilen SMS sayısı döner; kimlik/ad taşımaz
  ]);
  const accessLogCreatePattern = /\.patientAccessLog\.create\s*\(/;
  for (const file of sourceFiles) {
    const name = relative(file);
    const source = fs.readFileSync(file, "utf8");
    if (
      auditReadPattern.test(source)
      && !name.startsWith("src/app/api/superadmin/")
      && !auditReadAllowlist.has(name)
      && !source.includes("CLINIC_HIDDEN_AUDIT_NOT")
    ) {
      fail(`${name}: işlem kaydı okuması süperadmin/gizli giriş kayıtlarını klinikten gizlemiyor (src/lib/audit-visibility.ts)`);
    }
    // Hasta erişim günlüğü kliniğin KVKK kaydıdır: süperadmin oturumunda
    // (Rol Görünümü açıkken de) yöneticinin adına sahte erişim yazılmamalı.
    if (accessLogCreatePattern.test(source) && !source.includes("ghostSession")) {
      fail(`${name}: hasta erişim günlüğü süperadmin gizli oturumunda (ghostSession) yazılıyor`);
    }
  }

  const storagePatterns = [
    /localStorage\.(?:getItem|setItem|removeItem)\(["']clinic-unread-messages["']\)/,
    /localStorage\.(?:getItem|setItem|removeItem)\(["']clinic-messages-last-seen["']\)/,
    /localStorage\.(?:getItem|setItem|removeItem)\(["']dental-active-price-list["']\)/,
    /localStorage\.(?:getItem|setItem|removeItem)\(["']panel-alerts:/,
    /`hasta-takip:dashboard:\$\{rangeDays\}`/,
    /getHomeCacheKey\(\)/,
  ];
  for (const file of sourceFiles) {
    const name = relative(file);
    const source = fs.readFileSync(file, "utf8");
    if (storagePatterns.some((pattern) => pattern.test(source))) {
      fail(`${name}: kurum/şube kapsamı olmayan operasyonel tarayıcı önbelleği kullanıyor`);
    }
  }

  requireSource("src/lib/api.ts", ["requireAuth", "hasEffectivePermission", "user.actualRole === \"SUPERADMIN\"", "permission !== \"superadmin\""]);
  requireSource("src/lib/branch-context.ts", ["requireActiveBranch", "branchId"]);
  requireSource("src/lib/payment-ledger.ts", ["createIntegratedPayment", "deleteIntegratedPayment"]);
  requireSource("src/lib/stock-ledger.ts", ["applyStockMovement"]);
  requireSource("src/lib/notification-dispatch.ts", [
    "dispatchPatientMessage",
    "institutionId",
    "branchId",
    "Gönderimin sonucu kesinleşmedi",
    "retryable: false",
  ]);
  requireSource("src/lib/sms-jobs.ts", [
    "result.failedRecipients.filter((item) => item.retryable)",
  ]);
  requireSource("src/app/api/webhooks/whatsapp/route.ts", ["allowedPreviousStatuses", "providerMessageId", "institutionId"]);
  requireSource("src/app/api/sms/bulk/route.ts", ["requestId", "packageId: requestId"]);
  requireSource("src/components/layout/panel-cache-reset.tsx", ["PanelCacheReset", "clinic-unread-messages:", "klinikcep-active-price-list:"]);
  for (const file of [
    "src/app/(panel)/hasta-takip/page.tsx",
    "src/app/(panel)/log/page.tsx",
    "src/app/(panel)/rapor/page.tsx",
    "src/app/(panel)/hasta-detay/hasta-detay-content.tsx",
    "src/app/(panel)/sms/_tabs/HistoryTab.tsx",
    "src/app/(panel)/sms/_tabs/SendRecipientList.tsx",
    "src/app/superadmin/invoices/page.tsx",
  ]) requireSource(file, ["useLatestRequest"]);
}

function scanPrismaOwnershipContracts() {
  const models = Prisma.dmmf.datamodel.models;
  const tenantModels = new Set(
    models.filter((model) => model.fields.some((field) => field.name === "institutionId")).map((model) => model.name),
  );
  const branchModels = new Set(
    models.filter((model) => model.fields.some((field) => field.name === "branchId")).map((model) => model.name),
  );
  const intentionalTenantExceptions = new Set([
    "PatientAccessLog.user",
    "PatientFollowUp.createdBy",
    "PatientFollowUpEvent.createdBy",
    "PatientFollowUpEvent.updatedBy",
    "PatientConsent.template",
    "PatientConsent.createdBy",
    "SupportTicket.user",
    "Document.uploadedBy",
  ]);
  const intentionallyUnscopedModels = new Set([
    "Institution.owner",
    "SuperadminPermission.user",
    "Profile.user",
    "AuditLog.user",
  ]);

  for (const model of models) {
    const hasInstitution = tenantModels.has(model.name);
    for (const relation of model.fields.filter((field) => field.kind === "object" && field.relationFromFields?.length)) {
      const key = `${model.name}.${relation.name}`;
      const relationFields = relation.relationFromFields || [];
      if (hasInstitution && tenantModels.has(relation.type)
          && !relationFields.includes("institutionId")
          && !intentionalTenantExceptions.has(key)) {
        fail(`${key}: tenant ilişkisi institutionId bileşik anahtarını kullanmıyor`);
      }
      if (branchModels.has(model.name) && branchModels.has(relation.type)
          && !relationFields.includes("branchId")) {
        fail(`${key}: şube ilişkisi branchId bileşik anahtarını kullanmıyor`);
      }
      if (!hasInstitution && tenantModels.has(relation.type) && !intentionallyUnscopedModels.has(key)) {
        fail(`${key}: tenant modeline bağlanan operasyonel çocuk kayıt kendi institutionId alanını taşımıyor`);
      }
    }
  }
}

async function scanDatabaseContracts() {
  const requiredConstraints = [
    "Appointment_patientId_institutionId_branchId_fkey",
    "Appointment_clinicUnitId_institutionId_branchId_fkey",
    "Payment_patientId_institutionId_branchId_fkey",
    "LabOrder_patientId_institutionId_branchId_fkey",
    "LabOrder_firmaId_institutionId_branchId_fkey",
    "TreatmentPlan_patientId_institutionId_branchId_fkey",
    "TaksitPlan_patientId_institutionId_branchId_fkey",
    "Purchase_firmaId_institutionId_branchId_fkey",
    "PatientFollowUp_patientId_institutionId_branchId_fkey",
    "Reminder_patientId_institutionId_branchId_fkey",
    "Appointment_doctorId_institutionId_fkey",
    "Payment_doctorId_institutionId_fkey",
    "LabOrder_doctorId_institutionId_fkey",
    "ClinicTask_assignedToId_institutionId_fkey",
    "WhatsappMessage_patientId_institutionId_branchId_fkey",
    "UserBranch_userId_institutionId_fkey",
    "DoctorRateHistory_doctorId_institutionId_fkey",
    "PatientConsent_patientId_institutionId_fkey",
    "Document_patientId_institutionId_fkey",
    "PatientPackage_definitionId_institutionId_fkey",
    "ClinicTaskAssignee_taskId_institutionId_branchId_fkey",
    "PatientPackageUsage_appointmentId_institutionId_branchId_fkey",
    "LabTrip_labOrderId_institutionId_branchId_fkey",
    "LabOrderInvoice_labOrderId_institutionId_branchId_fkey",
    "PurchaseItem_stockItemId_institutionId_branchId_fkey",
    "TaksitOdeme_paymentId_institutionId_branchId_fkey",
    "FirmaPaymentAllocation_firmaId_institutionId_branchId_fkey",
    "BirthdaySmsLog_patientId_institutionId_branchId_fkey",
    "TaksitReminderLog_taksitId_institutionId_branchId_fkey",
  ];
  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint WHERE conname = ANY(${requiredConstraints}::text[])
  `;
  const present = new Set(constraints.map((row) => row.conname));
  for (const constraint of requiredConstraints) {
    if (!present.has(constraint)) fail(`Veritabanı kapsam kısıtı eksik: ${constraint}`);
  }

  const mismatchChecks: Array<{ label: string; sql: string }> = [
    {
      label: "randevu-hasta",
      sql: `SELECT COUNT(*)::int AS count FROM "Appointment" a JOIN "Patient" p ON p.id=a."patientId" WHERE a."institutionId"<>p."institutionId" OR a."branchId"<>p."homeBranchId"`,
    },
    {
      label: "ödeme-hasta",
      sql: `SELECT COUNT(*)::int AS count FROM "Payment" x JOIN "Patient" p ON p.id=x."patientId" WHERE x."institutionId"<>p."institutionId" OR x."branchId"<>p."homeBranchId"`,
    },
    {
      label: "laboratuvar-hasta",
      sql: `SELECT COUNT(*)::int AS count FROM "LabOrder" x JOIN "Patient" p ON p.id=x."patientId" WHERE x."institutionId"<>p."institutionId" OR x."branchId"<>p."homeBranchId"`,
    },
    {
      label: "satınalma-firma",
      sql: `SELECT COUNT(*)::int AS count FROM "Purchase" x JOIN "Firma" f ON f.id=x."firmaId" WHERE x."institutionId"<>f."institutionId" OR x."branchId"<>f."branchId"`,
    },
  ];
  for (const check of mismatchChecks) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(check.sql);
    if (Number(rows[0]?.count || 0) !== 0) fail(`${check.label}: kapsam dışı ilişkisel kayıt bulundu`);
  }
}

async function main() {
  scanSourceContracts();
  scanPrismaOwnershipContracts();
  await scanDatabaseContracts();
  if (failures.length) {
    console.error(failures.map((item) => `- ${item}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Architecture invariants: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
