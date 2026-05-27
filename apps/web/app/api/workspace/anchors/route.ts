import "server-only";

export const runtime = "nodejs";

/** 列出可选 Vue 锚点（默认扫描 src/views 下 .vue） */
export async function GET() {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const { listVueAnchors, resolveWorkspaceLayout } = await import(
    /* webpackIgnore: true */
    "@lets-talk/context"
  );

  try {
    const layout = resolveWorkspaceLayout();
    const anchors = await listVueAnchors(layout.workspaceRoot, {
      scanRoot: layout.frontendRoot,
    });
    return Response.json({ anchors });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, anchors: [] }, { status: 500 });
  }
}
