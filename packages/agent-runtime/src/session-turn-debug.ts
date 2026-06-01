/**
 * 从磁盘加载会话回合调试数据（.agent/debug + conversations/pi jsonl）
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { getConversation, resolvePiSessionFile } from "@lets-talk/conversation";
import type {
  AgentAnchor,
  SystemPromptSnapshot,
  TurnDebugSnapshot,
} from "@lets-talk/shared-types";
import { resolveSystemPromptSnapshot } from "./system-prompt-snapshot.js";
import { readPiJsonlTail } from "./turn-debug.js";

export type SessionTurnDebugSource = "debug" | "pi" | "none";

export interface LoadSessionTurnDebugResult {
  turns: TurnDebugSnapshot[];
  source: SessionTurnDebugSource;
  piSessionFile: string | null;
}

function debugDir(workspaceRoot: string, sessionId: string): string {
  return join(workspaceRoot, ".agent", "debug", sessionId);
}

function splitUserPromptText(full: string): {
  contextPrefix: string;
  userMessage: string;
  promptUserText: string;
} {
  const promptUserText = full;
  const trimmed = full.trim();
  const idx = trimmed.lastIndexOf("\n\n");
  if (
    idx > 0 &&
    (trimmed.startsWith("<") ||
      trimmed.slice(0, idx).includes("<context") ||
      trimmed.slice(0, idx).includes("<agent_rules"))
  ) {
    return {
      contextPrefix: trimmed.slice(0, idx).trim(),
      userMessage: trimmed.slice(idx + 2).trim(),
      promptUserText,
    };
  }
  return { contextPrefix: "", userMessage: trimmed, promptUserText };
}

interface TurnRequestJson {
  turnId: string;
  at?: string;
  chatMode?: string;
  anchor?: AgentAnchor | null;
  userMessage?: string;
  contextBlock?: string;
  systemPrompt?: SystemPromptSnapshot;
  modelLabel?: string;
  activeTools?: string[];
}

interface SessionSystemMetaJson {
  systemPrompt?: SystemPromptSnapshot;
  modelLabel?: string;
  activeTools?: string[];
}

interface TurnResponseJson {
  turnId: string;
  at?: string;
  assistantText?: string;
  tools?: Array<{ tool: string; ok?: boolean; preview: string }>;
  contextUsage?: TurnDebugSnapshot["contextUsage"];
}

async function loadSessionSystemMeta(
  workspaceRoot: string,
  sessionId: string,
): Promise<SessionSystemMetaJson | null> {
  try {
    const raw = await readFile(
      join(debugDir(workspaceRoot, sessionId), "session_system.json"),
      "utf8",
    );
    return JSON.parse(raw) as SessionSystemMetaJson;
  } catch {
    return null;
  }
}

function attachSystemMeta(
  turn: TurnDebugSnapshot,
  meta: SessionSystemMetaJson | null,
  fallback?: SystemPromptSnapshot | null,
): TurnDebugSnapshot {
  const sp = turn.systemPrompt ?? meta?.systemPrompt ?? fallback ?? null;
  return {
    ...turn,
    systemPrompt: sp,
    modelLabel: turn.modelLabel ?? meta?.modelLabel ?? null,
    activeTools: turn.activeTools ?? meta?.activeTools,
  };
}

async function loadTurnsFromDebugDir(
  workspaceRoot: string,
  sessionId: string,
  piRel: string | null,
  piTail: {
    tail: string | null;
    truncated: boolean;
    totalBytes: number;
  },
): Promise<TurnDebugSnapshot[]> {
  const dir = debugDir(workspaceRoot, sessionId);
  const sessionMeta = await loadSessionSystemMeta(workspaceRoot, sessionId);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const requestFiles = names
    .filter((n) => n.endsWith("_request.json"))
    .sort();

  const turns: TurnDebugSnapshot[] = [];

  for (const file of requestFiles) {
    try {
      const raw = await readFile(join(dir, file), "utf8");
      const req = JSON.parse(raw) as TurnRequestJson;
      if (!req.turnId) continue;

      const turnId = req.turnId;
      let resp: TurnResponseJson | null = null;
      const respName = `${turnId}_response.json`;
      if (names.includes(respName)) {
        const respRaw = await readFile(join(dir, respName), "utf8");
        resp = JSON.parse(respRaw) as TurnResponseJson;
      }

      const contextPrefix = req.contextBlock?.trim() ?? "";
      const userMessage = req.userMessage?.trim() ?? "";
      const promptUserText = contextPrefix
        ? `${contextPrefix}\n\n${userMessage}`
        : userMessage;

      turns.push(
        attachSystemMeta(
          {
            turnId,
            at: resp?.at ?? req.at ?? new Date(0).toISOString(),
            chatMode: req.chatMode ?? "explore",
            anchor: req.anchor ?? null,
            userMessage,
            contextPrefix,
            promptUserText,
            assistantText: resp?.assistantText ?? "",
            tools: (resp?.tools ?? []).map((t) => ({
              tool: t.tool,
              ok: t.ok,
              preview: t.preview,
            })),
            contextUsage: resp?.contextUsage ?? null,
            piSessionFile: piRel,
            piJsonlTail: piTail.tail,
            piJsonlTruncated: piTail.truncated,
            piJsonlTotalBytes: piTail.totalBytes,
            systemPrompt: req.systemPrompt ?? null,
            modelLabel: req.modelLabel ?? null,
            activeTools: req.activeTools,
          },
          sessionMeta,
        ),
      );
    } catch {
      /* skip corrupt */
    }
  }

  return turns.sort((a, b) => a.at.localeCompare(b.at));
}

