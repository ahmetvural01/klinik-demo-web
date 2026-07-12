const MAX_IMAGE_DIMENSION = 320;

/**
 * Seçilen görseli 320px'e küçültüp JPEG data-URL'e çevirir. Sonuç doğrudan
 * bir metin alanına (ör. Profile.photoUrl) yazılabilecek kadar küçük kalır —
 * ayrı bir dosya depolama/servis rotasına gerek kalmaz.
 */
export function downscaleImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Görsel açılamadı"));
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas desteklenmiyor")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
