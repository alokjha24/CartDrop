"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

const PENDING_PRODUCT_URL_KEY = "cartdrop.pending-product-url";

function savePendingProductUrl(value) {
  if (!value?.trim()) return true;
  try {
    window.sessionStorage.setItem(PENDING_PRODUCT_URL_KEY, value.trim());
    return true;
  } catch {
    toast.error("Unable to keep this product link. Please copy it before signing in.");
    return false;
  }
}

export function AuthModal({ isOpen, onClose, pendingProductUrl = "" }) {
  const supabase = createClient();
  const isSigningInRef = useRef(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleGoogleLogin = async () => {
    if (isSigningInRef.current) return;
    if (!termsAccepted) {
      toast.error("Accept the Terms and Privacy Policy to continue with Google.");
      return;
    }

    isSigningInRef.current = true;
    setIsSigningIn(true);
    const { origin } = window.location;
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("terms", "1");

    if (pendingProductUrl.trim()) {
      if (!savePendingProductUrl(pendingProductUrl)) {
        isSigningInRef.current = false;
        setIsSigningIn(false);
        return;
      }
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: { prompt: "select_account" },
        },
      });

      if (error) throw error;
    } catch (error) {
      isSigningInRef.current = false;
      setIsSigningIn(false);
      console.error("Google sign in failed:", error);
      toast.error(error?.message || "Unable to start Google sign in.");
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign In</DialogTitle>
          <DialogDescription>
            {pendingProductUrl.trim()
              ? "Sign in and we'll add this product for you."
              : "Track product prices and get alerts when they drop."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <Button
           onClick={handleGoogleLogin}
           disabled={isSigningIn}
           aria-busy={isSigningIn}
           variant="outline" 
           className="w-full gap-2" 
           size="lg">
             <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {isSigningIn ? "Connecting to Google..." : "Continue with Google"}
          </Button>
          <label className="flex items-start gap-2.5 text-xs leading-5 text-slate-400">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 accent-[#F97316]" />
            <span>I agree to CartDrop’s <Link className="text-[#FDBA74] underline" href="/terms">Terms</Link> and <Link className="text-[#FDBA74] underline" href="/privacy">Privacy Policy</Link>.</span>
          </label>
          <p className="text-center text-xs text-slate-400">or use email and password</p>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/login" onClick={(event) => { if (!savePendingProductUrl(pendingProductUrl)) event.preventDefault(); }} className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-slate-100 hover:bg-white/10">Sign in with email</Link>
            <Link href="/signup" onClick={(event) => { if (!savePendingProductUrl(pendingProductUrl)) event.preventDefault(); }} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#F97316] text-sm font-semibold text-white hover:bg-[#EA580C]">Create account</Link>
          </div>
        </div>

        
      </DialogContent>
    </Dialog>
  );
}
