"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Eraser, PenLine, Printer, XCircle } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { cachedGet } from "@/lib/client-cache";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

type ConsentTemplate = {
  id: string;
  title: string;
  category: string;
  body: string;
};

type PatientConsent = {
  id: string;
  title: string;
  category: string;
  body: string;
  signerName: string;
  signerIdentityNo?: string | null;
  signatureDataUrl: string;
  status?: string;
  voidedAt?: string | null;
  voidReason?: string | null;
  signedAt: string;
  createdBy?: { fullName: string } | null;
};

type InstitutionInfo = {
  institutionName?: string;
  institutionPhone?: string;
  institutionEmail?: string;
  institutionAddress?: string;
  institutionTaxNo?: string;
  institutionRegistryNo?: string;
  institutionWebsite?: string;
  logoUrl?: string;
};

type Props = {
  patientId: string;
  patientName: string;
  patientTcNo?: string | null;
  /** documents:write — yoksa yalnız imzalı onamlar listelenir (imza alanı gösterilmez). */
  canWrite?: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  KVKK: "KVKK",
  ACIK_RIZA: "Açık Rıza",
  TEDAVI_ONAM: "Tedavi Onamı",
  CERRAHI_ONAM: "Cerrahi Onam",
  IMPLANT_ONAM: "İmplant",
  ENDODONTI_ONAM: "Kanal Tedavisi",
  PROTEZ_ONAM: "Protez",
  RONTGEN_ONAM: "Görüntüleme",
  DIGER: "Diğer",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function PatientConsentPanel({ patientId, patientName, patientTcNo, canWrite = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [consents, setConsents] = useState<PatientConsent[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [institution, setInstitution] = useState<InstitutionInfo | null>(null);
  const [signerName, setSignerName] = useState(patientName);
  const [signerIdentityNo, setSignerIdentityNo] = useState(patientTcNo || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voidingConsent, setVoidingConsent] = useState<PatientConsent | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || templates[0],
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [templateRes, consentRes] = await Promise.all([
          fetch("/api/consent-templates", { cache: "no-store" }),
          fetch(`/api/patient-consents?patientId=${encodeURIComponent(patientId)}`, { cache: "no-store" }),
        ]);
        const templateBody = await templateRes.json().catch(() => null);
        const consentBody = await consentRes.json().catch(() => null);
        if (!templateRes.ok) throw new Error(templateBody?.message || "Onam şablonları yüklenemedi.");
        if (!consentRes.ok) throw new Error(consentBody?.message || "Hasta onamları yüklenemedi.");
        if (cancelled) return;
        const nextTemplates = Array.isArray(templateBody) ? templateBody : [];
        setTemplates(nextTemplates);
        setSelectedTemplateId((current) => current || nextTemplates[0]?.id || "");
        setConsents(Array.isArray(consentBody) ? consentBody : []);
      } catch (error) {
        showToastSafe({ title: "Onamlar yüklenemedi", message: error instanceof Error ? error.message : "Onam verileri yüklenemedi.", type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    cachedGet<InstitutionInfo | null>("/api/settings", 60_000)
      .then((body) => {
        if (!cancelled && body) setInstitution(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const data = padRef.current?.isEmpty() ? null : padRef.current?.toDataURL("image/png");
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      const context = canvas.getContext("2d");
      context?.scale(ratio, ratio);
      padRef.current?.clear();
      if (data) padRef.current?.fromDataURL(data);
    };

    padRef.current = new SignaturePad(canvas, {
      minWidth: 0.7,
      maxWidth: 2.4,
      penColor: "#0f172a",
      backgroundColor: "#ffffff",
    });
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      padRef.current?.off();
      padRef.current = null;
    };
  }, []);

  function clearSignature() {
    padRef.current?.clear();
  }

  function splitConsentSections(body: string) {
    return body
      .split(/\n(?=##\s+)/g)
      .map((section) => section.trim())
      .filter(Boolean)
      .map((section) => {
        const lines = section.split("\n");
        const heading = lines[0]?.replace(/^##\s*/, "").trim() || "Onam";
        return { heading, content: lines.slice(1).join("\n").trim() };
      });
  }

  async function saveConsent() {
    if (!selectedTemplate || !signerName.trim()) return;
    if (!padRef.current || padRef.current.isEmpty()) {
      showToastSafe({ title: "İmza eksik", message: "Kaydetmeden önce imza alanını doldurun.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/patient-consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          templateId: selectedTemplate.id,
          title: selectedTemplate.title,
          category: selectedTemplate.category,
          body: selectedTemplate.body,
          signerName,
          signerIdentityNo,
          signatureDataUrl: padRef.current.toDataURL("image/png"),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || body?.message || "Onam kaydedilemedi.");
      setConsents((current) => [body as PatientConsent, ...current]);
      clearSignature();
      showToastSafe({ title: "Onam kaydedildi", message: "İmzalı kayıt hasta dosyasına eklendi.", type: "success" });
    } catch (error) {
      showToastSafe({ title: "Onam kaydedilemedi", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function voidConsent() {
    if (!voidingConsent || voidReason.trim().length < 3) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/patient-consents/${voidingConsent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || body?.message || "Onam iptal edilemedi.");
      setConsents((current) => current.map((item) => (item.id === voidingConsent.id ? body as PatientConsent : item)));
      setVoidingConsent(null);
      setVoidReason("");
      showToastSafe({ title: "Onam iptal edildi", message: "Kayıt arşivde iptal durumuna alındı.", type: "success" });
    } catch (error) {
      showToastSafe({ title: "Onam iptal edilemedi", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      setVoiding(false);
    }
  }

  function prepareResign(consent: PatientConsent) {
    const template = templates.find((item) => item.title === consent.title);
    if (template) setSelectedTemplateId(template.id);
    setSignerName(consent.signerName);
    setSignerIdentityNo(consent.signerIdentityNo || patientTcNo || "");
    clearSignature();
    showToastSafe({ title: "Form hazırlandı", message: "İmzayı yeniden alıp yeni onam kaydı oluşturabilirsiniz.", type: "info" });
  }

  function buildConsentHtml(consent: PatientConsent) {
    const statusText = consent.status === "IPTAL" ? "İPTAL EDİLMİŞ KAYIT" : "AKTİF İMZALI KAYIT";
    const sections = splitConsentSections(consent.body);
    const clinicName = institution?.institutionName || "Klinik";
    const clinicLines = [
      institution?.institutionAddress,
      institution?.institutionPhone ? `Tel: ${institution.institutionPhone}` : "",
      institution?.institutionEmail ? `E-posta: ${institution.institutionEmail}` : "",
      institution?.institutionWebsite ? `Web: ${institution.institutionWebsite}` : "",
      institution?.institutionTaxNo ? `Vergi No: ${institution.institutionTaxNo}` : "",
      institution?.institutionRegistryNo ? `Sicil No: ${institution.institutionRegistryNo}` : "",
    ].filter((line): line is string => Boolean(line));
    const renderParagraphs = (content: string) =>
      content
        .split(/\n{2,}/g)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");
    const signatureBlock = `
      <div class="signature-block">
        <div>
          <strong>Hasta / Veli / Vasi</strong><br />
          ${escapeHtml(consent.signerName)}${consent.signerIdentityNo ? ` - ${escapeHtml(consent.signerIdentityNo)}` : ""}<br />
          İmza tarihi: ${escapeHtml(formatDate(consent.signedAt))}
        </div>
        <div class="sigbox">
          <img alt="İmza" src="${consent.signatureDataUrl}" />
          <div>Bu elektronik imza belgenin tüm sayfaları ve ekleri için geçerlidir.</div>
        </div>
      </div>`;
    const sectionHtml = sections.map((section) => `
      <article class="clause">
        <h2>${escapeHtml(section.heading)}</h2>
        ${renderParagraphs(section.content)}
      </article>
    `).join("");

    return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(consent.title)}</title>
  <style>
    @page { size: A4; margin: 10mm 12mm 27mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; line-height: 1.34; background: #eef2f7; font-size: 11px; }
    .toolbar { margin-bottom: 18px; }
    button { border: 1px solid #cbd5e1; background: #0f172a; color: #fff; border-radius: 8px; padding: 8px 12px; font-weight: 700; }
    .document { max-width: 920px; margin: 22px auto; }
    .sheet { background: white; border: 1px solid #d7dde7; padding: 18mm 16mm; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12); }
    .letterhead { display: grid; grid-template-columns: 1fr auto; gap: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
    .clinic { color: #475569; font-size: 10.5px; }
    .clinic h1 { font-size: 22px; letter-spacing: 0; color: #0f172a; margin: 0 0 4px; }
    .doc-title { font-size: 18px; margin: 8px 0 4px; color: #0f172a; }
    .status { display: inline-block; margin: 6px 0 8px; border: 1px solid ${consent.status === "IPTAL" ? "#fecaca" : "#86efac"}; background: ${consent.status === "IPTAL" ? "#fef2f2" : "#f0fdf4"}; color: ${consent.status === "IPTAL" ? "#b91c1c" : "#166534"}; border-radius: 999px; padding: 3px 9px; font-size: 10px; font-weight: 800; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #cbd5e1; margin: 8px 0 10px; }
    .meta-cell { min-height: 31px; padding: 5px 7px; border-right: 1px solid #cbd5e1; color: #334155; }
    .meta-cell:last-child { border-right: 0; }
    .meta-cell span { display: block; color: #64748b; font-size: 8.8px; font-weight: 700; text-transform: uppercase; }
    .notice { border: 1px solid #dbeafe; background: #eff6ff; color: #1e3a8a; padding: 6px 8px; margin-bottom: 9px; font-size: 10.4px; }
    .sections { column-count: 2; column-gap: 9mm; column-rule: 1px solid #e5e7eb; }
    .clause { break-inside: avoid; page-break-inside: avoid; margin: 0 0 7px; }
    .clause h2 { font-size: 11.5px; margin: 0 0 3px; color: #0f172a; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; }
    .clause p { margin: 0 0 4px; text-align: justify; }
    .signature-block { margin-top: 12px; border: 1px solid #cbd5e1; padding: 8px; display: grid; grid-template-columns: 1fr 230px; gap: 14px; align-items: end; color: #334155; background: #fff; }
    .signature-footer { position: static; margin-top: 10px; border-top: 1px solid #94a3b8; padding-top: 5px; display: grid; grid-template-columns: 1fr 190px; gap: 10px; align-items: center; color: #334155; background: white; font-size: 9.5px; }
    .sigbox { text-align: center; color: #64748b; font-size: 8.8px; }
    .sigbox img { max-width: 220px; max-height: 58px; border: 1px solid #e5e7eb; background: white; display: block; margin: 0 auto 3px; object-fit: contain; }
    .signature-footer .sigbox img { max-width: 176px; max-height: 43px; }
    .void { margin: 10px 0; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; padding: 8px; font-size: 10.5px; }
    @media print {
      body { background: white; font-size: 10.2px; }
      .toolbar { display: none; }
      .document { margin: 0; max-width: none; }
      .sheet { border: 0; padding: 0; box-shadow: none; }
      .letterhead { margin-bottom: 7px; padding-bottom: 6px; }
      .doc-title { font-size: 15px; margin-top: 6px; }
      .meta-grid { margin: 6px 0 8px; }
      .notice { padding: 5px 7px; margin-bottom: 7px; }
      .clause { margin-bottom: 5px; }
      .clause p { margin-bottom: 3px; }
      .signature-block { display: none; }
      .signature-footer { position: fixed; left: 12mm; right: 12mm; bottom: 7mm; margin: 0; padding-top: 4px; }
    }
    @media screen and (max-width: 760px) {
      .sheet { padding: 18px; }
      .letterhead, .meta-grid, .signature-block, .signature-footer { grid-template-columns: 1fr; }
      .sections { column-count: 1; }
      .meta-cell { border-right: 0; border-bottom: 1px solid #cbd5e1; }
      .meta-cell:last-child { border-bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="document">
    <div class="toolbar"><button onclick="window.print()">Yazdır</button></div>
    <main class="sheet">
      <header class="letterhead">
        <div class="clinic">
          <h1>${escapeHtml(clinicName)}</h1>
          ${clinicLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>
        <div class="clinic" style="text-align:right">
          <strong>Hasta Onam Dosyası</strong><br />
          Belge No: ${escapeHtml(consent.id.slice(-8).toUpperCase())}<br />
          Durum: ${escapeHtml(statusText)}
        </div>
      </header>
      <span class="status">${statusText}</span>
      <h1 class="doc-title">${escapeHtml(consent.title)}</h1>
      <section class="meta-grid">
        <div class="meta-cell"><span>Hasta</span>${escapeHtml(patientName)}</div>
        <div class="meta-cell"><span>İmzalayan</span>${escapeHtml(consent.signerName)} ${consent.signerIdentityNo ? `- ${escapeHtml(consent.signerIdentityNo)}` : ""}</div>
        <div class="meta-cell"><span>İmza Tarihi</span>${escapeHtml(formatDate(consent.signedAt))}</div>
      </section>
      <div class="notice">Hasta, bu kapsamlı onam paketindeki tüm bölümleri okuduğunu veya kendisine açıklandığını; tek elektronik imzasının belgenin tüm sayfaları, maddeleri ve ekleri için geçerli olduğunu kabul eder.</div>
      ${consent.status === "IPTAL" ? `<div class="void"><strong>İptal sebebi:</strong> ${escapeHtml(consent.voidReason || "-")}<br /><strong>İptal tarihi:</strong> ${consent.voidedAt ? escapeHtml(formatDate(consent.voidedAt)) : "-"}</div>` : ""}
      <section class="sections">${sectionHtml}</section>
      ${signatureBlock}
    </main>
    <footer class="signature-footer">
      <div>
        <strong>${escapeHtml(clinicName)}</strong> · Belge No: ${escapeHtml(consent.id.slice(-8).toUpperCase())}<br />
        Hasta / imzalayan: ${escapeHtml(consent.signerName)}${consent.signerIdentityNo ? ` - ${escapeHtml(consent.signerIdentityNo)}` : ""} · ${escapeHtml(formatDate(consent.signedAt))}
      </div>
      <div class="sigbox">
        <img alt="İmza" src="${consent.signatureDataUrl}" />
        <div>İmza tüm sayfalar için geçerlidir.</div>
      </div>
    </footer>
  </div>
</body>
</html>`;
  }

  function printConsent(consent: PatientConsent) {
    const blob = new Blob([buildConsentHtml(consent)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "width=900,height=1000");
    if (!win) {
      URL.revokeObjectURL(url);
      showToastSafe({ title: "Yazdırma penceresi açılamadı", message: "Tarayıcı açılır pencereyi engellemiş olabilir.", type: "error" });
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const activeCount = consents.filter((item) => item.status !== "IPTAL").length;
  const consentColumns: ListTableColumn<PatientConsent>[] = [
    {
      key: "title",
      header: "Onam",
      render: (consent) => (
        <div className="min-w-0">
          <p className={`font-medium ${consent.status === "IPTAL" ? "text-slate-500" : "text-slate-800"}`}>{consent.title}</p>
          {consent.status === "IPTAL" && <p className="text-xs text-red-700">İptal sebebi: {consent.voidReason || "—"}</p>}
        </div>
      ),
    },
    { key: "signer", header: "İmzalayan", render: (consent) => consent.signerName },
    { key: "date", header: "Tarih", render: (consent) => <span className="whitespace-nowrap">{formatDate(consent.signedAt)}</span> },
    { key: "status", header: "Durum", render: (consent) => (consent.status === "IPTAL" ? <Badge tone="neutral">İptal edildi</Badge> : <Badge tone="success">Geçerli</Badge>) },
    { key: "actions", header: "", align: "right", render: (consent) => consentActions(consent) },
  ];

  function consentActions(consent: PatientConsent) {
    const isVoided = consent.status === "IPTAL";
    return (
      <div className="flex justify-end gap-1.5">
        <IconButton icon={Printer} title="Yazdır" size="sm" onClick={() => printConsent(consent)} />
        {canWrite && <IconButton icon={PenLine} title="Yeniden imzalat" size="sm" onClick={() => prepareResign(consent)} />}
        {canWrite && !isVoided && <IconButton icon={XCircle} title="Onamı iptal et" tone="danger" size="sm" onClick={() => { setVoidingConsent(consent); setVoidReason(""); }} />}
      </div>
    );
  }

  return (
    <section className="ui-surface space-y-4 p-4 sm:p-5" aria-label="Onam ve KVKK imzası">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Onam ve KVKK imzası</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {canWrite ? "Onam metnini hastaya okutun, aşağıdaki alana imzasını alın. Tek imza belgenin tamamı için geçerlidir." : "Hastanın imzaladığı onamlar."}
          </p>
        </div>
        <Badge tone={activeCount > 0 ? "success" : "warning"}>{activeCount > 0 ? `${activeCount} geçerli onam` : "Geçerli onam yok"}</Badge>
      </div>

      {canWrite && (
        <div className="space-y-3">
          {templates.length > 1 && (
            <FormField label="Onam metni" htmlFor="consent-template">
              <Select id="consent-template" value={selectedTemplate?.id || ""} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
              </Select>
            </FormField>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-50">
            <p className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
              {selectedTemplate?.title || "Onam metni"}
              <span className="ml-2 text-xs font-normal text-slate-500">{CATEGORY_LABELS[selectedTemplate?.category || ""] || ""}</span>
            </p>
            <p className="max-h-56 overflow-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-slate-700">
              {loading && !selectedTemplate ? "Onam metni yükleniyor…" : selectedTemplate?.body || "Onam şablonu bulunamadı. Ayarlar'dan onam şablonu ekleyin."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="İmzalayan" htmlFor="consent-signer" required hint="Hasta değilse veli / vasinin adı.">
              <Input id="consent-signer" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
            </FormField>
            <FormField label="TC / kimlik no" htmlFor="consent-identity">
              <Input id="consent-identity" inputMode="numeric" value={signerIdentityNo} onChange={(event) => setSignerIdentityNo(event.target.value.replace(/\D/g, "").slice(0, 11))} className="font-mono" />
            </FormField>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">İmza alanı</span>
              <Button variant="ghost" size="sm" icon={Eraser} onClick={clearSignature}>İmzayı temizle</Button>
            </div>
            <canvas ref={canvasRef} aria-label="Hastanın imza alanı" className="h-44 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white" />
            <p className="mt-1 text-xs text-slate-500">Parmakla veya kalemle imzalatın. Yanlış olursa “İmzayı temizle”.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void saveConsent()} loading={saving} disabled={!selectedTemplate || !signerName.trim()}>İmzalı onamı kaydet</Button>
          </div>
        </div>
      )}

      <ListTable
        header={<h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800">İmzalı onamlar</h3>}
        columns={consentColumns}
        rows={consents}
        rowKey={(consent) => consent.id}
        loading={loading && consents.length === 0}
        skeletonRows={2}
        rowClassName={(consent) => (consent.status === "IPTAL" ? "opacity-70" : "")}
        emptyText="Henüz imzalı onam yok"
        mobileCard={(consent) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{consent.title}</p>
              <p className="text-xs text-slate-500">{formatDate(consent.signedAt)} · {consent.signerName}{consent.status === "IPTAL" ? " · İptal edildi" : ""}</p>
            </div>
            {consentActions(consent)}
          </div>
        )}
      />

      <Modal
        open={Boolean(voidingConsent)}
        onClose={() => { if (!voiding) setVoidingConsent(null); }}
        title="İmzalı onamı iptal et"
        description="İmzalı belge değiştirilmez; iptal sebebiyle arşivde saklanır. Ardından yeni imza alabilirsiniz."
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setVoidingConsent(null)} disabled={voiding}>Vazgeç</Button>
            <Button variant="danger" onClick={() => void voidConsent()} loading={voiding} disabled={voidReason.trim().length < 3}>Onamı iptal et</Button>
          </>
        )}
      >
        {voidingConsent && (
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{voidingConsent.title}</p>
            <FormField label="İptal sebebi" htmlFor="consent-void-reason" required hint="En az 3 harf.">
              <Textarea id="consent-void-reason" rows={3} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Örn. hasta imzayı yanlış attı, yeniden imza alınacak." />
            </FormField>
          </div>
        )}
      </Modal>
    </section>
  );
}
