"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

const DEFAULT_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const FORMAT_NAMES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/gif": "GIF",
  "image/svg+xml": "SVG",
  "image/avif": "AVIF",
};

const SIZE_NUMBER = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

/** ["image/png","image/jpeg","image/gif"] → "PNG, JPG veya GIF" */
function formatList(types: readonly string[]) {
  const names = Array.from(new Set(types.map((type) => FORMAT_NAMES[type] || type.replace(/^image\//, "").toUpperCase())));
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} veya ${names[names.length - 1]}`;
}

/** 409600 → "400 KB", 8388608 → "8 MB" */
function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${SIZE_NUMBER.format(bytes / (1024 * 1024))} MB`;
  return `${SIZE_NUMBER.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onerror = () => reject(new Error("decode"));
    image.onload = () => resolve(image);
    image.src = source;
  });
}

/**
 * Uzun kenarı `maxDimension`'a indirip data URL üretir (lib/image-upload.ts
 * downscaleImageToDataUrl ile aynı yol: 320 + image/jpeg + 0.85 aynı sonucu
 * verir). JPEG'de saydam alan siyah çıkmasın diye zemin önce beyaza boyanır.
 */
async function resizeToDataUrl(file: File, maxDimension: number, outputType: string, quality: number) {
  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("decode");
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  if (outputType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(outputType, quality);
}

type ImageUploadFieldProps = {
  /** Mevcut görsel: adres ya da data URL. "" = görsel yok. */
  value: string;
  /**
   * Yeni görselin data URL'i; "Kaldır"da "". Promise dönerse (ör. hemen
   * sunucuya kaydediliyorsa) bitene kadar düğmeler meşgul görünür; hata
   * fırlatırsa mesajı alanın altında gösterilir.
   */
  onChange: (dataUrl: string) => void | Promise<unknown>;
  /** Görselin adı: "Logo", "Fotoğraf". Grubun erişilebilir adı ve mesajların öznesidir ("Logo yükle"). */
  label: string;
  /**
   * Adı alanın üstünde görünür etiket olarak yaz (FormField etiketiyle aynı
   * biçim). Formda başka alanlarla birlikte duran görselde verin; görsel yüklü
   * iken düğme "Değiştir" olduğundan ad yoksa ekrandan kalkar. Ad zaten bölüm
   * başlığında yazıyorsa (Section/FormSection "Logo") vermeyin.
   */
  showLabel?: boolean;
  /** "round": kişi fotoğrafı (daire, kırpılır). "square": logo (kare, kırpılmadan sığdırılır). */
  shape?: "round" | "square";
  /** Kabul edilen MIME türleri. Varsayılan JPG, PNG, WEBP. */
  accept?: readonly string[];
  /** Seçilen DOSYANIN üst sınırı (küçültmeden önce). Varsayılan 8 MB. */
  maxBytes?: number;
  /**
   * Verilirse görsel tarayıcıda uzun kenarı bu piksele küçültülüp
   * `outputType` olarak kaydedilir (kişi fotoğrafı: 320). Verilmezse dosya
   * olduğu gibi okunur (logo: saydamlık ve GIF korunur).
   */
  maxDimension?: number;
  /** Küçültme çıktısı (varsayılan image/jpeg). Saydamlık gerekiyorsa image/png. */
  outputType?: "image/jpeg" | "image/png" | "image/webp";
  /** Küçültme kalitesi 0–1 (varsayılan 0.85). */
  quality?: number;
  /** Görsel yokken önizleme yerine (ör. kişi için <Avatar name={ad} size="lg" />). */
  placeholder?: ReactNode;
  /** Biçim/boyut satırının sonuna eklenen kısa not ("Arka planı şeffaf PNG en iyi görünür."). */
  hint?: ReactNode;
  /** Dışarıdan hata (ör. kaydedilemedi). Alanın kendi hatasıyla aynı yerde görünür. */
  error?: string | null;
  disabled?: boolean;
  /** Yalnız önizleme (yazma yetkisi yok): düğmeler ve açıklama gizlenir. */
  readOnly?: boolean;
  className?: string;
};

/**
 * Görsel yükleme alanı — TEK görünüm: önizleme + "… yükle / Değiştir" +
 * "Kaldır" + biçim/boyut notu + hata. Ayarlar > Logo, personel fotoğrafı ve
 * profil fotoğrafı aynı işi üç farklı düğme adı ve mesajla yapıyordu. Dosya
 * türü ve boyutu seçilir seçilmez denetlenir, görsel data URL olarak üst
 * bileşene verilir (ayrı dosya sunucusu gerekmez). Önizlemeye dosya
 * sürükleyip bırakmak da çalışır.
 *
 *   // Kişi fotoğrafı (eski downscaleImageToDataUrl davranışı)
 *   <ImageUploadField label="Fotoğraf" shape="round" value={photoUrl} onChange={setPhotoUrl}
 *     maxDimension={320} placeholder={<Avatar name={fullName} size="lg" />} />
 *   // Klinik logosu (eski GenelTab davranışı); formda başka alanlarla birlikteyse showLabel
 *   <ImageUploadField label="Logo" showLabel value={logoUrl} onChange={setLogoUrl} maxBytes={400 * 1024}
 *     accept={["image/png", "image/jpeg", "image/webp", "image/gif"]} hint="Arka planı şeffaf PNG en iyi görünür." />
 */
export function ImageUploadField({
  value,
  onChange,
  label,
  showLabel = false,
  shape = "square",
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  maxDimension,
  outputType = "image/jpeg",
  quality = 0.85,
  placeholder,
  hint,
  error,
  disabled = false,
  readOnly = false,
  className = "",
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const labelId = useId();
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hasImage = value.trim() !== "";
  const formats = formatList(accept);
  const interactive = !readOnly && !disabled && !pending;
  const shownError = localError || error || null;

  const commit = async (next: string) => {
    setPending(true);
    try {
      await onChange(next);
    } catch (caught) {
      // Tarayıcının İngilizce ağ hatası ("Failed to fetch") gösterilmez (§3).
      const ownMessage = caught instanceof Error && caught.message && !(caught instanceof TypeError) && caught.name !== "AbortError";
      setLocalError(ownMessage ? (caught as Error).message : `${label} kaydedilemedi. Yeniden deneyin.`);
    } finally {
      setPending(false);
    }
  };

  const selectFile = async (file?: File | null) => {
    if (!file) return;
    setLocalError(null);
    if (!accept.includes(file.type)) {
      setLocalError(`${label} ${formats} biçiminde olmalıdır.`);
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(`${label} dosyası en fazla ${formatBytes(maxBytes)} olabilir. Daha küçük bir görsel seçin.`);
      return;
    }
    let dataUrl: string;
    setPending(true);
    try {
      dataUrl = maxDimension ? await resizeToDataUrl(file, maxDimension, outputType, quality) : await readAsDataUrl(file);
    } catch (caught) {
      setPending(false);
      setLocalError(
        caught instanceof Error && caught.message === "read"
          ? "Dosya okunamadı. Başka bir görsel deneyin."
          : `${label} işlenemedi. ${formats} deneyin.`,
      );
      return;
    }
    await commit(dataUrl);
  };

  const openPicker = () => {
    if (interactive) inputRef.current?.click();
  };

  const dragProps = interactive
    ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          void selectFile(event.dataTransfer.files?.[0]);
        },
      }
    : {};

  const frameShape = shape === "round" ? "h-16 w-16 rounded-full" : "h-20 w-20 rounded-lg";
  const preview = hasImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={value}
      alt=""
      className={`${frameShape} shrink-0 border border-slate-200 ${shape === "round" ? "object-cover" : "bg-slate-50 object-contain p-1"}`}
    />
  ) : placeholder ? (
    <span className="flex shrink-0">{placeholder}</span>
  ) : (
    <span className={`${frameShape} flex shrink-0 items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-slate-400`}>
      <ImagePlus className="h-6 w-6" aria-hidden="true" />
    </span>
  );

  const group = (
    <div
      role="group"
      aria-label={showLabel ? undefined : label}
      aria-labelledby={showLabel ? labelId : undefined}
      className={`ui-image-upload flex items-center gap-3 sm:gap-4 ${showLabel ? "" : className}`}
      {...dragProps}
    >
      {/* Önizlemeye tıklamak da dosya seçer; klavye kullanıcısı için asıl düğme yanda. */}
      <div
        aria-hidden="true"
        onClick={openPicker}
        className={`relative shrink-0 ${shape === "round" ? "rounded-full" : "rounded-lg"} ${interactive ? "cursor-pointer" : ""} ${dragging ? "ring-2 ring-primary/50 ring-offset-2" : ""}`}
      >
        {preview}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={accept.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              disabled={!interactive}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Aynı dosya yeniden seçilebilsin.
                event.target.value = "";
                void selectFile(file);
              }}
            />
            <Button variant="secondary" size="sm" icon={Upload} loading={pending} disabled={disabled} onClick={openPicker} aria-describedby={messageId}>
              {hasImage ? "Değiştir" : `${label} yükle`}
            </Button>
            {hasImage && (
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={disabled || pending}
                onClick={() => {
                  setLocalError(null);
                  void commit("");
                }}
              >
                Kaldır
              </Button>
            )}
          </div>
        )}
        {shownError ? (
          <p id={messageId} role="alert" className="text-xs font-medium text-red-600">{shownError}</p>
        ) : !readOnly ? (
          <p id={messageId} className="text-xs leading-5 text-slate-500">
            {formats}; en fazla {formatBytes(maxBytes)}.{hint ? <> {hint}</> : null}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (!showLabel) return group;
  return (
    <div className={className}>
      <p id={labelId} className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">{label}</p>
      {group}
    </div>
  );
}
