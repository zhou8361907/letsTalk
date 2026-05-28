import "server-only";

export const runtime = "nodejs";

/** 可选子系统 USER_SYS_ID 列表 */
export async function GET() {
  const { listMenuUserSysIds } = await import("../../../../lib/menu-db");
  try {
    const systems = await listMenuUserSysIds();
    return Response.json({ systems });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, systems: [] }, { status: 500 });
  }
}
