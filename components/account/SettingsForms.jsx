"use client";

import {
  changePassword,
  deleteAccount,
  requestEmailChange,
  setAlertEmailPreference,
  signOutOtherSessions,
} from "@/app/actions/account";
import AccountActionForm from "@/components/account/AccountActionForm";
import GoogleReauthButton from "@/components/account/GoogleReauthButton";

const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#0b1220]/80 px-3 text-sm text-white outline-none focus:border-orange-400/60 focus:ring-4 focus:ring-orange-500/10";

export default function SettingsForms({ user, profile }) {
  const hasPassword = (user.app_metadata?.providers ?? []).includes("email");
  return (
    <div className="grid gap-5">
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Email and verification</h2>
        <p className="mt-1 text-sm text-slate-400">Current email: <span className="text-slate-200">{user.email}</span> · {user.email_confirmed_at ? "Verified" : "Not verified"}</p>
        <AccountActionForm action={requestEmailChange} submitLabel="Request email change" >
          <label className="block text-sm font-medium text-slate-200">New email address
            <input className={fieldClass} type="email" name="email" autoComplete="email" required />
          </label>
        </AccountActionForm>
      </section>

      <section id="password" className="glass-card scroll-mt-24 rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Password and security</h2>
        <p className="mt-1 text-sm text-slate-400">Sign-in method: {(user.app_metadata?.providers ?? []).join(", ") || "email"}. Last sign-in: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "unknown"}.</p>
        <p className="mt-2 text-sm text-slate-400">Use 12 or more characters with uppercase, lowercase, a number, and a symbol.</p>
        {!hasPassword && <div className="mt-4"><GoogleReauthButton userId={user.id} nextPath="/settings#password" /><p className="mt-2 text-xs text-slate-400">Reauthenticate before setting or changing an account password.</p></div>}
        <AccountActionForm action={changePassword} submitLabel="Update password" >
          {hasPassword && <label className="block text-sm font-medium text-slate-200">Current password
            <input className={fieldClass} type="password" name="currentPassword" autoComplete="current-password" required />
          </label>}
          <label className="block text-sm font-medium text-slate-200">New password
            <input className={fieldClass} type="password" name="password" autoComplete="new-password" minLength={12} required />
          </label>
          <label className="block text-sm font-medium text-slate-200">Confirm new password
            <input className={fieldClass} type="password" name="confirmPassword" autoComplete="new-password" minLength={12} required />
          </label>
        </AccountActionForm>
        <div className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold">Active sessions</h3>
          <p className="mt-1 text-sm text-slate-400">Sign out this CartDrop account from other devices. This device stays signed in.</p>
          <AccountActionForm action={signOutOtherSessions} submitLabel="Sign out other sessions" />
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Notification preferences</h2>
        <p className="mt-1 text-sm text-slate-400">Control whether CartDrop sends price-drop emails to {user.email}.</p>
        <AccountActionForm action={setAlertEmailPreference} submitLabel="Save notification preference">
          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input type="checkbox" name="enabled" value="true" defaultChecked={profile?.price_alert_emails_enabled !== false} className="mt-1 accent-[#F97316]" />
            <span>Email me when one of my price alerts is triggered.</span>
          </label>
        </AccountActionForm>
      </section>

      <section className="rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-red-100">Delete account</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-red-100/70">This permanently deletes your profile, tracked products, price history, alert rules, alert events, and uploaded images. This cannot be undone.</p>
        {!hasPassword && <div className="mt-4"><GoogleReauthButton userId={user.id} /><p className="mt-2 text-xs text-slate-400">For your safety, reauthenticate with the Google account used here before deleting.</p></div>}
        <AccountActionForm action={deleteAccount} submitLabel="Permanently delete account" danger>
          {hasPassword && <label className="block text-sm font-medium text-red-100">Current password
            <input className={`${fieldClass} border-red-300/20`} type="password" name="currentPassword" autoComplete="current-password" required />
          </label>}
          <label className="block text-sm font-medium text-red-100">Type DELETE to confirm
            <input className={`${fieldClass} border-red-300/20`} type="text" name="confirmation" autoComplete="off" required />
          </label>
        </AccountActionForm>
      </section>
    </div>
  );
}
