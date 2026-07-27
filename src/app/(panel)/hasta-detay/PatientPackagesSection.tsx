"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";

type DoctorLite = { id: string; fullName: string };

type PackageDefinition = {
  id: string;
  name: string;
  treatmentType: string | null;
  sessionCount: number;
  price: number | string;
  validityDays: number;
  isActive: boolean;
};

type PatientPackage = {
  id: string;
  name: string;
  sessionsTotal: number;
  sessionsUsed: number;
  totalPrice: number | string;
  purchasedAt: string;
  expiresAt: string | null;
  status: "AKTIF" | "TAMAMLANDI" | "SURESI_DOLDU" | "IPTAL";
  effectiveStatus: "AKTIF" | "TAMAMLANDI" | "SURESI_DOLDU" | "IPTAL";
  note: string | null;
  doctor: { id: string; fullName: string } | null;
  definition: { id: string; name: string } | null;
  usages: { id: string; usedAt: string; note: string | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  AKTIF: "Aktif",
  TAMAMLANDI: "Tamamlandı",
  SURESI_DOLDU: "Süresi Doldu",
  IPTAL: "İptal",
};
const STATUS_TONE: Record<string, "success" | "neutral" | "warning" | "critical"> = {
  AKTIF: "success",
  TAMAMLANDI: "neutral",
  SURESI_DOLDU: "warning",
  IPTAL: "critical",
};

export function PatientPackagesSection({ patientId, doctorOptions }: { patientId: string; doctorOptions: DoctorLite[] }) {
  const [packages, setPackages] = useState<PatientPackage[]>([]);
  const [definitions, setDefinitions] = useState<PackageDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSell, setShowSell] = useState(false);
  const [saving, setSaving] = useState(false);

  const [definitionId, setDefinitionId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customSessions, setCustomSessions] = useState("6");
  const [customPrice, setCustomPrice] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [pesnat, setPesnat] = useState("");
  const [taksitSayisi, setTaksitSayisi] = useState("2");

  const load = async () => {
    setLoading(true);
    const [pkgRes, defRes] = await Promise.all([
      fetch(`/api/patient-packages?patientId=${patientId}`).catch(() => null),
      fetch("/api/package-definitions").catch(() => null),
    ]);
    const pkgData = await pkgRes?.json().catch(() => []);
    const defData = await defRes?.json().catch(() => []);
    setPackages(Array.isArray(pkgData) ? pkgData : []);
    setDefinitions(Array.isArray(defData) ? defData.filter((d: PackageDefinition) => d.isActive) : []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [patientId]);

  const selectedDefinition = definitions.find((d) => d.id === definitionId) || null;
  const price = selectedDefinition ? Number(selectedDefinition.price) : Number(customPrice) || 0;
  const remaining = Math.max(0, price - (Number(pesnat) || 0));

  const openSell = () => {
    setDefinitionId("");
    setCustomName(""); setCustomSessions("6"); setCustomPrice("");
    setDoctorId(doctorOptions[0]?.id || "");
    setPesnat("");
    setTaksitSayisi("2");
    setShowSell(true);
  };

  const sell = async () => {
    if (!doctorId) { showToastSafe({ title: "Eksik bilgi", message: "Doktor seçin", type: "error" }); return; }
    if (!definitionId && !customName.trim()) { showToastSafe({ title: "Eksik bilgi", message: "Paket şablonu seçin veya özel paket adı girin", type: "error" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/patient-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId, doctorId,
          definitionId: definitionId || undefined,
          name: definitionId ? undefined : customName.trim(),
          sessionCount: definitionId ? undefined : Number(customSessions),
          price: definitionId ? undefined : Number(customPrice),
          pesnat: pesnat === "" ? undefined : Number(pesnat),
          taksitSayisi: Number(taksitSayisi),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Paket satılamadı.");
      showToastSafe({ title: "Satıldı", message: "Paket hasta kartına eklendi.", type: "success" });
      setShowSell(false);
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Paket satılamadı.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const consumeSession = async (pkg: PatientPackage) => {
    if (!(await confirmDialog({ message: `${pkg.name} paketinden 1 seans kullanılsın mı? (${pkg.sessionsUsed}/${pkg.sessionsTotal})`, confirmText: "Seans Kullan" }))) return;
    const res = await fetch(`/api/patient-packages/${pkg.id}/use`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToastSafe({ title: "Hata", message: data?.message || "İşlem yapılamadı.", type: "error" }); return; }
    showToastSafe({ title: "Seans kullanıldı", message: `${pkg.name}: ${data.sessionsUsed}/${data.sessionsTotal}`, type: "success" });
    await load();
  };

  const cancelPackage = async (pkg: PatientPackage) => {
    if (!(await confirmDialog({ message: `${pkg.name} paketi iptal edilsin mi? Bağlı ödeme/taksit kaydı ayrıca muhasebeden düzenlenmeli.`, danger: true, confirmText: "İptal Et" }))) return;
    const res = await fetch(`/api/patient-packages/${pkg.id}`, { method: "DELETE" });
    if (!res.ok) { showToastSafe({ title: "Hata", message: "İptal edilemedi.", type: "error" }); return; }
    showToastSafe({ title: "İptal edildi", message: `${pkg.name} iptal edildi.`, type: "success" });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Paketler</h3>
        <Button size="sm" onClick={openSell}>Yeni Paket Sat</Button>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-400">Yükleniyor…</div>
      ) : packages.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-400">Bu hastaya henüz paket satılmamış</div>
      ) : (
        <div className="space-y-2">
          {packages.map((pkg) => {
            const remainingSessions = pkg.sessionsTotal - pkg.sessionsUsed;
            const pct = Math.min(100, Math.round((pkg.sessionsUsed / pkg.sessionsTotal) * 100));
            return (
              <div key={pkg.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">{pkg.name}</p>
                      <Badge tone={STATUS_TONE[pkg.effectiveStatus]}>{STATUS_LABEL[pkg.effectiveStatus]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {pkg.doctor?.fullName || "-"} · ₺{Number(pkg.totalPrice).toLocaleString("tr-TR")} ·
                      {" "}Satış: {new Date(pkg.purchasedAt).toLocaleDateString("tr-TR")}
                      {pkg.expiresAt ? ` · Son geçerlilik: ${new Date(pkg.expiresAt).toLocaleDateString("tr-TR")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pkg.effectiveStatus !== "AKTIF"}
                      onClick={() => void consumeSession(pkg)}
                    >
                      Seans Kullan
                    </Button>
                    {pkg.effectiveStatus !== "IPTAL" && (
                      <Button size="sm" variant="ghost" onClick={() => void cancelPackage(pkg)}>İptal</Button>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{pkg.sessionsUsed} / {pkg.sessionsTotal} seans kullanıldı</span>
                    <span>{remainingSessions} seans kaldı</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showSell}
        onClose={() => setShowSell(false)}
        title="Yeni Paket Sat"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowSell(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={sell}>Paketi Sat</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField label="Paket Şablonu">
            <select value={definitionId} onChange={(e) => setDefinitionId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="">— Özel paket (aşağıda tanımla) —</option>
              {definitions.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.sessionCount} seans, ₺{Number(d.price).toLocaleString("tr-TR")})</option>
              ))}
            </select>
          </FormField>

          {!definitionId && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Paket Adı" required>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </FormField>
              <FormField label="Seans Sayısı" required>
                <input type="number" min={1} value={customSessions} onChange={(e) => setCustomSessions(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </FormField>
              <FormField label="Fiyat (₺)" required>
                <input type="number" min={0} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </FormField>
            </div>
          )}

          <FormField label="Satışı Yapan Doktor" required>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="">— Seçin —</option>
              {doctorOptions.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Peşinat (₺)" hint={`Toplam ₺${price.toLocaleString("tr-TR")} — boş bırakılırsa tamamı peşin alınır`}>
              <input type="number" min={0} max={price || undefined} value={pesnat} onChange={(e) => setPesnat(e.target.value)} placeholder={String(price || "")} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            {remaining > 0 && (
              <FormField label="Kalan Tutar Taksit Sayısı">
                <input type="number" min={1} value={taksitSayisi} onChange={(e) => setTaksitSayisi(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </FormField>
            )}
          </div>
          {remaining > 0 && (
            <p className="text-xs text-slate-500">Kalan ₺{remaining.toLocaleString("tr-TR")} tutar için otomatik olarak {taksitSayisi} taksitlik bir plan oluşturulacak (Finans &gt; Taksitler altında görünür).</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
