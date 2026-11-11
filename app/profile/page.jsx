import { redirect } from "next/navigation";
import AccountShell from "@/components/account/AccountShell";
import ProfileEditor from "@/components/account/ProfileEditor";
import { createClient } from "@/utils/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fprofile");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (
    <AccountShell user={user} profile={profile} eyebrow="Your account" title="My profile" description="Manage the details shown on your CartDrop account.">
      <ProfileEditor user={user} profile={profile} />
    </AccountShell>
  );
}
