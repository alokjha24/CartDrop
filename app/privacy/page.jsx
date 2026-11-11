import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="app-background min-h-screen px-4 py-12 text-[#F8FAFC]">
      <article className="glass-card mx-auto max-w-3xl rounded-3xl p-6 sm:p-10">
        <Link href="/signup" className="text-sm font-semibold text-[#FDBA74]">← Back to sign up</Link>
        <h1 className="mt-6 text-3xl font-bold">CartDrop Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated November 12, 2026</p>
        <div className="mt-7 space-y-5 text-sm leading-7 text-slate-200">
          <p>CartDrop stores the name, email address, sign-in provider details, and optional profile image you provide. Profile images are stored in a public bucket and can be viewed by anyone who has the image URL. CartDrop also stores the products, price history, and alert settings you add to your account.</p>
          <p>Supabase provides authentication, database, and file storage. Google sign-in is handled by Google and Supabase. CartDrop uses the email service configured by its operator to send account messages and price alerts.</p>
          <p>Your account data is scoped to your authenticated user. CartDrop uses it to provide sign-in, price tracking, alerts, profile settings, security, and account deletion. Product and alert records are removed when you delete your account.</p>
          <p>Do not add sensitive personal information to product links or profile fields. This policy describes the current application and should be reviewed by the CartDrop operator before public launch.</p>
        </div>
      </article>
    </main>
  );
}
