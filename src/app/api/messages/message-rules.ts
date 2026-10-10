import { NextResponse } from "next/server";

// Ekip mesajı kuralları — liste (GET), düzenleme (PATCH) ve silme (DELETE)
// aynı kuralı kullanır. Önceden ekran "yazma izni olan herkes her mesajı
// düzenleyebilir" sanıyordu; Doktor/Asistan/Banko başkasının mesajında
// çalışmayan Düzenle/Sil düğmeleri görüyordu. Artık her mesaj `canEdit`
// bayrağıyla döner ve düğmeler yalnız onda görünür.

/** Başkasının mesajını düzenleyip silebilen roller (moderasyon). */
export function canManageAllMessages(role: string) {
  return role === "YONETICI" || role === "SUPERADMIN";
}

export function canEditMessage(viewer: { id: string; role: string }, message: { userId: string }, canWrite: boolean) {
  return canWrite && (message.userId === viewer.id || canManageAllMessages(viewer.role));
}

/**
 * Sistem sahibinin kliniğe görünmez girişinde mesaj/duyuru klinik yöneticisi
 * adına kaydedilir ve personele yönetici yazmış gibi görünürdü (oturum bandı
 * "personel işlemlerinizi göremez" der). Bu oturumda yeni mesaj ve duyuru
 * yazılmaz; okuma ve yönetim (silme/yayından kaldırma) denetim kaydıyla sürer.
 */
export function rejectGhostAuthoring(user: { ghostSession?: boolean }, what: "mesaj" | "duyuru") {
  if (!user.ghostSession) return null;
  return NextResponse.json(
    {
      error: `Sistem sahibi oturumunda ekip ${what === "mesaj" ? "mesajı" : "duyurusu"} yazılamaz: kayıt klinik yöneticisi adına görünürdü.`,
      message: `Sistem sahibi oturumunda ekip ${what === "mesaj" ? "mesajı" : "duyurusu"} yazılamaz: kayıt klinik yöneticisi adına görünürdü.`,
    },
    { status: 403 },
  );
}
