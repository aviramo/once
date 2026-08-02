"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireViewerScope } from "@/lib/admin-auth";
import {
  ADMIN_ENV_COOKIE,
  parseAdminEnv,
  type AdminEnv,
} from "@/lib/adminEnv";

/** A year — the operator picks an environment once and stays in it. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Switch the whole panel to one matching environment. Every screen reads the
 * cookie through `readAdminEnv()`, so the whole layout tree is revalidated —
 * nav badges included — rather than the current route alone.
 *
 * Any signed-in viewer may switch: the environment decides what is SHOWN, and
 * what a manager is allowed to see is a separate gate (`requireViewerScope`)
 * that every screen still applies on top of it.
 */
export async function setAdminEnv(raw: string): Promise<{ env: AdminEnv }> {
  await requireViewerScope();
  const env = parseAdminEnv(raw);
  const jar = await cookies();
  jar.set(ADMIN_ENV_COOKIE, env, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  revalidatePath("/", "layout");
  return { env };
}
