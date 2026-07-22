import { clearSessionCookie, isSecureRequest, revokeSession, SESSION_COOKIE } from "../../../auth";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? null;
  await revokeSession(token);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(isSecureRequest(request)) } });
}
