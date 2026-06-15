import "server-only";
import { ActorAccessError, validateActorRequest } from "../../../lib/actor-server";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 当前 Actor 的会话列表 */
export async function GET(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { actorId } = await validateActorRequest(root, req);
    const { listConversations } = await import(
      /* webpackIgnore: true */
      "@lets-talk/conversation"
    );
    const conversations = await listConversations(root, actorId);
    return Response.json({ conversations });
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** 新建会话（归属当前 Actor） */
export async function POST(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { actor, actorId } = await validateActorRequest(root, req);
    const { createConversation } = await import(
      /* webpackIgnore: true */
      "@lets-talk/conversation"
    );
    const record = await createConversation(root, {
      ownerActorId: actorId,
      ownerDisplayName: actor.displayName,
    });
    return Response.json(record);
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
