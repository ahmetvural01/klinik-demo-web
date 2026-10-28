"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import { Disclosure } from "@/components/ui/Disclosure";
import { StepList, type StepItem, type StepStatus } from "@/components/ui/StepList";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { FormSkeleton, TableSkeleton } from "@/components/ui/PageSkeleton";
import { showToastSafe } from "@/lib/toast-client";
import { adsTxtLine, normalizeAdSlotId, normalizePublisherId } from "@/lib/panel-ads";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type AdConfig = { enabled: boolean; publisherId: string; slotId: string };
type ClinicRow = { id: string; name: string; isActive: boolean; isDemo: boolean; adsEnabled: boolean };
type AdsResponse = { config: AdConfig; institutions: ClinicRow[] };
type FieldKey = "publisherId" | "slotId";

const ADSENSE_URL = "https://adsense.google.com";

// Sayfanın açıldığı adres (Google onayı için alan adı denetimi). Sunucuda boş.
const noSubscribe = () => () => {};
function useHostname() {
  return useSyncExternalStore(noSubscribe, () => window.location.hostname, () => "");
}

function hostKind(hostname: string): "render" | "local" | "own" {
  if (hostname.endsWith(".onrender.com")) return "render";
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || /^[\d.:]+$/.test(hostname)) return "local";
  return "own";
}

function validate(form: AdConfig): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (form.publisherId.trim() && !normalizePublisherId(form.publisherId)) {
    errors.publisherId = "ca-pub- ve 16 rakamdan oluşur (ör. ca-pub-1234567890123456).";
  } else if (form.enabled && !form.publisherId.trim()) {
    errors.publisherId = "Reklamları açmak için yayıncı kimliğini girin.";
  }
  if (form.slotId.trim() && !normalizeAdSlotId(form.slotId)) {
    errors.slotId = "Yalnız rakamdan oluşur (ör. 1234567890).";
  } else if (form.enabled && !form.slotId.trim()) {
    errors.slotId = "Reklamları açmak için reklam birimi kimliğini girin.";
  }
  return errors;
}

/**
 * Süperadmin › Reklamlar. Klinik panelindeki küçük reklam alanlarını tek
 * sağlayıcı Google AdSense doldurur; elle reklam satılmaz. Burada: kurulum
 * adımları, AdSense kimlikleri + platform anahtarı ve kliniğe göre anahtar.
 * Kural (hangi ekranda, kimde gösterilir): src/lib/panel-ads.ts.
 */
