/**
 * Tier-2 episodic prefetch：用户问历史时自动 FTS 召回进 user prefix
 */

import { getSessionDb } from "./db-sync.js";
import { runSessionSearch } from "./db-search.js";
import type { DiscoverySessionResult } from "./db-message-types.js";

const EPISODIC_TRIGGER =
  /上次|之前|先前|上周|上回|还记得|记得吗|聊过|说过|讨论过|历史会话|那个需求|以前|earlier|last\s+time|remember\s+when|we\s+discussed/gi;

const STOP_WORDS =
  /^(吗|呢|啊|的|了|是|什么|怎么|哪|请|帮|我|你|还|不|有|没|the|a|an|to|and|or)$/i;

function envFlag(name: string, defaultOn = true): boolean {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return defaultOn;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export function isEpisodicPrefetchEnabled(): boolean {
  return envFlag("LETS_TALK_EPISODIC_PREFETCH", true);
}

export function shouldEpisodicPrefetch(userMessage: string): boolean {
  const t = userMessage.trim();
  if (t.length < 4) return false;
  return EPISODIC_TRIGGER.test(t);
}

export function extractEpisodicQuery(userMessage: string): string {
  let s = userMessage.trim();
  s = s.replace(EPISODIC_TRIGGER, " ");
  s = s.replace(/[？?！!。，,；;：:\s]+/g, " ").trim();
  const tokens = s.split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.test(w));
  if (tokens.length > 0) {
    return tokens.slice(0, 6).join(" ");
  }
  const fallback = userMessage.replace(EPISODIC_TRIGGER, "").trim();
  return fallback.length >= 2 ? fallback.slice(0, 40) : userMessage.slice(0, 40);
}

function formatDiscoveryEntry(entry: DiscoverySessionResult): string {
  const lines: string[] = [
    `### 会话：${entry.title} (${entry.session_id.slice(0, 8)}…)`,
    `更新：${entry.updated_at} | 命中 message_id=${entry.match_message_id}`,
  ];
  if (entry.bookend_start.length > 0) {
    lines.push("**开场：**");
    for (const m of entry.bookend_start) {
      lines.push(`- [${m.role}] ${(m.content ?? "").slice(0, 300)}`);
    }
  }
  lines.push("**命中附近：**");
  for (const m of entry.messages) {
    const mark = m.anchor ? " *" : "";
    lines.push(`- [${m.role}]${mark} ${(m.content ?? "").slice(0, 400)}`);
  }
  if (entry.bookend_end.length > 0) {
    lines.push("**收尾：**");
    for (const m of entry.bookend_end) {
      lines.push(`- [${m.role}] ${(m.content ?? "").slice(0, 300)}`);
    }
  }
  if (entry.messages_before > 0 || entry.messages_after > 0) {
    lines.push(
      `（更早/更晚各约 ${entry.messages_before}/${entry.messages_after} 条，可用 session_search scroll）`,
    );
  }
  return lines.join("\n");
}

/** 构建 `<episodic_recall>` 块正文；无命中返回空字符串 */
export async function buildEpisodicRecallBlock(
  workspaceRoot: string,
  userMessage: string,
  options?: { currentSessionId?: string },
): Promise<string> {
  if (!isEpisodicPrefetchEnabled() || !shouldEpisodicPrefetch(userMessage)) {
    return "";
  }

  const db = getSessionDb(workspaceRoot);
  if (!db || !db.ftsEnabled) return "";

  const query = extractEpisodicQuery(userMessage);
  if (!query.trim()) return "";

  const result = runSessionSearch(db, {
    query,
    current_session_id: options?.currentSessionId,
    discovery_limit: 1,
  });

  if (!result.success || result.mode !== "discovery" || !result.results?.length) {
    return "";
  }

  const entries = result.results as DiscoverySessionResult[];
  const body = entries.map(formatDiscoveryEntry).join("\n\n");
  return body.trim();
}
