import type { AgentStepLogFields } from "@lets-talk/infrastructure/logging";
import type { TraceStepRecord, TurnTraceMeta } from "./types.js";

export interface TraceRecorderInit {
  traceId: string;
  sessionId: string;
  chatMode?: string;
  actorId?: string;
  actorDisplayName?: string;
}

/** 单次 HTTP 请求的 step 收集器（Mastra trace span 的 letsTalk 等价物） */
export class TraceRecorder {
  private readonly steps: TraceStepRecord[] = [];
  private turnMeta: TurnTraceMeta | null = null;
  private startedAt = Date.now();

  constructor(private readonly init: TraceRecorderInit) {}

  get traceId(): string {
    return this.init.traceId;
  }

  get sessionId(): string {
    return this.init.sessionId;
  }

  record(fields: AgentStepLogFields): void {
    this.steps.push({
      ...fields,
      at: new Date().toISOString(),
    });
  }

  setTurnMeta(meta: TurnTraceMeta): void {
    this.turnMeta = meta;
  }

  getSteps(): readonly TraceStepRecord[] {
    return this.steps;
  }

  getTurnMeta(): TurnTraceMeta | null {
    return this.turnMeta;
  }

  totalDurationMs(): number {
    const last = this.steps[this.steps.length - 1];
    if (last?.step === "sse.flush") return last.durationMs;
    return Date.now() - this.startedAt;
  }

  isSuccess(): boolean {
    if (this.turnMeta && !this.turnMeta.success) return false;
    return this.steps.every((s) => s.success);
  }

  buildTraceRecord(): import("./types.js").TraceRecord {
    const meta = this.turnMeta;
    const success = this.isSuccess();
    const durationMs = this.totalDurationMs();
    return {
      at: new Date().toISOString(),
      traceId: this.init.traceId,
      sessionId: this.init.sessionId,
      actorId: this.init.actorId,
      actorDisplayName: this.init.actorDisplayName,
      turnId: meta?.turnId,
      chatMode: meta?.chatMode ?? this.init.chatMode,
      model: meta?.model,
      userMessageHash: meta?.userMessageHash,
      userMessageLen: meta?.userMessageLen,
      durationMs,
      success,
      error: meta?.error,
      steps: [...this.steps],
      tools: meta?.tools ?? [],
      turnTokenUsage: meta?.turnTokenUsage,
      turnCostUsd: meta?.turnCostUsd,
      sessionTokenTotal: meta?.sessionTokenTotal,
      sessionCostUsd: meta?.sessionCostUsd,
    };
  }
}