async function loadTurnsFromPiJsonl(
  workspaceRoot: string,
  sessionId: string,
  absPath: string,
  relPath: string,
  record: { chatMode?: string; anchor?: AgentAnchor | null },
): Promise<TurnDebugSnapshot[]> {
  let raw: string;
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    return [];
  }

  const { tail, totalBytes, truncated } = await readPiJsonlTail(absPath);
  const sessionMeta = await loadSessionSystemMeta(workspaceRoot, sessionId);
  let fallbackSystem: SystemPromptSnapshot | null =
    sessionMeta?.systemPrompt ?? null;
  if (!fallbackSystem) {
    try {
      fallbackSystem = await resolveSystemPromptSnapshot(
        workspaceRoot,
        (record.chatMode as "explore" | "prd") ?? "explore",
        {
          modelLabel: sessionMeta?.modelLabel,
          activeTools: sessionMeta?.activeTools,
        },
      );
    } catch {
      fallbackSystem = null;
    }
  }
  const turns: TurnDebugSnapshot[] = [];
  let turnIndex = 0;

  type PiMsg = {
    role: string;
    content?: Array<{ type: string; text?: string }>;
    timestamp?: string;
  };

  let current: {
    turnId: string;
    at: string;
    promptUserText: string;
    assistantParts: string[];
    tools: TurnDebugSnapshot["tools"];
    contextUsage: TurnDebugSnapshot["contextUsage"];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const { contextPrefix, userMessage, promptUserText } = splitUserPromptText(
      current.promptUserText,
    );
    turns.push(
      attachSystemMeta(
        {
          turnId: current.turnId,
          at: current.at,
          chatMode: record.chatMode ?? "explore",
          anchor: record.anchor ?? null,
          userMessage,
          contextPrefix,
          promptUserText,
          assistantText: current.assistantParts.join(""),
          tools: current.tools,
          contextUsage: current.contextUsage,
          piSessionFile: relPath,
          piJsonlTail: tail,
          piJsonlTruncated: truncated,
          piJsonlTotalBytes: totalBytes,
        },
        sessionMeta,
        fallbackSystem,
      ),
    );
    current = null;
  };

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: {
      type?: string;
      timestamp?: string;
      message?: PiMsg & {
        usage?: { totalTokens?: number };
        toolName?: string;
        isError?: boolean;
      };
    };
    try {
      row = JSON.parse(trimmed) as typeof row;
    } catch {
      continue;
    }
    if (row.type !== "message" || !row.message) continue;

    const msg = row.message;
    const ts = row.timestamp ?? new Date(0).toISOString();

    if (msg.role === "user") {
      flush();
      turnIndex += 1;
      const text =
        msg.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("") ?? "";
      current = {
        turnId: `pi-turn-${String(turnIndex).padStart(3, "0")}`,
        at: ts,
        promptUserText: text,
        assistantParts: [],
        tools: [],
        contextUsage: null,
      };
    } else if (msg.role === "assistant" && current) {
      const parts = msg.content ?? [];
      for (const c of parts) {
        if (c.type === "text" && c.text) {
          current.assistantParts.push(c.text);
        }
      }
      const usage = (msg as { usage?: { totalTokens?: number } }).usage;
      if (usage?.totalTokens) {
        current.contextUsage = {
          tokens: usage.totalTokens,
          contextWindow: 1048576,
          percent: null,
        };
      }
    } else if (msg.role === "toolResult" && current) {
      const tr = msg as {
        toolName?: string;
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
      const preview =
        tr.content?.map((c) => c.text ?? "").join("\n") ?? "";
      current.tools.push({
        tool: tr.toolName ?? "tool",
        ok: tr.isError !== true,
        preview,
      });
    }
  }

  flush();
  return turns;
}

