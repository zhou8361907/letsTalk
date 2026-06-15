import type { TraceStepRecord, TraceToolRecord } from "./trace-types.js";

export function toolRecordsFromSteps(
  steps: readonly TraceStepRecord[],
): TraceToolRecord[] {
  return steps
    .filter((s) => s.step === "tool.execute")
    .map((s) => ({
      tool: s.toolName ?? "?",
      stepId: s.stepId,
      ok: s.success,
      durationMs: s.durationMs,
      preview: s.preview,
      truncated: s.truncated,
    }));
}
