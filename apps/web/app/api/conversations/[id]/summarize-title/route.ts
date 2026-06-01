import "server-only";

export const runtime = "nodejs";
export const maxDuration = 60;

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

type RouteCtx = { params: Promise<{ id: string }> };

/** 导出/定稿后：用 LLM 根据需求清单生成侧栏标题 */
export async function POST(_req: Request, ctx: RouteCtx) {
  if (!process.env.LLM_API_KEY?.trim()) {
    return Response.json({ error: "未配置 LLM_API_KEY" }, { status: 503 });
  }

  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const { getConversation, setConversationTitle } = await import(
    "@lets-talk/conversation"
  );
  const { summarizeConversationTitle } = await import("@lets-talk/agent-runtime");

  const record = await getConversation(root, id);
  if (!record) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }
  if (!record.requirementDraft?.items.length) {
    return Response.json({ error: "无需求清单，无法生成标题" }, { status: 400 });
  }

  try {
    const title = await summarizeConversationTitle({
      cwd: root,
      draft: record.requirementDraft,
    });
    if (!title) {
      return Response.json({ error: "未能生成标题" }, { status: 422 });
    }
    const updated = await setConversationTitle(root, id, title, { lock: true });
    return Response.json({ title, record: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
