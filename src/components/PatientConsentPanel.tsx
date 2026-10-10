"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type SignaturePad from "signature_pad";
import { Eraser, FileSignature, PenLine, Printer, XCircle } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { cachedGet } from "@/lib/client-cache";
import { FormModal } from "@/components/ui/FormModal";
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
  isActive?: boolean;
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
};

type Props = {
  patientId: string;
  patientName: string;
  patientTcNo?: string | null;
  /** documents:write — yoksa yalnız imzalı onamlar listelenir (imza penceresi açılmaz). */
  canWrite?: boolean;
  /** İmza penceresi dışarıdan da açılabilir ("İşlem ekle > Onam imzalat"). */
  signOpen: boolean;
  onSignOpenChange: (open: boolean) => void;
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
  KAPSAMLI_ONAM: "Kapsamlı Onam",
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
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
}

function splitConsentSections(body: string) {
  return body
    .split(/\n(?=##\s+)/g)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const lines = section.split("\n");
      const hasHeading = /^##\s+/.test(lines[0] || "");
      const heading = hasHeading ? lines[0].replace(/^##\s*/, "").trim() : "";
      return { heading, content: (hasHeading ? lines.slice(1) : lines).join("\n").trim() };
    });
}

/**
 * Hastanın onam ve KVKK imzaları. Sekmede yalnız imzalı onamlar listesi
 * durur; imza alma (metin, imzalayan, imza alanı) ayrı penceredir. Önceden
 * seyrek kullanılan imza formu tuvaliyle birlikte Belgeler sekmesinin en
 * üstünde her girişte açık duruyordu ve aynı görünümde iki birincil düğme vardı.
 * İmza kitaplığı yalnız pencere açılınca yüklenir.
 */
export function PatientConsentPanel({ patientId, patientName, patientTcNo, canWrite = true, signOpen, onSignOpenChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [consents, setConsents] = useState<PatientConsent[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [signerName, setSignerName] = useState(patientName);
  const [signerIdentityNo, setSignerIdentityNo] = useState(patientTcNo || "");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Onam şablonları yalnız imza penceresi açılınca okunur (Belgeler sekmesinin
  // her açılışında gereksiz bir istek daha gidiyordu).
  const [templatesState, setTemplatesState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  /** "Yeniden imzalat": şablonlar gelince seçilecek onamın başlığı. */
  const pendingTemplateTitleRef = useRef("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [signatureError, setSignatureError] = useState("");
  // İmza atıldıysa pencere dışına yanlışlıkla tıklamak pencereyi kapatmasın (imza kaybolmasın).
  const [drawn, setDrawn] = useState(false);
  const [voidingConsent, setVoidingConsent] = useState<PatientConsent | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  // Pasifleştirilmiş şablon imzaya sunulmaz (sunucu da reddeder).
  const activeTemplates = useMemo(() => templates.filter((template) => template.isActive !== false), [templates]);
  const selectedTemplate = useMemo(
    () => activeTemplates.find((template) => template.id === selectedTemplateId) || activeTemplates[0],
    [selectedTemplateId, activeTemplates],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const consentRes = await fetch(`/api/patient-consents?patientId=${encodeURIComponent(patientId)}`, { cache: "no-store" });
        const consentBody = await consentRes.json().catch(() => null);
        if (!consentRes.ok) throw new Error(consentBody?.message || consentBody?.error || "Hasta onamları yüklenemedi.");
        if (cancelled) return;
        setConsents(Array.isArray(consentBody) ? consentBody : []);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Onam kayıtları yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  // Şablonlar pencere ilk açılınca okunur; okunamazsa pencere yeniden açılınca denenir.
  // İstek bir kez gider (pencere kapanıp açılsa da); yanıt bileşen kapansa da işlenir.
  const templatesRequestedRef = useRef(false);
  useEffect(() => {
    if (!signOpen || templatesRequestedRef.current) return;
    templatesRequestedRef.current = true;
    setTemplatesState("loading");
    fetch("/api/consent-templates", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body)) throw new Error("templates");
        const list = body as ConsentTemplate[];
        setTemplates(list);
        const wanted = pendingTemplateTitleRef.current;
        pendingTemplateTitleRef.current = "";
        const match = wanted ? list.find((item) => item.isActive !== false && item.title === wanted) : null;
        if (match) setSelectedTemplateId(match.id);
        setTemplatesState("ready");
      })
      .catch(() => {
        templatesRequestedRef.current = false;
        setTemplatesState("error");
      });
  }, [signOpen]);

  // İmza alanı pencere açılınca kurulur; kitaplık o an indirilir.
  useEffect(() => {
    if (!signOpen) return;
    setDrawn(false);
    setSaveError("");
    setSignatureError("");
    let disposed = false;
    let removeResize: (() => void) | null = null;
    void import("signature_pad").then(({ default: SignaturePadClass }) => {
      // Pencere gövdesi çizildikten sonra ölç.
      window.requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;
        const pad = new SignaturePadClass(canvas, { minWidth: 0.7, maxWidth: 2.4, penColor: "#0f172a", backgroundColor: "#ffffff" });
        padRef.current = pad;
        let lastSize = "";
        const resize = () => {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          // Yerleşim ölçüsü (offsetWidth/Height) dönüşümden etkilenmez: pencere
          // açılırken küçükten büyüyerek (scale) geldiği için getBoundingClientRect
          // tuvali ~%1,5 küçük ölçüyor, imza parmağın biraz sağında/altında çıkıyordu.
          const width = canvas.offsetWidth;
          const height = canvas.offsetHeight;
          const size = `${width}x${height}@${ratio}`;
          if (size === lastSize) return;
          lastSize = size;
          const data = pad.isEmpty() ? null : pad.toDataURL("image/png");
          canvas.width = Math.max(1, Math.floor(width * ratio));
          canvas.height = Math.max(1, Math.floor(height * ratio));
          canvas.getContext("2d")?.scale(ratio, ratio);
          pad.clear();
          if (data) void pad.fromDataURL(data);
        };
        resize();
        pad.addEventListener("beginStroke", () => { setSignatureError(""); setDrawn(true); });
        // Tuvalin genişliği pencere boyutu değişmeden de değişebilir (onam metni
        // geç yüklenip pencerede kaydırma çubuğu belirince): tuvalin kendisi izlenir.
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
        observer?.observe(canvas);
        window.addEventListener("resize", resize);
        removeResize = () => {
          observer?.disconnect();
          window.removeEventListener("resize", resize);
        };
      });
    }).catch(() => setSignatureError("İmza alanı yüklenemedi. Sayfayı yenileyip tekrar deneyin."));
    return () => {
      disposed = true;
      removeResize?.();
      padRef.current?.off();
      padRef.current = null;
    };
  }, [signOpen]);

  const clearSignature = () => {
    padRef.current?.clear();
    setDrawn(false);
  };

  const openSign = useCallback(() => {
    setSaveError("");
    setSignatureError("");
    setDrawn(false);
    onSignOpenChange(true);
  }, [onSignOpenChange]);

  async function saveConsent() {
    if (!selectedTemplate || !signerName.trim() || saving) return;
    if (!padRef.current || padRef.current.isEmpty()) {
      setSignatureError("Kaydetmeden önce imzayı alın.");
      return;
    }
    setSaving(true);
    setSaveError("");
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
      showToastSafe({ title: "Onam kaydedildi", message: "İmzalı kayıt hasta dosyasına eklendi.", type: "success" });
      onSignOpenChange(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Onam kaydedilemedi. Lütfen tekrar deneyin.");
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
    const template = activeTemplates.find((item) => item.title === consent.title);
    if (template) setSelectedTemplateId(template.id);
    // Şablonlar henüz okunmadıysa gelince seçilir.
    else pendingTemplateTitleRef.current = consent.title;
    setSignerName(consent.signerName);
    setSignerIdentityNo(consent.signerIdentityNo || patientTcNo || "");
    openSign();
  }

  function buildConsentHtml(consent: PatientConsent, institution: InstitutionInfo | null) {
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
          <img alt="İmza" src="${escapeHtml(consent.signatureDataUrl)}" />
          <div>Bu elektronik imza belgenin tüm sayfaları ve ekleri için geçerlidir.</div>
        </div>
      </div>`;
    const sectionHtml = sections.map((section) => `
      <article class="clause">
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ""}
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
        <img alt="İmza" src="${escapeHtml(consent.signatureDataUrl)}" />
        <div>İmza tüm sayfalar için geçerlidir.</div>
      </div>
    </footer>
  </div>
</body>
</html>`;
  }

  async function printConsent(consent: PatientConsent) {
    // Pencere tıklamayla hemen açılır (açılır pencere engeline takılmasın),
    // antet okununca belge içine yazılır. Antet ayar yetkisi gerektirmez.
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      showToastSafe({ title: "Yazdırma penceresi açılamadı", message: "Tarayıcı açılır pencereyi engellemiş olabilir.", type: "error" });
      return;
    }
    const institution = await cachedGet<InstitutionInfo | null>("/api/documents/letterhead", 5 * 60_000).catch(() => null);
    const blob = new Blob([buildConsentHtml(consent, institution)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    win.location.href = url;
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
        <IconButton icon={Printer} title="Yazdır" size="sm" onClick={() => void printConsent(consent)} />
        {canWrite && <IconButton icon={PenLine} title="Yeniden imzalat" size="sm" onClick={() => prepareResign(consent)} />}
        {canWrite && !isVoided && <IconButton icon={XCircle} title="Onamı iptal et" tone="danger" size="sm" onClick={() => { setVoidingConsent(consent); setVoidReason(""); }} />}
      </div>
    );
  }

  const templateSections = selectedTemplate ? splitConsentSections(selectedTemplate.body) : [];

  return (
    <>
      <ListTable
        title="Onamlar"
        actions={(
          <>
            {!loading && !loadError && <Badge tone={activeCount > 0 ? "success" : "warning"}>{activeCount > 0 ? `${activeCount} geçerli onam` : "Geçerli onam yok"}</Badge>}
            {canWrite && <Button size="sm" variant="secondary" icon={FileSignature} onClick={openSign}>Onam imzalat</Button>}
          </>
        )}
        columns={consentColumns}
        rows={consents}
        rowKey={(consent) => consent.id}
        loading={loading && consents.length === 0}
        error={loadError || null}
        onRetry={() => setReloadKey((key) => key + 1)}
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

      {canWrite && (
        <FormModal
          open={signOpen}
          onClose={() => { if (!saving) onSignOpenChange(false); }}
          module="clipboard"
          title="Onam imzalat"
          description={patientName}
          size="lg"
          onSubmit={saveConsent}
          submitting={saving}
          submitDisabled={!selectedTemplate || !signerName.trim()}
          error={saveError}
          isDirty={drawn}
        >
          {activeTemplates.length > 1 && (
            <FormField label="Onam metni" htmlFor="consent-template">
              <Select id="consent-template" value={selectedTemplate?.id || ""} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                {activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
              </Select>
            </FormField>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-50">
            <p className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
              {selectedTemplate?.title || "Onam metni"}
              {selectedTemplate && <span className="ml-2 text-xs font-normal text-slate-500">{CATEGORY_LABELS[selectedTemplate.category] || ""}</span>}
            </p>
            <div className="max-h-56 space-y-2 overflow-auto px-3 py-2 text-sm leading-relaxed text-slate-700">
              {(templatesState === "idle" || templatesState === "loading") && !selectedTemplate ? (
                <p>Onam metni yükleniyor…</p>
              ) : templatesState === "error" && !selectedTemplate ? (
                <p>Onam şablonları yüklenemedi. Pencereyi kapatıp yeniden açın.</p>
              ) : templateSections.length > 0 ? templateSections.map((section, index) => (
                <section key={`${section.heading}-${index}`}>
                  {section.heading && <h3 className="font-semibold text-slate-900">{section.heading}</h3>}
                  <p className="whitespace-pre-wrap">{section.content}</p>
                </section>
              )) : (
                <p>Onam şablonu bulunamadı. Ayarlar’dan onam şablonu ekleyin.</p>
              )}
            </div>
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
              <span className="text-xs font-bold text-slate-800">İmza</span>
              <Button variant="ghost" size="sm" icon={Eraser} onClick={clearSignature}>İmzayı temizle</Button>
            </div>
            <canvas ref={canvasRef} aria-label="Hastanın imza alanı" className="h-44 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white" />
            {signatureError
              ? <p role="alert" className="mt-1 text-xs font-medium text-red-600">{signatureError}</p>
              : <p className="mt-1 text-xs text-slate-500">Parmakla ya da kalemle imzalatın.</p>}
          </div>
        </FormModal>
      )}

      <FormModal
        open={Boolean(voidingConsent)}
        onClose={() => { if (!voiding) setVoidingConsent(null); }}
        title="İmzalı onamı iptal et"
        description="İmzalı belge değiştirilmez; iptal sebebiyle arşivde saklanır. Ardından yeni imza alabilirsiniz."
        size="md"
        onSubmit={voidConsent}
        submitting={voiding}
        submitDisabled={voidReason.trim().length < 3}
        submitLabel="Onamı iptal et"
        submitVariant="danger"
      >
        {voidingConsent && (
          <>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{voidingConsent.title}</p>
            <FormField label="İptal sebebi" htmlFor="consent-void-reason" required hint="En az 3 harf.">
              <Textarea id="consent-void-reason" rows={3} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Örn. hasta imzayı yanlış attı, yeniden imza alınacak." />
            </FormField>
          </>
        )}
      </FormModal>
    </>
  );
}
