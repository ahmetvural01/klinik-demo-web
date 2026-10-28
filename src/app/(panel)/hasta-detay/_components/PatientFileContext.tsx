"use client";

import { createContext, useContext } from "react";
import type { PatientFormSection } from "@/components/patient/PatientFormModal";
import type { StaffLike } from "@/lib/staff-roles";
import type { ClinicLetterhead } from "./clinic-letterhead";
import type { ClinicTask, Pay, PatientBalance, PatientDetailData, TabKey } from "./patient-file-shared";

/**
 * "İşlem ekle" menüsünden gelen ve sekme açılınca yapılacak iş: menü yalnız
 * sekmeyi değiştirmekle kalmasın, işi başlatsın (tedavi aramasına odak, yeni
 * reçete penceresi, dosya seçici, onam penceresi, not kutusu).
 */
export type PatientFileIntent = "treatment" | "rx" | "upload" | "consent" | "note";

/**
 * Hasta dosyasının bütün sekmelerinin ortak bağlamı: hasta verisi, yenileme,
 * yetki ve sık kullanılan eylemler (tahsilat penceresi, sekme değiştirme...).
 * Her sekme kendi form durumunu kendisi tutar; ana bileşen yalnız veriyi ve
 * sekmeler arası köprüleri taşır.
 */
export type PatientFileContextValue = {
  patientId: string;
  data: PatientDetailData;
  /** Hasta dosyasını sunucudan yeniden okur. silent: iskelet göstermeden. */
  reload: (silent?: boolean) => Promise<void>;
  can: (permission: string) => boolean;
  canOpenTab: (key: TabKey) => boolean;
  selectTab: (key: TabKey) => void;
  hidePatientPhone: boolean;
  canEditPatient: boolean;
  /** Etkin hekimler (bkz. src/lib/staff-roles.ts). */
  doctors: StaffLike[];
  doctorsLoaded: boolean;
  currentUserId: string;
  /**
   * Oturumdaki kişinin adı; yalnız kabuk kimliği vermediyse dolar (boş olabilir).
   * Not damgasını ("[tarih - kişi]") artık sunucu atar.
   */
  currentUserName: string;
  /**
   * Doktor rolü (görünmez destek oturumu hariç): tedavi kaydı ve reçete yalnız
   * kendi adına açılır, başkasının kaydı değiştirilemez (sunucu kuralı). Formlarda
   * hekim alanı salt okunur kendi adıdır.
   */
  lockDoctorToSelf: boolean;
  /** Belge antedindeki klinik adı; ilk yazdırma/indirmede okunur (açılışta istek yok). */
  clinicName: string;
  /** Belge anteti (klinik adı, adres, telefon) — yazdırma/indirme anında okunur. */
  getLetterhead: () => Promise<ClinicLetterhead>;
  balance: PatientBalance;
  /**
   * Bakiye doğru hesaplanabildi mi? Tedavi kayıtlarını göremeyen rol bakiyeyi
   * sunucudan alır; o istek başarısızsa bakiye bilinmez — "₺0" gösterilmez.
   */
  balanceKnown: boolean;
  /**
   * Formlarda önerilen hekim (tahsilat, reçete, lab, görev, tedavi): ücrete
   * yansıyan son tedavinin hekimi (sunucu kuralı); yoksa sıradaki ya da son
   * randevunun hekimi.
   */
  recentDoctorId: string;
  /** Hastayı tedavi etmiş hekimlerin adları (yanlış hekim seçimi uyarısı için). */
  treatingDoctorNames: string[];
  /**
   * Hastayı tedavi etmiş hekimlerin kimlikleri — sunucu bakiyesinden de gelir;
   * tedavi kayıtlarını göremeyen rolde (banko) de "bu hekim tedavi etmedi"
   * uyarısı çalışır. Adla karşılaştırmadan güvenilirdir.
   */
  treatingDoctorIds: string[];
  /**
   * Hastaya bağlı görevler yalnız Özet görünürken okunur (Görevler bölümü
   * orada): hekim dosyayı Tedavi'de açtığında ve her sessiz yenilemede
   * gereksiz görev isteği atılmaz. Okunamadıysa liste boş değil hata gösterir.
   */
  clinicTasks: ClinicTask[];
  tasksLoaded: boolean;
  tasksError: boolean;
  /** Görevleri ilk kez okur; `retry` ile hata sonrası yeniden dener. */
  loadTasks: (retry?: boolean) => void;
  /** Laboratuvar adları yalnız Lab sekmesi ya da yeni lab işi penceresi açılınca okunur. */
  labNames: string[];
  labsLoading: boolean;
  loadLabNames: () => void;
  openPayment: (payment?: Pay) => void;
  /** Hasta formunu açar; `section` verilirse o katlanır bölüm açık gelir ("diger": notlar). */
  openEditPatient: (section?: PatientFormSection) => void;
  openLabCreate: () => void;
  /** Görev penceresi (Görevler sayfasıyla aynı form): görev verilirse düzenler. */
  openTaskForm: (task?: ClinicTask) => void;
  /** Yeni randevu formunu bu hasta seçili olarak açar (Randevular sayfası). */
  appointmentHref: string;
  intent: PatientFileIntent | null;
  clearIntent: () => void;
  /** Sekmeyi açar ve işi başlatır ("İşlem ekle" menüsüyle aynı yol; ör. randevu penceresindeki "Tedavi gir"). */
  startIntent: (key: TabKey, next: PatientFileIntent) => void;
};

const PatientFileContext = createContext<PatientFileContextValue | null>(null);

export const PatientFileProvider = PatientFileContext.Provider;

export function usePatientFile() {
  const value = useContext(PatientFileContext);
  if (!value) throw new Error("usePatientFile yalnız hasta dosyası içinde kullanılabilir.");
  return value;
}
