import "server-only";

/**
 * GET/POST /api/qa/whitelist — 查看/修改 URL 白名单
 *
 * GET: 返回当前白名单
 * POST: 更新白名单 { patterns: string[] }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getWhitelist } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );
    return Response.json({ patterns: getWhitelist() });
  } catch (e) {
    console.error("qa/whitelist GET error:", e);
    return Response.json({ error: "获取白名单失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { patterns?: string[] };
    const { setWhitelist, resetWhitelist } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );

    if (body.patterns) {
      setWhitelist(body.patterns);
    } else {
      resetWhitelist();
    }

    return Response.json({ ok: true, patterns: body.patterns ?? null });
  } catch (e) {
    console.error("qa/whitelist POST error:", e);
    return Response.json({ error: "更新白名单失败" }, { status: 500 });
  }
}
