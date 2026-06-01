import "server-only";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ sessionId: string }> };

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 从 .agent/debug 或 pi jsonl 加载会话全部历史回合 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { sessionId } = await ctx.params;
  const { loadSessionTurnDebugFromDisk } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );

  try {
    const result = await loadSessionTurnDebugFromDisk(root, sessionId);
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: message, turns: [], source: "none" as const },
      { status: 500 },
    );
  }
}
