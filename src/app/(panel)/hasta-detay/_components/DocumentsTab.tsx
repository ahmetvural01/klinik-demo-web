"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, FileText, RotateCcw, Upload, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { formatDateText } from "@/components/ui/Money";
import { PatientConsentPanel } from "@/components/PatientConsentPanel";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { DOCUMENT_CATEGORY_LABELS, errorMessageOf, type PatientDocument } from "./patient-file-shared";

type UploadItem = {
  key: string;
  file: File;
  name: string;
  size: number;
  status: "uploading" | "done" | "error" | "canceled";
  /** null: tarayıcı ilerlemeyi bildirmiyor (belirsiz çubuk gösterilir). */
  progress: number | null;
  error?: string;
};

type Category = PatientDocument["category"];
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 15 * 1024 * 1024;

export function DocumentsTab() {
  const { data, patientId, can } = usePatientFile();
  const canReadDocs = can("documents:read");
  const canReadXray = can("xray:read");
  const canWriteDocs = can("documents:write");
  const canWriteXray = can("xray:write");
  const canDeleteDocs = can("documents:delete");
  const canDeleteXray = can("xray:delete");

  const categoryOptions = ([
    { value: "BELGE" as Category, label: DOCUMENT_CATEGORY_LABELS.BELGE, description: "Kimlik, sigorta, sevk, rapor", disabled: !canWriteDocs },
    { value: "RONTGEN" as Category, label: DOCUMENT_CATEGORY_LABELS.RONTGEN, description: "Panoramik, periapikal…", disabled: !canWriteXray },
    { value: "FOTOGRAF" as Category, label: DOCUMENT_CATEGORY_LABELS.FOTOGRAF, description: "Önce / sonra fotoğrafları", disabled: !canWriteXray },
  ]).map((option) => ({ ...option, disabledReason: option.disabled ? "Bu tür için yükleme yetkiniz yok" : undefined }));
  const firstAllowed = categoryOptions.find((option) => !option.disabled)?.value || "BELGE";
  const canUpload = canWriteDocs || canWriteXray;

  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState<Category>(firstAllowed);
  const [toothNo, setToothNo] = useState("");
  const [note, setNote] = useState("");
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [busyId, setBusyId] = useState("");
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch(`/api/documents?patientId=${encodeURIComponent(patientId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Belgeler yüklenemedi."));
      setDocuments(Array.isArray(body) ? body : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Belgeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (!canReadDocs && !canReadXray) { setLoading(false); return; }
    void load();
    const onRealtime = () => { void load(); };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => window.removeEventListener("ks:realtime-sync", onRealtime);
  }, [load, canReadDocs, canReadXray]);

  const updateItem = (key: string, patch: Partial<UploadItem>) =>
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const upload = async (item: { file: File; key: string }, meta: { category: Category; toothNo: string; note: string }) => {
    updateItem(item.key, { status: "uploading", progress: 0, error: undefined });
    try {
      const form = new FormData();
      form.append("patientId", patientId);
      form.append("category", meta.category);
      if (meta.toothNo.trim()) form.append("toothNo", meta.toothNo.trim());
      if (meta.note.trim()) form.append("note", meta.note.trim());
      form.append("file", item.file);
      // fetch gövde gönderim ilerlemesini bildirmediği için XMLHttpRequest:
      // gerçek yüzde ve gerçek iptal (abort) — API sözleşmesi aynı.
      const result = await new Promise<{ ok: boolean; body: unknown }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRefs.current.set(item.key, xhr);
        xhr.open("POST", "/api/documents");
        xhr.upload.onprogress = (event) => updateItem(item.key, { progress: event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null });
        xhr.onload = () => {
          let body: unknown = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* boş yanıt */ }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
        };
        xhr.onerror = () => reject(new Error("network"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.send(form);
      });
      xhrRefs.current.delete(item.key);
      if (!result.ok) {
        updateItem(item.key, { status: "error", error: errorMessageOf(result.body, "Belge yüklenemedi.") });
        return;
      }
      updateItem(item.key, { status: "done", progress: 100 });
      window.setTimeout(() => setQueue((current) => current.filter((entry) => entry.key !== item.key)), 2500);
      void load();
    } catch (error) {
      xhrRefs.current.delete(item.key);
      const aborted = error instanceof Error && error.message === "aborted";
      updateItem(item.key, { status: aborted ? "canceled" : "error", error: aborted ? undefined : "Bağlantı hatası; tekrar deneyin." });
    }
  };

  const enqueue = async (files: File[]) => {
    if (files.length === 0) return;
    const existing = new Set(documents.map((doc) => doc.fileName.toLocaleLowerCase("tr-TR")));
    const duplicates = files.filter((file) => existing.has(file.name.toLocaleLowerCase("tr-TR"))).map((file) => file.name);
    let selected = files;
    if (duplicates.length > 0) {
      const proceed = await confirmDialog({
        title: "Aynı adlı dosya var",
        message: `Bu hastada aynı adla yüklenmiş dosya var: ${duplicates.join(", ")}. Yine de yeni kopya olarak yüklensin mi?`,
        confirmText: "Yine de yükle",
      });
      if (!proceed) selected = files.filter((file) => !duplicates.includes(file.name));
    }
    const meta = { category, toothNo, note };
    const items: UploadItem[] = [];
    const startable: { file: File; key: string }[] = [];
    for (const file of selected) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!ALLOWED_TYPES.includes(file.type)) {
        items.push({ key, file, name: file.name, size: file.size, status: "error", progress: null, error: "Yalnız JPG, PNG, WEBP veya PDF yüklenebilir." });
      } else if (file.size > MAX_SIZE) {
        items.push({ key, file, name: file.name, size: file.size, status: "error", progress: null, error: "Dosya en fazla 15 MB olabilir." });
      } else {
        items.push({ key, file, name: file.name, size: file.size, status: "uploading", progress: 0 });
        startable.push({ file, key });
      }
    }
    setQueue((current) => [...current, ...items]);
    setToothNo("");
    setNote("");
    for (const item of startable) await upload(item, meta);
  };

  const archive = async (doc: PatientDocument) => {
    if (busyId) return;
    if (!(await confirmDialog({ message: `“${doc.fileName}” hasta dosyasından kaldırılsın mı? Dosya silinmez, arşivde saklanır.`, danger: true, confirmText: "Arşivle" }))) return;
    setBusyId(doc.id);
    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Belge kaldırılamadı."));
      setDocuments((current) => current.filter((item) => item.id !== doc.id));
      showToastSafe({ type: "success", message: "Belge arşivlendi." });
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Belge kaldırılamadı." });
    } finally {
      setBusyId("");
    }
  };

  const canArchive = (doc: PatientDocument) => (doc.category === "BELGE" ? canDeleteDocs : canDeleteXray);

  return (
    <div className="space-y-4">
      {can("documents:read") && <PatientConsentPanel patientId={patientId} patientName={data.fullName} patientTcNo={data.tcNo === "***" ? null : data.tcNo} canWrite={can("documents:write")} />}

      {canUpload && (
        <section className="ui-surface space-y-4 p-4 sm:p-5" aria-label="Belge veya röntgen yükle">
          <div>
            <h2 className="text-base font-bold text-slate-900">Belge / röntgen yükle</h2>
            <p className="mt-0.5 text-sm text-slate-500">JPG, PNG, WEBP veya PDF · dosya başına en fazla 15 MB · birden çok dosya seçilebilir.</p>
          </div>
          <ChoiceCards label="Ne yüklüyorsunuz?" options={categoryOptions} value={category} onChange={setCategory} columns={3} />
          <div className="grid gap-3 sm:grid-cols-2">
            {category !== "BELGE" && (
              <FormField label="Diş no" htmlFor="hd-doc-tooth" hint="İsteğe bağlı, ör. 26 veya 36-37.">
                <Input id="hd-doc-tooth" maxLength={40} value={toothNo} onChange={(event) => setToothNo(event.target.value)} />
              </FormField>
            )}
            <FormField label="Not" htmlFor="hd-doc-note" hint="İsteğe bağlı.">
              <Input id="hd-doc-note" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
            </FormField>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_TYPES.join(",")}
              className="sr-only"
              aria-label="Yüklenecek dosyaları seçin"
              data-dirty-ignore
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void enqueue(files);
              }}
            />
            <Button icon={Upload} onClick={() => fileInputRef.current?.click()}>Dosya seç ve yükle</Button>
          </div>

          {queue.length > 0 && (
            <ul className="space-y-2" aria-label="Yüklemeler">
              {queue.map((item) => (
                <li key={item.key} className={`rounded-lg border px-3 py-2.5 ${item.status === "error" ? "border-red-200 bg-red-50" : item.status === "done" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{item.name}</p>
                    <span className="shrink-0 text-xs text-slate-500">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  {item.status === "uploading" && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuenow={item.progress ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${item.progress ?? 35}%` }} />
                      </div>
                      <span className="w-20 text-right text-xs font-semibold text-primary">{item.progress === null ? "Yükleniyor" : item.progress < 100 ? `%${item.progress}` : "İşleniyor"}</span>
                      <IconButton icon={X} title="Yüklemeyi durdur" size="sm" onClick={() => xhrRefs.current.get(item.key)?.abort()} />
                    </div>
                  )}
                  {(item.status === "error" || item.status === "canceled") && (
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-red-700">{item.status === "canceled" ? "Yükleme durduruldu." : item.error}</p>
                      <div className="flex gap-1.5">
                        {(item.status === "canceled" || item.progress !== null || item.error?.includes("Bağlantı")) && (
                          <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => void upload(item, { category, toothNo, note })}>Tekrar dene</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setQueue((current) => current.filter((entry) => entry.key !== item.key))}>Kapat</Button>
                      </div>
                    </div>
                  )}
                  {item.status === "done" && <p className="mt-1 text-xs font-semibold text-emerald-700">Yüklendi.</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="ui-surface p-4 sm:p-5" aria-label="Yüklü belgeler">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Yüklü belgeler</h2>
          {documents.length > 0 && <span className="text-sm text-slate-500">{documents.length} dosya</span>}
        </div>
        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => { setLoading(true); void load(); }} />
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map((index) => <div key={index} className="h-40 rounded-lg bg-slate-100" />)}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState icon={FileText} compact title="Henüz belge veya röntgen yok" description={canUpload ? "Yukarıdan dosya seçerek yükleyin." : undefined} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {documents.map((doc) => (
              <li key={doc.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer" className="block bg-slate-50" title={`${doc.fileName} — yeni sekmede aç`}>
                  {doc.mimeType.startsWith("image/") ? (
                    <Image src={`/api/documents/${doc.id}/file`} alt={doc.fileName} width={320} height={128} unoptimized className="h-32 w-full object-cover" />
                  ) : (
                    <span className="flex h-32 w-full flex-col items-center justify-center gap-1 text-slate-400">
                      <FileText className="h-8 w-8" aria-hidden="true" />
                      <span className="text-xs font-semibold">PDF</span>
                    </span>
                  )}
                </a>
                <div className="flex items-start justify-between gap-1 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800" title={doc.fileName}>{doc.fileName}</p>
                    <p className="text-[11px] text-slate-500">{[DOCUMENT_CATEGORY_LABELS[doc.category], doc.toothNo ? `Diş ${doc.toothNo}` : "", formatDateText(doc.createdAt)].filter(Boolean).join(" · ")}</p>
                    {doc.note && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{doc.note}</p>}
                  </div>
                  {canArchive(doc) && <IconButton icon={Archive} title="Hasta dosyasından kaldır (arşivle)" size="sm" disabled={busyId === doc.id} onClick={() => void archive(doc)} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
