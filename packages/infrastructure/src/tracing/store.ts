import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionLedgerEntry, TraceRecord } from "./types.js";
import type { TokenUsageFields } from "@lets-talk/infrastructure/logging";

function agentLogsDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".agent", "logs");
}

function traceDayPath(workspaceRoot: string, isoDate: string): string {
  return join(agentLogsDir(workspaceRoot), "traces", `${isoDate}.jsonl`);
}

function sessionLedgerPath(workspaceRoot: string, sessionId: string): string {
  return join(agentLogsDir(workspaceRoot), "sessions", `${sessionId}.jsonl`);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function readJsonlLines<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function addTokenUsage(
  a: TokenUsageFields,
  b: TokenUsageFields,
): TokenUsageFields {
  return {
    input: (a.input ?? 0) + (b.input ?? 0),
    output: (a.output ?? 0) + (b.output ?? 0),
    total: (a.total ?? 0) + (b.total ?? 0),
  };
}

export async function appendTraceRecord(
  workspaceRoot: string,
  record: TraceRecord,
): Promise<string> {
  const day = record.at.slice(0, 10);
  const dir = join(agentLogsDir(workspaceRoot), "traces");
  await ensureDir(dir);
  const filePath = traceDayPath(workspaceRoot, day);
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return filePath;
}

export async function appendSessionLedger(
  workspaceRoot: string,
  record: TraceRecord,
): Promise<string> {
  const dir = join(agentLogsDir(workspaceRoot), "sessions");
  await ensureDir(dir);
  const filePath = sessionLedgerPath(workspaceRoot, record.sessionId);
  const prev = await readJsonlLines<SessionLedgerEntry>(filePath);
  const last = prev[prev.length - 1];
  const turnIndex = (last?.turnIndex ?? 0) + 1;
  const turnCost = record.turnCostUsd ?? 0;
  const turnTokens = record.turnTokenUsage ?? {};
  const cumulativeCostUsd = (last?.cumulativeCostUsd ?? 0) + turnCost;
  const cumulativeTokenUsage = addTokenUsage(
    last?.cumulativeTokenUsage ?? {},
    turnTokens,
  );

  const entry: SessionLedgerEntry = {
    at: record.at,
    traceId: record.traceId,
    sessionId: record.sessionId,
    turnId: record.turnId,
    turnIndex,
    chatMode: record.chatMode,
    model: record.model,
    turnCostUsd: turnCost,
    turnTokenUsage: turnTokens,
    cumulativeCostUsd,
    cumulativeTokenUsage,
    turnCount: turnIndex,
    success: record.success,
  };
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return filePath;
}

export async function persistTraceRecord(
  workspaceRoot: string,
  record: TraceRecord,
): Promise<{ traceFile: string; sessionFile: string }> {
  const traceFile = await appendTraceRecord(workspaceRoot, record);
  const sessionFile = await appendSessionLedger(workspaceRoot, record);
  return { traceFile, sessionFile };
}

export async function findTraceById(
  workspaceRoot: string,
  traceId: string,
  dayHint?: string,
): Promise<TraceRecord | null> {
  const tracesDir = join(agentLogsDir(workspaceRoot), "traces");
  const days = dayHint
    ? [`${dayHint}.jsonl`]
    : (await readdir(tracesDir).catch(() => []))
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse();

  for (const file of days) {
    const records = await readJsonlLines<TraceRecord>(
      join(tracesDir, file),
    );
    const hit = records.find((r) => r.traceId === traceId);
    if (hit) return hit;
  }
  return null;
}

export async function listSessionTraces(
  workspaceRoot: string,
  sessionId: string,
  limit = 5,
): Promise<TraceRecord[]> {
  const ledgerPath = sessionLedgerPath(workspaceRoot, sessionId);
  const ledger = await readJsonlLines<SessionLedgerEntry>(ledgerPath);
  const traceIds = ledger
    .slice(-limit)
    .map((e) => e.traceId)
    .reverse();

  const tracesDir = join(agentLogsDir(workspaceRoot), "traces");
  const files = (await readdir(tracesDir).catch(() => []))
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  const out: TraceRecord[] = [];
  for (const traceId of traceIds) {
    for (const file of files) {
      const records = await readJsonlLines<TraceRecord>(
        join(tracesDir, file),
      );
      const hit = records.find((r) => r.traceId === traceId);
      if (hit) {
        out.push(hit);
        break;
      }
    }
  }
  return out;
}

export interface DailyCostRow {
  sessionId: string;
  turnCount: number;
  cumulativeCostUsd: number;
  cumulativeTokenUsage: TokenUsageFields;
  lastAt: string;
}

export async function summarizeDailySessionCosts(
  workspaceRoot: string,
  isoDate: string,
): Promise<DailyCostRow[]> {
  const sessionsDir = join(agentLogsDir(workspaceRoot), "sessions");
  const files = await readdir(sessionsDir).catch(() => []);
  const rows: DailyCostRow[] = [];

  for (const file of files) {
    if (!file.endsWith(".jsonl")) continue;
    const sessionId = file.replace(/\.jsonl$/, "");
    const entries = await readJsonlLines<SessionLedgerEntry>(
      join(sessionsDir, file),
    );
    const dayEntries = entries.filter((e) => e.at.startsWith(isoDate));
    if (dayEntries.length === 0) continue;
    const last = dayEntries[dayEntries.length - 1]!;
    rows.push({
      sessionId,
      turnCount: dayEntries.length,
      cumulativeCostUsd: last.cumulativeCostUsd,
      cumulativeTokenUsage: last.cumulativeTokenUsage,
      lastAt: last.at,
    });
  }

  return rows.sort((a, b) => b.cumulativeCostUsd - a.cumulativeCostUsd);
}
