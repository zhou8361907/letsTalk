import "server-only";
import { randomUUID } from "node:crypto";

// ──── types ────

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: "user" | "admin";
  created_at: string;
}

// ──── MySQL 连接 ────

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function readDbConfig(): DbConfig | null {
  const host = process.env.MENU_DB_HOST?.trim();
  const user = process.env.MENU_DB_USER?.trim();
  const password = process.env.MENU_DB_PASSWORD?.trim();
  const database = process.env.MENU_DB_NAME?.trim() || "test";
  if (!host || !user || password === undefined) return null;
  const port = Number(process.env.MENU_DB_PORT || "3306");
  return { host, port, user, password, database };
}

async function getConn() {
  const cfg = readDbConfig();
  if (!cfg) throw new Error("数据库未配置，请检查 MENU_DB_* 环境变量");
  const mysql = await import("mysql2/promise");
  return mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });
}

// ──── 建表 ────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function ensureTables() {
  const conn = await getConn();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lets_talk_users (
        id          VARCHAR(36) PRIMARY KEY,
        username    VARCHAR(64) NOT NULL UNIQUE,
        display_name VARCHAR(64) NOT NULL,
        password    VARCHAR(128) NOT NULL,
        role        VARCHAR(16) NOT NULL DEFAULT 'user',
        created_at  VARCHAR(32) NOT NULL
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lets_talk_sessions (
        id         VARCHAR(36) PRIMARY KEY,
        user_id    VARCHAR(36) NOT NULL,
        expires_at BIGINT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES lets_talk_users(id)
      )
    `);
    // 清理过期 session
    await conn.execute(
      "DELETE FROM lets_talk_sessions WHERE expires_at < ?",
      [Date.now()],
    );
  } finally {
    conn.end();
  }
}

// ──── public API ────

/** 注册用户，第一个自动为管理员 */
export async function registerUser(
  _workspaceRoot: string,
  username: string,
  password: string,
  displayName?: string,
): Promise<User> {
  await ensureTables();
  const conn = await getConn();
  try {
    // 检查重名
    const [rows] = await conn.execute(
      "SELECT id FROM lets_talk_users WHERE username = ?",
      [username],
    ) as [Array<{ id: string }>, unknown];
    if (rows.length > 0) throw new Error("用户名已存在");

    // 检查是不是第一个用户
    const [countRows] = await conn.execute(
      "SELECT COUNT(*) AS c FROM lets_talk_users",
    ) as [Array<{ c: number }>, unknown];
    const role = countRows[0]?.c === 0 ? "admin" : "user";

    const id = randomUUID();
    const now = new Date().toISOString();
    const name = displayName || username;

    await conn.execute(
      "INSERT INTO lets_talk_users (id, username, display_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, username, name, password, role, now],
    );

    return { id, username, display_name: name, role: role as "user" | "admin", created_at: now };
  } finally {
    conn.end();
  }
}

/** 登录，返回 user + session token */
export async function loginUser(
  _workspaceRoot: string,
  username: string,
  password: string,
): Promise<{ user: User; token: string }> {
  await ensureTables();
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT id, username, display_name, password, role, created_at FROM lets_talk_users WHERE username = ?",
      [username],
    ) as [Array<{ id: string; username: string; display_name: string; password: string; role: string; created_at: string }>, unknown];

    if (rows.length === 0 || rows[0]!.password !== password) {
      throw new Error("用户名或密码错误");
    }

    const user = rows[0]!;
    const token = randomUUID();

    await conn.execute(
      "INSERT INTO lets_talk_sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      [token, user.id, Date.now() + SESSION_TTL_MS],
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role as "user" | "admin",
        created_at: user.created_at,
      },
      token,
    };
  } finally {
    conn.end();
  }
}

/** 校验 session token */
export async function validateSession(
  _workspaceRoot: string,
  token: string,
): Promise<User | null> {
  try {
    const conn = await getConn();
    try {
      // 清理过期 session
      await conn.execute(
        "DELETE FROM lets_talk_sessions WHERE expires_at < ?",
        [Date.now()],
      );

      const [rows] = await conn.execute(
        `SELECT u.id, u.username, u.display_name, u.role, u.created_at
         FROM lets_talk_sessions s
         JOIN lets_talk_users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at >= ?`,
        [token, Date.now()],
      ) as [Array<{ id: string; username: string; display_name: string; role: string; created_at: string }>, unknown];

      if (rows.length === 0) return null;
      const u = rows[0]!;
      return {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role as "user" | "admin",
        created_at: u.created_at,
      };
    } finally {
      conn.end();
    }
  } catch {
    return null;
  }
}

/** 登出 */
export async function logoutUser(_workspaceRoot: string, token: string): Promise<void> {
  try {
    const conn = await getConn();
    try {
      await conn.execute("DELETE FROM lets_talk_sessions WHERE id = ?", [token]);
    } finally {
      conn.end();
    }
  } catch {
    // ignore
  }
}

/** 通过 ID 查用户 */
export async function getUserById(
  _workspaceRoot: string,
  userId: string,
): Promise<User | null> {
  try {
    const conn = await getConn();
    try {
      const [rows] = await conn.execute(
        "SELECT id, username, display_name, role, created_at FROM lets_talk_users WHERE id = ?",
        [userId],
      ) as [Array<{ id: string; username: string; display_name: string; role: string; created_at: string }>, unknown];
      if (rows.length === 0) return null;
      const u = rows[0]!;
      return {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role as "user" | "admin",
        created_at: u.created_at,
      };
    } finally {
      conn.end();
    }
  } catch {
    return null;
  }
}
