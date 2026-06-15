import "server-only";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 列出工作区 Actor（含默认匿名） */
export async function GET() {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { listActors } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  const actors = await listActors(root);
  return Response.json({ actors });
}

/** 新建命名 Actor（重名则返回已有） */
export async function POST(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  let body: { displayName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }

  const displayName = body.displayName?.trim();
  if (!displayName) {
    return Response.json({ error: "需要 displayName" }, { status: 400 });
  }

  const { createNamedActor } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  try {
    const actor = await createNamedActor(root, displayName);
    return Response.json({ actor });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
