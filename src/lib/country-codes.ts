export type CountryCode = {
  /** Uluslararası arama kodu ("+90"); hasta kaydında `phoneCountryCode` olarak saklanır. */
  code: string;
  /** Bayrak için ISO 3166-1 alfa-2 kodu (flag-icons: `fi-<iso>`). */
  iso: string;
  name: string;
  label: string;
  /** Aramada eşleşen ek adlar (ör. Türkiye kodunu kullanan KKTC). */
  keywords?: string;
};

function country(code: string, iso: string, name: string, keywords?: string): CountryCode {
  return { code, iso, name, label: `${name} ${code}`, ...(keywords ? { keywords } : {}) };
}

// Her arama kodu listede bir kez geçer (değer koddur): aynı kodu paylaşan
// ülkeler tek satırda birlikte yazılır ("ABD / Kanada", "Rusya / Kazakistan").
// Sıralama bileşende yapılır (PhoneCountrySelect: Türkiye ve sık kodlar önce).
// Önceden 26 ülke vardı; listede olmayan ülkeden hasta kaydedilemiyordu (F4).
export const COUNTRY_CODES: CountryCode[] = [
  country("+90", "tr", "Türkiye", "KKTC Kuzey Kıbrıs"),
  country("+93", "af", "Afganistan"),
  country("+355", "al", "Arnavutluk"),
  country("+213", "dz", "Cezayir"),
  country("+376", "ad", "Andorra"),
  country("+49", "de", "Almanya"),
  country("+1", "us", "ABD / Kanada", "Amerika"),
  country("+971", "ae", "Birleşik Arap Emirlikleri", "BAE Dubai"),
  country("+44", "gb", "Birleşik Krallık", "İngiltere"),
  country("+31", "nl", "Hollanda"),
  country("+33", "fr", "Fransa"),
  country("+39", "it", "İtalya"),
  country("+34", "es", "İspanya"),
  country("+32", "be", "Belçika"),
  country("+41", "ch", "İsviçre"),
  country("+46", "se", "İsveç"),
  country("+47", "no", "Norveç"),
  country("+45", "dk", "Danimarka"),
  country("+7", "ru", "Rusya / Kazakistan", "Kazakistan"),
  country("+380", "ua", "Ukrayna"),
  country("+995", "ge", "Gürcistan"),
  country("+994", "az", "Azerbaycan"),
  country("+98", "ir", "İran"),
  country("+964", "iq", "Irak"),
  country("+966", "sa", "Suudi Arabistan"),
  country("+61", "au", "Avustralya"),
  // Komşu ve yakın ülkeler
  country("+963", "sy", "Suriye"),
  country("+359", "bg", "Bulgaristan"),
  country("+30", "gr", "Yunanistan"),
  country("+357", "cy", "Kıbrıs (Güney)", "Kıbrıs Cumhuriyeti"),
  country("+374", "am", "Ermenistan"),
  // Orta Asya
  country("+998", "uz", "Özbekistan"),
  country("+993", "tm", "Türkmenistan"),
  country("+996", "kg", "Kırgızistan"),
  country("+992", "tj", "Tacikistan"),
  country("+976", "mn", "Moğolistan"),
  // Orta Doğu ve Kuzey Afrika
  country("+962", "jo", "Ürdün"),
  country("+961", "lb", "Lübnan"),
  country("+974", "qa", "Katar"),
  country("+965", "kw", "Kuveyt"),
  country("+968", "om", "Umman"),
  country("+973", "bh", "Bahreyn"),
  country("+967", "ye", "Yemen"),
  country("+972", "il", "İsrail"),
  country("+970", "ps", "Filistin"),
  country("+20", "eg", "Mısır"),
  country("+218", "ly", "Libya"),
  country("+216", "tn", "Tunus"),
  country("+212", "ma", "Fas"),
  country("+249", "sd", "Sudan"),
  country("+252", "so", "Somali"),
  country("+251", "et", "Etiyopya"),
  country("+234", "ng", "Nijerya"),
  country("+27", "za", "Güney Afrika"),
  // Balkanlar ve Doğu Avrupa
  country("+389", "mk", "Kuzey Makedonya", "Makedonya"),
  country("+387", "ba", "Bosna-Hersek", "Bosna Hersek"),
  country("+383", "xk", "Kosova"),
  country("+381", "rs", "Sırbistan"),
  country("+382", "me", "Karadağ"),
  country("+385", "hr", "Hırvatistan"),
  country("+386", "si", "Slovenya"),
  country("+373", "md", "Moldova", "Gagavuzya"),
  country("+40", "ro", "Romanya"),
  country("+36", "hu", "Macaristan"),
  country("+420", "cz", "Çekya", "Çek Cumhuriyeti"),
  country("+421", "sk", "Slovakya"),
  country("+48", "pl", "Polonya"),
  country("+375", "by", "Belarus", "Beyaz Rusya"),
  country("+370", "lt", "Litvanya"),
  country("+371", "lv", "Letonya"),
  country("+372", "ee", "Estonya"),
  // Batı ve Kuzey Avrupa
  country("+43", "at", "Avusturya"),
  country("+358", "fi", "Finlandiya"),
  country("+353", "ie", "İrlanda"),
  country("+351", "pt", "Portekiz"),
  country("+352", "lu", "Lüksemburg"),
  // Asya ve diğerleri
  country("+91", "in", "Hindistan"),
  country("+92", "pk", "Pakistan"),
  country("+880", "bd", "Bangladeş"),
  country("+86", "cn", "Çin"),
  country("+81", "jp", "Japonya"),
  country("+82", "kr", "Güney Kore", "Kore"),
  country("+62", "id", "Endonezya"),
  country("+60", "my", "Malezya"),
  country("+55", "br", "Brezilya"),
  country("+54", "ar", "Arjantin"),
  country("+52", "mx", "Meksika"),
  country("+64", "nz", "Yeni Zelanda"),
];
