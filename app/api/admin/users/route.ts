import { env } from "../../../../db/runtime";
import { getSessionUserFromRequest } from "../../../auth";
import { ensureSchema } from "../../../../db/bootstrap";

export async function GET(request: Request) {
  const actor = await getSessionUserFromRequest(request);
  if (!actor || actor.role !== "ADMIN") return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
  await ensureSchema();
  const users = await env.DB.prepare("SELECT id,username,display_name,auth_provider,role,active,created_at,last_login_at FROM auth_users ORDER BY created_at DESC").all();
  return Response.json({ users: users.results, currentUserId: actor.id });
}

export async function PATCH(request: Request) {
  const actor = await getSessionUserFromRequest(request);
  if (!actor || actor.role !== "ADMIN") return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
  let payload: { userId?: string; active?: boolean; role?: "USER" | "ADMIN" };
  try {
    payload = await request.json() as { userId?: string; active?: boolean; role?: "USER" | "ADMIN" };
  } catch {
    return Response.json({ error: "请求格式无效，请刷新后重试" }, { status: 400 });
  }
  if (!payload.userId) return Response.json({ error: "USER_REQUIRED" }, { status: 400 });
  if (payload.userId === actor.id && (payload.active === false || payload.role === "USER")) return Response.json({ error: "不能停用或降级当前管理员账户" }, { status: 400 });
  await ensureSchema();
  const target = await env.DB.prepare("SELECT id FROM auth_users WHERE id=?").bind(payload.userId).first();
  if (!target) return Response.json({ error: "用户不存在" }, { status: 404 });
  if (typeof payload.active === "boolean") await env.DB.prepare("UPDATE auth_users SET active=? WHERE id=?").bind(payload.active ? 1 : 0, payload.userId).run();
  if (payload.role) await env.DB.prepare("UPDATE auth_users SET role=? WHERE id=?").bind(payload.role, payload.userId).run();
  return Response.json({ ok: true });
}
