import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Sayfa Bulunamadı</h2>
        <p className="text-gray-500 mb-6">Aradığınız sayfa mevcut değil veya taşınmış olabilir.</p>
        <Link
          href="/anasayfa"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
