import type { SessionDB } from "./session-db.js";
import type {
  DbMessageRow,
  DiscoverySessionResult,
  ScrollSessionResult,
  ShapedMessage,
} from "./db-message-types.js";
import type { SessionSearchResult } from "./db-message-types.js";

const DISCOVERY_MAX_SESSIONS = 3;
const DISCOVERY_WINDOW = 5;
const DISCOVERY_BOOKEND = 3;
const DISCOVERY_SOFT_CAP_MESSAGES = 80;
const SCROLL_MAX_WINDOW = 10;
const SCROLL_HARD_CAP = 21;
const BROWSE_LIMIT = 20;

export interface SessionSearchArgs {
  query?: string;
  session_id?: string;
  around_message_id?: number;
  window?: number;
  current_session_id?: string;
  /** Discovery 最多返回几个 session（默认 3；prefetch 用 1） */
  discovery_limit?: number;
}

export type { SessionSearchResult } from "./db-message-types.js";

interface BrowseResult {
  session_id: string;
  title: string;
  updated_at: string;
  message_count: number;
  preview: string;
}

export function shapeMessage(row: DbMessageRow, anchorId?: number): ShapedMessage {
  const entry: ShapedMessage = {
    id: row.id,
    role: row.role,
    content: row.content,
  };
  if (row.kind) entry.kind = row.kind;
  if (row.tool_name) entry.tool_name = row.tool_name;
  if (anchorId !== undefined && row.id === anchorId) entry.anchor = true;
  return entry;
}

function countShapedMessages(result: DiscoverySessionResult): number {
  return (
    result.bookend_start.length +
    result.messages.length +
    result.bookend_end.length
  );
}

function browse(db: SessionDB, currentSessionId?: string): SessionSearchResult {
  const rows = db.listSessionsBrowse(BROWSE_LIMIT + (currentSessionId ? 1 : 0));
  const results: BrowseResult[] = rows
    .filter((r) => !currentSessionId || r.sessionId !== currentSessionId)
    .slice(0, BROWSE_LIMIT)
    .map((r) => ({
      session_id: r.sessionId,
      title: r.title,
      updated_at: r.updatedAt,
      message_count: r.messageCount,
      preview: r.preview,
    }));

  return {
    success: true,
    mode: "browse",
    results,
    count: results.length,
    message: `最近 ${results.length} 个会话。传 query= 搜索；传 session_id + around_message_id 翻页。`,
  };
}

function scroll(
  db: SessionDB,
  sessionId: string,
  aroundMessageId: number,
  window: number,
): SessionSearchResult {
  const half = Math.max(1, Math.min(window, SCROLL_MAX_WINDOW));
  let effectiveSessionId = sessionId;
  let warning: string | undefined;

  let view = db.getAnchoredView(effectiveSessionId, aroundMessageId, {
    window: half,
    bookend: 0,
  });

  if (view.window.length === 0) {
    const owning = db.resolveMessageSession(aroundMessageId);
    if (owning && owning !== sessionId) {
      const rebound = db.getAnchoredView(owning, aroundMessageId, {
        window: half,
        bookend: 0,
      });
      if (rebound.window.length > 0) {
        view = rebound;
        effectiveSessionId = owning;
        warning = `around_message_id ${aroundMessageId} 属于 session ${owning}，已从 ${sessionId} rebind`;
      }
    }
  }

  if (view.window.length === 0) {
    const range = db.getMessageIdRange(sessionId);
    const rangeHint = range
      ? `该会话 DB 内共 ${range.count} 条消息，message_id 约在 ${range.min}–${range.max}（SQLite 自增 id，不是第几条）。`
      : "该 session 在 DB 中无消息或不存在。";
    return {
      success: false,
      mode: "scroll",
      error: `未找到 message_id=${aroundMessageId}。${rangeHint} 请先用 session_search(query=…) 拿 match_message_id，勿猜 100/500 等数字。`,
    };
  }

  const capped = view.window.slice(0, SCROLL_HARD_CAP);
  const meta = db.getSessionMeta(effectiveSessionId);
  const scrollResult: ScrollSessionResult = {
    session_id: effectiveSessionId,
    around_message_id: aroundMessageId,
    session_meta: {
      title: meta?.title ?? "新对话",
      updated_at: meta?.updated_at ?? "",
    },
    window: half,
    messages: capped.map((r) => shapeMessage(r, aroundMessageId)),
    messages_before: view.messages_before,
    messages_after: view.messages_after,
    warning,
  };

  return {
    success: true,
    mode: "scroll",
    results: [scrollResult],
    count: scrollResult.messages.length,
    message: `返回 ${scrollResult.messages.length} 条（window=±${half}）。messages_before=${view.messages_before} messages_after=${view.messages_after}。`,
  };
}

