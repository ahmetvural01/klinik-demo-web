"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, FileText, Plus, RotateCcw, Upload, X } from "lucide-react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button, IconButton } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Section, SectionDivider } from "@/components/ui/Section";
import { formatDateText } from "@/components/ui/Money";
import { PatientConsentPanel } from "@/components/PatientConsentPanel";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { DOCUMENT_CATEGORY_LABELS, errorMessageOf, type PatientDocument } from "./patient-file-shared";

type Category = PatientDocument["category"];
type UploadMeta = { category: Category; toothNo: string; note: string };

type UploadItem = {
  key: string;
  file: File;
  name: string;
  size: number;
  status: "uploading" | "done" | "error" | "canceled";
  /** null: tarayıcı ilerlemeyi bildirmiyor (belirsiz çubuk gösterilir). */
  progress: number | null;
  error?: string;
  /**
   * Dosyanın kendisi reddedildi (tür, boyut ya da sunucunun içerik denetimi):
   * aynı dosyayı yeniden denemek işe yaramaz, "Başka dosya seç" sunulur.
   */
  rejected?: boolean;
  /**
   * Kuyruğa alınırken seçilen tür, diş no ve not dosyayla birlikte saklanır:
   * "Tekrar dene" bunlarla yükler. Önceden o anki (temizlenmiş) alanlarla
   * yüklüyor, röntgen diş numarasını ve notunu kaybediyordu.
   */
  meta: UploadMeta;
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 15 * 1024 * 1024;
const REALTIME_MIN_GAP_MS = 10_000;

/** Küçük dosyada "0.0 MB" yazmasın: KB / MB. */
const fileSizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

// Sekmeye dönünce liste beklemeden görünsün (arkada yenilenir). Kısa ömürlü:
// başka hastaya/şubeye geçince eski liste uzun süre gösterilmez.
const DOCUMENT_CACHE_MS = 2 * 60_000;
const documentCache = new Map<string, { at: number; list: PatientDocument[] }>();
const cachedDocuments = (patientId: string) => {
  const entry = documentCache.get(patientId);
  return entry && Date.now() - entry.at < DOCUMENT_CACHE_MS ? entry.list : null;
};

export function DocumentsTab() {
  const { data, patientId, can, intent, clearIntent } = usePatientFile();
  const canReadDocs = can("documents:read");
  const canReadXray = can("xray:read");
  const canWriteDocs = can("documents:write");
  const canWriteXray = can("xray:write");
  const canDeleteDocs = can("documents:delete");
  const canDeleteXray = can("xray:delete");

  const categoryOptions = ([
    { value: "RONTGEN" as Category, label: DOCUMENT_CATEGORY_LABELS.RONTGEN, disabled: !canWriteXray },
    { value: "FOTOGRAF" as Category, label: DOCUMENT_CATEGORY_LABELS.FOTOGRAF, disabled: !canWriteXray },
    { value: "BELGE" as Category, label: DOCUMENT_CATEGORY_LABELS.BELGE, disabled: !canWriteDocs },
  ]).map((option) => ({ ...option, disabledReason: option.disabled ? "Bu tür için yükleme yetkiniz yok" : undefined }));
  const firstAllowed = categoryOptions.find((option) => !option.disabled)?.value || "BELGE";
  const canUpload = canWriteDocs || canWriteXray;

  const cached = cachedDocuments(patientId);
  const [documents, setDocuments] = useState<PatientDocument[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState<Category>(firstAllowed);
  const [toothNo, setToothNo] = useState("");
  const [note, setNote] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [busyId, setBusyId] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents?patientId=${encodeURIComponent(patientId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Belgeler yüklenemedi."));
      const list = Array.isArray(body) ? (body as PatientDocument[]) : [];
      documentCache.set(patientId, { at: Date.now(), list });
      setDocuments(list);
      setLoadError("");
      lastLoadRef.current = Date.now();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Belgeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Klinikteki her değişiklik olay üretir; liste en sık 10 sn'de bir ve yalnız
  // sekme görünürken yenilenir (önceden her olayda hemen yeniden çekiliyordu).
  useEffect(() => {
    if (!canReadDocs && !canReadXray) { setLoading(false); return; }
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (document.hidden || timer) return;
      const wait = Math.max(400, REALTIME_MIN_GAP_MS - (Date.now() - lastLoadRef.current));
      timer = setTimeout(() => { timer = null; if (!document.hidden) void load(); }, wait);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [load, canReadDocs, canReadXray]);

  // "İşlem ekle" menüsünden gelen iş: dosya seçici ya da onam penceresi.
  useEffect(() => {
    if (intent === "upload") {
      clearIntent();
      if (!canUpload) return;
      // Sekme kodu geç inerse tarayıcı (özellikle iPad Safari) dosya seçiciyi
      // kullanıcı tıklaması dışında açmayabilir: düğme görünür ve odaklı kalsın.
      const button = document.getElementById("hd-doc-upload");
      button?.scrollIntoView({ block: "center" });
      button?.focus();
      fileInputRef.current?.click();
    } else if (intent === "consent") {
      clearIntent();
      if (canWriteDocs) setSignOpen(true);
    }
  }, [intent, clearIntent, canUpload, canWriteDocs]);

  const updateItem = (key: string, patch: Partial<UploadItem>) =>
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const upload = async (item: { file: File; key: string; meta: UploadMeta }) => {
    updateItem(item.key, { status: "uploading", progress: 0, error: undefined, rejected: false });
    try {
      const form = new FormData();
      form.append("patientId", patientId);
      form.append("category", item.meta.category);
      if (item.meta.toothNo.trim()) form.append("toothNo", item.meta.toothNo.trim());
      if (item.meta.note.trim()) form.append("note", item.meta.note.trim());
      form.append("file", item.file);
      // fetch gövde gönderim ilerlemesini bildirmediği için XMLHttpRequest:
      // gerçek yüzde ve gerçek iptal (abort) — API sözleşmesi aynı.
      const result = await new Promise<{ ok: boolean; status: number; body: unknown }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRefs.current.set(item.key, xhr);
        xhr.open("POST", "/api/documents");
        xhr.upload.onprogress = (event) => updateItem(item.key, { progress: event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null });
        xhr.onload = () => {
          let body: unknown = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* boş yanıt */ }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
        };
        xhr.onerror = () => reject(new Error("network"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.send(form);
      });
      xhrRefs.current.delete(item.key);
      if (!result.ok) {
        // 400/413/415: dosya reddedildi (ör. içerik seçilen türle uyuşmuyor).
        updateItem(item.key, { status: "error", error: errorMessageOf(result.body, "Belge yüklenemedi."), rejected: [400, 413, 415].includes(result.status) });
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
    // Belge türünde diş no alanı gizlidir; önceki röntgenden kalan diş no belgeye yazılmasın.
    const meta: UploadMeta = { category, toothNo: category === "BELGE" ? "" : toothNo, note };
    const items: UploadItem[] = [];
    const startable: { file: File; key: string; meta: UploadMeta }[] = [];
    for (const file of selected) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!ALLOWED_TYPES.includes(file.type)) {
        items.push({ key, file, name: file.name, size: file.size, status: "error", progress: null, error: "Yalnız JPG, PNG, WEBP veya PDF yüklenebilir.", rejected: true, meta });
      } else if (file.size > MAX_SIZE) {
        items.push({ key, file, name: file.name, size: file.size, status: "error", progress: null, error: "Dosya en fazla 15 MB olabilir.", rejected: true, meta });
      } else {
        items.push({ key, file, name: file.name, size: file.size, status: "uploading", progress: 0, meta });
        startable.push({ file, key, meta });
      }
    }
    setQueue((current) => [...current, ...items]);
    // Sonraki dosya için alanlar yalnız en az bir dosya yüklenmeye başladıysa
    // boşalır (bilgi kuyruktaki kayıtta kalır). Desteklenmeyen dosya seçilince
    // diş no ve not silinmiyordu; kullanıcı aynı bilgilerle başka dosya seçer.
    if (startable.length > 0) {
      setToothNo("");
      setNote("");
    }
    for (const item of startable) await upload(item);
  };

  /** Reddedilen dosyanın yerine başka dosya: tür, diş no ve not geri gelir, seçici açılır. */
  const chooseAnotherFile = (item: UploadItem) => {
    setQueue((current) => current.filter((entry) => entry.key !== item.key));
    setCategory(item.meta.category);
    setToothNo(item.meta.toothNo);
    setNote(item.meta.note);
    fileInputRef.current?.click();
  };

  const metaSummary = (meta: UploadMeta) => [
    DOCUMENT_CATEGORY_LABELS[meta.category],
    meta.category !== "BELGE" && meta.toothNo.trim() ? `Diş ${meta.toothNo.trim()}` : "",
    meta.note.trim() ? "not" : "",
  ].filter(Boolean).join(" · ");

  const archive = async (doc: PatientDocument) => {
    if (busyId) return;
    if (!(await confirmDialog({ message: `“${doc.fileName}” hasta dosyasından kaldırılsın mı? Dosya silinmez, arşivde saklanır.`, danger: true, confirmText: "Arşivle" }))) return;
    setBusyId(doc.id);
    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Belge kaldırılamadı."));
      setDocuments((current) => {
        const next = current.filter((item) => item.id !== doc.id);
        documentCache.set(patientId, { at: Date.now(), list: next });
        return next;
      });
      showToastSafe({ type: "success", message: "Belge arşivlendi." });
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Belge kaldırılamadı." });
    } finally {
      setBusyId("");
    }
  };

  const canArchive = (doc: PatientDocument) => (doc.category === "BELGE" ? canDeleteDocs : canDeleteXray);

  const metaSummaryText = [category !== "BELGE" && toothNo.trim() ? `Diş ${toothNo.trim()}` : "", note.trim() ? "not yazıldı" : ""].filter(Boolean).join(" · ");

  // Tek kart: yükleme seçenekleri belgelerin üstünde ince bir şerit, "Dosya
  // seç ve yükle" kart başlığında. Önceden "Belge / röntgen yükle" ayrı bir
  // kartta, içinde ayrıca çerçeveli "Diş no ve not" kutusu vardı.
  return (
    <div className="space-y-4">
      <Section
        title="Belgeler ve röntgenler"
        actions={canUpload ? (
          <>
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
            <Button id="hd-doc-upload" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>Dosya seç ve yükle</Button>
          </>
        ) : undefined}
      >
        {canUpload && (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-semibold text-slate-500" aria-hidden="true">Yüklenecek tür</span>
                <ChoiceCards label="Yüklenecek tür" labelHidden variant="pills" options={categoryOptions} value={category} onChange={setCategory} />
                {!metaOpen && (
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => setMetaOpen(true)}>
                    {category === "BELGE" ? "Not" : "Diş no ve not"}
                    {metaSummaryText && <span className="font-normal text-slate-500">· {metaSummaryText}</span>}
                  </Button>
                )}
              </div>
              {metaOpen && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {category !== "BELGE" && (
                    <FormField label="Diş no" htmlFor="hd-doc-tooth" hint="Ör. 26 ya da 36-37.">
                      <Input id="hd-doc-tooth" maxLength={40} value={toothNo} onChange={(event) => setToothNo(event.target.value)} />
                    </FormField>
                  )}
                  <FormField label="Not" htmlFor="hd-doc-note" hint="İsteğe bağlı">
                    <Input id="hd-doc-note" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
                  </FormField>
                </div>
              )}
              <p className="text-xs text-slate-500">JPG, PNG, WEBP ya da PDF · dosya başına en fazla 15 MB · birden çok dosya seçilebilir.</p>

              {queue.length > 0 && (
                <ul className="space-y-2" aria-label="Yüklemeler">
                  {queue.map((item) => (
                    <li key={item.key} className={`rounded-lg border px-3 py-2.5 ${item.status === "error" ? "border-red-200 bg-red-50" : item.status === "done" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{item.name}</p>
                        <span className="shrink-0 text-xs text-slate-500">{fileSizeText(item.size)}</span>
                      </div>
                      {item.status !== "done" && <p className="mt-0.5 text-xs text-slate-500">{metaSummary(item.meta)}</p>}
                      {item.status === "uploading" && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <ProgressBar
                            className="min-w-0 flex-1"
                            value={item.progress ?? 35}
                            aria-label={`${item.name} yükleniyor`}
                            valueLabel={false}
                          />
                          <span className="w-20 text-right text-xs font-semibold text-primary">{item.progress === null ? "Yükleniyor" : item.progress < 100 ? `%${item.progress}` : "İşleniyor"}</span>
                          <IconButton icon={X} title="Yüklemeyi durdur" size="sm" onClick={() => xhrRefs.current.get(item.key)?.abort()} />
                        </div>
                      )}
                      {(item.status === "error" || item.status === "canceled") && (
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-red-700">{item.status === "canceled" ? "Yükleme durduruldu." : item.error}</p>
                          <div className="flex gap-1.5">
                            {!item.rejected ? (
                              <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => void upload(item)}>Yeniden dene</Button>
                            ) : (
                              // Dosya reddedildi (tür, boyut, içerik): aynı bilgilerle başka dosya.
                              <Button size="sm" variant="secondary" icon={Upload} onClick={() => chooseAnotherFile(item)}>Başka dosya seç</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setQueue((current) => current.filter((entry) => entry.key !== item.key))}>Kaldır</Button>
                          </div>
                        </div>
                      )}
                      {item.status === "done" && <p className="mt-1 text-xs font-semibold text-emerald-700">Yüklendi.</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <SectionDivider />
          </>
        )}

        {loadError && documents.length === 0 ? (
          <LoadErrorState message={loadError} onRetry={() => { setLoading(true); void load(); }} />
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map((index) => <div key={index} className="ui-skeleton-shimmer h-40 rounded-lg bg-slate-100" />)}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState icon={FileText} compact title="Henüz belge ya da röntgen yok" description={canUpload ? "“Dosya seç ve yükle” ile ekleyin." : undefined} />
        ) : (
          <>
            {loadError && <LoadErrorState compact message={`${loadError} Son yüklenen liste gösteriliyor.`} onRetry={() => void load()} />}
            {/* Kutusuz kutucuk: görüntünün kendisi sınırdır; altında ad ve kısa satır,
                arşivleme çerçevesiz "…" menüsünde. */}
            <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              {documents.map((doc) => (
                <li key={doc.id} className="min-w-0">
                  <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200/70" title={`${doc.fileName} — yeni sekmede aç`}>
                    {doc.mimeType.startsWith("image/") ? (
                      // Küçük resim isteği (?view=thumb) erişim kaydına yazılır ama klinik genelinde yenileme tetiklemez.
                      <Image src={`/api/documents/${doc.id}/file?view=thumb`} alt={doc.fileName} width={320} height={128} unoptimized className="h-32 w-full object-cover" />
                    ) : (
                      <span className="flex h-32 w-full flex-col items-center justify-center gap-1 text-slate-400">
                        <FileText className="h-8 w-8" aria-hidden="true" />
                        <span className="text-xs font-semibold">PDF</span>
                      </span>
                    )}
                  </a>
                  <div className="mt-1.5 flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800" title={doc.fileName}>{doc.fileName}</p>
                      <p className="truncate text-xs text-slate-500" title={doc.note || undefined}>{[DOCUMENT_CATEGORY_LABELS[doc.category], doc.toothNo ? `Diş ${doc.toothNo}` : "", formatDateText(doc.createdAt)].filter(Boolean).join(" · ")}</p>
                      {doc.note && <p className="line-clamp-1 text-xs text-slate-500">{doc.note}</p>}
                    </div>
                    {canArchive(doc) && (
                      <ActionMenu
                        label={`${doc.fileName} için işlemler`}
                        items={[{ key: "archive", label: "Hasta dosyasından kaldır (arşivle)", icon: Archive, danger: true, disabled: busyId === doc.id, onSelect: () => void archive(doc) }]}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {canReadDocs && (
        <PatientConsentPanel
          patientId={patientId}
          patientName={data.fullName}
          patientTcNo={data.tcNo === "***" ? null : data.tcNo}
          canWrite={canWriteDocs}
          signOpen={signOpen}
          onSignOpenChange={setSignOpen}
        />
      )}
    </div>
  );
}
