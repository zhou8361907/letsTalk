import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationRecord } from "@lets-talk/shared-types";
import { conversationsDir } from "./store.js";
import { getSessionDb, resetSessionDbCacheForTests } from "./db-sync.js";

export interface ImportSessionsResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** 从 `.agent/conversations/*.json` 批量导入 state.db（INSERT OR IGNORE 幂等） */
export async function importConversationsFromJson(
  workspaceRoot: string,
): Promise<ImportSessionsResult> {
  const db = getSessionDb(workspaceRoot);
  if (!db) {
    throw new Error("Session DB 不可用（LETS_TALK_SESSION_DB=0 或 open 失败）");
  }

  const dir = conversationsDir(workspaceRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { imported: 0, skipped: 0, errors: [] };
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try {
      const raw = await readFile(path, "utf8");
      const record = JSON.parse(raw) as ConversationRecord;
      if (!record.sessionId) {
        skipped++;
        continue;
      }
      db.syncRecord(record);
      imported++;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, skipped, errors };
}

export { resetSessionDbCacheForTests };
