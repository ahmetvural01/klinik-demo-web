"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import type { ConsistencyIssue, ConsistencyPayload } from "@/lib/data-consistency";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { formatDateText } from "@/components/ui/Money";
import { CardsSkeleton } from "@/components/ui/PageSkeleton";
import { Section } from "@/components/ui/Section";
import { Toolbar } from "@/components/ui/Toolbar";

// Önem sözlüğü (Raporlar/zil ile aynı dil): Acil · Bakılmalı · Bilgi.
const SEVERITY: Record<ConsistencyIssue["severity"], { tone: BadgeTone; label: string; order: number }> = {
  critical: { tone: "critical", label: "Acil", order: 0 },
  warning: { tone: "warning", label: "Bakılmalı", order: 1 },
  info: { tone: "neutral", label: "Bilgi", order: 2 },
};

/**
 * Tutarlılık taraması kurumla sınırlıdır; sorun metinleri ve bağlantıları
 * kaynağında (lib/data-consistency) klinik diliyle yazılır. Klinik kullanıcısı
 * süperadmin sayfalarını açamadığı için öyle bir bağlantı gelirse gösterilmez.
 */
function clinicIssue(issue: ConsistencyIssue): ConsistencyIssue {
  const usable = (href?: string) => Boolean(href) && !href?.startsWith("/superadmin");
  return {
    ...issue,
    href: usable(issue.href) ? issue.href : undefined,
    records: issue.records?.filter((record) => usable(record.href)),
  };
}

/**
 * İşlem kayıtları › Kayıt kontrolü (eski /sistem-izleme "Sistem Durumu").
 * Tarama ağır olduğu için yalnız bu sekme açılınca çalışır. Başlıkta kayıt
 * toplamı yazılmaz: aynı tahsilat birden çok konuda sayılabiliyordu; konu
 * sayısı önem derecesine göre verilir. Sunucu ölçümleri ("Teknik ölçümler")
 * platform genelidir, kliniğe ait değildir; klinik ekranından kaldırıldı.
 */
export function RecordCheckTab() {
  const [report, setReport] = useState<ConsistencyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/system/consistency", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.message || "Kayıt kontrolü yapılamadı.");
      setReport(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kayıt kontrolü yapılamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const issues = useMemo(
    () => (report?.issues || []).map(clinicIssue).sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order),
    [report],
  );
  const groups = useMemo(() => {
    const byArea = new Map<string, ConsistencyIssue[]>();
    for (const issue of issues) byArea.set(issue.area, [...(byArea.get(issue.area) || []), issue]);
    return Array.from(byArea.entries());
  }, [issues]);
  const severityCounts = (["critical", "warning", "info"] as const)
    .map((severity) => ({ severity, count: issues.filter((issue) => issue.severity === severity).length }))
    .filter((item) => item.count > 0);
  const checkedAt = report?.generatedAt ? formatDateText(report.generatedAt, "datetime") : null;

  return (
    <div className="space-y-3">
      {/* Özet şeridi çerçevesiz, sayfa zemininde (sadelik K1: ayrı kart değil). */}
      <Toolbar bare actions={<Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={() => void load()}>Yeniden kontrol et</Button>}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600">
          {severityCounts.length > 0 && !loading && severityCounts.map((item) => (
            <Badge key={item.severity} tone={SEVERITY[item.severity].tone}>{item.count} {SEVERITY[item.severity].label.toLocaleLowerCase("tr-TR")}</Badge>
          ))}
          <span className="text-xs text-slate-500">
            {loading ? "Kayıtlar kontrol ediliyor…" : checkedAt ? `Son kontrol ${checkedAt}` : "Tahsilat, muhasebe, stok ve tedarikçi kayıtlarının birbiriyle uyumu"}
          </span>
        </div>
      </Toolbar>

      {/* Yeniden kontrol başarısız olursa önceki sonuç ekranda kalır; hata üstte kısa satırda. */}
      {error && report && !loading && <LoadErrorState message={`Kontrol yenilenemedi: ${error}`} onRetry={() => void load()} compact />}

      {loading && !report ? (
        <CardsSkeleton count={3} columns={1} />
      ) : error && !report ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : issues.length === 0 ? (
        <div className="ui-surface">
          <EmptyState
            icon={CheckCircle2}
            accent="emerald"
            title="Düzeltilmesi gereken kayıt yok"
            description="Tahsilat, muhasebe, stok ve tedarikçi kayıtları birbiriyle uyumlu."
          />
        </div>
      ) : (
        // TEK kart (sadelik K1): bölümler (Laboratuvar, Stok…) kart içinde küçük
        // grup başlığı; her konu ince çizgiyle ayrılmış katlanır satır. Önceden
        // her bölüm ayrı kart, her konu o kartın içinde ayrı çerçeveli kutuydu.
        <Section padding="none" className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
          {groups.map(([area, areaIssues], groupIndex) => (
            <div key={area} role="group" aria-labelledby={`kayit-kontrol-${groupIndex}`} className={groupIndex > 0 ? "border-t border-slate-100" : ""}>
              <h2 id={`kayit-kontrol-${groupIndex}`} className="bg-slate-50/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{area}</h2>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {areaIssues.map((issue) => (
                  <Disclosure
                    key={issue.id}
                    // Çerçevesiz satır: grup içinde kutu-içinde-kutu olmasın.
                    className="!rounded-none !border-0"
                    title={(
                      <>
                        <Badge tone={SEVERITY[issue.severity].tone}>{SEVERITY[issue.severity].label}</Badge>
                        <span className="min-w-0 text-slate-900">{issue.title}</span>
                      </>
                    )}
                    summary={`${issue.count.toLocaleString("tr-TR")} kayıt`}
                  >
                    <div className="space-y-2 text-sm">
                      <p className="text-slate-600">{issue.detail}</p>
                      {issue.action && <p className="text-slate-700"><b>Ne yapmalı:</b> {issue.action}</p>}
                      {issue.records && issue.records.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {issue.records.map((record, index) => (
                            <Button key={`${issue.id}-${index}`} variant="secondary" size="sm" href={record.href} icon={ArrowRight} iconPosition="right">
                              {record.label}
                            </Button>
                          ))}
                          {issue.count > issue.records.length && (
                            <span className="text-xs text-slate-500">ve {(issue.count - issue.records.length).toLocaleString("tr-TR")} kayıt daha</span>
                          )}
                        </div>
                      ) : issue.href ? (
                        <Button variant="secondary" size="sm" href={issue.href} icon={ArrowRight} iconPosition="right">İlgili sayfaya git</Button>
                      ) : null}
                    </div>
                  </Disclosure>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
