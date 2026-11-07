import Link from "next/link";
import { CircleAlert } from "lucide-react";

export default function AuthErrorPage() {
  return (
    <main className="app-background flex min-h-screen items-center justify-center px-4 text-center text-[#F8FAFC]">
      <section className="glass-card max-w-md rounded-3xl p-8">
        <CircleAlert
          className="mx-auto h-10 w-10 text-[#F97316]"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-2xl font-bold">Sign-in was not completed</h1>
        <p className="mt-2 text-sm text-[#B8C4D9]">
          We couldn&apos;t finish Google sign-in. Return to the dashboard and try
          again. If this keeps happening, check the Google provider and allowed
          callback URLs in Supabase.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#F97316] px-5 text-sm font-semibold text-white transition hover:bg-[#EA580C]"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
