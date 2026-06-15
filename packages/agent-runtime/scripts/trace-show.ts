/**
 * 查看 prod trace 索引（.agent/logs/）
 *
 *   pnpm trace:show <traceId>
 *   pnpm trace:show --session <sessionId> [--limit 5]
 *   pnpm trace:show --cost [--date 2026-06-11]
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { formatDuration } from "../src/format-agent-log.js";
import { formatTurnSummaryLines } from "../src/format-turn-summary.js";
import {
  findTraceById,
  listSessionTraces,
  summarizeDailySessionCosts,
} from "../src/trace-store.js";
import type { TraceRecord } from "../src/trace-types.js";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

function workspaceRoot(): string {
  const root = process.env.WORKSPACE_ROOT?.trim();
  if (!root) {
    console.error("请在 .env 配置 WORKSPACE_ROOT");
    process.exit(1);
  }
  return root;
}

function printTrace(record: TraceRecord): void {
  for (const line of formatTurnSummaryLines(record)) {
    console.log(line);
  }
  console.log("");
  console.log("steps:");
  for (const s of record.steps) {
    const extra = [
      s.model,
      s.toolName,
      s.stepId,
      s.tokenUsage?.input != null ? `in ${s.tokenUsage.input}` : "",
      s.tokenUsage?.output != null ? `out ${s.tokenUsage.output}` : "",
      s.costUsd != null ? `$${s.costUsd.toFixed(4)}` : "",
      s.error,
    ]
      .filter(Boolean)
      .join(" · ");
    const mark = s.success ? "✓" : "✗";
    console.log(
      `  ${mark} ${s.step.padEnd(22)} ${formatDuration(s.durationMs).padStart(7)}${extra ? `  ${extra}` : ""}`,
    );
  }
}

function parseArgs(argv: string[]): {
  mode: "trace" | "session" | "cost";
  traceId?: string;
  sessionId?: string;
  limit: number;
  date: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  if (argv.includes("--cost")) {
    const dateIdx = argv.indexOf("--date");
    const date =
      dateIdx >= 0 && argv[dateIdx + 1] ? argv[dateIdx + 1]! : today;
    return { mode: "cost", limit: 10, date };
  }
  const sessionIdx = argv.indexOf("--session");
  if (sessionIdx >= 0) {
    const sessionId = argv[sessionIdx + 1];
    if (!sessionId) {
      console.error("用法: pnpm trace:show --session <sessionId>");
      process.exit(1);
    }
    const limitIdx = argv.indexOf("--limit");
    const limit =
      limitIdx >= 0 && argv[limitIdx + 1]
        ? Number.parseInt(argv[limitIdx + 1]!, 10)
        : 5;
    return { mode: "session", sessionId, limit, date: today };
  }
  const traceId = argv.find((a) => !a.startsWith("-"));
  if (!traceId) {
    console.error(`用法:
  pnpm trace:show <traceId>
  pnpm trace:show --session <sessionId> [--limit 5]
  pnpm trace:show --cost [--date YYYY-MM-DD]`);
    process.exit(1);
  }
  return { mode: "trace", traceId, limit: 5, date: today };
}

const args = parseArgs(process.argv.slice(2));
const root = workspaceRoot();

if (args.mode === "cost") {
  const rows = await summarizeDailySessionCosts(root, args.date);
  console.log(`# ${args.date} session 成本汇总 (${rows.length} 个会话)\n`);
  if (rows.length === 0) {
    console.log("（无记录）");
    process.exit(0);
  }
  for (const row of rows) {
    const tok = row.cumulativeTokenUsage;
    const tokStr = [
      tok.input != null ? `in ${tok.input.toLocaleString()}` : "",
      tok.output != null ? `out ${tok.output.toLocaleString()}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `${row.sessionId.slice(0, 8)}…  ${row.turnCount} 轮  $${row.cumulativeCostUsd.toFixed(4)}  ${tokStr}`,
    );
  }
  process.exit(0);
}

if (args.mode === "session") {
  const traces = await listSessionTraces(root, args.sessionId!, args.limit);
  console.log(`# session ${args.sessionId} 最近 ${traces.length} 条 trace\n`);
  if (traces.length === 0) {
    console.log("（无记录）");
    process.exit(0);
  }
  for (const t of traces) {
    printTrace(t);
    console.log("─".repeat(60));
  }
  process.exit(0);
}

const record = await findTraceById(root, args.traceId!);
if (!record) {
  console.error(`未找到 trace: ${args.traceId}`);
  process.exit(1);
}
printTrace(record);