/** 加载会话 system prompt（debug 落盘优先，否则按当前配置重建） */
export async function loadSessionSystemPromptFromDisk(
  workspaceRoot: string,
  sessionId: string,
): Promise<SystemPromptSnapshot | null> {
  const meta = await loadSessionSystemMeta(workspaceRoot, sessionId);
  if (meta?.systemPrompt) return meta.systemPrompt;

  const record = await getConversation(workspaceRoot, sessionId);
  const chatMode = (record?.chatMode as "explore" | "prd") ?? "explore";
  try {
    return await resolveSystemPromptSnapshot(workspaceRoot, chatMode, {
      modelLabel: meta?.modelLabel,
      activeTools: meta?.activeTools,
    });
  } catch {
    return null;
  }
}

/** 从 .agent/debug 或 pi jsonl 加载历史回合（供调试弹窗） */
export async function loadSessionTurnDebugFromDisk(
  workspaceRoot: string,
  sessionId: string,
): Promise<LoadSessionTurnDebugResult> {
  const record = await getConversation(workspaceRoot, sessionId);
  let piRel: string | null = record?.piSessionFile ?? null;
  let piAbs: string | null = null;

  try {
    piAbs = resolvePiSessionFile(workspaceRoot, sessionId, piRel);
    piRel = relative(resolve(workspaceRoot), piAbs).replace(/\\/g, "/");
  } catch {
    piAbs = null;
    piRel = null;
  }

  const piTail = piAbs
    ? await readPiJsonlTail(piAbs)
    : { tail: null, totalBytes: 0, truncated: false };

  const fromDebug = await loadTurnsFromDebugDir(
    workspaceRoot,
    sessionId,
    piRel,
    piTail,
  );
  if (fromDebug.length > 0) {
    return { turns: fromDebug, source: "debug", piSessionFile: piRel };
  }

  if (piAbs) {
    const fromPi = await loadTurnsFromPiJsonl(
      workspaceRoot,
      sessionId,
      piAbs,
      piRel!,
      {
        chatMode: record?.chatMode,
        anchor: record?.anchor ?? null,
      },
    );
    if (fromPi.length > 0) {
      return { turns: fromPi, source: "pi", piSessionFile: piRel };
    }
  }

  return { turns: [], source: "none", piSessionFile: piRel };
}

/** 合并磁盘回合与 SSE 内存回合（同 turnId 以 SSE 为准） */
export function mergeTurnDebugSnapshots(
  disk: TurnDebugSnapshot[],
  live: TurnDebugSnapshot[],
): TurnDebugSnapshot[] {
  const map = new Map<string, TurnDebugSnapshot>();
  for (const t of disk) {
    map.set(t.turnId, t);
  }
  for (const t of live) {
    map.set(t.turnId, t);
  }
  return Array.from(map.values()).sort((a, b) => a.at.localeCompare(b.at));
}

/** 按 user 原文匹配回合（气泡旁「调试」） */
export function findTurnIdByUserMessage(
  turns: TurnDebugSnapshot[],
  userText: string,
): string | undefined {
  const q = userText.trim();
  if (!q) return undefined;
  const hit = [...turns]
    .reverse()
    .find((t) => t.userMessage.trim() === q);
  return hit?.turnId;
}
