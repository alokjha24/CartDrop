"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function GoogleReauthButton({ userId, nextPath = "/settings?reauth=delete" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const reauthenticate = async () => {
    setPending(true);
    setError("");
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", nextPath);
    callback.searchParams.set("expectedUser", userId);
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
      });
      if (authError) throw authError;
    } catch {
      setPending(false);
      setError("Unable to start Google reauthentication. Try again.");
    }
  };
  return (
    <div>
      <button type="button" onClick={reauthenticate} disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-60">
        {pending ? "Opening Google…" : "Reauthenticate with Google"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-200">{error}</p>}
    </div>
  );
}
