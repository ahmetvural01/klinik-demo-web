import { SuperadminLoginForm } from "@/components/auth/superadmin-login-form";
import { decodeTokenUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function SuperadminEntryPage() {
  const user = decodeTokenUser();
  if (user?.role === "SUPERADMIN") {
    redirect("/superadmin/panel");
  }

  return <SuperadminLoginForm />;
}
