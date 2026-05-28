#!/usr/bin/env node
/**
 * 从 sys_menu 同步到 .agent/menu-map/{userSysId}.json
 * 用法: node scripts/sync-menu-map.mjs [userSysId]
 * 需配置 MENU_DB_* 或根目录 .env（由 dotenv 加载）
 */
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env") });

const arg = process.argv[2] || process.env.MENU_USER_SYS_ID || "672";
const syncAll = arg === "all" || arg === "*";

const host = process.env.MENU_DB_HOST;
const user = process.env.MENU_DB_USER;
const password = process.env.MENU_DB_PASSWORD;
const database = process.env.MENU_DB_NAME || "mifc";
const port = Number(process.env.MENU_DB_PORT || 3306);

if (!host || !user || password === undefined) {
  console.error("请配置 MENU_DB_HOST / MENU_DB_USER / MENU_DB_PASSWORD");
  process.exit(1);
}

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  charset: "utf8mb4",
});

const [rows] = await conn.execute(
  syncAll
    ? `SELECT MENU_ID, MENU_NAME, PARENT_ID, LEVEL_NUM, IS_LEAF, ENABLED, url,
              DISP_ORDER, USER_SYS_ID
       FROM sys_menu WHERE ENABLED = 1`
    : `SELECT MENU_ID, MENU_NAME, PARENT_ID, LEVEL_NUM, IS_LEAF, ENABLED, url,
              DISP_ORDER, USER_SYS_ID
       FROM sys_menu WHERE ENABLED = 1 AND USER_SYS_ID = ?`,
  syncAll ? [] : [arg],
);

await conn.end();

const mapped = rows.map((r) => ({
  menuId: String(r.MENU_ID),
  menuName: String(r.MENU_NAME),
  parentId: String(r.PARENT_ID),
  levelNum: Number(r.LEVEL_NUM),
  isLeaf: Number(r.IS_LEAF) === 1,
  enabled: Number(r.ENABLED) === 1,
  url: r.url ? String(r.url) : null,
  dispOrder: Number(r.DISP_ORDER ?? 0),
  userSysId: String(r.USER_SYS_ID),
}));

const outDir = join(root, ".agent", "menu-map");
await mkdir(outDir, { recursive: true });
const fileId = syncAll ? "all" : arg;
const outPath = join(outDir, `${fileId}.json`);
await writeFile(
  outPath,
  JSON.stringify(
    { userSysId: fileId, syncedAt: new Date().toISOString(), rows: mapped },
    null,
    2,
  ),
  "utf8",
);

console.log(`Wrote ${mapped.length} rows → ${outPath}`);
