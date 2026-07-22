import { env } from "../db/runtime";
import { ensureSchema } from "../db/bootstrap";
import { normalizeUsername } from "./auth";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

type AttemptRow = { attempt_key: string; failed_count: number; window_started_at: string };

export type LoginAttempt = { key: string; retryAfterSeconds: number | null };

/** Limits failed password attempts per username and client address. */
export async function checkPasswordLogin(request: Request, username: string): Promise<LoginAttempt> {
  await ensureSchema();
  const key = await attemptKey(request, username);
  const row = await env.DB.prepare("SELECT attempt_key,failed_count,window_started_at FROM auth_login_attempts WHERE attempt_key=? LIMIT 1")
    .bind(key).first<AttemptRow>();
  if (!row) return { key, retryAfterSeconds: null };
  const startedAt = Date.parse(row.window_started_at);
  const remaining = Math.ceil((WINDOW_MS - (Date.now() - startedAt)) / 1000);
  return { key, retryAfterSeconds: Number.isFinite(startedAt) && remaining > 0 && Number(row.failed_count) >= MAX_FAILURES ? remaining : null };
}

export async function recordPasswordLoginFailure(key: string) {
  await ensureSchema();
  const now = new Date();
  const row = await env.DB.prepare("SELECT failed_count,window_started_at FROM auth_login_attempts WHERE attempt_key=? LIMIT 1")
    .bind(key).first<AttemptRow>();
  const startedAt = row ? Date.parse(row.window_started_at) : Number.NaN;
  const inWindow = Number.isFinite(startedAt) && now.getTime() - startedAt < WINDOW_MS;
  if (!row) {
    await env.DB.prepare("INSERT INTO auth_login_attempts (attempt_key,failed_count,window_started_at,last_attempt_at) VALUES (?,?,?,?)")
      .bind(key, 1, now.toISOString(), now.toISOString()).run();
    return;
  }
  await env.DB.prepare("UPDATE auth_login_attempts SET failed_count=?,window_started_at=?,last_attempt_at=? WHERE attempt_key=?")
    .bind(inWindow ? Number(row.failed_count) + 1 : 1, inWindow ? row.window_started_at : now.toISOString(), now.toISOString(), key).run();
}

export async function clearPasswordLoginFailures(key: string) {
  await ensureSchema();
  await env.DB.prepare("DELETE FROM auth_login_attempts WHERE attempt_key=?").bind(key).run();
}

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip")?.trim() || request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
}

async function attemptKey(request: Request, username: string) {
  const value = `${normalizeUsername(username)}\n${clientAddress(request)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
