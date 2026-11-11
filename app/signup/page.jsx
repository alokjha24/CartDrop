import { redirect } from "next/navigation";
import AuthPanel from "@/components/auth/AuthPanel";
import { createClient } from "@/utils/supabase/server";

export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  return <AuthPanel mode="signup" />;
}
