// supabase/functions/_shared/auth.ts
// =============================================================================
// AUTH — Shared helpers for Supabase Edge Functions (Production Hardened, 2026)
// =============================================================================
// Exports (stable API):
//   - AuthError
//   - serviceClient()
//   - anonClient(jwt)
//   - requireAuth(req)          // throws AuthError
//   - authenticate(req)         // alias for requireAuth (keeps old imports working)
//   - authenticateAdmin(req)    // returns ok/result (no throw)
//   - requireAdmin(req)         // throws AuthError
//
// Auth source of truth:
//   - Caller identity: anon JWT client -> auth.getUser() (server-validated JWT)
//   - Admin check: prefer RPC public.is_admin(uid uuid) (SECURITY DEFINER)
//                fallback to profiles.role === 'admin'
//
// Notes:
//   - Deno edge safe
//   - No `any`
//   - Fail-closed for admin authorization
// =============================================================================

import type { Database } from "./database.types.ts";
import type { AnonClient, SvcClient } from "./supabase.ts";
import { createAnonClient, createServiceClient, readBearerToken } from "./supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string | null;
};

export type RequireAuthResult = AuthUser;

export type AdminAuthReason =
  | "missing_bearer"
  | "empty_token"
  | "invalid_token"
  | "not_admin"
  | "admin_check_failed";

export type AuthenticateAdminResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; reason: AdminAuthReason; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// AuthError
// ─────────────────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  code: string;
  status: number;
  reason?: string;

  constructor(code: string, message: string, status = 401, reason?: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export function serviceClient(): SvcClient {
  return createServiceClient();
}

export function anonClient(jwt: string): AnonClient {
  return createAnonClient(jwt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isProd(): boolean {
  const a = (Deno.env.get("APP_ENV") ?? "").trim().toLowerCase();
  const n = (Deno.env.get("NODE_ENV") ?? "").trim().toLowerCase();
  return a === "production" || n === "production";
}

function safeMsgProd(prodMsg: string, devMsg: string): string {
  return isProd() ? prodMsg : devMsg;
}

function hasBearerHeader(req: Request): boolean {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  return /^bearer\s+/i.test(raw.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth + authenticate alias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates Bearer JWT and returns authenticated user.
 * Throws AuthError on failure.
 */
export async function requireAuth(req: Request): Promise<RequireAuthResult> {
  const token = readBearerToken(req);

  if (!token) {
    const reason: AdminAuthReason = hasBearerHeader(req) ? "empty_token" : "missing_bearer";
    throw new AuthError("AUTH_MISSING", "Missing Authorization Bearer token", 401, reason);
  }

  const anon = createAnonClient(token);

  // Server-side validation of JWT
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user?.id) {
    throw new AuthError("AUTH_INVALID", "Invalid or expired token", 401, "invalid_token");
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

/**
 * Backwards-compatible alias used by older functions (like finalize-order).
 */
export function authenticate(req: Request): Promise<RequireAuthResult> {
  return requireAuth(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin checks
// ─────────────────────────────────────────────────────────────────────────────

async function checkAdminByRpc(svc: SvcClient, uid: string): Promise<boolean> {
  const { data, error } = await svc.rpc("is_admin", { uid });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function checkAdminByProfilesRole(svc: SvcClient, uid: string): Promise<boolean> {
  const { data, error } = await svc
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const role = (data?.role ?? "").toLowerCase();
  return role === "admin";
}

/**
 * Auth + admin authorization (no throw).
 */
export async function authenticateAdmin(req: Request): Promise<AuthenticateAdminResult> {
  if (!hasBearerHeader(req)) {
    return { ok: false, reason: "missing_bearer", message: "Missing Bearer token" };
  }

  let user: RequireAuthResult;
  try {
    user = await requireAuth(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return { ok: false, reason: "invalid_token", message: safeMsgProd("Unauthorized", msg) };
  }

  const svc = createServiceClient();

  let isAdmin = false;
  try {
    isAdmin = await checkAdminByRpc(svc, user.id);
  } catch {
    try {
      isAdmin = await checkAdminByProfilesRole(svc, user.id);
    } catch {
      return {
        ok: false,
        reason: "admin_check_failed",
        message: safeMsgProd("Forbidden", "Unable to verify admin role"),
      };
    }
  }

  if (!isAdmin) {
    return { ok: false, reason: "not_admin", message: safeMsgProd("Forbidden", "User is not admin") };
  }

  return { ok: true, userId: user.id, email: user.email };
}

/**
 * Admin auth (throws AuthError).
 */
export async function requireAdmin(req: Request): Promise<{ userId: string; email: string | null }> {
  const res = await authenticateAdmin(req);
  if (!res.ok) {
    const status = res.reason === "not_admin" ? 403 : 401;
    const code =
      res.reason === "not_admin"
        ? "AUTH_FORBIDDEN"
        : res.reason === "missing_bearer" || res.reason === "empty_token"
          ? "AUTH_MISSING"
          : "AUTH_INVALID";

    throw new AuthError(code, res.message, status, res.reason);
  }
  return { userId: res.userId, email: res.email };
}

// Re-export Database if you like consistent imports elsewhere
export type { Database };