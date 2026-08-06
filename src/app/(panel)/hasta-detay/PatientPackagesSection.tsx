"use client";

import { useEffect, useRef, useState } from "react";
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
  const [usingPackageId, setUsingPackageId] = useState<string | null>(null);
  const [cancellingPackageId, setCancellingPackageId] = useState<string | null>(null);
  const sellRequestKeyRef = useRef("");
  const usageRequestKeysRef = useRef<Record<string, string>>({});

  const [definitionId, setDefinitionId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customSessions, setCustomSessions] = useState("6");
  const [customPrice, setCustomPrice] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [pesnat, setPesnat] = useState("");
  const [taksitSayisi, setTaksitSayisi] = useState("2");

  const load = async () => {
    setLoading(true);
    try {
      const [pkgRes, defRes] = await Promise.all([
        fetch(`/api/patient-packages?patientId=${encodeURIComponent(patientId)}`),
        fetch("/api/package-definitions"),
      ]);
      const [pkgData, defData] = await Promise.all([
        pkgRes.json().catch(() => null),
        defRes.json().catch(() => null),
      ]);
      if (!pkgRes.ok || !Array.isArray(pkgData)) throw new Error("Hasta paketleri yüklenemedi.");
      setPackages(pkgData);
      if (!defRes.ok || !Array.isArray(defData)) {
        showToastSafe({ title: "Şablonlar yüklenemedi", message: "Mevcut paketler korundu; paket şablonlarını yenilemek için tekrar deneyin.", type: "error" });
      } else {
        setDefinitions(defData.filter((d: PackageDefinition) => d.isActive));
      }
    } catch (error) {
      showToastSafe({ title: "Paketler yüklenemedi", message: error instanceof Error ? error.message : "Bağlantıyı kontrol edip tekrar deneyin.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [patientId]);

  const selectedDefinition = definitions.find((d) => d.id === definitionId) || null;
  const price = selectedDefinition ? Number(selectedDefinition.price) : Number(customPrice) || 0;
  const remaining = Math.max(0, price - (Number(pesnat) || 0));

  const sellDirty = Boolean(
    definitionId
    || customName.trim()
    || customSessions !== "6"
    || customPrice
    || (doctorId && doctorId !== (doctorOptions[0]?.id || ""))
    || pesnat
    || taksitSayisi !== "2",
  );

  const openSell = () => {
    sellRequestKeyRef.current = crypto.randomUUID();
    setDefinitionId("");
    setCustomName(""); setCustomSessions("6"); setCustomPrice("");
    setDoctorId(doctorOptions[0]?.id || "");
    setPesnat("");
    setTaksitSayisi("2");
    setShowSell(true);
  };

  const closeSell = () => {
    sellRequestKeyRef.current = "";
    setShowSell(false);
    setDefinitionId("");
    setCustomName("");
    setCustomSessions("6");
    setCustomPrice("");
    setDoctorId("");
    setPesnat("");
    setTaksitSayisi("2");
  };

  const sell = async () => {
    if (!doctorId) { showToastSafe({ title: "Eksik bilgi", message: "Doktor seçin", type: "error" }); return; }
    if (!definitionId && !customName.trim()) { showToastSafe({ title: "Eksik bilgi", message: "Paket şablonu seçin veya özel paket adı girin", type: "error" }); return; }
    if (!definitionId && (!Number.isInteger(Number(customSessions)) || Number(customSessions) <= 0 || Number(customSessions) > 10_000)) {
      showToastSafe({ title: "Geçersiz bilgi", message: "Özel paket için geçerli bir seans sayısı girin", type: "error" });
      return;
    }
    if (!definitionId && (customPrice === "" || !Number.isFinite(Number(customPrice)) || Number(customPrice) <= 0 || Number(customPrice) > 99_999_999.99)) {
      showToastSafe({ title: "Geçersiz bilgi", message: "Özel paket için geçerli bir fiyat girin", type: "error" });
      return;
    }
    const deposit = pesnat === "" ? 0 : Number(pesnat);
    if (!Number.isFinite(deposit) || deposit < 0 || deposit > price) {
      showToastSafe({ title: "Geçersiz bilgi", message: "Peşinat toplam fiyatı aşamaz", type: "error" });
      return;
    }
    if (remaining > 0 && (!Number.isInteger(Number(taksitSayisi)) || Number(taksitSayisi) <= 0 || Number(taksitSayisi) > 100)) {
      showToastSafe({ title: "Geçersiz bilgi", message: "Kalan tutar için geçerli bir taksit sayısı girin", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/patient-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": sellRequestKeyRef.current || (sellRequestKeyRef.current = crypto.randomUUID()) },
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
      closeSell();
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Paket satılamadı.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const consumeSession = async (pkg: PatientPackage) => {
    if (usingPackageId) return;
    if (!(await confirmDialog({ message: `${pkg.name} paketinden 1 seans kullanılsın mı? (${pkg.sessionsUsed}/${pkg.sessionsTotal})`, confirmText: "Seans Kullan" }))) return;
    setUsingPackageId(pkg.id);
    const requestKey = usageRequestKeysRef.current[pkg.id] || (usageRequestKeysRef.current[pkg.id] = crypto.randomUUID());
    try {
      const res = await fetch(`/api/patient-packages/${pkg.id}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "İşlem yapılamadı.");
      delete usageRequestKeysRef.current[pkg.id];
      showToastSafe({ title: "Seans kullanıldı", message: `${pkg.name}: ${data.sessionsUsed}/${data.sessionsTotal}`, type: "success" });
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "İşlem yapılamadı. Aynı işlem güvenle tekrar denenebilir.", type: "error" });
    } finally {
      setUsingPackageId(null);
    }
  };

  const cancelPackage = async (pkg: PatientPackage) => {
    if (cancellingPackageId) return;
    if (!(await confirmDialog({ message: `${pkg.name} paketi iptal edilsin mi? Bağlı ödeme/taksit kaydı ayrıca muhasebeden düzenlenmeli.`, danger: true, confirmText: "İptal Et" }))) return;
    setCancellingPackageId(pkg.id);
    try {
      const res = await fetch(`/api/patient-packages/${pkg.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "İptal edilemedi.");
      showToastSafe({ title: "İptal edildi", message: `${pkg.name} iptal edildi.`, type: "success" });
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "İptal edilemedi.", type: "error" });
    } finally {
      setCancellingPackageId(null);
    }
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
                      loading={usingPackageId === pkg.id}
                      disabled={pkg.effectiveStatus !== "AKTIF" || Boolean(usingPackageId) || Boolean(cancellingPackageId)}
                      onClick={() => void consumeSession(pkg)}
                    >
                      Seans Kullan
                    </Button>
                    {pkg.effectiveStatus !== "IPTAL" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={cancellingPackageId === pkg.id}
                        disabled={Boolean(usingPackageId) || Boolean(cancellingPackageId)}
                        onClick={() => void cancelPackage(pkg)}
                      >İptal</Button>
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
        onClose={closeSell}
        isDirty={sellDirty}
        title="Yeni Paket Sat"
        footer={(
          <>
            <Button variant="secondary" onClick={closeSell}>Vazgeç</Button>
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
                <input type="number" min={1} max={10000} value={customSessions} onChange={(e) => setCustomSessions(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </FormField>
              <FormField label="Fiyat (₺)" required>
                <input type="number" min={0.01} max={99999999.99} step="0.01" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
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
                <input type="number" min={1} max={100} value={taksitSayisi} onChange={(e) => setTaksitSayisi(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
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
