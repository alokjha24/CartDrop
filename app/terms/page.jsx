import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="app-background min-h-screen px-4 py-12 text-[#F8FAFC]">
      <article className="glass-card mx-auto max-w-3xl rounded-3xl p-6 sm:p-10">
        <Link href="/signup" className="text-sm font-semibold text-[#FDBA74]">← Back to sign up</Link>
        <h1 className="mt-6 text-3xl font-bold">CartDrop Terms</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated November 12, 2026</p>
        <div className="mt-7 space-y-5 text-sm leading-7 text-slate-200">
          <p>CartDrop helps you track public product prices and configure alerts. Price information comes from third-party stores and can change or be unavailable. Check the retailer’s final price and terms before buying.</p>
          <p>Keep your account credentials private and use the service only for lawful personal or business shopping. Do not attempt to access another person’s account, disrupt the service, or misuse retailer websites.</p>
          <p>You can change your profile, notification preference, password, or delete your account in Account Settings. Deleting an account removes its tracked products, price history, alerts, and profile data from CartDrop.</p>
          <p>The service is provided as available. CartDrop does not sell products or guarantee that every monitored retailer page will remain accessible or that an alert will arrive before a price changes.</p>
        </div>
      </article>
    </main>
  );
}
