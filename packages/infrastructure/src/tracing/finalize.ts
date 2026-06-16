import { printTurnSummary } from "@lets-talk/infrastructure/format";
import { persistTraceRecord } from "./store.js";
import type { TraceRecorder } from "./recorder.js";

/** 落盘 trace/session jsonl 并打印回合摘要块（dev 默认） */
export async function finalizeTrace(
  workspaceRoot: string | undefined,
  recorder: TraceRecorder,
): Promise<{ traceFile: string; sessionFile: string } | null> {
  if (!workspaceRoot?.trim()) {
    printTurnSummary(recorder);
    return null;
  }
  const record = recorder.buildTraceRecord();
  const files = await persistTraceRecord(workspaceRoot, record);
  printTurnSummary(recorder, files);
  return files;
}
