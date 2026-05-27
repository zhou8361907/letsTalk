import "server-only";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 当前会话的 Pi 上下文 token 占用 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;

  const { queryContextUsage } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );

  const usage = await queryContextUsage(id);
  if (!usage) {
    return Response.json({ tokens: null, contextWindow: 0, percent: null });
  }
  return Response.json(usage);
}
