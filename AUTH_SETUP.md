# CartDrop authentication setup

The application now uses the existing Supabase Auth project for email/password, Google sign-in, signup confirmation links, password reset, email change, profile data, notification preferences, and account deletion.

## Apply the database changes

Apply [`supabase/migrations/20261111010000_create_profiles_and_secure_account_data.sql`](supabase/migrations/20261111010000_create_profiles_and_secure_account_data.sql) to the same Supabase project used by CartDrop. In Supabase Dashboard, open **SQL Editor**, paste the migration, and run it. This creates user profiles and the avatar bucket and strengthens row-level ownership rules for price alerts and alert events. Existing tracked products and price history remain in place.

## Set Vercel environment variables

In Vercel → CartDrop → **Settings → Environment Variables**, confirm these values are set for Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://cart-drop.vercel.app`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; needed for complete account deletion and already used by the price-check cron)

Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`. Redeploy after changing environment variables.

For local development, copy `.env.example` to `.env.local` and set the public Supabase URL and publishable key. Do not commit `.env.local`.

## Configure hosted Supabase Auth

These project settings are not applied to the hosted Supabase project by `supabase/config.toml`; that file configures local Supabase CLI development.

1. Open Supabase Dashboard → **Authentication → URL Configuration**.
2. Set **Site URL** to `https://cart-drop.vercel.app`.
3. Add `https://cart-drop.vercel.app/auth/callback` and `http://localhost:3000/auth/callback` to allowed redirect URLs. Add a Vercel preview URL only if you use previews.
4. Under **Authentication → Sign In / Providers → Email**, enable email signups and require email confirmation. Set the minimum password length to 12, require lowercase, uppercase, digits, and symbols, set OTP expiry to 900 seconds, and keep resend limits enabled.
5. Keep Supabase's default **Confirm signup** email template. The free hosted email sender sends a confirmation link, and CartDrop now handles that link through `/auth/callback`. Editing the hosted template to show a six-digit code requires custom SMTP, an email hook, or a plan that allows template customization.
6. Enable the password-changed security notification. Keep the existing Google provider enabled. Its Google OAuth redirect URI remains the Supabase callback URL shown in the Google provider settings.

The signup checkbox records acceptance in the profile row. The `/terms` and `/privacy` pages are starter policy text and should be reviewed before public launch.

## Email delivery limits to understand

Supabase's hosted built-in email sender is for trying Auth. It currently allows two messages per hour for the whole project and sends only to email addresses on your Supabase organization team. Other recipients are rejected. This affects signup verification, password reset, and email-change messages.

The existing CartDrop price-alert sender is separate. Brevo requires a verified sender and may restrict recipients until the account is approved for transactional sending. The application can record alerts and show them in CartDrop, but it cannot deliver email to every user until the mail provider permits it. Deploying on Vercel does not remove either provider restriction.

To enable email for all users, configure a custom SMTP provider (or Supabase Send Email Hook) for Supabase Auth, and verify a sender/domain in Brevo for price alerts. Set `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, and optionally `BREVO_FROM_NAME` in the deployment environment. Follow the provider's current free-tier and sender-verification requirements before choosing one.

## Run and verify locally

With local Supabase running, Auth emails are captured by Mailpit rather than sent to real inboxes. Open the local Mailpit URL printed by `supabase status`, create an account, and click its signup confirmation link. The hosted project requires the dashboard steps above and working email delivery to test with real users.

After the hosted migration, Auth URL settings, and Vercel variables are set, redeploy CartDrop. Then verify signup, the confirmation link, login, Google login, password reset, profile/avatar update, notification preference, other-session logout, and account deletion with test accounts. Check that each account sees only its own tracked products and alerts.
