import { env } from "../../../../db/runtime";
import { createSession, hashPassword, isSecureRequest, normalizeUsername, publicUser, sessionCookie, validatePassword, validateUsername } from "../../../auth";
import { ensureDatabase, ensureSchema, joinHouseholdByInvite } from "../../../../db/bootstrap";

export async function POST(request: Request) {
  let payload: { username?: string; password?: string; displayName?: string; inviteCode?: string };
  try {
    payload = await request.json() as { username?: string; password?: string; displayName?: string; inviteCode?: string };
  } catch {
    return Response.json({ error: "请求格式无效，请重新填写注册信息" }, { status: 400 });
  }
  const username = normalizeUsername(payload.username ?? "");
  const password = payload.password ?? "";
  const displayName = (payload.displayName ?? "").trim();
  if (!validateUsername(username)) return Response.json({ error: "用户名需为 3—24 位中文、字母、数字、下划线或短横线" }, { status: 400 });
  if (!validatePassword(password)) return Response.json({ error: "密码长度需为 8—128 位" }, { status: 400 });
  if (!displayName || displayName.length > 30) return Response.json({ error: "请填写 1—30 位昵称" }, { status: 400 });

  await ensureSchema();
  const existing = await env.DB.prepare("SELECT id FROM auth_users WHERE username=? LIMIT 1").bind(username).first();
  if (existing) return Response.json({ error: "用户名已被使用" }, { status: 409 });
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_users WHERE active=1").first<{ count: number }>();
  const role = Number(count?.count ?? 0) === 0 ? "ADMIN" : "USER";
  const passwordData = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO auth_users (id,username,display_name,password_salt,password_hash,password_iterations,auth_provider,role,active,created_at,last_login_at) VALUES (?,?,?,?,?,?,'PASSWORD',?,1,?,?)")
    .bind(id, username, displayName, passwordData.salt, passwordData.hash, passwordData.iterations, role, now, now).run();
  try {
    if (payload.inviteCode?.trim()) await joinHouseholdByInvite(id, displayName, payload.inviteCode);
    else await ensureDatabase(id, displayName);
  } catch (error) {
    await env.DB.prepare("DELETE FROM auth_users WHERE id=?").bind(id).run();
    return Response.json({ error: error instanceof Error ? error.message : "无法加入家庭" }, { status: 400 });
  }
  const session = await createSession(id);
  const user = publicUser({ id, username, display_name: displayName, password_salt: passwordData.salt, password_hash: passwordData.hash, password_iterations: passwordData.iterations, auth_provider: "PASSWORD", role, active: 1 });
  return Response.json({ user, firstAccount: role === "ADMIN" }, { status: 201, headers: { "set-cookie": sessionCookie(session.token, session.expires, isSecureRequest(request)) } });
}
