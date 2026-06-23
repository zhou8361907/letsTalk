import "server-only";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ──── types ────

export interface AdminOverview {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
  actorCount: number;
  dailyTrend: DailyTrendRow[];
  modelBreakdown: ModelBreakdownRow[];
  recentSessions: RecentSessionRow[];
}

export interface DailyTrendRow {
  date: string; // YYYY-MM-DD
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelBreakdownRow {
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  sessionCount: number;
}

export interface RecentSessionRow {
  sessionId: string;
  title: string;
  actorName: string;
  costUsd: number;
  updatedAt: string;
}

export interface ActorConsumptionRow {
  actorId: string;
  actorName: string;
  sessionCount: number;
  totalCostUsd: number;
  totalTokens: number;
  lastActive: string;
}

export interface ActorSessionRow {
  sessionId: string;
  title: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionTraceTurn {
  turnIndex: number;
  at: string;
  model: string;
  turnCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cumulativeCostUsd: number;
  success: boolean;
}

export interface SessionTraceDetail {
  sessionId: string;
  title: string;
  actorName: string;
  createdAt: string;
  updatedAt: string;
  totalCostUsd: number;
  turns: SessionTraceTurn[];
}

// ──── helpers ────

interface ConversationMeta {
  sessionId: string;
  title: string;
  ownerActorId?: string;
  ownerDisplayName?: string;
  totalCostUsd?: number;
  createdAt: string;
  updatedAt: string;
}

function readConversationsDir(workspaceRoot: string): ConversationMeta[] {
  const dir = join(workspaceRoot, ".agent", "conversations");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: ConversationMeta[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      out.push({
        sessionId: data.sessionId as string,
        title: (data.title as string) || "新对话",
        ownerActorId: data.ownerActorId as string | undefined,
        ownerDisplayName: data.ownerDisplayName as string | undefined,
        totalCostUsd: (data.totalCostUsd as number) ?? 0,
        createdAt: (data.createdAt as string) ?? "",
        updatedAt: (data.updatedAt as string) ?? "",
      });
    } catch {
      // skip malformed files
    }
  }
  return out;
}

interface SessionLedgerEntry {
  at: string;
  sessionId: string;
  turnIndex: number;
  model?: string;
  turnCostUsd: number;
  turnTokenUsage?: { input?: number; output?: number; total?: number };
  cumulativeCostUsd: number;
  cumulativeTokenUsage?: { input?: number; output?: number; total?: number };
  success: boolean;
}

function readSessionLedger(workspaceRoot: string, sessionId: string): SessionLedgerEntry[] {
  const path = join(workspaceRoot, ".agent", "logs", "sessions", `${sessionId}.jsonl`);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SessionLedgerEntry);
  } catch {
    return [];
  }
}

interface TraceRecord {
  at: string;
  sessionId: string;
  actorId?: string;
  actorDisplayName?: string;
  model?: string;
  turnCostUsd?: number | null;
  turnTokenUsage?: { input?: number; output?: number; total?: number };
  sessionCostUsd?: number;
  durationMs: number;
  success: boolean;
}

/** 缓存：避免 60 秒内重复读盘 */
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string, ttlMs: number, fetcher: () => T): T {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }
  const data = fetcher();
  cache.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

function invalidateCache(): void {
  cache.clear();
}

// ──── public API ────

/** 仪表盘概览 */
export function getAdminOverview(workspaceRoot: string): AdminOverview {
  return getCached<AdminOverview>("overview", 60_000, () =>
    computeAdminOverview(workspaceRoot),
  );
}

