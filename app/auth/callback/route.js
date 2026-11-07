import { createClient } from "@/utils/supabase/server";
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
  } catch {
    console.error("OAuth callback session exchange failed.");
    return NextResponse.redirect(failureUrl);
  }

  return NextResponse.redirect(new URL("/", request.url));
}
