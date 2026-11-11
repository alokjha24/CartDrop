import { createClient } from "@/utils/supabase/server";
import { safeInternalPath } from "@/lib/auth-validation.mjs";
import { NextResponse } from "next/server";

export async function GET(request) {
  const callbackUrl = new URL(request.url);
  const { searchParams } = callbackUrl;

  const code = searchParams.get("code");
  const providerError = searchParams.get("error");
  const failureUrl = new URL("/auth/error", request.url);

  if (providerError || !code) {
    return NextResponse.redirect(failureUrl);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("OAuth callback session exchange failed.");
      return NextResponse.redirect(failureUrl);
    }
    const { data: { user } } = await supabase.auth.getUser();
    const expectedUserId = searchParams.get("expectedUser");
    if (expectedUserId && user?.id !== expectedUserId) {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(failureUrl);
    }
    if (searchParams.get("terms") === "1") {
      if (user) {
        const { error: termsError } = await supabase.from("profiles").upsert({
          id: user.id,
          full_name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
          terms_accepted_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (termsError) console.error("Terms acceptance could not be saved for the OAuth account.");
      }
    }
  } catch {
    console.error("OAuth callback session exchange failed.");
    return NextResponse.redirect(failureUrl);
  }

  const destination = safeInternalPath(searchParams.get("next"), "/");
  return NextResponse.redirect(new URL(destination, callbackUrl.origin));
}