function computeAdminOverview(workspaceRoot: string): AdminOverview {
  const conversations = readConversationsDir(workspaceRoot);

  // 会话数与总 cost
  const sessionCount = conversations.length;

  // Actor 统计
  const actorSet = new Set<string>();
  for (const c of conversations) {
    if (c.ownerActorId) actorSet.add(c.ownerActorId);
  }
  const actorCount = actorSet.size;

  const costBySession = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number }>();

  // 遍历 session ledger 取得累积 token 与 cost
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const modelMap = new Map<
    string,
    { costUsd: number; inputTokens: number; outputTokens: number; sessions: Set<string> }
  >();

  const sessionsDir = join(workspaceRoot, ".agent", "logs", "sessions");
  if (existsSync(sessionsDir)) {
    const sessionFiles = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
    for (const file of sessionFiles) {
      const sid = file.replace(/\.jsonl$/, "");
      const entries = readSessionLedger(workspaceRoot, sid);
      if (entries.length === 0) continue;

      // 取最后一条作为累积值
      const last = entries[entries.length - 1]!;
      totalCostUsd += last.cumulativeCostUsd;
      totalInputTokens += last.cumulativeTokenUsage?.input ?? 0;
      totalOutputTokens += last.cumulativeTokenUsage?.output ?? 0;

      costBySession.set(sid, {
        costUsd: last.cumulativeCostUsd,
        inputTokens: last.cumulativeTokenUsage?.input ?? 0,
        outputTokens: last.cumulativeTokenUsage?.output ?? 0,
      });

      // 按 model 分组
      for (const entry of entries) {
        const model = entry.model || "unknown";
        if (!modelMap.has(model)) {
          modelMap.set(model, {
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
            sessions: new Set(),
          });
        }
        const m = modelMap.get(model)!;
        m.costUsd += entry.turnCostUsd;
        m.inputTokens += entry.turnTokenUsage?.input ?? 0;
        m.outputTokens += entry.turnTokenUsage?.output ?? 0;
        m.sessions.add(entry.sessionId);
      }
    }
  }

  // 每日趋势：遍历 traces 目录
  const dailyMap = new Map<string, { costUsd: number; input: number; output: number }>();
  const tracesDir = join(workspaceRoot, ".agent", "logs", "traces");
  if (existsSync(tracesDir)) {
    const traceFiles = readdirSync(tracesDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort();
    for (const file of traceFiles) {
      const date = file.replace(/\.jsonl$/, "");
      try {
        const raw = readFileSync(join(tracesDir, file), "utf8");
        const lines = raw.split("\n").filter(Boolean);
        let dayCost = 0;
        let dayInput = 0;
        let dayOutput = 0;
        for (const line of lines) {
          try {
            const rec = JSON.parse(line) as TraceRecord;
            dayCost += rec.turnCostUsd ?? 0;
            dayInput += rec.turnTokenUsage?.input ?? 0;
            dayOutput += rec.turnTokenUsage?.output ?? 0;
          } catch {
            // skip malformed lines
          }
        }
        dailyMap.set(date, { costUsd: dayCost, input: dayInput, output: dayOutput });
      } catch {
        // skip unreadable files
      }
    }
  }

  // 最近 20 条会话（cost 从 ledger 取）
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const recentSessions: RecentSessionRow[] = sorted.slice(0, 20).map((c) => ({
    sessionId: c.sessionId,
    title: c.title,
    actorName: c.ownerDisplayName || c.ownerActorId || "匿名",
    costUsd: costBySession.get(c.sessionId)?.costUsd ?? 0,
    updatedAt: c.updatedAt,
  }));

  return {
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    sessionCount,
    actorCount,
    dailyTrend: Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        costUsd: v.costUsd,
        inputTokens: v.input,
        outputTokens: v.output,
      })),
    modelBreakdown: Array.from(modelMap.entries())
      .map(([model, v]) => ({
        model,
        costUsd: v.costUsd,
        inputTokens: v.inputTokens,
        outputTokens: v.outputTokens,
        sessionCount: v.sessions.size,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    recentSessions,
  };
}

/** 所有 Actor 的消耗排行 */
export function getActorConsumption(workspaceRoot: string): ActorConsumptionRow[] {
  return getCached<ActorConsumptionRow[]>("actors", 60_000, () =>
    computeActorConsumption(workspaceRoot),
  );
}

function computeActorConsumption(workspaceRoot: string): ActorConsumptionRow[] {
  const conversations = readConversationsDir(workspaceRoot);
  const actorMap = new Map<
    string,
    {
      name: string;
      sessionCount: number;
      totalCostUsd: number;
      totalTokens: number;
      lastActive: string;
    }
  >();

  for (const c of conversations) {
    const id = c.ownerActorId || "anon";
    if (!actorMap.has(id)) {
      actorMap.set(id, {
        name: c.ownerDisplayName || id,
        sessionCount: 0,
        totalCostUsd: 0,
        totalTokens: 0,
        lastActive: "",
      });
    }
    const a = actorMap.get(id)!;
    a.sessionCount++;

    // 从 ledger 取 cost + token（比 conversation JSON 更准确）
    const entries = readSessionLedger(workspaceRoot, c.sessionId);
    if (entries.length > 0) {
      const last = entries[entries.length - 1]!;
      a.totalCostUsd += last.cumulativeCostUsd;
      a.totalTokens += last.cumulativeTokenUsage?.total ?? 0;
    }

    if (c.updatedAt > a.lastActive) {
      a.lastActive = c.updatedAt;
    }
  }

  return Array.from(actorMap.entries())
    .map(([actorId, v]) => ({
      actorId,
      actorName: v.name,
      sessionCount: v.sessionCount,
      totalCostUsd: v.totalCostUsd,
      totalTokens: v.totalTokens,
      lastActive: v.lastActive,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

/** 单个 Actor 的会话列表 */
export function getActorSessions(
  workspaceRoot: string,
  actorId: string,
): ActorSessionRow[] {
  const cacheKey = `actor-sessions:${actorId}`;
  return getCached<ActorSessionRow[]>(cacheKey, 60_000, () =>
    computeActorSessions(workspaceRoot, actorId),
  );
}

function computeActorSessions(
  workspaceRoot: string,
  actorId: string,
): ActorSessionRow[] {
  const conversations = readConversationsDir(workspaceRoot);
  const matched = conversations.filter(
    (c) => (c.ownerActorId || "anon") === actorId,
  );

  return matched
    .map((c) => {
      const entries = readSessionLedger(workspaceRoot, c.sessionId);
      let inputTokens = 0;
      let outputTokens = 0;
      if (entries.length > 0) {
        const last = entries[entries.length - 1]!;
        inputTokens = last.cumulativeTokenUsage?.input ?? 0;
        outputTokens = last.cumulativeTokenUsage?.output ?? 0;
      }
      const costUsd = entries.length > 0 ? entries[entries.length - 1]!.cumulativeCostUsd : 0;
      return {
        sessionId: c.sessionId,
        title: c.title,
        costUsd,
        inputTokens,
        outputTokens,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    })
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

/** 单个会话的 turn 级明细 */
export function getSessionTurnTraces(
  workspaceRoot: string,
  sessionId: string,
): SessionTraceDetail | null {
  const cacheKey = `session-turns:${sessionId}`;
  return getCached<SessionTraceDetail | null>(cacheKey, 60_000, () =>
    computeSessionTurnTraces(workspaceRoot, sessionId),
  );
}

function computeSessionTurnTraces(
  workspaceRoot: string,
  sessionId: string,
): SessionTraceDetail | null {
  // 读 conversation 元数据
  const conversations = readConversationsDir(workspaceRoot);
  const meta = conversations.find((c) => c.sessionId === sessionId);
  if (!meta) return null;

  // 读 ledger
  const entries = readSessionLedger(workspaceRoot, sessionId);

  return {
    sessionId: meta.sessionId,
    title: meta.title,
    actorName: meta.ownerDisplayName || meta.ownerActorId || "匿名",
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    totalCostUsd: meta.totalCostUsd ?? 0,
    turns: entries.map((e) => ({
      turnIndex: e.turnIndex,
      at: e.at,
      model: e.model || "unknown",
      turnCostUsd: e.turnCostUsd,
      inputTokens: e.turnTokenUsage?.input ?? 0,
      outputTokens: e.turnTokenUsage?.output ?? 0,
      cumulativeCostUsd: e.cumulativeCostUsd,
      success: e.success,
    })),
  };
}
