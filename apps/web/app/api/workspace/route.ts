import "server-only";

export const runtime = "nodejs";

/** 当前工作区布局：运行根 + workFront / workBack */
export async function GET() {
  const { resolveWorkspaceLayout } = await import(
    /* webpackIgnore: true */
    "@lets-talk/context"
  );

  const layout = resolveWorkspaceLayout();
  return Response.json({
    ok: Boolean(process.env.WORKSPACE_ROOT?.trim()),
    workspaceRoot: layout.workspaceRoot,
    frontendRoot: layout.frontendRoot,
    backendRoot: layout.backendRoot,
    frontendRel: layout.frontendRel,
    backendRel: layout.backendRel,
  });
}
