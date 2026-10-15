import Link from "next/link";
import { ArrowLeft, Bell, ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getAllPriceAlerts } from "@/app/actions/alerts";
import AlertsList from "@/components/ui/AlertsList";

export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="app-background flex min-h-screen items-center justify-center px-4 text-center text-[#F8FAFC]">
        <div className="glass-card max-w-md rounded-3xl p-8">
          <Bell className="mx-auto h-10 w-10 text-[#F97316]" />
          <h1 className="mt-4 text-2xl font-bold">Sign in to view alerts</h1>
          <p className="mt-2 text-sm text-[#B8C4D9]">
            Your price alerts are private and available only in your CartDrop account.
          </p>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#F97316] transition hover:text-[#FDBA74]">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F97316] text-[#F97316] transition hover:bg-[#F97316]/10">
              <ArrowLeft className="h-4 w-4" />
            </span>
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const result = await getAllPriceAlerts();

  return (
    <main className="app-background min-h-screen text-[#F8FAFC]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B1220]/55 backdrop-blur-3xl supports-[backdrop-filter]:bg-[#0B1220]/35">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#F97316] transition hover:text-[#FDBA74]">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F97316] text-[#F97316] transition hover:bg-[#F97316]/10">
              <ArrowLeft className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1.5 text-xs font-semibold text-[#FDBA74] sm:gap-2 sm:px-3 sm:text-sm">
            <Bell className="h-4 w-4" /> Price alerts
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[#F97316]/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#FDBA74]">Stay ahead of the drop</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Your price alert centre</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#B8C4D9] sm:mt-4 sm:text-base sm:leading-7">
            Every alert in one place. See what you are waiting for, how close each product is, and update settings anytime.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Alerts use verified price observations only
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
        <AlertsList initialAlerts={result.alerts ?? []} error={result.error} />
      </section>
    </main>
  );
}
