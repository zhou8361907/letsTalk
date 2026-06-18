/**
 * QA 录制会话存储层
 * - 录制 JSON 文件的读写管理
 * - 按日期分目录存储
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { QaRecordEvent } from "@lets-talk/shared-types";

/** 录制会话元数据 */
export interface RecordedSession {
  sessionId: string;
  chatSessionId: string;
  startedAt: string;
  endedAt: string | null;
  browserUrl: string | null;
  events: QaRecordEvent[];
}

const QA_DIR = join(process.cwd(), ".agent", "qa-recordings");

function ensureDir(): void {
  if (!existsSync(QA_DIR)) {
    mkdirSync(QA_DIR, { recursive: true });
  }
}

function sessionPath(sessionId: string): string {
  return join(QA_DIR, `${sessionId}.json`);
}

/** 创建新录制会话（全局唯一 ID，不绑定对话） */
export function createSession(_chatSessionId: string): RecordedSession {
  ensureDir();
  const session: RecordedSession = {
    sessionId: "__qa_current__",
    chatSessionId: _chatSessionId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    browserUrl: null,
    events: [],
  };
  writeFileSync(sessionPath(session.sessionId), JSON.stringify(session, null, 2));
  return session;
}

/** 加载录制会话 */
export function loadSession(sessionId: string): RecordedSession | null {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as RecordedSession;
}

/** 加载当前全局录制 */
export function loadCurrentSession(): RecordedSession | null {
  return loadSession("__qa_current__");
}

/** 保存录制会话 */
export function saveSession(session: RecordedSession): void {
  ensureDir();
  writeFileSync(sessionPath(session.sessionId), JSON.stringify(session, null, 2));
}

/** 追加事件到录制会话 */
export function appendEvent(session: RecordedSession, event: QaRecordEvent): void {
  session.events.push(event);
  saveSession(session);
  // 同时输出人类可读日志到 debug 文件
  writeDebugLog(session.sessionId, event);
}

function writeDebugLog(sessionId: string, event: QaRecordEvent): void {
  try {
    const logPath = join(QA_DIR, `${sessionId}.log`);
    const time = new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour12: false });
    const icon = event.kind === "PAGE" ? "📄" : event.kind === "TAB" ? "📑" : event.kind === "CLICK" ? "🖱" : "🌐";
    const status = event.statusCode ? ` [${event.statusCode}]` : "";
    const line = `${time} ${icon} [${event.kind}] ${event.summary}${status}${event.traceId ? ` traceId=${event.traceId}` : ""}\n`;
    const { appendFileSync, existsSync } = require("node:fs") as typeof import("node:fs");
    if (!existsSync(logPath)) {
      const { writeFileSync } = require("node:fs") as typeof import("node:fs");
      writeFileSync(logPath, `=== QA 录制调试日志 ===\n会话: ${sessionId}\n\n`);
    }
    appendFileSync(logPath, line);
  } catch {}
}

/** 设置浏览器 URL */
export function setBrowserUrl(session: RecordedSession, url: string): void {
  session.browserUrl = url;
  saveSession(session);
}

/** 清除当前录制 */
export function clearSession(): void {
  const path = sessionPath("__qa_current__");
  if (existsSync(path)) {
    writeFileSync(path, JSON.stringify({
      sessionId: "__qa_current__",
      chatSessionId: "",
      startedAt: new Date().toISOString(),
      endedAt: null,
      browserUrl: null,
      events: [],
    }, null, 2));
  }
  // 也删调试日志
  try {
    const logPath = join(QA_DIR, "__qa_current__.log");
    if (existsSync(logPath)) writeFileSync(logPath, "");
  } catch {}
}

/** 结束录制 */
export function finalizeSession(session: RecordedSession): void {
  session.endedAt = new Date().toISOString();
  saveSession(session);
}

/** 列出所有录制会话 */
export function listSessions(): { sessionId: string; startedAt: string; eventCount: number; browserUrl: string | null }[] {
  ensureDir();
  const files = readdirSync(QA_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const s = JSON.parse(readFileSync(join(QA_DIR, f), "utf-8")) as RecordedSession;
    return {
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      eventCount: s.events.length,
      browserUrl: s.browserUrl,
    };
  });
}
