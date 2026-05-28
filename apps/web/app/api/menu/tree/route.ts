import "server-only";

import { buildMenuTree, buildMergedMenuTree } from "../../../../lib/menu-tree";
import { fetchSysMenuRows } from "../../../../lib/menu-db";

export const runtime = "nodejs";

/** 门户式菜单树：左一级 + 右分组网格（默认合并全部一级） */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userSysIdParam = url.searchParams.get("userSysId")?.trim();
  const merged = url.searchParams.get("merged") !== "0" && !userSysIdParam;

  try {
    const rows = merged
      ? await fetchSysMenuRows()
      : await fetchSysMenuRows(
          userSysIdParam || process.env.MENU_USER_SYS_ID?.trim() || "672",
        );
    if (rows.length === 0) {
      return Response.json(
        {
          error: "无菜单数据。请配置 MENU_DB_* 或运行 pnpm sync-menu",
          userSysId: merged ? "*" : userSysIdParam,
          roots: [],
          panels: {},
        },
        { status: 503 },
      );
    }
    const tree = merged
      ? buildMergedMenuTree(rows)
      : buildMenuTree(
          rows,
          userSysIdParam || process.env.MENU_USER_SYS_ID?.trim() || "672",
        );
    return Response.json(tree);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
