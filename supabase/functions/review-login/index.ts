// review-login — App Store / Play "demo account" sign-in.
//
// The app is passwordless (Google / Apple / email magic-link) and access is
// gated by group membership, so a store reviewer signing up fresh is gated and
// cannot review. This endpoint authenticates a FIXED reviewer email + code,
// mints a one-time OTP for a dedicated review auth user via the service role,
// and seeds that user as a fully-onboarded member of the enabled "בדיקה"
// group (app_review_seed). The client then completes sign-in with verifyOtp.
//
// Security: the only static secret is the code; it leads ONLY to a dedicated
// sandbox review account (no admin powers, only its own state) — the standard,
// expected demo-account pattern for review. verify_jwt is disabled because this
// is a pre-auth endpoint with its own code gate.
//
// THE CODE IS NOT IN THIS FILE ANY MORE (2026-08-03). It was the literal
// "once-review-7Fq2", i.e. a credential published to everyone who can read the
// repo, and it is the app's ONE pre-auth door. It is REVIEW_CODE in the function
// env now, and rotating it costs nothing on the client: the code is typed into a
// field by the reviewer (mobile/app/login.tsx takes it as an argument and holds
// no copy), so the only other place it exists is the demo-account note in App
// Store Connect / the Play Console. No app build is involved.
//
// The env fallback is the OLD literal, deliberately: with REVIEW_CODE unset this
// endpoint behaves exactly as it did before, so the deploy and the setting of
// the secret are safe in either order. See BACKWARD_COMPAT.md for the removal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const REVIEW_EMAIL = Deno.env.get("REVIEW_EMAIL") ?? "review@once.app";
const REVIEW_CODE = Deno.env.get("REVIEW_CODE") ?? "once-review-7Fq2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, code } = await req.json().catch(() => ({}));

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // A DOOR WITH ONE STATIC ANSWER MUST COUNT THE KNOCKS. Nothing limited this
    // endpoint, so the code could be guessed as fast as the runtime would answer.
    // Per-CALLER, never global: a global counter would let anyone lock the
    // reviewers out from anywhere, and a store review that cannot sign in is a
    // rejected release — a worse outcome than the guessing it would prevent.
    //
    // THE RIGHT ANSWER IS ALWAYS LET THROUGH, WHICH IS WHY THE CODE IS CHECKED
    // FIRST. The limit was ahead of it for one deploy, and the 429 then applied
    // to everyone at that address — so a reviewer who mistyped ten times was shut
    // out of his own account for fifteen minutes (measured against the live
    // endpoint, which is how this was caught). Nothing is lost by the order: a
    // guesser's knocks are wrong BY DEFINITION, so they are the ones being
    // counted and the ones being refused. The limit is a statement about wrong
    // answers, and it may only ever be spent by one.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("cf-connecting-ip")
      ?? "unknown";

    if (
      typeof email !== "string" ||
      typeof code !== "string" ||
      email.trim().toLowerCase() !== REVIEW_EMAIL ||
      code !== REVIEW_CODE
    ) {
      const { data: allowed } = await admin.rpc("app_review_login_allowed", { p_ip: ip });
      // Recorded, not awaited on the way out: the caller learns nothing from how
      // long the refusal took, and a failed write must not turn a 401 into a 500.
      EdgeRuntime.waitUntil(admin.rpc("app_review_login_failed", { p_ip: ip }).then(() => {}));
      return allowed === false
        ? new Response(JSON.stringify({ error: "too_many" }), { status: 429, headers: cors })
        : new Response(JSON.stringify({ error: "invalid" }), { status: 401, headers: cors });
    }

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
