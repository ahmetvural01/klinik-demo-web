/**
 * Platform yönetimindeki geçici şifrelerin TEK üreticisi (yeni klinik
 * sahibi, klinik kullanıcısı, platform yöneticisi). Önceden üç ekranda üç
 * kopya vardı. Karışması kolay karakterler (0/O, 1/l/I) yok; telefonda
 * okunup yazdırılabilsin diye 10 karakter.
 */
export function generateTemporaryPassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}
