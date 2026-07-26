import { SuperadminLoginForm } from "@/components/auth/superadmin-login-form";
import { decodeTokenUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SuperadminEntryPage() {
  const user = await decodeTokenUser();
  if (user?.role === "SUPERADMIN") {
    redirect("/superadmin/panel");
  }

  return <SuperadminLoginForm />;
}
