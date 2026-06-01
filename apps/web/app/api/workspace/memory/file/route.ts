import "server-only";
import { importPromptEditorModule } from "../../../../../lib/import-prompt-editor";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

function isPromptPath(path: string): boolean {
  return path.replace(/\\/g, "/").startsWith(".agent/prompt/");
}

/** 读取单个 memory / prompt 文件 */
export async function GET(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get("path")?.trim();
  if (!path) {
    return Response.json({ error: "缺少 path 参数" }, { status: 400 });
  }

  try {
    if (isPromptPath(path)) {
      const { readPromptEditorFile } = await importPromptEditorModule();
      const file = await readPromptEditorFile(root, path);
      return Response.json(file);
    }

    const { readMemoryEditorFile } = await import(
      /* webpackIgnore: true */
      "@lets-talk/memory"
    );
    const file = await readMemoryEditorFile(root, path);
    return Response.json(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 400 });
  }
}

/** 保存 memory / prompt 文件；可选 invalidate 当前 Pi 会话以应用到下一条回复 */
export async function PUT(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  let body: {
    path?: string;
    content?: string;
    sessionId?: string;
    applyToNextReply?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }

  const path = body.path?.trim();
  if (!path) {
    return Response.json({ error: "缺少 path" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return Response.json({ error: "缺少 content" }, { status: 400 });
  }

  try {
    const saved = isPromptPath(path)
      ? await (
          await importPromptEditorModule()
        ).writePromptEditorFile(root, path, body.content)
      : await (
          await import(/* webpackIgnore: true */ "@lets-talk/memory")
        ).writeMemoryEditorFile(root, path, body.content);

    let invalidated = false;
    const apply = body.applyToNextReply !== false;
    const sessionId = body.sessionId?.trim();
    if (apply && sessionId) {
      const { disposePiSession } = await import(
        /* webpackIgnore: true */
        "@lets-talk/agent-runtime"
      );
      disposePiSession(sessionId);
      invalidated = true;
    }

    const promptSaved = isPromptPath(path);
    return Response.json({
      ok: true,
      ...saved,
      invalidated,
      message: invalidated
        ? promptSaved
          ? "已保存；下一条回复将加载最新 system prompt"
          : "已保存；下一条回复将加载最新记忆（Tier 1 已刷新）"
        : "已保存",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 400 });
  }
}
