import "server-only";
import { importPromptEditorModule } from "../../../../lib/import-prompt-editor";

export const runtime = "nodejs";

/** 列出 .agent/memory 与 .agent/prompt 下可编辑文件 */
export async function GET() {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { listMemoryEditorFiles } = await import(
    /* webpackIgnore: true */
    "@lets-talk/memory"
  );
  const { listPromptEditorFiles } = await importPromptEditorModule();

  try {
    const files = [
      ...listPromptEditorFiles(),
      ...(await listMemoryEditorFiles(workspaceRoot)),
    ];
    return Response.json({ files });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, files: [] }, { status: 500 });
  }
}
