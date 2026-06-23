/**
 * 进程内 Session 上下文：revision（chatMode 硬边界）与软锚点指针。
 */

import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";

// ContextPointer / ContextChange 原定义于 @lets-talk/context（format-context-v1），
// 此处内联以避免 context → domain → infrastructure 循环依赖。
export interface ContextPointer {
  revision: number;
  chat_mode: ChatMode;
  anchor_ref?: string | null;
  anchor_kind?: AgentAnchor["kind"];
  draft_revision?: number;
  product_line?: string;
}

export interface ContextChange {
  type: "chat_mode_changed";
  old: ChatMode;
  new: ChatMode;
}

interface SessionContextEntry {
  revision: number;
  chatMode: ChatMode;
  anchorRef: string | null;
  anchorKind?: AgentAnchor["kind"];
}

const entries = new Map<string, SessionContextEntry>();

function getEntry(sessionId: string): SessionContextEntry {
  let e = entries.get(sessionId);
  if (!e) {
    e = {
      revision: 0,
      chatMode: "explore",
      anchorRef: null,
    };
    entries.set(sessionId, e);
  }
  return e;
}

export interface SyncSessionPointerInput {
  sessionId: string;
  chatMode: ChatMode;
  anchor: AgentAnchor | null;
  productLine?: string;
}

export interface SyncSessionPointerResult {
  pointer: ContextPointer;
  contextChange?: ContextChange;
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

  entry.anchorRef = anchorRef;
  entry.anchorKind = anchorKind;

  const pointer: ContextPointer = {
    revision: entry.revision,
    chat_mode: input.chatMode,
    anchor_ref: anchorRef,
    anchor_kind: anchorKind,
    draft_revision: draftRevision,
    product_line: input.productLine,
  };

  return { pointer, contextChange };
}

export function clearSessionContext(sessionId: string): void {
  entries.delete(sessionId);
}

export function getSessionRevision(sessionId: string): number {
  return getEntry(sessionId).revision;
}
