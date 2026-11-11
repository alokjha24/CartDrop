"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAuthCallbackUrl } from "@/lib/auth-urls.mjs";
import { safeInternalPath, validateEmail, validatePassword } from "@/lib/auth-validation.mjs";

const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formString(formData, name) {
  return String(formData?.get(name) ?? "").trim();
}

function errorResult(error, fallback) {
  const message = String(error?.message ?? "").toLowerCase();
  if (error?.code === "email_address_not_authorized") {
    return { error: "Supabase is only allowed to email project team members right now. Configure custom SMTP before inviting other users." };
  }
  if (error?.code === "over_email_send_rate_limit" || message.includes("email rate limit exceeded")) {
    return { error: "Supabase's built-in email limit has been reached. Wait before retrying or configure custom SMTP." };
  }
  if (message.includes("invalid login credentials")) return { error: "Email or password is incorrect." };
  if (message.includes("email not confirmed")) return { error: "Verify your email before signing in." };
  if (message.includes("password should be at least") || message.includes("weak_password")) {
    return { error: "Choose a stronger password that meets the requirements." };
  }
  if (message.includes("already registered") || message.includes("user already registered")) {
    return { error: "An account may already use this email. Try signing in or resetting its password." };
  }
  if (message.includes("same password")) return { error: "Choose a password you have not used before." };
  return { error: fallback };
}

async function getUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user ?? null;
}

export async function signUpWithEmail(formData) {
  const fullName = formString(formData, "fullName");
  const email = validateEmail(formString(formData, "email"));
  const password = String(formData?.get("password") ?? "");
  const confirmation = String(formData?.get("confirmPassword") ?? "");
  if (!fullName || fullName.length > 120) return { error: "Enter your name (up to 120 characters)." };
  if (!email) return { error: "Enter a valid email address." };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmation) return { error: "The passwords do not match." };
  if (formData?.get("terms") !== "on") return { error: "Accept the Terms and Privacy Policy to continue." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthCallbackUrl("/"),
      data: { full_name: fullName, terms_accepted: true },
    },
  });
  if (error) return errorResult(error, "Unable to create your account. Please try again.");
  if (data.session) return { success: true, redirectTo: "/" };
  return { success: true, email, redirectTo: `/auth/verify?email=${encodeURIComponent(email)}` };
}

export async function signInWithEmail(formData) {
  const email = validateEmail(formString(formData, "email"));
  const password = String(formData?.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return errorResult(error, "Unable to sign in. Check your details and try again.");
  return { success: true, redirectTo: safeInternalPath(formString(formData, "next"), "/") };
}

export async function resendSignupConfirmation(formData) {
  const email = validateEmail(formString(formData, "email"));
  if (!email) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthCallbackUrl("/") },
  });
  if (error) return errorResult(error, "Unable to resend the confirmation link yet. Wait a minute and try again.");
  return { success: true, message: "A new confirmation link has been sent." };
}

export async function requestPasswordReset(formData) {
  const email = validateEmail(formString(formData, "email"));
  if (!email) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthCallbackUrl("/auth/reset-password"),
  });
  if (error?.code === "email_address_not_authorized") {
    return { error: "Supabase is blocking reset emails to this address until custom SMTP is configured." };
  }
  if (error?.code === "over_email_send_rate_limit" || String(error?.message ?? "").toLowerCase().includes("email rate limit")) {
    return { error: "The Supabase email limit has been reached. Wait before trying again or configure custom SMTP." };
  }
  if (error) console.error("Password reset request failed.");
  // Keep the response identical for existing and unknown addresses.
  return { success: true, message: "If an account uses that email, a reset link will arrive shortly." };
}

export async function setNewPassword(formData) {
  const password = String(formData?.get("password") ?? "");
  const confirmation = String(formData?.get("confirmPassword") ?? "");
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmation) return { error: "The passwords do not match." };
  const supabase = await createClient();
  if (!(await getUser(supabase))) return { error: "The reset link expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return errorResult(error, "Unable to update the password. Request a new reset link.");
  return { success: true, redirectTo: "/login?passwordReset=1" };
}

export async function changePassword(formData) {
  const currentPassword = String(formData?.get("currentPassword") ?? "");
  const password = String(formData?.get("password") ?? "");
  const confirmation = String(formData?.get("confirmPassword") ?? "");
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmation) return { error: "The passwords do not match." };
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { error: "Sign in again to change your password." };
  const hasPassword = (user.app_metadata?.providers ?? []).includes("email");
  if (hasPassword && !currentPassword) return { error: "Enter your current password." };
  if (!hasPassword) {
    const lastSignIn = Date.parse(user.last_sign_in_at ?? "");
    if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > 10 * 60 * 1000) {
      return { error: "Reauthenticate with Google, then retry within 10 minutes." };
    }
  }
  const { error } = await supabase.auth.updateUser({
    password,
    ...(hasPassword ? { current_password: currentPassword } : {}),
  });
  if (error) return errorResult(error, "Unable to change your password. Sign in again and retry.");
  return { success: true, message: "Password updated." };
}

