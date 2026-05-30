/**
 * 进程内 Session 上下文：revision（chatMode 硬边界）与软锚点指针。
 */

import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";
import type { ContextChange, ContextPointer } from "@lets-talk/context";

interface SessionContextEntry {
  revision: number;
  chatMode: ChatMode;
  anchorRef: string | null;
  anchorKind?: AgentAnchor["kind"];
  /** 本会话是否已 Push 过 Rule（进程内） */
  rulesPushed: boolean;
}

const entries = new Map<string, SessionContextEntry>();

function getEntry(sessionId: string): SessionContextEntry {
  let e = entries.get(sessionId);
  if (!e) {
    e = {
      revision: 0,
      chatMode: "explore",
      anchorRef: null,
      rulesPushed: false,
    };
    entries.set(sessionId, e);
  }
  return e;
}

export interface SyncSessionPointerInput {
  sessionId: string;
  chatMode: ChatMode;
  anchor: AgentAnchor | null;
}

export interface SyncSessionPointerResult {
  pointer: ContextPointer;
  contextChange?: ContextChange;
  /** 首条或 chatMode 切换时需 Push Rule；普通轮次仅 pointer */
  pushRules: boolean;
}

/**
 * 同步会话指针。仅 chatMode 变化时 revision++ 并返回 context_change。
 * 锚点变化只更新 Store，不 bump revision（软焦点）。
 */
export function syncSessionPointer(
  input: SyncSessionPointerInput,
  draftRevision: number,
): SyncSessionPointerResult {
  const entry = getEntry(input.sessionId);
  const anchorRef = input.anchor?.ref?.trim() || null;
  const anchorKind = input.anchor?.kind;

  let contextChange: ContextChange | undefined;
  if (entry.chatMode !== input.chatMode) {
    contextChange = {
      type: "chat_mode_changed",
      old: entry.chatMode,
      new: input.chatMode,
    };
    entry.revision += 1;
    entry.chatMode = input.chatMode;
  }

  const pushRules = !entry.rulesPushed || Boolean(contextChange);

  entry.anchorRef = anchorRef;
  entry.anchorKind = anchorKind;

  const pointer: ContextPointer = {
    revision: entry.revision,
    chat_mode: input.chatMode,
    anchor_ref: anchorRef,
    anchor_kind: anchorKind,
    draft_revision: draftRevision,
  };

  return { pointer, contextChange, pushRules };
}

/** runChat 在拼完 prefix 且含 rules 后调用 */
export function markRulesPushed(sessionId: string): void {
  getEntry(sessionId).rulesPushed = true;
}

export function clearSessionContext(sessionId: string): void {
  entries.delete(sessionId);
}

export function getSessionRevision(sessionId: string): number {
  return getEntry(sessionId).revision;
}
