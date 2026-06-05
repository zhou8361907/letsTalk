import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ConversationRecord, ConversationSummary } from "@lets-talk/shared-types";
import type {
  AnchoredViewResult,
  DbMessageRow,
  DbSessionBrowseRow,
  FtsHitRow,
  MessagesAroundResult,
} from "./db-message-types.js";

const DEFAULT_FTS_ROLES = ["user", "assistant"] as const;
import { resolveSessionDbPath } from "./session-db-config.js";
import { SCHEMA_V1_BASE_SQL, SCHEMA_V1_FTS_SQL, SCHEMA_VERSION } from "./schema.js";
import { transcriptItemsToMessageRows } from "./transcript-db-mapper.js";

export class SessionDB {
  readonly db: Database.Database;
  ftsEnabled = true;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static open(workspaceRoot: string): SessionDB {
    const dbPath = resolveSessionDbPath(workspaceRoot);
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new Database(dbPath, { timeout: 1000 });
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const sessionDb = new SessionDB(db);
    sessionDb.detectFts();  // 先探测 FTS5 可用性，确保 migrate 可按条件跳过 FTS DDL
    sessionDb.migrate();
    return sessionDb;
  }

  static openInMemory(): SessionDB {
    const db = new Database(":memory:", { timeout: 1000 });
    db.pragma("foreign_keys = ON");
    const sessionDb = new SessionDB(db);
    sessionDb.detectFts();  // 先探测 FTS5 可用性
    sessionDb.migrate();
    return sessionDb;
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
      .get() as { name: string } | undefined;

    if (!row) {
      this.db.exec(SCHEMA_V1_BASE_SQL);
      if (this.ftsEnabled) {
        try {
          this.db.exec(SCHEMA_V1_FTS_SQL);
        } catch {
          this.ftsEnabled = false;
        }
      }
      this.db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
      return;
    }

    const versionRow = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
      | { version: number }
      | undefined;
    const current = versionRow?.version ?? 0;
    if (current < SCHEMA_VERSION) {
      this.db.exec(SCHEMA_V1_BASE_SQL);
      if (this.ftsEnabled) {
        try {
          this.db.exec(SCHEMA_V1_FTS_SQL);
        } catch {
          this.ftsEnabled = false;
        }
      }
      if (versionRow) {
        this.db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION);
      } else {
        this.db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
      }
    }
  }

  private detectFts(): void {
    try {
      this.db.exec("CREATE VIRTUAL TABLE temp._fts_probe USING fts5(x, tokenize='trigram')");
      this.db.exec("DROP TABLE temp._fts_probe");
      this.ftsEnabled = true;
    } catch {
      this.ftsEnabled = false;
    }
  }

  upsertSession(record: ConversationRecord): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
          id, source, title, title_locked, chat_mode, pi_session_file,
          anchor_json, has_draft, created_at, updated_at, message_count
        ) VALUES (
          @id, 'web', @title, @title_locked, @chat_mode, @pi_session_file,
          @anchor_json, @has_draft, @created_at, @updated_at, @message_count
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          title_locked = excluded.title_locked,
          chat_mode = excluded.chat_mode,
          pi_session_file = excluded.pi_session_file,
          anchor_json = excluded.anchor_json,
          has_draft = excluded.has_draft,
          updated_at = excluded.updated_at,
          message_count = excluded.message_count`,
      )
      .run({
        id: record.sessionId,
        title: record.title,
        title_locked: record.titleLocked ? 1 : 0,
        chat_mode: record.chatMode ?? "explore",
        pi_session_file: record.piSessionFile ?? null,
        anchor_json: record.anchor ? JSON.stringify(record.anchor) : null,
        has_draft: record.requirementDraft && record.requirementDraft.items?.length ? 1 : 0,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        message_count: record.items.length,
      });
  }

  flushMessages(sessionId: string, items: ConversationRecord["items"], createdAt: string): void {
    const rows = transcriptItemsToMessageRows(items);
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO messages (
        session_id, seq, role, kind, content, tool_name, created_at
      ) VALUES (
        @session_id, @seq, @role, @kind, @content, @tool_name, @created_at
      )`,
    );

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        insert.run({
          session_id: sessionId,
          seq: row.seq,
          role: row.role,
          kind: row.kind,
          content: row.content,
          tool_name: row.tool_name,
          created_at: createdAt,
        });
      }
    });
    tx();
  }

  syncRecord(record: ConversationRecord): void {
    const tx = this.db.transaction(() => {
      this.upsertSession(record);
      this.flushMessages(record.sessionId, record.items, record.updatedAt);
    });
    tx();
  }

  deleteSession(sessionId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  listSessions(): ConversationSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id AS sessionId, title, created_at AS createdAt, updated_at AS updatedAt
         FROM sessions
         ORDER BY updated_at DESC, id DESC`,
      )
      .all() as ConversationSummary[];
    return rows.map((r) => ({
      ...r,
      title: r.title || "新对话",
    }));
  }

  countMessages(sessionId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE session_id = ?")
      .get(sessionId) as { c: number };
    return row.c;
  }

  /** 移除 FTS5 特殊字符，避免 MATCH 语法错误 */
  static sanitizeFtsQuery(q: string): string {
    // FTS5 特殊字符：^ * " ( ) : + - ~ { } [ ] 等；中文 / 字母 / 数字 / 空格保留
    return q.replace(/[^一-龥a-zA-Z0-9_\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  /** Discovery 前处理：去掉 Agent 误传的 session 限定，避免 UUID 碎片进入 FTS */
  static normalizeDiscoveryQuery(q: string): string {
    let s = q.trim();
    s = s.replace(
      /\bfrom\s+session\s*:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      " ",
    );
    s = s.replace(
      /\bsession\s*:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      " ",
    );
    return SessionDB.sanitizeFtsQuery(s);
  }

  private ftsMatch(matchQuery: string, limit: number, roles: readonly string[]): FtsHitRow[] {
    if (!matchQuery.trim()) return [];
    const placeholders = roles.map(() => "?").join(", ");
    try {
      return this.db
        .prepare(
          `SELECT m.session_id, m.id, m.content, m.role
           FROM messages_fts fts
           JOIN messages m ON m.id = fts.rowid
           WHERE messages_fts MATCH ?
             AND m.role IN (${placeholders})
           ORDER BY bm25(messages_fts)
           LIMIT ?`,
        )
        .all(matchQuery, ...roles, limit) as FtsHitRow[];
    } catch {
      return [];
    }
  }

  searchMessagesFts(
    query: string,
    limit = 20,
    roles: readonly string[] = DEFAULT_FTS_ROLES,
  ): FtsHitRow[] {
    if (!this.ftsEnabled || !query.trim()) {
      return [];
    }
    const normalized = SessionDB.normalizeDiscoveryQuery(query);
    if (!normalized) {
      return [];
    }

    const terms = normalized.split(/\s+/).filter(Boolean);
    let hits = this.ftsMatch(normalized, limit, roles);
    if (hits.length === 0 && terms.length > 1) {
      hits = this.ftsMatch(terms.join(" OR "), limit, roles);
    }
    if (hits.length === 0 && terms.length > 1) {
      const longest = [...terms].sort((a, b) => b.length - a.length)[0]!;
      hits = this.ftsMatch(longest, limit, roles);
    }
    return hits;
  }

  resolveMessageSession(messageId: number): string | null {
    const row = this.db
      .prepare("SELECT session_id FROM messages WHERE id = ?")
      .get(messageId) as { session_id: string } | undefined;
    return row?.session_id ?? null;
  }

  getMessageIdRange(
    sessionId: string,
  ): { min: number; max: number; count: number } | null {
    const row = this.db
      .prepare(
        `SELECT MIN(id) AS min, MAX(id) AS max, COUNT(*) AS count
         FROM messages WHERE session_id = ?`,
      )
      .get(sessionId) as { min: number | null; max: number | null; count: number } | undefined;
    if (!row || row.count === 0 || row.min == null || row.max == null) {
      return null;
    }
    return { min: row.min, max: row.max, count: row.count };
  }

  getSessionMeta(sessionId: string): {
    id: string;
    title: string;
    updated_at: string;
  } | null {
    const row = this.db
      .prepare(
        `SELECT id, title, updated_at FROM sessions WHERE id = ?`,
      )
      .get(sessionId) as { id: string; title: string | null; updated_at: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      title: row.title || "新对话",
      updated_at: row.updated_at,
    };
  }

  getMessagesAroundPrimitive(
    sessionId: string,
    aroundMessageId: number,
    halfWindow: number,
  ): MessagesAroundResult {
    const empty: MessagesAroundResult = {
      window: [],
      messages_before: 0,
      messages_after: 0,
    };
    const anchor = this.db
      .prepare(
        `SELECT id, session_id, seq, role, kind, content, tool_name, created_at
         FROM messages WHERE session_id = ? AND id = ?`,
      )
      .get(sessionId, aroundMessageId) as DbMessageRow | undefined;
    if (!anchor) return empty;

    const lo = Math.max(0, anchor.seq - halfWindow);
    const hi = anchor.seq + halfWindow;

    const window = this.db
      .prepare(
        `SELECT id, session_id, seq, role, kind, content, tool_name, created_at
         FROM messages
         WHERE session_id = ? AND seq BETWEEN ? AND ?
         ORDER BY seq ASC, id ASC`,
      )
      .all(sessionId, lo, hi) as DbMessageRow[];

    if (window.length === 0) return empty;

    const beforeRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages WHERE session_id = ? AND seq < ?`,
      )
      .get(sessionId, lo) as { c: number };
    const afterRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages WHERE session_id = ? AND seq > ?`,
      )
      .get(sessionId, hi) as { c: number };

    return {
      window,
      messages_before: beforeRow.c,
      messages_after: afterRow.c,
    };
  }

  /** @deprecated 用 getMessagesAroundPrimitive；保留兼容 */
  getMessagesAround(
    sessionId: string,
    aroundMessageId: number,
    halfWindow: number,
  ): DbMessageRow[] {
    return this.getMessagesAroundPrimitive(sessionId, aroundMessageId, halfWindow).window;
  }

  getAnchoredView(
    sessionId: string,
    aroundMessageId: number,
    options?: {
      window?: number;
      bookend?: number;
      keepRoles?: readonly string[] | null;
    },
  ): AnchoredViewResult {
    const windowSize = options?.window ?? 5;
    const bookend = options?.bookend ?? 3;
    const keepRoles = options?.keepRoles === null ? null : (options?.keepRoles ?? DEFAULT_FTS_ROLES);

    const primitive = this.getMessagesAroundPrimitive(
      sessionId,
      aroundMessageId,
      windowSize,
    );
    if (primitive.window.length === 0) {
      return {
        window: [],
        messages_before: 0,
        messages_after: 0,
        bookend_start: [],
        bookend_end: [],
      };
    }

    const keepSet = keepRoles ? new Set(keepRoles) : null;
    const filteredWindow = keepSet
      ? primitive.window.filter(
          (m) => m.id === aroundMessageId || keepSet.has(m.role),
        )
      : primitive.window;

    const windowMinId = primitive.window[0]!.id;
    const windowMaxId = primitive.window[primitive.window.length - 1]!.id;

    let bookend_start: DbMessageRow[] = [];
    let bookend_end: DbMessageRow[] = [];

    if (bookend > 0) {
      const roleClause = keepRoles
        ? ` AND role IN (${keepRoles.map(() => "?").join(", ")})`
        : "";
      const roleParams = keepRoles ? [...keepRoles] : [];

      bookend_start = this.db
        .prepare(
          `SELECT id, session_id, seq, role, kind, content, tool_name, created_at
           FROM messages
           WHERE session_id = ? AND id < ?${roleClause}
             AND length(COALESCE(content, '')) > 0
           ORDER BY id ASC LIMIT ?`,
        )
        .all(sessionId, windowMinId, ...roleParams, bookend) as DbMessageRow[];

      const endRows = this.db
        .prepare(
          `SELECT id, session_id, seq, role, kind, content, tool_name, created_at
           FROM messages
           WHERE session_id = ? AND id > ?${roleClause}
             AND length(COALESCE(content, '')) > 0
           ORDER BY id DESC LIMIT ?`,
        )
        .all(sessionId, windowMaxId, ...roleParams, bookend) as DbMessageRow[];
      bookend_end = endRows.reverse();
    }

    return {
      window: filteredWindow,
      messages_before: primitive.messages_before,
      messages_after: primitive.messages_after,
      bookend_start,
      bookend_end,
    };
  }

  listSessionsBrowse(limit: number): DbSessionBrowseRow[] {
    const rows = this.db
      .prepare(
        `SELECT
           s.id AS sessionId,
           s.title,
           s.created_at AS createdAt,
           s.updated_at AS updatedAt,
           s.message_count AS messageCount,
           COALESCE(
             (SELECT SUBSTR(m.content, 1, 120)
              FROM messages m
              WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL AND m.content != ''
              ORDER BY m.seq ASC, m.id ASC
              LIMIT 1),
             ''
           ) AS preview
         FROM sessions s
         ORDER BY s.updated_at DESC, s.id DESC
         LIMIT ?`,
      )
      .all(limit) as DbSessionBrowseRow[];
    return rows.map((r) => ({
      ...r,
      title: r.title || "新对话",
    }));
  }
}