export default function AdsPage() {
  const hostname = useHostname();
  const [saved, setSaved] = useState<AdConfig | null>(null);
  const [form, setForm] = useState<AdConfig>({ enabled: false, publisherId: "", slotId: "" });
  const [rows, setRows] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tried, setTried] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<AdsResponse>("/api/superadmin/ads", "Reklam ayarları yüklenemedi.", controller.signal)
      .then((data) => {
        const config = {
          enabled: Boolean(data?.config?.enabled),
          publisherId: data?.config?.publisherId ?? "",
          slotId: data?.config?.slotId ?? "",
        };
        setSaved(config);
        setForm(config);
        setRows(Array.isArray(data?.institutions) ? data.institutions : []);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Reklam ayarları yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const setField = <K extends keyof AdConfig>(key: K, value: AdConfig[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // Alan hataları ilk kaydetme denemesinden sonra, alanın altında (sunucu aynı kuralı uygular).
  const errors = tried ? validate(form) : {};

  const save = async () => {
    setTried(true);
    setSaveError(null);
    if (Object.keys(validate(form)).length > 0) return;
    setSaving(true);
    try {
      const payload = {
        enabled: form.enabled,
        publisherId: form.publisherId.trim() ? normalizePublisherId(form.publisherId) : "",
        slotId: form.slotId.trim() ? normalizeAdSlotId(form.slotId) : "",
      };
      const data = await saSend<{ config: AdConfig }>("/api/superadmin/ads", "PUT", payload, "Reklam ayarı kaydedilemedi.");
      const next = { enabled: data.config.enabled, publisherId: data.config.publisherId, slotId: data.config.slotId };
      setSaved(next);
      setForm(next);
      setTried(false);
      showToastSafe({ type: "success", message: "Reklam ayarı kaydedildi." });
    } catch (error) {
      setSaveError(errorMessage(error, "Reklam ayarı kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const toggleClinic = async (row: ClinicRow, adsEnabled: boolean) => {
    // Anında kaydeder; hata olursa anahtar eski haline döner (sözleşme §4.2).
    setBusyIds((current) => new Set(current).add(row.id));
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, adsEnabled } : item)));
    try {
      await saSend("/api/superadmin/ads", "PATCH", { institutionId: row.id, adsEnabled }, "Değişiklik kaydedilemedi.");
    } catch (error) {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, adsEnabled: !adsEnabled } : item)));
      showToastSafe({ type: "error", message: `${row.name}: ${errorMessage(error, "Değişiklik kaydedilemedi.")}` });
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return q ? rows.filter((row) => row.name.toLocaleLowerCase("tr-TR").includes(q)) : rows;
  }, [rows, query]);
  const openCount = rows.filter((row) => row.adsEnabled && !row.isDemo).length;

  const savedPublisher = saved?.publisherId ?? "";
  const savedSlot = saved?.slotId ?? "";
  const host = hostKind(hostname);
  const setupComplete = Boolean(savedPublisher && savedSlot) && host !== "render";

  const domainStatus: StepStatus = host === "render" ? "error" : host === "own" ? "done" : "upcoming";
  const steps: StepItem[] = [
    {
      key: "alan-adi",
      title: "Sistemi kendi alan adınızda açın",
      status: domainStatus,
      description:
        host === "render"
          ? `Şu an ${hostname} adresindesiniz; Google bu adresi onaylamaz. Render'a kendi alan adınızı (ör. panel.alanadiniz.com) bağlayın ve AdSense'e o adresi yazın.`
          : host === "own"
            ? `${hostname} uygun.`
            : "Canlı adreste denetlenir; Google onrender.com adresini onaylamaz.",
    },
    {
      key: "hesap",
      title: "Google AdSense hesabı açıp siteyi onaya gönderin",
      status: savedPublisher ? "done" : domainStatus === "error" ? "upcoming" : "current",
      description: (
        <>
          <a href={ADSENSE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">adsense.google.com</a>
          {" "}adresinde hesap açın, sitenizi ekleyin. Onay birkaç gün ile birkaç hafta sürebilir.
        </>
      ),
    },
    {
      key: "kimlik",
      title: "Onaydan sonra kimlikleri aşağıya girin",
      status: savedPublisher && savedSlot ? "done" : savedPublisher ? "current" : "upcoming",
      description: "AdSense › Reklamlar › Reklam birimine göre › Görüntülü reklam (duyarlı). Koddaki ca-pub-… ve data-ad-slot değerleri; kodun tamamını da yapıştırabilirsiniz.",
    },
    {
      key: "ads-txt",
      title: "ads.txt kendiliğinden yayınlanır",
      status: savedPublisher ? "done" : "upcoming",
      description: savedPublisher ? (
        <CopyField label="ads.txt satırı" labelHidden value={adsTxtLine(savedPublisher)} openHref="/ads.txt" className="mt-1 max-w-xl" />
      ) : (
        "Yayıncı kimliği kaydedilince sitenizin /ads.txt adresinde yayınlanır; sizin bir şey yüklemeniz gerekmez."
      ),
    },
    {
      key: "otomatik",
      title: "AdSense'te “Otomatik reklamlar” kapalı kalsın",
      description: "Açılırsa Google reklamı istediği yere, hasta ekranlarına da koyabilir. Reklamlar yalnız bu sistemin ayırdığı küçük alanlarda çıkmalı.",
    },
    {
      key: "gelir",
      title: "Gelir AdSense panelinde görünür",
      description: (
        <>
          Kazanç ve ödemeler{" "}
          <a href={ADSENSE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">adsense.google.com</a>
          {" "}adresinde izlenir; ödeme için orada adres ve banka bilgilerinizi tamamlayın.
        </>
      ),
    },
  ];
  const stepList = <StepList aria-label="Reklam kurulum adımları" steps={steps} />;

  const columns: ListTableColumn<ClinicRow>[] = [
    {
      key: "name",
      header: "Klinik",
      render: (row) => <ClinicName row={row} />,
    },
    {
      key: "ads",
      header: "Reklam gösterilsin",
      align: "right",
      render: (row) => <ClinicSwitch row={row} busy={busyIds.has(row.id)} onChange={toggleClinic} />,
    },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        icon="sa-ads"
        title="Reklamlar"
        description="Klinik panelindeki küçük reklam alanlarını Google AdSense doldurur; gelir AdSense hesabınıza yatar."
      />

      {/* Tek okunaklı sütun: iki sütunlu klinik listesi ve adım metinleri tam genişlikte dağılıyordu. */}
      {loading && !saved ? (
        <div className="max-w-3xl space-y-4">
          <FormSkeleton fields={2} columns={2} />
          <TableSkeleton rows={5} columns={2} toolbar />
        </div>
      ) : loadError && !saved ? (
        <LoadErrorState message={loadError} onRetry={reload} />
      ) : (
        <div className="max-w-3xl space-y-4">
          {loadError && (
            <Callout tone="warning" compact role="status" action={<Button size="sm" variant="ghost" onClick={reload}>Yeniden dene</Button>}>
              {loadError} Son yüklenen bilgiler gösteriliyor.
            </Callout>
          )}

          {!setupComplete && <Section title="Kurulum">{stepList}</Section>}

          <Section
            title="Google AdSense"
            description="Kliniğe sizin girişinizde reklam gösterilmez: kendi reklamınıza tıklamak AdSense hesabını kapattırabilir."
          >
            <div className="space-y-4">
              {saveError && <Callout tone="critical" role="alert" compact>{saveError}</Callout>}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Google AdSense yayıncı kimliği" htmlFor="ads-publisher" error={errors.publisherId}>
                  <Input
                    id="ads-publisher"
                    value={form.publisherId}
                    onChange={(event) => setField("publisherId", event.target.value)}
                    placeholder="ca-pub-1234567890123456"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormField>
                <FormField label="Reklam birimi kimliği" htmlFor="ads-slot" error={errors.slotId}>
                  <Input
                    id="ads-slot"
                    value={form.slotId}
                    onChange={(event) => setField("slotId", event.target.value)}
                    placeholder="1234567890"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormField>
              </div>
              <Switch
                checked={form.enabled}
                onChange={(checked) => setField("enabled", checked)}
                label="Reklamlar gösterilsin"
                description="Kapalıyken hiçbir klinikte reklam görünmez."
              />
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
              </div>
            </div>
          </Section>

          <ListTable<ClinicRow>
            title="Klinikler"
            subtitle={saved?.enabled ? `${openCount} klinikte açık` : `Reklamlar kapalı; açınca ${openCount} klinikte görünür`}
            toolbar={(
              <Toolbar>
                <SearchInput value={query} onChange={setQuery} placeholder="Klinik adı" wrapperClassName="flex-1 min-w-[220px]" />
              </Toolbar>
            )}
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            rowClassName={(row) => (row.isActive ? "" : "opacity-60")}
            emptyText={query.trim() ? "Bu adla klinik yok" : "Klinik yok"}
            mobileCard={(row) => (
              <div className="flex items-center justify-between gap-3">
                <ClinicName row={row} />
                <ClinicSwitch row={row} busy={busyIds.has(row.id)} onChange={toggleClinic} />
              </div>
            )}
          />

          {setupComplete && (
            <Disclosure title="Kurulum adımları" summary="Tamamlandı">
              {stepList}
            </Disclosure>
          )}
        </div>
      )}
    </section>
  );
}

function ClinicName({ row }: { row: ClinicRow }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={`/superadmin/institutions/${row.id}`} className="min-w-0 truncate font-semibold text-slate-900 hover:text-primary hover:underline">
        {row.name}
      </Link>
      {row.isDemo && <Badge tone="info">Demo</Badge>}
      {!row.isActive && <Badge tone="neutral">Klinik kapalı</Badge>}
    </div>
  );
}

function ClinicSwitch({ row, busy, onChange }: { row: ClinicRow; busy: boolean; onChange: (row: ClinicRow, adsEnabled: boolean) => void }) {
  // Deneme (demo) kliniğinde reklam hiç gösterilmez (müşteri adayı reklam görmesin).
  if (row.isDemo) return <span className="block text-right text-xs text-slate-500">Demo — reklam yok</span>;
  return (
    <Switch
      checked={row.adsEnabled}
      onChange={(checked) => onChange(row, checked)}
      disabled={busy}
      label={`${row.name}: reklam gösterilsin`}
      labelHidden
      className="justify-end"
    />
  );
}
