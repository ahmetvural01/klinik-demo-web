/**
 * Klinik paneli reklam kuralları (src/lib/panel-ads.ts) — saf fonksiyon testi.
 * Kullanım: npx tsx scripts/panel-ads-rules-test.ts
 */
import assert from "node:assert/strict";
import {
  adsTxtLine,
  adsenseScriptSrc,
  isAdSafeQuery,
  normalizeAdSlotId,
  normalizePublisherId,
  shouldShowPanelAd,
  type PanelAdContext,
} from "../src/lib/panel-ads";

const base: PanelAdContext = {
  enabled: true,
  publisherId: "ca-pub-1234567890123456",
  slotId: "1234567890",
  clinicAdsEnabled: true,
  ghost: false,
  pathname: "/anasayfa",
  search: "",
  referrer: "",
};

// Her koşul sağlanınca reklam görünür.
assert.equal(shouldShowPanelAd(base), true);

// Platform anahtarı, kimlikler, klinik anahtarı ve gizli giriş.
assert.equal(shouldShowPanelAd({ ...base, enabled: false }), false);
assert.equal(shouldShowPanelAd({ ...base, publisherId: "" }), false);
assert.equal(shouldShowPanelAd({ ...base, publisherId: "pub-1234567890123456" }), false, "normalize edilmemiş kimlik kabul edilmez");
assert.equal(shouldShowPanelAd({ ...base, slotId: "" }), false);
assert.equal(shouldShowPanelAd({ ...base, slotId: "12ab" }), false);
assert.equal(shouldShowPanelAd({ ...base, clinicAdsEnabled: false }), false);
assert.equal(shouldShowPanelAd({ ...base, ghost: true }), false);

// Sağlık ekranları ve "yetkiniz yok" ekranı reklamsız; benzer adlı ekranlar etkilenmez.
for (const pathname of ["/hasta-detay", "/hasta-detay/x", "/recete", "/tedavi-plani", "/muayene", "/yetkisiz"]) {
  assert.equal(shouldShowPanelAd({ ...base, pathname }), false, pathname);
}
for (const pathname of ["/hasta", "/hasta-takip", "/randevu", "/muhasebe", "/receteler-raporu"]) {
  assert.equal(shouldShowPanelAd({ ...base, pathname }), true, pathname);
}

// Adreste kişisel veri taşıyabilecek parametre varken reklam yok (Google'a gitmesin).
assert.equal(shouldShowPanelAd({ ...base, pathname: "/randevu", search: "tab=liste&donem=bu-ay" }), true);
assert.equal(shouldShowPanelAd({ ...base, pathname: "/randevu", search: "?yeni=1" }), true);
assert.equal(shouldShowPanelAd({ ...base, pathname: "/randevu", search: "yeni=1&patientId=c1&patientName=Ay%C5%9Fe" }), false);
assert.equal(shouldShowPanelAd({ ...base, pathname: "/hasta", search: "q=ayse" }), false);
assert.equal(shouldShowPanelAd({ ...base, pathname: "/muhasebe", search: "tab=alacaklar&q=Ay%C5%9Fe" }), false);
assert.equal(shouldShowPanelAd({ ...base, pathname: "/firma-detay", search: "id=abc" }), false);

// Önceki sayfa (referrer) da reklam isteğiyle gider.
assert.equal(shouldShowPanelAd({ ...base, referrer: "https://www.google.com/" }), true);
assert.equal(shouldShowPanelAd({ ...base, referrer: "https://panel.ornek.com/hasta?q=ayse" }), false);
assert.equal(shouldShowPanelAd({ ...base, referrer: "https://panel.ornek.com/klinik/giris" }), true);
assert.equal(shouldShowPanelAd({ ...base, referrer: "https://panel.ornek.com/klinik/giris?next=%2Fanasayfa&neden=oturum" }), true);
assert.equal(
  shouldShowPanelAd({ ...base, referrer: "https://panel.ornek.com/klinik/giris?next=%2Frandevu%3Fyeni%3D1%26patientName%3DAy%25C5%259Fe&neden=oturum" }),
  false,
  "girişten dönüş adresindeki hasta adı",
);
assert.equal(shouldShowPanelAd({ ...base, referrer: "bozuk adres" }), false);
assert.equal(isAdSafeQuery("next=%2Fhasta%3Fq%3Dx"), false);

// Yayıncı kimliği: kabul edilen yazımlar tek biçime iner.
assert.equal(normalizePublisherId("ca-pub-1234567890123456"), "ca-pub-1234567890123456");
assert.equal(normalizePublisherId("  PUB-1234567890123456 "), "ca-pub-1234567890123456");
assert.equal(normalizePublisherId("1234567890123456"), "ca-pub-1234567890123456");
assert.equal(
  normalizePublisherId('<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456" crossorigin="anonymous"></script>'),
  "ca-pub-1234567890123456",
);
assert.equal(normalizePublisherId("ca-pub-123"), null);
assert.equal(normalizePublisherId("ca-pub-12345678901234567"), null, "17 hane");
assert.equal(normalizePublisherId("abc"), null);

// Reklam birimi kimliği: rakam ya da kopyalanan koddaki data-ad-slot.
assert.equal(normalizeAdSlotId(" 1234567890 "), "1234567890");
assert.equal(normalizeAdSlotId('<ins class="adsbygoogle" data-ad-slot="9876543210"></ins>'), "9876543210");
assert.equal(normalizeAdSlotId("1234567890123456"), null, "yayıncı kimliği rakamları reklam birimi değildir");
assert.equal(normalizeAdSlotId("12-34"), null);

// ads.txt satırı ve betik adresi.
assert.equal(adsTxtLine("ca-pub-1234567890123456"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0");
assert.equal(
  adsenseScriptSrc("ca-pub-1234567890123456"),
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456",
);

console.log("Reklam alanı kuralları doğrulandı.");