export async function requestEmailChange(formData) {
  const email = validateEmail(formString(formData, "email"));
  if (!email) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  if (!(await getUser(supabase))) return { error: "Sign in again to change your email." };
  const { error } = await supabase.auth.updateUser({ email }, {
    emailRedirectTo: getAuthCallbackUrl("/settings"),
  });
  if (error) return errorResult(error, "Unable to request this email change.");
  return { success: true, message: "Confirm the email change using the verification email from Supabase." };
}

export async function updateProfile(formData) {
  const fullName = formString(formData, "fullName");
  if (!fullName || fullName.length > 120) return { error: "Enter your name (up to 120 characters)." };
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { error: "Sign in to update your profile." };

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileError) {
    console.error("Profile update failed.", profileError.code);
    return { error: "Unable to save your profile. Apply the latest CartDrop database migration and retry." };
  }
  const { error: metadataError } = await supabase.auth.updateUser({ data: { ...user.user_metadata, full_name: fullName } });
  if (metadataError) {
    console.error("Profile metadata update failed.");
    return { error: "Your profile name was saved, but could not be synchronized to your account." };
  }
  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true, message: "Profile saved." };
}

export async function updateAvatar(formData) {
  const file = formData?.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a profile image first." };
  if (file.size > AVATAR_MAX_BYTES || !AVATAR_TYPES.has(file.type)) {
    return { error: "Choose a JPG, PNG, or WebP image no larger than 3 MB." };
  }
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { error: "Sign in to update your profile image." };

  let bytes;
  try {
    bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000 })
      .rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch {
    return { error: "That file is not a supported image." };
  }

  const path = `${user.id}/${randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, bytes, {
    contentType: "image/webp", cacheControl: "3600", upsert: false,
  });
  if (uploadError) {
    console.error("Avatar upload failed.", uploadError.message);
    return { error: "Unable to upload your image. Check the profile storage migration and try again." };
  }
  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
  const { data: oldProfile } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
    avatar_url: publicData.publicUrl,
    avatar_path: path,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileError) {
    await supabase.storage.from("avatars").remove([path]);
    console.error("Avatar profile save failed.", profileError.code);
    return { error: "Unable to save the profile image reference." };
  }
  await supabase.auth.updateUser({ data: { ...user.user_metadata, avatar_url: publicData.publicUrl } });
  if (oldProfile?.avatar_path && oldProfile.avatar_path !== path) {
    await supabase.storage.from("avatars").remove([oldProfile.avatar_path]);
  }
  revalidatePath("/profile");
  revalidatePath("/");
  return { success: true, message: "Profile image updated." };
}

export async function setAlertEmailPreference(formData) {
  const enabled = formData?.get("enabled") === "true";
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { error: "Sign in to change notification settings." };
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
    price_alert_emails_enabled: enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) return { error: "Unable to save notification settings. Apply the latest database migration and retry." };
  revalidatePath("/settings");
  return { success: true, message: "Notification preference saved." };
}

export async function signOutOtherSessions() {
  const supabase = await createClient();
  if (!(await getUser(supabase))) return { error: "Sign in again to manage sessions." };
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { error: "Unable to sign out other sessions." };
  return { success: true, message: "Other sessions have been signed out." };
}

async function listStoragePaths(admin, bucket, prefix, depth = 0) {
  if (depth > 5) throw new Error("Unexpected storage folder nesting.");
  const paths = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id || item.metadata) paths.push(path);
      else paths.push(...await listStoragePaths(admin, bucket, path, depth + 1));
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  return paths;
}

async function removeUserStorage(admin, userId) {
  for (const bucket of ["avatars", "product-images"]) {
    const paths = await listStoragePaths(admin, bucket, userId);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(offset, offset + 100));
      if (error) throw error;
    }
  }
}

export async function deleteAccount(formData) {
  if (formString(formData, "confirmation") !== "DELETE") return { error: "Type DELETE to confirm account removal." };
  const currentPassword = String(formData?.get("currentPassword") ?? "");
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return { error: "Sign in again before deleting your account." };
  const providers = user.app_metadata?.providers ?? [];

  if (providers.includes("email")) {
    if (!currentPassword) return { error: "Enter your current password to confirm account removal." };
    const { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (error || data.user?.id !== user.id) return { error: "Your current password did not match." };
  } else {
    const lastSignIn = Date.parse(user.last_sign_in_at ?? "");
    if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > 10 * 60 * 1000) {
      return { error: "Sign in with Google again, then retry account deletion within 10 minutes." };
    }
  }

  try {
    const admin = createAdminClient();
    await removeUserStorage(admin, user.id);
    const { error: productsError } = await admin.from("products").delete().eq("user_id", user.id);
    if (productsError) throw productsError;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  } catch (error) {
    console.error("Account deletion cleanup failed.", error?.code ?? error?.message ?? "unknown");
    return { error: "Account removal could not finish. Your account is still active; contact support or try again." };
  }

  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/");
  return { success: true, redirectTo: "/?accountDeleted=1" };
}
