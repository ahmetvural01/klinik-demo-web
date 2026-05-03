"use client";

export default function LogoutButton() {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/superadmin";
  };

  return (
    <button
      onClick={handleLogout}
      className="w-full rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-sm font-semibold text-white transition"
    >
      Çıkış Yap
    </button>
  );
}
