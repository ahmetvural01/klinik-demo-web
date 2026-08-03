import { spawnSync } from "node:child_process";

/**
 * Pilot öncesi tek komutluk kapı: mevcut script'leri (test mantığını
 * tekrar yazmadan) sırayla çalıştırır, ilk başarısızlıkta durur.
 * Kullanım: npm run pilot:smoke
 */
const steps = [
  { name: "typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { name: "lint", cmd: "npm", args: ["run", "lint"] },
  { name: "build", cmd: "npm", args: ["run", "build"] },
  { name: "git diff --check", cmd: "git", args: ["diff", "--check"] },
  { name: "role permission test", cmd: "npm", args: ["run", "test:role-permissions"] },
  { name: "firma cancel race test", cmd: "npm", args: ["run", "test:firma-islem-cancel-race"] },
  { name: "stock idempotency test", cmd: "npm", args: ["run", "test:stock-idempotency"] },
  { name: "taksit quick-pay ledger test", cmd: "npm", args: ["run", "test:taksit-quick-pay-ledger"] },
  {
    name: "production env preflight",
    cmd: "npm",
    args: ["run", "preflight:prod"],
    optional: true,
    optionalNote:
      "PREFLIGHT_BASE_URL/APP_URL çalışan bir sunucuya işaret etmiyorsa veya prod env değişkenleri yerelde tanımlı değilse bu adım BEKLENEN şekilde başarısız olur — gerçek deploy ortamında zorunludur, yerel geliştirmede bilgi amaçlıdır.",
  },
];

const results = [];
let hardFailure = false;

for (const step of steps) {
  process.stdout.write(`\n=== ${step.name} ===\n`);
  // Argümanlar bu dosyada sabit kodlanmış (kullanıcı girdisi değil), tek bir
  // komut satırı string'i olarak geçirilip shell:true kullanmak, args
  // dizisini shell:true ile birlikte vermenin tetiklediği Node uyarısını
  // (DEP0190) güvenli şekilde önler.
  const res = spawnSync([step.cmd, ...step.args].join(" "), { stdio: "inherit", shell: true });
  const ok = res.status === 0;
  results.push({ name: step.name, ok, optional: Boolean(step.optional) });
  if (!ok && step.optionalNote) {
    process.stdout.write(`[bilgi] ${step.optionalNote}\n`);
  }
  if (!ok && !step.optional) {
    hardFailure = true;
    break;
  }
}

process.stdout.write("\n\n=== ÖZET ===\n");
for (const r of results) {
  const label = r.ok ? "GEÇTİ" : r.optional ? "ATLANDI/BAŞARISIZ (opsiyonel)" : "BAŞARISIZ";
  process.stdout.write(`${r.ok ? "✓" : "✗"} ${r.name} — ${label}\n`);
}

if (hardFailure) {
  process.stdout.write("\nSMOKE TEST BAŞARISIZ — pilot yayına engel bir adım var, yukarıdaki çıktıya bakın.\n");
  process.exit(1);
}

process.stdout.write("\nTüm zorunlu adımlar geçti.\n");
