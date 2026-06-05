import { resolve } from "node:path";
import type { ConversationRecord } from "@lets-talk/shared-types";
import { isSessionDbEnabled } from "./session-db-config.js";
import { SessionDB } from "./session-db.js";

const cache = new Map<string, SessionDB | null>();

function cacheKey(workspaceRoot: string): string {
  return resolve(workspaceRoot);
}

/** 进程内单例；open 失败缓存 null，后续走 JSON-only */
export function getSessionDb(workspaceRoot: string): SessionDB | null {
  if (!isSessionDbEnabled()) {
    return null;
  }
  const key = cacheKey(workspaceRoot);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  try {
    const db = SessionDB.open(workspaceRoot);
    cache.set(key, db);
    return db;
  } catch (err) {
    console.warn(
      "[session-db] open failed, falling back to JSON-only:",
      err instanceof Error ? err.message : err,
    );
    cache.set(key, null);
    return null;
  }
}

/** JSON 写入成功后 best-effort 同步 DB；失败只 warn，不抛错 */
export function trySyncConversationToDb(
  workspaceRoot: string,
  record: ConversationRecord,
): void {
  const db = getSessionDb(workspaceRoot);
  if (!db) return;
  try {
    db.syncRecord(record);
  } catch (err) {
    console.warn(
      `[session-db] sync failed for session ${record.sessionId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** 删除 DB 行；失败只 warn */
export function tryDeleteSessionFromDb(workspaceRoot: string, sessionId: string): void {
  const db = getSessionDb(workspaceRoot);
  if (!db) return;
  try {
    db.deleteSession(sessionId);
  } catch (err) {
    console.warn(
      `[session-db] delete failed for session ${sessionId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** 测试用：清缓存并关闭连接 */
export function resetSessionDbCacheForTests(): void {
  for (const db of cache.values()) {
    db?.close();
  }
  cache.clear();
}
