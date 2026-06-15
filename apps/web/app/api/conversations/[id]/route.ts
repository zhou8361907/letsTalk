import "server-only";
import { ActorAccessError } from "../../../../lib/actor-server";
import { loadConversationForActor } from "../../../../lib/conversation-access";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

type RouteCtx = { params: Promise<{ id: string }> };

/** 读取一条会话 */
export async function GET(req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  try {
    const { record } = await loadConversationForActor(root, id, req);
    return Response.json(record);
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
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

  try {
    await loadConversationForActor(root, id, req);
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
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
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

  try {
    await loadConversationForActor(root, id, req);
    const { renameConversation } = await import(
      /* webpackIgnore: true */
      "@lets-talk/conversation"
    );

    const record = await renameConversation(root, id, title);
    if (!record) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }
    return Response.json(record);
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

/** 删除会话（JSON + Pi jsonl） */
export async function DELETE(req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { id } = await ctx.params;
  try {
    await loadConversationForActor(root, id, req);
    const { deleteConversation } = await import(
      /* webpackIgnore: true */
      "@lets-talk/conversation"
    );
    const { cleanupSessionDebug, disposePiSession } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );

    const ok = await deleteConversation(root, id);
    if (!ok) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }
    disposePiSession(id);
    await cleanupSessionDebug(root, id);
    return Response.json({ ok: true, sessionId: id });
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
