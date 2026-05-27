import "server-only";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 会话列表 */
export async function GET() {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { listConversations } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  const conversations = await listConversations(root);
  return Response.json({ conversations });
}

/** 新建会话 */
export async function POST() {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { createConversation } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  const record = await createConversation(root);
  return Response.json(record);
}
