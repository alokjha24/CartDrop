import AuthPanel from "@/components/auth/AuthPanel";
import { validateEmail } from "@/lib/auth-validation.mjs";

export default async function VerifyEmailPage({ searchParams }) {
  const params = await searchParams;
  const email = validateEmail(typeof params?.email === "string" ? params.email : "") ?? "";
  return <AuthPanel mode="verify" email={email} />;
}
