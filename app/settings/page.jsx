import { redirect } from "next/navigation";
import AccountShell from "@/components/account/AccountShell";
import SettingsForms from "@/components/account/SettingsForms";
import { createClient } from "@/utils/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fsettings");
  const { data: profile } = await supabase.from("profiles").select("price_alert_emails_enabled").eq("id", user.id).maybeSingle();
  return (
    <AccountShell user={user} profile={profile} eyebrow="Security and preferences" title="Account settings" description="Manage sign-in, notifications, active sessions, and your account data.">
      <SettingsForms user={user} profile={profile} />
    </AccountShell>
  );
}
