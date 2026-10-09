import assert from "node:assert/strict";
import { clientMutation, runRecordBatch } from "../src/lib/client-mutation";
import { parseReportDateInput, reportQuickRange } from "../src/lib/report-date-range";

async function main() {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  try {
    globalThis.fetch = async () => { attempts++; throw new TypeError("Failed to fetch"); };
    await assert.rejects(clientMutation("/api/firma", { method: "POST" }, "Kaydedilemedi"), /Bağlantı kurulamadı/);
    assert.equal(attempts, 1, "Bir mutasyon kendiliğinden tekrar gönderilmemeli");
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "Yetkiniz yok" }), { status: 403 });
    await assert.rejects(clientMutation("/api/firma", { method: "POST" }, "Kaydedilemedi"), /Yetkiniz yok/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "Geçersiz tutar" }), { status: 400 });
    await assert.rejects(clientMutation("/api/taksit-plani", { method: "POST" }, "Kaydedilemedi"), /Geçersiz tutar/);
    globalThis.fetch = async () => new Response("<html>Unavailable</html>", { status: 503 });
    await assert.rejects(clientMutation("/api/firma", { method: "POST" }, "Kaydedilemedi"), /Kaydedilemedi/);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await clientMutation("/api/firma", { method: "POST" }, "Kaydedilemedi");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const visited: string[] = [];
  const result = await runRecordBatch(["a", "b", "c", "d"], async id => {
    visited.push(id);
    if (id === "b") throw new TypeError("Network failure");
    if (id === "d") throw new Error("Permission denied");
  });
  assert.deepEqual(visited, ["a", "b", "c", "d"]);
  assert.deepEqual(result, { succeeded: ["a", "c"], failed: ["b", "d"] });
  const edits = { a: "bir", b: "iki", c: "üç", d: "dört" };
  const remaining = Object.fromEntries(Object.entries(edits).filter(([id]) => !result.succeeded.includes(id)));
  assert.deepEqual(remaining, { b: "iki", d: "dört" });

  const now = new Date("2026-12-31T21:15:00Z"); // Türkiye'de 1 Ocak
  assert.deepEqual(reportQuickRange("bugun", now), { from: "2027-01-01T00:00", to: "2027-01-01T23:59" });
  assert.deepEqual(reportQuickRange("ay", now), { from: "2027-01-01T00:00", to: "2027-01-01T23:59" });
  assert.deepEqual(reportQuickRange("yil", now), { from: "2027-01-01T00:00", to: "2027-01-01T23:59" });
  assert.deepEqual(reportQuickRange("hafta", new Date("2026-03-01T12:00:00Z")), { from: "2026-02-23T00:00", to: "2026-03-01T23:59" });
  assert.equal(parseReportDateInput("2027-01-01T00:00")?.toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(parseReportDateInput("2027-01-01T23:59", true)?.toISOString(), "2027-01-01T20:59:59.999Z");
  for (const value of ["2026-02-30T12:00", "2026-01-01T24:00", "2026-01-01T12:60", "geçersiz"]) {
    assert.throws(() => parseReportDateInput(value), /Geçerli bir rapor/);
  }
  assert.equal(parseReportDateInput(null), undefined);
  process.stdout.write("PASS: ağ/sunucu hataları, tek gönderim, kısmi toplu işlem ve Türkiye rapor tarih sınırları.\n");
}

main().catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
