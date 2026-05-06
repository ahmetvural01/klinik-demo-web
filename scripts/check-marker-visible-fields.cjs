const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const m = "[DEMO_PAKET_20260506]";
(async () => {
  const checks = [
    ["user", "fullName"],
    ["patient", "fullName"],
    ["patientFollowUp", "note"],
    ["firma", "name"],
    ["stockItem", "supplier"],
    ["appointment", "note"],
    ["examination", "note"],
    ["payment", "description"],
    ["treatmentPlan", "title"],
    ["labOrder", "notes"],
    ["supportTicket", "subject"],
    ["message", "text"],
    ["announcement", "text"],
    ["advertisement", "title"],
    ["invoice", "description"]
  ];

  const out = {};
  for (const [model, field] of checks) {
    const c = await prisma[model].count({ where: { [field]: { contains: m } } });
    out[`${model}.${field}`] = c;
  }
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
})();
