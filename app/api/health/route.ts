export const dynamic = "force-dynamic";

/** Lightweight liveness probe for reverse proxies and Docker health checks. */
export async function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store, max-age=0" } });
}
