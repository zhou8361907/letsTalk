import { join, resolve } from "node:path";

export const SESSION_DB_REL = ".agent/state.db";

function envFlag(name: string, defaultOn = true): boolean {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return defaultOn;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

/** `LETS_TALK_SESSION_DB=0` 时关闭 SQLite，纯 JSON 模式 */
export function isSessionDbEnabled(): boolean {
  return envFlag("LETS_TALK_SESSION_DB", true);
}

export function resolveSessionDbPath(workspaceRoot: string): string {
  const override = process.env.LETS_TALK_SESSION_DB_PATH?.trim();
  if (override) {
    return resolve(override);
  }
  return join(resolve(workspaceRoot), SESSION_DB_REL);
}
