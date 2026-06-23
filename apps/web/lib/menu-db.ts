import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SysMenuRow } from "./menu-tree.js";

export interface MenuDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function readMenuDbConfig(): MenuDbConfig | null {
  const host = process.env.MENU_DB_HOST?.trim();
  const user = process.env.MENU_DB_USER?.trim();
  const password = process.env.MENU_DB_PASSWORD?.trim();
  const database = process.env.MENU_DB_NAME?.trim() || "mifc";
  if (!host || !user || password === undefined) return null;
  const port = Number(process.env.MENU_DB_PORT || "3306");
  return { host, port, user, password, database };
}

function rowFromDb(r: Record<string, unknown>): SysMenuRow {
  return {
    menuId: String(r.MENU_ID),
    menuName: String(r.MENU_NAME),
    parentId: String(r.PARENT_ID),
    levelNum: Number(r.LEVEL_NUM),
    isLeaf: Number(r.IS_LEAF) === 1,
    enabled: Number(r.ENABLED) === 1,
    url: r.url ? String(r.url) : null,
    dispOrder: Number(r.DISP_ORDER ?? 0),
    userSysId: String(r.USER_SYS_ID),
  };
}

/** 默认菜单表名：优先从 env 读取，兜底 sys_menu */
function defaultMenuTable(): string {
  return process.env.YIBAO_MENU_TABLE?.trim() || "sys_menu";
}

export async function fetchSysMenuRows(
  userSysId?: string,
  tableName?: string,
): Promise<SysMenuRow[]> {
  const tbl = tableName || defaultMenuTable();
  const cfg = readMenuDbConfig();
  if (!cfg) {
    return loadMenuRowsFromCache(userSysId);
  }

  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: "utf8mb4",
  });

  try {
    // 表名用参数替换（安全：来自配置而非用户输入）
    const table = tbl.replace(/[^a-z0-9_]/gi, "");
    const sql = userSysId
      ? `SELECT MENU_ID, MENU_NAME, PARENT_ID, LEVEL_NUM, IS_LEAF, ENABLED, url,
                DISP_ORDER, USER_SYS_ID
         FROM \`${table}\` WHERE ENABLED = 1 AND USER_SYS_ID = ?`
      : `SELECT MENU_ID, MENU_NAME, PARENT_ID, LEVEL_NUM, IS_LEAF, ENABLED, url,
                DISP_ORDER, USER_SYS_ID
         FROM \`${table}\` WHERE ENABLED = 1`;
    console.log(`[menu-db] SQL: ${sql.replace(/\s+/g, " ").trim()}`, userSysId ? `[${userSysId}]` : "[all]");
    const [rows] = await conn.execute(sql, userSysId ? [userSysId] : []);
    return (rows as Record<string, unknown>[]).map(rowFromDb);
  } finally {
    await conn.end();
  }
}

export async function loadMenuRowsFromCache(userSysId?: string): Promise<SysMenuRow[]> {
  const root = process.env.WORKSPACE_ROOT?.trim() || process.cwd();
  const fileName = userSysId ? `${userSysId}.json` : "all.json";
  const path = join(root, ".agent", "menu-map", fileName);
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as { rows?: SysMenuRow[] };
    return data.rows ?? [];
  } catch {
    if (!userSysId) return [];
    const fallback = process.env.MENU_USER_SYS_ID?.trim() || "672";
    if (fallback === userSysId) return [];
    return loadMenuRowsFromCache(fallback);
  }
}

export async function listMenuUserSysIds(
  tbl: string = "sys_menu",
): Promise<string[]> {
  const cfg = readMenuDbConfig();
  if (!cfg) {
    const id = process.env.MENU_USER_SYS_ID?.trim() || "672";
    return [id];
  }
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });
  try {
    const table = tbl.replace(/[^a-z0-9_]/gi, "");
    const sql = `SELECT DISTINCT USER_SYS_ID FROM \`${table}\`
       WHERE ENABLED = 1 AND PARENT_ID = USER_SYS_ID
       ORDER BY USER_SYS_ID`;
    console.log(`[menu-db] SQL: ${sql.replace(/\s+/g, " ").trim()}`);
    const [rows] = await conn.execute(sql);
    return (rows as { USER_SYS_ID: string }[]).map((r) => String(r.USER_SYS_ID));
  } finally {
    await conn.end();
  }
}
