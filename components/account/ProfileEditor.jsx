"use client";

import Image from "next/image";
import { updateAvatar, updateProfile } from "@/app/actions/account";
import AccountActionForm from "@/components/account/AccountActionForm";

const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#0b1220]/80 px-3 text-sm text-white outline-none focus:border-orange-400/60 focus:ring-4 focus:ring-orange-500/10";

export default function ProfileEditor({ user, profile }) {
  const name = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || "";
  const avatar = profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || "";
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Personal information</h2>
        <p className="mt-1 text-sm text-slate-400">Your name appears in your CartDrop account menu.</p>
        <AccountActionForm action={updateProfile} submitLabel="Save profile" >
          <label className="block text-sm font-medium text-slate-200">Full name
            <input className={fieldClass} type="text" name="fullName" defaultValue={name} maxLength={120} autoComplete="name" required />
          </label>
        </AccountActionForm>
        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-400">Email</dt><dd className="mt-1 break-all font-medium">{user.email}</dd></div>
          <div><dt className="text-slate-400">Account created</dt><dd className="mt-1 font-medium">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-slate-400">Email status</dt><dd className={`mt-1 font-medium ${user.email_confirmed_at ? "text-emerald-300" : "text-amber-300"}`}>{user.email_confirmed_at ? "Verified" : "Not verified"}</dd></div>
        </dl>
      </section>

      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Profile picture</h2>
        <p className="mt-1 text-sm text-slate-400">JPG, PNG, or WebP, up to 3 MB. Profile images are public to anyone with the image link.</p>
        <div className="my-5 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-orange-500/15 text-2xl font-bold text-orange-100">
            {avatar ? <Image src={avatar} alt="Current profile" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : (name || user.email || "C").slice(0, 1).toUpperCase()}
          </div>
          <span className="text-sm text-slate-300">Visible to you in the CartDrop account menu.</span>
        </div>
        <AccountActionForm action={updateAvatar} submitLabel="Upload picture">
          <label className="block text-sm font-medium text-slate-200">Choose an image
            <input className={`${fieldClass} h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white`} type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required />
          </label>
        </AccountActionForm>
      </section>
    </div>
  );
}
