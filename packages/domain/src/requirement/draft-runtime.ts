/**
 * 需求草稿更新的事件桥。
 *
 * update_requirement_draft 工具执行后调用 notifyDraftUpdated，
 * run-chat 注册的 listener 负责推 SSE 并 persistDraft。
 */

import type { RequirementDraftState } from "@lets-talk/shared-types";

type DraftListener = (draft: RequirementDraftState) => void;

/** sessionId → 本轮 runChat 的草稿变更回调 */
const listeners = new Map<string, DraftListener>();

/** runChat 在 try/finally 中注册与清理 */
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
