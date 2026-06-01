import "server-only";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ sessionId: string }> };

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 加载会话 system prompt（debug 落盘或按当前配置重建） */
export async function GET(_req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { sessionId } = await ctx.params;
  const { loadSessionSystemPromptFromDisk } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );

  try {
    const systemPrompt = await loadSessionSystemPromptFromDisk(root, sessionId);
    return Response.json({ systemPrompt });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, systemPrompt: null }, { status: 500 });
  }
}
