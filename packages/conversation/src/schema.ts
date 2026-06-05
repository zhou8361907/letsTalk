/** state.db v1 DDL — 与 docs/STATE_DB_V1.md §3 对齐 */
export const SCHEMA_VERSION = 1;

/** 基础表 DDL（不含 FTS5 虚拟表及触发器） */
export const SCHEMA_V1_BASE_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL DEFAULT 'web',
    title           TEXT,
    title_locked    INTEGER DEFAULT 0,
    chat_mode       TEXT DEFAULT 'explore',
    model           TEXT,
    pi_session_file TEXT,
    anchor_json     TEXT,
    has_draft       INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    ended_at        TEXT,
    parent_session_id TEXT,
    message_count   INTEGER DEFAULT 0,
    input_tokens    INTEGER DEFAULT 0,
    output_tokens   INTEGER DEFAULT 0,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,
    role            TEXT NOT NULL,
    kind            TEXT,
    content         TEXT,
    tool_name       TEXT,
    tool_call_id    TEXT,
    tool_calls_json TEXT,
    metadata_json   TEXT,
    created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_seq
    ON messages(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
`;

/** FTS5 虚拟表及触发器（仅在 FTS5 可用时执行） */
export const SCHEMA_V1_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    tool_name,
    content='messages',
    content_rowid='id',
    tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, tool_name)
  VALUES (new.id, COALESCE(new.content, ''), COALESCE(new.tool_name, ''));
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, tool_name)
  VALUES ('delete', old.id, COALESCE(old.content, ''), COALESCE(old.tool_name, ''));
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, tool_name)
  VALUES ('delete', old.id, COALESCE(old.content, ''), COALESCE(old.tool_name, ''));
  INSERT INTO messages_fts(rowid, content, tool_name)
  VALUES (new.id, COALESCE(new.content, ''), COALESCE(new.tool_name, ''));
END;
`;

/** 完整 DDL（含 FTS5），兼容已有引用 */
export const SCHEMA_V1_SQL = `${SCHEMA_V1_BASE_SQL}\n${SCHEMA_V1_FTS_SQL}`;
