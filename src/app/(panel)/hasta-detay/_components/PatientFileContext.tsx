"use client";

import { createContext, useContext } from "react";
import type { StaffLike } from "@/lib/staff-roles";
import type { ClinicTask, Pay, PatientBalance, PatientDetailData, TabKey, TreatmentPlanLite } from "./patient-file-shared";

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
  clinicName: string;
  balance: PatientBalance;
  /** Hastayı en son tedavi eden hekim — tahsilat/reçete formlarında varsayılan. */
  recentDoctorId: string;
  /** Hastayı tedavi etmiş hekimlerin adları (yanlış hekim seçimi uyarısı için). */
  treatingDoctorNames: string[];
  clinicTasks: ClinicTask[];
  tasksLoaded: boolean;
  treatmentPlans: TreatmentPlanLite[];
  openPayment: (payment?: Pay) => void;
  openEditPatient: () => void;
  openLabCreate: () => void;
  /** Yeni randevu formunu bu hasta seçili olarak açar (Randevular sayfası). */
  appointmentHref: string;
};

const PatientFileContext = createContext<PatientFileContextValue | null>(null);

export const PatientFileProvider = PatientFileContext.Provider;

export function usePatientFile() {
  const value = useContext(PatientFileContext);
  if (!value) throw new Error("usePatientFile yalnız hasta dosyası içinde kullanılabilir.");
  return value;
}
