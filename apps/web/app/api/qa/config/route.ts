import "server-only";

/**
 * POST /api/qa/config — 更新 QA 模块配置
 * 请求体: { logPath?: string }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { logPath?: string };
    const mod = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    ) as any;

    if (body.logPath) {
      // 设置日志路径供 log-analyzer 使用
      mod.setLogBasePath?.(body.logPath);
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "配置失败" },
      { status: 500 },
    );
  }
}
