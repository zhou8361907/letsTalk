import "server-only";

/**
 * POST /api/qa/start — 启动录制浏览器
 * 请求体: { chatSessionId: string; targetUrl?: string }
 * 响应: { sessionId: string; ok: boolean; error?: string }
 *
 * 直接启动 Playwright 浏览器窗口，用户可直接操作。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chatSessionId?: string;
      targetUrl?: string;
    };

    if (!body.chatSessionId) {
      return Response.json({ error: "缺少 chatSessionId" }, { status: 400 });
    }

    const { openBrowser } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );

    const result = await openBrowser(body.chatSessionId, body.targetUrl);

    if (!result.ok) {
      return Response.json(
        { error: result.error ?? "启动浏览器失败" },
        { status: 500 },
      );
    }

    return Response.json({
      sessionId: result.sessionId,
      ok: true,
    });
  } catch (e) {
    console.error("qa/start error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "启动录制失败" },
      { status: 500 },
    );
  }
}
