import "server-only";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ──── types ────

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: "user" | "admin";
  created_at: string;
}

export interface AuthSession {
  id: string;
  user_id: string;
  expires_at: string;
}

// ──── db init ────

function dbPath(workspaceRoot: string): string {
  const dir = join(workspaceRoot, ".agent");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "auth.db");
}

function getDb(workspaceRoot: string): Database.Database {
  const path = dbPath(workspaceRoot);
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      display_name  TEXT NOT NULL,
      password      TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  // 清理过期 session
  db.prepare("DELETE FROM auth_sessions WHERE expires_at < datetime('now')").run();
  return db;
}

// ──── public API ────

export function registerUser(
  workspaceRoot: string,
  username: string,
  password: string,
  displayName?: string,
): User {
  const db = getDb(workspaceRoot);
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as
    | { id: string }
    | undefined;
  if (existing) {
    throw new Error("用户名已存在");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const name = displayName || username;
  // 第一个注册的自动成为管理员
  const userCount = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  const role = userCount === 0 ? "admin" : "user";

  db.prepare(
    "INSERT INTO users (id, username, display_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, username, name, password, role, now);

  return { id, username, display_name: name, role: role as "user", created_at: now };
}

export function loginUser(
  workspaceRoot: string,
  username: string,
  password: string,
): { user: User; token: string } {
  const db = getDb(workspaceRoot);
  const row = db.prepare(
    "SELECT id, username, display_name, password, role, created_at FROM users WHERE username = ?",
  ).get(username) as
    | { id: string; username: string; display_name: string; password: string; role: string; created_at: string }
    | undefined;

  if (!row) {
    throw new Error("用户名或密码错误");
  }

  if (row.password !== password) {
    throw new Error("用户名或密码错误");
  }

  // 创建 session
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 天

  db.prepare(
    "INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, row.id, now.toISOString(), expiresAt.toISOString());

  return {
    user: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role as "user" | "admin",
      created_at: row.created_at,
    },
    token,
  };
}

export function validateSession(workspaceRoot: string, token: string): User | null {
  try {
    const db = getDb(workspaceRoot);
    // 清理过期 session
    db.prepare("DELETE FROM auth_sessions WHERE expires_at < datetime('now')").run();

    const row = db.prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.created_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at >= datetime('now')`,
    ).get(token) as
      | { id: string; username: string; display_name: string; role: string; created_at: string }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role as "user" | "admin",
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}

export function logoutUser(workspaceRoot: string, token: string): void {
  try {
    const db = getDb(workspaceRoot);
    db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(token);
  } catch {
    // ignore
  }
}

export function getUserById(workspaceRoot: string, userId: string): User | null {
  try {
    const db = getDb(workspaceRoot);
    const row = db.prepare(
      "SELECT id, username, display_name, role, created_at FROM users WHERE id = ?",
    ).get(userId) as
      | { id: string; username: string; display_name: string; role: string; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role as "user" | "admin",
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}
