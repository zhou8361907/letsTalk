import "server-only";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ sessionId: string }> };

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

/** 读取 Pi 会话 jsonl 全文（调试用） */
export async function GET(_req: Request, ctx: RouteCtx) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { sessionId } = await ctx.params;
  const { getConversation } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );
  const { resolvePiSessionFile } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );
  const { readPiJsonlFull } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );
  const { relative } = await import("node:path");

  const record = await getConversation(root, sessionId);
  const abs = resolvePiSessionFile(root, sessionId, record?.piSessionFile);
  const rel = relative(root, abs).replace(/\\/g, "/");

  try {
    const content = await readPiJsonlFull(abs);
    return Response.json({
      path: rel,
      charCount: content.length,
      content,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, path: rel }, { status: 404 });
  }
}
