"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Bell, ChevronDown, CircleUserRound, KeyRound, LogOut, Package, Settings, UserRound } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { getInitials } from "@/lib/auth-validation.mjs";

export default function AccountMenu({ user, profile }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const name = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || "CartDrop member";
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || "";
  const verified = Boolean(user.email_confirmed_at);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
        className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1.5 pr-2.5 text-left transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-500/20 text-xs font-bold text-orange-100">
          {avatarUrl ? <Image src={avatarUrl} alt="" width={28} height={28} unoptimized className="h-full w-full object-cover" /> : getInitials(name, user.email)}
        </span>
        <span className="hidden max-w-28 truncate text-xs font-semibold text-slate-100 sm:block">{name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-[60] mt-2 w-[min(19rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-[#111c2e] p-2 text-[#F8FAFC] shadow-2xl shadow-black/50 animate-in fade-in zoom-in-95">
          <div className="border-b border-white/10 px-3 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{user.email}</p>
            <p className={`mt-2 inline-flex items-center gap-1 text-xs ${verified ? "text-emerald-300" : "text-amber-300"}`}>
              {verified ? <BadgeCheck className="h-3.5 w-3.5" /> : <CircleUserRound className="h-3.5 w-3.5" />}
              {verified ? "Email verified" : "Email not verified"}
            </p>
          </div>
          <nav className="py-1" aria-label="Account">
            <MenuLink href="/profile" icon={<UserRound className="h-4 w-4" />} onClick={() => setOpen(false)}>My profile</MenuLink>
            <MenuLink href="/settings" icon={<Settings className="h-4 w-4" />} onClick={() => setOpen(false)}>Account settings</MenuLink>
            <MenuLink href="/settings#password" icon={<KeyRound className="h-4 w-4" />} onClick={() => setOpen(false)}>Change password</MenuLink>
            <MenuLink href="/#tracked" icon={<Package className="h-4 w-4" />} onClick={() => setOpen(false)}>Tracked products</MenuLink>
            <MenuLink href="/alerts" icon={<Bell className="h-4 w-4" />} onClick={() => setOpen(false)}>Price alerts</MenuLink>
          </nav>
          <form action={signOut} className="border-t border-white/10 pt-1">
            <button role="menuitem" type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-white">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon, children, onClick }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white">
      {icon}{children}
    </Link>
  );
}
