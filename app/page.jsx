import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bell,
  CircleCheck,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import AddProductForm from "@/components/ui/AddProductForm";
import AuthButton from "@/components/ui/AuthButton";
import FavoritesButton from "@/components/ui/FavoritesButton";
import { createClient } from "@/utils/supabase/server";
import { getProducts } from "./actions/auth";
import TrackedProducts from "@/components/ui/TrackedProducts";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Verified price data",
    description: "We read the live selling price instead of confusing it with MRP or crossed-out prices.",
  },
  {
    icon: BellRing,
    title: "Smart price history",
    description: "See meaningful changes over time and know whether today is a good time to buy.",
  },
  {
    icon: Zap,
    title: "One-click refresh",
    description: "Refresh any tracked product whenever you want the latest available price.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const products = user ? await getProducts() : [];

  return (
    <main className="app-background relative min-h-screen text-[#F8FAFC]">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="background-orb background-orb-orange" />
      </div>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1220]/55 shadow-lg shadow-black/20 backdrop-blur-3xl supports-[backdrop-filter]:bg-[#0B1220]/35">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0" aria-label="CartDrop home">
            <Image src="/logoCD.png" alt="CartDrop" width={600} height={200} className="h-9 w-auto" priority />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#B8C4D9] md:flex">
            <a href="#tracked" className="transition hover:text-[#F97316]">Price tracker</a>
            <a href="#how-it-works" className="transition hover:text-[#F97316]">How it works</a>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7cc] px-3 py-1 text-xs font-semibold text-[#8a6800]">
              <Sparkles className="h-3.5 w-3.5" /> Smart shopping
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user && (
              <>
                <FavoritesButton products={products} />
                <Link
                  href="/alerts"
                  aria-label="View all alerts"
                  title="View all alerts"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#F97316]/60 text-[#FDBA74] transition hover:bg-orange-500/10 sm:h-10 sm:w-10"
                >
                  <Bell className="h-4 w-4" />
                </Link>
              </>
            )}
            <AuthButton user={user} />
          </div>
        </div>
      </header>

      <section className="relative z-10 overflow-hidden px-4 pb-20 pt-14 text-white sm:pt-20">
        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-orange-100">
              <CircleCheck className="h-4 w-4 text-[#ffe500]" />
              Your personal price intelligence dashboard
            </div>
            <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              Buy at the right price, not just the current price.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Track products from your favorite stores, compare meaningful price changes, and make confident purchase decisions.
            </p>
            <div className="mt-8">
              <AddProductForm user={user} />
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-[#168A52]" />
              No fake discounts. No invented ratings. Just the price we can verify.
            </p>
          </div>
          <div className="mt-12 grid max-w-3xl grid-cols-3 gap-2 sm:gap-5">
            {[
              ["Live", "selling prices"],
              ["7D / 1M / 3M", "history views"],
              ["Any store", "one dashboard"],
            ].map(([value, label]) => (
              <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:p-4">
                <p className="whitespace-nowrap text-[clamp(0.82rem,3.8vw,1.5rem)] font-bold tracking-tight">{value}</p>
                <p className="mt-1 truncate text-[10px] text-slate-400 sm:text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tracked" className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {user && products.length > 0 ? (
          <>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#F97316]">Your dashboard</p>
                <h2 className="text-3xl font-bold tracking-tight text-[#F8FAFC]">Tracked products</h2>
                <p className="mt-2 text-sm text-[#B8C4D9]">Keep an eye on every product you may want to buy.</p>
              </div>
              <div className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-[#0B1220]/65 px-4 py-2 text-sm font-medium text-[#B8C4D9] shadow-lg shadow-black/20 backdrop-blur-xl">
                <LayoutGrid className="h-4 w-4 text-[#F97316]" />
                {products.length} {products.length === 1 ? "product" : "products"}
              </div>
            </div>
            <TrackedProducts products={products} />
          </>
        ) : (
          <div id="how-it-works">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#F97316]">Simple by design</p>
              <h2 className="text-3xl font-bold tracking-tight text-[#F8FAFC] sm:text-4xl">A calmer way to shop online</h2>
              <p className="mt-3 text-[#B8C4D9]">Paste a product link once. CartDrop keeps the price story easy to understand.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }, index) => (
                <div key={title} className="glass-card relative rounded-2xl p-6">
                  <span className="absolute right-5 top-5 text-sm font-bold text-slate-300">0{index + 1}</span>
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-[#F97316]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-[#F8FAFC]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#B8C4D9]">{description}</p>
                </div>
              ))}
            </div>
            {user && (
              <div className="glass-card mx-auto mt-10 flex max-w-2xl flex-col gap-4 rounded-2xl border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-50 p-2.5 text-[#168A52]"><TrendingDown className="h-5 w-5" /></div>
                  <div>
                    <p className="font-semibold text-[#F8FAFC]">Your tracker is ready</p>
                    <p className="text-sm text-[#B8C4D9]">Add your first product above to get started.</p>
                  </div>
                </div>
                <ArrowRight className="hidden h-5 w-5 text-slate-300 sm:block" />
              </div>
            )}
          </div>
        )}
      </section>

      <footer className="relative z-10 border-t border-slate-800/80 bg-[#0B1220]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-[#B8C4D9] sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} CartDrop</span>
          <span>Smarter decisions for every cart.</span>
        </div>
      </footer>
    </main>
  );
}
