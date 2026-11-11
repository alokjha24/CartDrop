import { redirect } from "next/navigation";
import AuthPanel from "@/components/auth/AuthPanel";
import { createClient } from "@/utils/supabase/server";
import { safeInternalPath } from "@/lib/auth-validation.mjs";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const nextPath = safeInternalPath(typeof params?.next === "string" ? params.next : "/", "/");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(nextPath);
  return <AuthPanel mode="login" nextPath={nextPath} initialMessage={params?.passwordReset === "1" ? "Your password has been reset. Sign in with your new password." : ""} />;
}