function discovery(
  db: SessionDB,
  query: string,
  currentSessionId?: string,
  maxSessions = DISCOVERY_MAX_SESSIONS,
): SessionSearchResult {
  if (!db.ftsEnabled) {
    return {
      success: false,
      mode: "discovery",
      error: "FTS5 不可用，无法按关键词搜索历史会话",
    };
  }

  const hits = db.searchMessagesFts(query, 50);
  if (hits.length === 0) {
    return {
      success: true,
      mode: "discovery",
      query,
      results: [],
      count: 0,
      message: `未找到匹配「${query}」的历史消息。建议缩短 query（单词搜索），勿在 query 里写 FROM session:uuid。`,
    };
  }

  const bySession = new Map<string, (typeof hits)[0]>();
  let includeCurrentSession = false;

  for (const h of hits) {
    if (currentSessionId && h.session_id === currentSessionId) continue;
    if (!bySession.has(h.session_id)) {
      bySession.set(h.session_id, h);
    }
    if (bySession.size >= maxSessions) break;
  }

  if (bySession.size === 0 && currentSessionId) {
    const inCurrent = hits.find((h) => h.session_id === currentSessionId);
    if (inCurrent) {
      includeCurrentSession = true;
      bySession.set(currentSessionId, inCurrent);
    }
  }

  const results: DiscoverySessionResult[] = [];
  let totalMessages = 0;

  for (const [sessionId, hit] of bySession) {
    if (results.length >= maxSessions) break;
    if (totalMessages >= DISCOVERY_SOFT_CAP_MESSAGES) break;

    const view = db.getAnchoredView(sessionId, hit.id, {
      window: DISCOVERY_WINDOW,
      bookend: DISCOVERY_BOOKEND,
    });
    if (view.window.length === 0) continue;

    const meta = db.getSessionMeta(sessionId);
    const entry: DiscoverySessionResult = {
      session_id: sessionId,
      title: meta?.title ?? "新对话",
      updated_at: meta?.updated_at ?? "",
      match_message_id: hit.id,
      matched_role: hit.role,
      snippet: (hit.content ?? "").slice(0, 200),
      bookend_start: view.bookend_start.map((r) => shapeMessage(r)),
      messages: view.window.map((r) => shapeMessage(r, hit.id)),
      bookend_end: view.bookend_end.map((r) => shapeMessage(r)),
      messages_before: view.messages_before,
      messages_after: view.messages_after,
    };

    const n = countShapedMessages(entry);
    if (totalMessages + n > DISCOVERY_SOFT_CAP_MESSAGES) {
      const budget = DISCOVERY_SOFT_CAP_MESSAGES - totalMessages;
      if (budget <= 0) break;
      entry.messages = entry.messages.slice(0, Math.max(1, budget));
      entry.bookend_start = [];
      entry.bookend_end = [];
    }

    totalMessages += countShapedMessages(entry);
    results.push(entry);
  }

  const baseMsg = `最多 ${maxSessions} 个会话（anchored view ±${DISCOVERY_WINDOW} + bookend ${DISCOVERY_BOOKEND}）。需要更多请 scroll(session_id, match_message_id)。`;
  const hint = includeCurrentSession
    ? "（命中均在当前会话；更早段落请 scroll。）"
    : "";

  return {
    success: true,
    mode: "discovery",
    query,
    results,
    count: totalMessages,
    message: baseMsg + hint,
  };
}

/** 三模式合一：query → discovery；session_id+around_message_id → scroll；否则 browse */
export function runSessionSearch(
  db: SessionDB,
  args: SessionSearchArgs,
): SessionSearchResult {
  const query = args.query?.trim();
  const sessionId = args.session_id?.trim();
  const aroundId = args.around_message_id;

  if (query) {
    const limit =
      typeof args.discovery_limit === "number" && args.discovery_limit > 0
        ? Math.min(args.discovery_limit, DISCOVERY_MAX_SESSIONS)
        : DISCOVERY_MAX_SESSIONS;
    return discovery(db, query, args.current_session_id, limit);
  }

  if (sessionId && aroundId != null) {
    const wid =
      typeof args.window === "number" && Number.isFinite(args.window)
        ? Math.floor(args.window)
        : 5;
    return scroll(db, sessionId, aroundId, wid);
  }

  if (sessionId && aroundId === undefined) {
    return {
      success: false,
      mode: "scroll",
      error: "scroll 需要 around_message_id（整数 message id，来自 Discovery 的 match_message_id）",
    };
  }

  return browse(db, args.current_session_id);
}
