import "server-only";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

type RouteCtx = { params: Promise<{ id: string }> };

/** 读取一条会话 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const { getConversation } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  const record = await getConversation(root, id);
  if (!record) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }
  return Response.json(record);
}

/** 保存 Transcript */
export async function PUT(req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  let body: {
    items?: unknown;
    anchor?: unknown;
    title?: string;
    chatMode?: "explore" | "prd";
    requirementDraft?: import("@lets-talk/shared-types").RequirementDraftState | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return Response.json({ error: "需要 items 数组" }, { status: 400 });
  }

  const { saveConversation } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  const record = await saveConversation(root, {
    sessionId: id,
    items: body.items as import("@lets-talk/shared-types").TranscriptItem[],
    anchor: (body.anchor ?? null) as import("@lets-talk/shared-types").AgentAnchor | null,
    title: body.title,
    chatMode: body.chatMode,
    requirementDraft: body.requirementDraft,
  });

  return Response.json(record);
}

/** 重命名会话 */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  let body: { title?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return Response.json({ error: "需要 title" }, { status: 400 });
  }

  const { renameConversation } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  try {
    const record = await renameConversation(root, id, title);
    if (!record) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }
    return Response.json(record);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

/** 删除会话（JSON + Pi jsonl） */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const { deleteConversation } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );
  const { disposePiSession } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );

  const ok = await deleteConversation(root, id);
  disposePiSession(id);
  if (!ok) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }
  return Response.json({ ok: true, sessionId: id });
}
