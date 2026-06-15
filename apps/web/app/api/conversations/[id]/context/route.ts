import "server-only";
import { ActorAccessError } from "../../../../../lib/actor-server";
import { loadConversationForActor } from "../../../../../lib/conversation-access";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 当前会话的 Pi 上下文 token 占用 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;

  try {
    await loadConversationForActor(root, id, req);
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

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
