"use client";
import Link from "next/link";

export default function YetkisizPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.929 4.929l14.142 14.142M4.929 19.071l14.142-14.142" />
          <circle cx="12" cy="12" r="9" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="text-2xl font-black text-slate-900">Erişim Yetkiniz Yok</h1>
      <p className="text-sm text-slate-500 max-w-xs">
        Bu sayfaya erişmek için gerekli yetkiye sahip değilsiniz. Lütfen yöneticinizle iletişime geçin.
      </p>
      <Link href="/anasayfa" className="mt-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 transition">
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}
