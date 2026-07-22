import { createSession, findPasswordUser, isSecureRequest, publicUser, sessionCookie, verifyPassword } from "../../../auth";
import { checkPasswordLogin, clearPasswordLoginFailures, recordPasswordLoginFailure } from "../../../auth-rate-limit";
import { env } from "../../../../db/runtime";

export async function POST(request: Request) {
  let payload: { username?: string; password?: string; mode?: "USER" | "ADMIN" };
  try {
    payload = await request.json() as { username?: string; password?: string; mode?: "USER" | "ADMIN" };
  } catch {
    return Response.json({ error: "请求格式无效，请重新填写登录信息" }, { status: 400 });
  }
  const attempt = await checkPasswordLogin(request, payload.username ?? "");
  if (attempt.retryAfterSeconds) {
    return Response.json({ error: "登录尝试过多，请稍后再试", retryAfterSeconds: attempt.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(attempt.retryAfterSeconds) } });
  }
  const row = await findPasswordUser(payload.username ?? "");
  const valid = row?.password_salt && row.password_hash && row.password_iterations
    ? await verifyPassword(payload.password ?? "", row.password_salt, row.password_hash, row.password_iterations)
    : false;
  if (!row || !valid || !row.active) await recordPasswordLoginFailure(attempt.key);
  if (!row || !valid || !row.active) return Response.json({ error: "用户名或密码不正确" }, { status: 401 });
  if (payload.mode === "ADMIN" && row.role !== "ADMIN") return Response.json({ error: "该账户没有管理员权限" }, { status: 403 });
  await clearPasswordLoginFailures(attempt.key);
  await env.DB.prepare("UPDATE auth_users SET last_login_at=? WHERE id=?").bind(new Date().toISOString(), row.id).run();
  const session = await createSession(row.id);
  return Response.json({ user: publicUser(row) }, { headers: { "set-cookie": sessionCookie(session.token, session.expires, isSecureRequest(request)) } });
}
