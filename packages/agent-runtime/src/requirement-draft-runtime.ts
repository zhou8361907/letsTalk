import type { RequirementDraftState } from "@lets-talk/shared-types";

type DraftListener = (draft: RequirementDraftState) => void;

const listeners = new Map<string, DraftListener>();

export function setDraftListener(
  sessionId: string,
  listener: DraftListener | null,
): void {
  if (listener) {
    listeners.set(sessionId, listener);
  } else {
    listeners.delete(sessionId);
  }
}

export function notifyDraftUpdated(
  sessionId: string,
  draft: RequirementDraftState,
): void {
  try {
    listeners.get(sessionId)?.(draft);
  } catch {
    // 本轮 SSE 已结束时不应阻断工具成功返回
  }
}
