import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import AccountMenu from "@/components/ui/AccountMenu";

export default function AccountShell({ user, profile, eyebrow, title, description, children }) {
  return (
    <main className="app-background min-h-screen text-[#F8FAFC]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1220]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#FDBA74]">
            <ArrowLeft className="h-4 w-4" /> <span>CartDrop</span>
          </Link>
          <AccountMenu user={user} profile={profile} />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-7 max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#FDBA74]"><ShieldCheck className="h-4 w-4" />{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#B8C4D9]">{description}</p>
        </div>
        <div className="grid gap-5">{children}</div>
      </div>
    </main>
  );
}
