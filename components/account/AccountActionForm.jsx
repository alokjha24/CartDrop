"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountActionForm({ action, submitLabel, children, danger = false }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setFeedback(null);
    let result;
    try {
      result = await action(formData);
    } catch {
      result = { error: "Something went wrong. Please try again." };
    }
    setPending(false);
    setFeedback(result?.error ? { type: "error", text: result.error } : { type: "success", text: result?.message || "Saved." });
    if (result?.redirectTo) {
      router.replace(result.redirectTo);
      router.refresh();
    } else if (result?.success) {
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {children}
      {feedback && (
        <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2.5 text-sm ${feedback.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
          {feedback.text}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60 ${danger ? "border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20" : "bg-[#F97316] text-white hover:bg-[#EA580C]"}`}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
