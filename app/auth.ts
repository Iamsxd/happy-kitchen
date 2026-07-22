import { env } from "../db/runtime";
import { cookies } from "next/headers";
import { ensureSchema } from "../db/bootstrap";

export const SESSION_COOKIE = "happy_kitchen_session";
const SESSION_DAYS = 7;
// Cloudflare Workers currently caps Web Crypto PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;

export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  role: "USER" | "ADMIN";
  authProvider: "PASSWORD" | "CHATGPT";
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_salt: string | null;
  password_hash: string | null;
  password_iterations: number | null;
  auth_provider: "PASSWORD" | "CHATGPT";
  role: "USER" | "ADMIN";
  active: number;
};

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function validateUsername(value: string) {
  return /^[a-zA-Z0-9_\-\u4e00-\u9fff]{3,24}$/.test(value);
}

export function validatePassword(value: string) {
  return value.length >= 8 && value.length <= 128;
}

export async function hashPassword(password: string, salt = randomBytes(16), iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return { salt: toBase64Url(salt), hash: toBase64Url(new Uint8Array(bits)), iterations };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string, iterations: number) {
  const result = await hashPassword(password, fromBase64Url(salt), iterations);
  return timingSafeEqual(fromBase64Url(result.hash), fromBase64Url(expectedHash));
}

export async function createSession(userId: string) {
  await ensureSchema();
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB.prepare("INSERT INTO auth_sessions (id,user_id,token_hash,expires_at,created_at,revoked_at) VALUES (?,?,?,?,?,NULL)")
    .bind(crypto.randomUUID(), userId, tokenHash, expires.toISOString(), now.toISOString()).run();
  await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL").bind(now.toISOString()).run();
  return { token, expires };
}

export async function getSessionUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  return userForToken(cookieStore.get(SESSION_COOKIE)?.value ?? null);
}

export async function getSessionUserFromRequest(request: Request): Promise<AppUser | null> {
  return userForToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

export async function revokeSession(token: string | null) {
  if (!token) return;
  await ensureSchema();
  await env.DB.prepare("UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), await sha256(token)).run();
}

export function sessionCookie(token: string, expires: Date, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Priority=High; Max-Age=${SESSION_DAYS * 86400}; Expires=${expires.toUTCString()}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Priority=High; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Accept the original HTTPS scheme when a trusted NAS reverse proxy terminates TLS. */
export function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export async function findPasswordUser(username: string) {
  await ensureSchema();
  return env.DB.prepare("SELECT * FROM auth_users WHERE username=? AND auth_provider='PASSWORD' LIMIT 1")
    .bind(normalizeUsername(username)).first<UserRow>();
}

export function publicUser(row: UserRow): AppUser {
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role, authProvider: row.auth_provider };
}

async function userForToken(token: string | null): Promise<AppUser | null> {
  if (!token) return null;
  await ensureSchema();
  const row = await env.DB.prepare(`SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.active=1 LIMIT 1`)
    .bind(await sha256(token), new Date().toISOString()).first<UserRow>();
  return row ? publicUser(row) : null;
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
