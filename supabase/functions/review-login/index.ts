// review-login — App Store / Play "demo account" sign-in.
//
// The app is passwordless (Google / Apple / email magic-link) and access is
// gated by group membership, so a store reviewer signing up fresh is gated and
// cannot review. This endpoint authenticates a FIXED reviewer email + code,
// mints a one-time OTP for a dedicated review auth user via the service role,
// and seeds that user as a fully-onboarded member of the enabled "בדיקה"
// group (app_review_seed). The client then completes sign-in with verifyOtp.
//
// Security: the only static secret is REVIEW_CODE; it leads ONLY to a
// dedicated sandbox review account (no admin powers, only its own state) — the
// standard, expected demo-account pattern for review. verify_jwt is disabled
// because this is a pre-auth endpoint with its own code gate.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const REVIEW_EMAIL = "review@once.app";
const REVIEW_CODE = "once-review-7Fq2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, code } = await req.json().catch(() => ({}));
    if (
      typeof email !== "string" ||
      typeof code !== "string" ||
      email.trim().toLowerCase() !== REVIEW_EMAIL ||
      code !== REVIEW_CODE
    ) {
      return new Response(JSON.stringify({ error: "invalid" }), { status: 401, headers: cors });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Ensure the dedicated review auth user exists (passwordless, confirmed).
    // createUser resolves to {data,error}; an "already registered" error is
    // expected on subsequent logins and is intentionally ignored.
    await admin.auth.admin.createUser({ email: REVIEW_EMAIL, email_confirm: true });

    // Fresh single-use OTP for that user (no email is actually delivered).
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: REVIEW_EMAIL,
    });
    if (lErr || !link?.user?.id || !link?.properties?.email_otp) {
      return new Response(JSON.stringify({ error: "link_failed" }), { status: 500, headers: cors });
    }

    // Idempotently make it a complete, onboarded, group-approved account.
    const { error: sErr } = await admin.rpc("app_review_seed", { p_user_id: link.user.id });
    if (sErr) {
      return new Response(JSON.stringify({ error: "seed_failed" }), { status: 500, headers: cors });
    }

    return new Response(
      JSON.stringify({ email: REVIEW_EMAIL, otp: link.properties.email_otp }),
      { status: 200, headers: cors },
    );
  } catch (_e) {
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: cors });
  }
});
