"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { safeInternalPath } from "@/lib/auth-validation.mjs";
import {
  requestPasswordReset,
  resendSignupConfirmation,
  setNewPassword,
  signInWithEmail,
  signUpWithEmail,
} from "@/app/actions/account";

function PasswordField({ label, name, autoComplete, required = true }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block text-sm font-medium text-slate-200">
      {label}
      <span className="relative mt-1.5 block">
        <input
          className="auth-input pr-12"
          type={visible ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          required={required}
          minLength={name === "password" || name === "confirmPassword" ? 12 : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-slate-400 hover:text-white"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function GoogleButton({ nextPath, termsAccepted }) {
  const [pending, setPending] = useState(false);
  const beginGoogle = async () => {
    if (!termsAccepted) {
      toast.error("Accept the Terms and Privacy Policy to continue with Google.");
      return;
    }
    setPending(true);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", safeInternalPath(nextPath, "/"));
    callback.searchParams.set("terms", "1");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
      if (error) throw error;
    } catch {
      setPending(false);
      toast.error("Unable to start Google sign in. Try again.");
    }
  };
  return (
    <button type="button" onClick={beginGoogle} disabled={pending} className="auth-secondary-button">
      <span className="text-base font-bold text-[#4285F4]" aria-hidden="true">G</span>
      {pending ? "Connecting to Google…" : "Continue with Google"}
    </button>
  );
}

export default function AuthPanel({ mode, email = "", nextPath = "/", initialMessage = "" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [seconds, setSeconds] = useState(mode === "verify" ? 60 : 0);
  const isLogin = mode === "login";

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    let result;
    try {
      if (mode === "signup") result = await signUpWithEmail(formData);
      else if (mode === "login") result = await signInWithEmail(formData);
      else if (mode === "forgot") result = await requestPasswordReset(formData);
      else if (mode === "reset") result = await setNewPassword(formData);
    } catch {
      result = { error: "Something went wrong. Please try again." };
    }
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.message) setMessage(result.message);
    if (result?.redirectTo) {
      router.replace(result.redirectTo);
      router.refresh();
      return;
    }
    if (result?.email) {
      router.replace(`/auth/verify?email=${encodeURIComponent(result.email)}`);
    }
  };

  const handleResend = async () => {
    setPending(true);
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("email", email);
    const result = await resendSignupConfirmation(formData);
    setPending(false);
    if (result.error) setError(result.error);
    else {
      setMessage(result.message);
      setSeconds(60);
    }
  };

  const heading = {
    login: "Welcome back",
    signup: "Create your account",
    verify: "Check your email",
    forgot: "Reset your password",
    reset: "Choose a new password",
  }[mode];
  const description = {
    login: "Sign in to see your tracked products and price alerts.",
    signup: "Create a free account to track products and get price alerts.",
    verify: `Open the confirmation email sent to ${email || "your email"} and click its link in this browser to finish signing in.`,
    forgot: "We’ll send a secure password reset link if the account exists.",
    reset: "Use a strong password you have not used on CartDrop before.",
  }[mode];

  return (
    <main className="app-background flex min-h-screen items-center justify-center px-4 py-10 text-[#F8FAFC]">
      <section className="glass-card w-full max-w-md rounded-3xl p-6 shadow-2xl sm:p-8">
        <Link href="/" className="mx-auto mb-6 flex w-fit items-center gap-2 text-sm font-semibold text-[#FDBA74]">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-[#F97316]"><ShoppingBag className="h-5 w-5" /></span>
          CartDrop
        </Link>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-[#FDBA74]">
            {mode === "verify" || mode === "forgot" || mode === "reset" ? <LockKeyhole className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 text-sm leading-6 text-[#B8C4D9]">{description}</p>
        </div>

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200">{message}</p>}

        {mode !== "verify" && <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <label className="block text-sm font-medium text-slate-200">Full name
              <input className="auth-input mt-1.5" type="text" name="fullName" autoComplete="name" maxLength={120} required />
            </label>
          )}
          {["login", "signup", "forgot"].includes(mode) && (
            <label className="block text-sm font-medium text-slate-200">Email address
              <input className="auth-input mt-1.5" type="email" name="email" defaultValue={email} autoComplete="email" required />
            </label>
          )}
          {["login", "signup", "reset"].includes(mode) && <PasswordField label="Password" name="password" autoComplete={isLogin ? "current-password" : mode === "reset" ? "new-password" : "new-password"} />}
          {["signup", "reset"].includes(mode) && <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" />}
          {mode === "signup" && (
            <label className="flex items-start gap-2.5 text-xs leading-5 text-slate-300">
              <input type="checkbox" name="terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 accent-[#F97316]" required />
              <span>I agree to CartDrop’s <Link className="text-[#FDBA74] underline" href="/terms">Terms</Link> and <Link className="text-[#FDBA74] underline" href="/privacy">Privacy Policy</Link>.</span>
            </label>
          )}
          {mode === "login" && <input type="hidden" name="next" value={safeInternalPath(nextPath, "/")} />}
          <button type="submit" disabled={pending} aria-busy={pending} className="auth-primary-button">
            {pending ? "Please wait…" : ({ login: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" }[mode])}
          </button>
        </form>}

        {mode === "login" && (
          <label className="mt-4 flex items-start gap-2.5 text-xs leading-5 text-slate-300">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 accent-[#F97316]" />
            <span>Accept the <Link className="text-[#FDBA74] underline" href="/terms">Terms</Link> and <Link className="text-[#FDBA74] underline" href="/privacy">Privacy Policy</Link> to continue with Google.</span>
          </label>
        )}

        {mode === "verify" && (
          <div className="mt-6">
            <p className="text-center text-sm text-[#B8C4D9]">We sent a confirmation email to <strong className="text-white">{email}</strong>.</p>
            <button type="button" onClick={handleResend} disabled={pending || seconds > 0} className="mt-4 w-full text-center text-sm text-[#FDBA74] disabled:text-slate-500">
              {pending ? "Sending…" : seconds > 0 ? `Resend link in ${seconds}s` : "Resend confirmation link"}
            </button>
          </div>
        )}
        {["login", "signup"].includes(mode) && (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-slate-500"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
            <GoogleButton nextPath={nextPath} termsAccepted={termsAccepted} />
          </>
        )}
        <div className="mt-6 text-center text-sm text-[#B8C4D9]">
          {mode === "login" && <><Link href="/auth/forgot-password" className="text-[#FDBA74] hover:underline">Forgot password?</Link><p className="mt-4">New to CartDrop? <Link href="/signup" className="font-semibold text-[#FDBA74] hover:underline">Create an account</Link></p></>}
          {mode === "signup" && <>Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-[#FDBA74] hover:underline">Sign in</Link></>}
          {["verify", "forgot", "reset"].includes(mode) && <Link href="/login" className="font-semibold text-[#FDBA74] hover:underline">Back to sign in</Link>}
        </div>
      </section>
    </main>
  );
}
