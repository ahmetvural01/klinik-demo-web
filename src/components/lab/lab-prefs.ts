// "Yeni lab işi" formunda son kullanılan laboratuvar ve hekim — kullanıcıya
// özel bir kolaylık (tarayıcıda tutulur; okunamazsa form boş açılır, iş
// kuralı buna bağlı değildir). Banko/asistan çoğu işi aynı laboratuvara ve
// aynı hekim adına açtığı için iki seçimi her seferinde tekrarlamasın.

export type LabFormPrefs = { labName?: string; doctorId?: string };

function storageKey(scopeKey: string) {
  return `klinikcep-lab-son:${scopeKey}`;
}

export function readLabFormPrefs(scopeKey: string): LabFormPrefs {
  if (!scopeKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(scopeKey));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    return {
      labName: typeof record.labName === "string" ? record.labName : undefined,
      doctorId: typeof record.doctorId === "string" ? record.doctorId : undefined,
    };
  } catch {
    return {};
  }
}

export function writeLabFormPrefs(scopeKey: string, prefs: LabFormPrefs) {
  if (!scopeKey) return;
  try {
    window.localStorage.setItem(storageKey(scopeKey), JSON.stringify(prefs));
  } catch {
    // Depolama kapalıysa (gizli pencere vb.) yalnız varsayılan kaybolur.
  }
}
