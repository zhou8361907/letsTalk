import "server-only";

export const runtime = "nodejs";

/** 可选子系统 USER_SYS_ID 列表 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const productLine = (url.searchParams.get("productLine")?.trim() || "yibao");
  const { PRODUCT_LINES, DEFAULT_PRODUCT_LINE } = await import("@lets-talk/shared-types");
  const pl = PRODUCT_LINES[productLine as keyof typeof PRODUCT_LINES] ?? PRODUCT_LINES[DEFAULT_PRODUCT_LINE];
  const menuTable = productLine === "shebao"
    ? (process.env.SHEBAO_MENU_TABLE?.trim() || pl.menuTable)
    : (process.env.YIBAO_MENU_TABLE?.trim() || pl.menuTable);
  const { listMenuUserSysIds } = await import("../../../../lib/menu-db");
  try {
    const systems = await listMenuUserSysIds(menuTable);
    return Response.json({ systems });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message, systems: [] }, { status: 500 });
  }
}
