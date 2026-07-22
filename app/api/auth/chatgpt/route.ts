import { env } from "../../../../db/runtime";
import { createSession, isSecureRequest, publicUser, sessionCookie } from "../../../auth";
import { ensureSchema } from "../../../../db/bootstrap";

type Row = { id: string; username: string; display_name: string; password_salt: null; password_hash: null; password_iterations: null; auth_provider: "CHATGPT"; role: "USER" | "ADMIN"; active: number };

export async function POST(request: Request) {
  if (process.env.ENABLE_CHATGPT_LOGIN !== "true") return Response.json({ error: "此部署不支持 ChatGPT 登录" }, { status: 404 });
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return Response.json({ error: "当前请求没有 ChatGPT 登录身份" }, { status: 401 });
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const displayName = encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
    ? safeDecode(encodedName) ?? email.split("@")[0]
    : email.split("@")[0];
  const username = `chatgpt:${email}`;
  await ensureSchema();
  let row = await env.DB.prepare("SELECT * FROM auth_users WHERE username=? LIMIT 1").bind(username).first<Row>();
  if (!row) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_users WHERE active=1").first<{ count: number }>();
    const role = Number(count?.count ?? 0) === 0 ? "ADMIN" : "USER";
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO auth_users (id,username,display_name,password_salt,password_hash,password_iterations,auth_provider,role,active,created_at,last_login_at) VALUES (?,?,?,NULL,NULL,NULL,'CHATGPT',?,1,?,?)")
      .bind(id, username, displayName, role, now, now).run();
    row = { id, username, display_name: displayName, password_salt: null, password_hash: null, password_iterations: null, auth_provider: "CHATGPT", role, active: 1 };
  }
  if (!row.active) return Response.json({ error: "账户已停用" }, { status: 403 });
  await env.DB.prepare("UPDATE auth_users SET last_login_at=? WHERE id=?").bind(new Date().toISOString(), row.id).run();
  const session = await createSession(row.id);
  return Response.json({ user: publicUser(row) }, { headers: { "set-cookie": sessionCookie(session.token, session.expires, isSecureRequest(request)) } });
}

function safeDecode(value: string) { try { return decodeURIComponent(value); } catch { return null; } }
