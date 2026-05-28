import "server-only";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 根据 PM 定稿 lazy 生成研发附录（实验） */
export async function POST(req: Request) {
  if (!process.env.LLM_API_KEY?.trim()) {
    return Response.json({ error: "未配置 LLM_API_KEY" }, { status: 503 });
  }

  const body = (await req.json()) as {
    sessionId?: string;
    title?: string;
    anchor?: import("@lets-talk/shared-types").AgentAnchor | null;
  };

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return Response.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  const { getConversation } = await import("@lets-talk/conversation");
  const { generateDevAppendix } = await import("@lets-talk/agent-runtime");
  const { buildRequirementPrimaryMarkdown } = await import("../../../../lib/export-prd");
  const { resolveWorkspaceLayout } = await import("@lets-talk/context");

  const cwd = resolveWorkspaceLayout().workspaceRoot;
  const record = await getConversation(cwd, sessionId);
  if (!record?.requirementDraft?.items.length) {
    return Response.json({ error: "当前会话无需求清单" }, { status: 400 });
  }

  const title = body.title?.trim() || record.title || "需求";
  const anchor = body.anchor ?? record.anchor ?? null;
  const primary = buildRequirementPrimaryMarkdown(record.requirementDraft, {
    title,
    anchor,
  });

  try {
    const appendix = await generateDevAppendix({
      primaryMarkdown: primary,
      anchor,
    });
    return Response.json({ primary, appendix });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
