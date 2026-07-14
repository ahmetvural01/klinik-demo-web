// Bir endpoint'in "yavaş" sayılması için tek eşik tanımı — hem sunucu tarafı
// alarm listesi (src/lib/system-alerts.ts) hem istemci tarafı Sistem İzleme
// gecikme tablosu buradan okur, böylece aynı ekranda birbiriyle çelişen iki
// "yavaş" tanımı olmaz. Ayrı, sunucu bağımlılığı olmayan bir dosyada tutulur
// ki istemci bileşenleri güvenle import edebilsin.
export const SLOW_ROUTE_WARNING_MS = 1500;
export const SLOW_ROUTE_CRITICAL_MS = 5000;
