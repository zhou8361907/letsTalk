"use client";

/**
 * 对话页（阶段 5 v1）
 * - 最左：会话列表（DeepSeek 风格分组）
 * - 左中：锚点
 * - 右：Transcript + 输入
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupConversationsByDate } from "../lib/conversation-groups";
import {
  buildConversationMarkdown,
  buildRequirementPrimaryMarkdown,
  downloadMarkdown,
  mergePrimaryAndDevAppendix,
} from "../lib/export-prd";
import { buildAgentActionsFromDraft } from "../lib/requirement-draft-actions";
import { formatContextUsageLabel } from "../lib/format-tokens";
import {
  groupTranscriptForDisplay,
  isToolGroup,
  toolGroupFailedCount,
} from "../lib/group-transcript";
import {
  buildAssistantTurnIds,
  mergeTurnDebugSnapshots,
} from "../lib/turn-debug-client";
import { MenuAnchorPicker } from "../components/MenuAnchorPicker";
import { MemoryEditorModal } from "../components/MemoryEditorModal";
import { RequirementCanvas } from "../components/RequirementCanvas";
import { TurnDebugModal } from "../components/TurnDebugModal";
import type {
  AgentAction,
  AgentAnchor,
  ChatMode,
  ContextUsageSnapshot,
  ConversationSummary,
  RequirementDraftState,
  SseEvent,
  TranscriptItem,
  TurnDebugSnapshot,
} from "@lets-talk/shared-types";

const ANCHOR_STORAGE_KEY = "letsTalk.anchor";
const SESSION_STORAGE_KEY = "letsTalk.sessionId";
const CHAT_MODE_STORAGE_KEY = "letsTalk.chatMode";

interface SessionDebugState {
  turns: TurnDebugSnapshot[];
  assistantTurnIds: string[];
  source?: "debug" | "pi" | "none";
  loading?: boolean;
}

function getSessionDebugState(
  map: Map<string, SessionDebugState>,
  sessionId: string,
): SessionDebugState {
  return map.get(sessionId) ?? { turns: [], assistantTurnIds: [] };
}

function loadStoredChatMode(): ChatMode {
  if (typeof window === "undefined") return "explore";
  const v = sessionStorage.getItem(CHAT_MODE_STORAGE_KEY);
  return v === "prd" ? "prd" : "explore";
}

function loadStoredAnchor(): AgentAnchor | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgentAnchor;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const [sessionId, setSessionId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [booting, setBooting] = useState(true);

  const [anchor, setAnchor] = useState<AgentAnchor | null>(null);
  const [anchorList, setAnchorList] = useState<AgentAnchor[]>([]);
  const [exportAppendixBusy, setExportAppendixBusy] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [anchorTab, setAnchorTab] = useState<"file" | "menu">("menu");

  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");
  const [contextUsage, setContextUsage] = useState<ContextUsageSnapshot | null>(
    null,
  );
  const [chatMode, setChatMode] = useState<ChatMode>("explore");
  const [requirementDraft, setRequirementDraft] =
    useState<RequirementDraftState | null>(null);
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [workspace, setWorkspace] = useState<{
    root: string | null;
    front: string | null;
    back: string | null;
  }>({ root: null, front: null, back: null });
  const [memoryEditorOpen, setMemoryEditorOpen] = useState(false);
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [debugInitialTurnId, setDebugInitialTurnId] = useState<string | null>(
    null,
  );
  const [debugTick, setDebugTick] = useState(0);
  const debugBySessionRef = useRef<Map<string, SessionDebugState>>(new Map());

  const assistantBuf = useRef("");
  const lastToolName = useRef<string>("tool");
  const itemsRef = useRef<TranscriptItem[]>([]);
  const sessionIdRef = useRef("");
  const anchorRef = useRef<AgentAnchor | null>(null);
  const chatModeRef = useRef<ChatMode>("explore");
  const requirementDraftRef = useRef<RequirementDraftState | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  itemsRef.current = items;
  sessionIdRef.current = sessionId;
  anchorRef.current = anchor;
  chatModeRef.current = chatMode;
  requirementDraftRef.current = requirementDraft;

  const persistAnchor = useCallback((next: AgentAnchor | null) => {
    setAnchor(next);
    anchorRef.current = next;
    if (next) {
      sessionStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(next));
    } else {
      sessionStorage.removeItem(ANCHOR_STORAGE_KEY);
    }
  }, []);

  const refreshRequirementDraft = useCallback(async (sid?: string) => {
    const id = sid ?? sessionIdRef.current;
    if (!id || chatModeRef.current !== "prd") return;
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const record = (await res.json()) as {
        requirementDraft?: RequirementDraftState | null;
      };
      const remote = record.requirementDraft ?? null;
      const local = requirementDraftRef.current;
      // 避免 turn 结束时 GET 早于 persistDraft，用旧/空数据覆盖 SSE 刚推的新草稿
      if (local?.updatedAt && remote?.updatedAt) {
        if (remote.updatedAt < local.updatedAt) return;
      } else if (local?.items?.length && !remote?.items?.length) {
        return;
      }
      setRequirementDraft(remote);
      requirementDraftRef.current = remote;
      setAgentActions(buildAgentActionsFromDraft(remote));
    } catch {
      // ignore
    }
  }, []);

  const refreshContextUsage = useCallback(async (sid?: string) => {
    const id = sid ?? sessionIdRef.current;
    if (!id) {
      setContextUsage(null);
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${id}/context`);
      if (!res.ok) return;
      setContextUsage((await res.json()) as ContextUsageSnapshot);
    } catch {
      // ignore
    }
  }, []);

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  const refreshConversationList = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return [];
    const data = (await res.json()) as { conversations?: ConversationSummary[] };
    const list = data.conversations ?? [];
    setConversations(list);
    return list;
  }, []);

  const persistCurrent = useCallback(
    async (snapshot?: TranscriptItem[]) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      const draft = requirementDraftRef.current;
      const body: Record<string, unknown> = {
        items: snapshot ?? itemsRef.current,
        anchor: anchorRef.current,
        chatMode: chatModeRef.current,
      };
      // 仅在有草稿时写入；避免 null 覆盖服务端 Agent 刚 persist 的清单
      if (draft) {
        body.requirementDraft = draft;
      }
      await fetch(`/api/conversations/${sid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refreshConversationList();
    },
    [refreshConversationList],
  );

  const applyConversation = useCallback(
    (record: {
      sessionId: string;
      items?: TranscriptItem[];
      anchor?: AgentAnchor | null;
      chatMode?: ChatMode;
      requirementDraft?: RequirementDraftState | null;
    }) => {
      setSessionId(record.sessionId);
      sessionIdRef.current = record.sessionId;
      sessionStorage.setItem(SESSION_STORAGE_KEY, record.sessionId);
      const mode = record.chatMode === "prd" ? "prd" : "explore";
      setChatMode(mode);
      chatModeRef.current = mode;
      sessionStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
      setItems(record.items ?? []);
      itemsRef.current = record.items ?? [];
      if (record.anchor) {
        persistAnchor(record.anchor);
      } else if (record.anchor === null) {
        persistAnchor(null);
      }
      const draft = record.requirementDraft ?? null;
      setRequirementDraft(draft);
      requirementDraftRef.current = draft;
      setAgentActions([]);
      void refreshContextUsage(record.sessionId);
      scrollTranscriptToBottom("auto");
    },
    [persistAnchor, refreshContextUsage, scrollTranscriptToBottom],
  );

  const startNewConversation = useCallback(async () => {
    if (busy) return;
    if (sessionIdRef.current) {
      await persistCurrent();
    }
    const res = await fetch("/api/conversations", { method: "POST" });
    if (!res.ok) return;
    const record = (await res.json()) as {
      sessionId: string;
      items: TranscriptItem[];
      anchor: AgentAnchor | null;
    };
    applyConversation(record);
    setItems([]);
    itemsRef.current = [];
    setRequirementDraft(null);
    requirementDraftRef.current = null;
    setAgentActions([]);
    setContextUsage(null);
    void refreshContextUsage(record.sessionId);
    await refreshConversationList();
  }, [applyConversation, busy, persistCurrent, refreshConversationList]);

  const refreshSessionDebugTurns = useCallback(
    async (sid: string, transcriptItems?: TranscriptItem[]) => {
      if (!sid) return;
      const prev = getSessionDebugState(debugBySessionRef.current, sid);
      debugBySessionRef.current.set(sid, { ...prev, loading: true });
      setDebugTick((t) => t + 1);

      try {
        const res = await fetch(`/api/debug/session/${sid}/turns`);
        const data = (await res.json()) as {
          turns?: TurnDebugSnapshot[];
          source?: SessionDebugState["source"];
          error?: string;
        };
        const disk = data.turns ?? [];
        const live = getSessionDebugState(debugBySessionRef.current, sid).turns;
        const merged = mergeTurnDebugSnapshots(disk, live);
        const itemsForMap = transcriptItems ?? itemsRef.current;
        debugBySessionRef.current.set(sid, {
          turns: merged,
          assistantTurnIds: buildAssistantTurnIds(itemsForMap, merged),
          source: data.source ?? (disk.length ? "debug" : "none"),
          loading: false,
        });
      } catch {
        const live = getSessionDebugState(debugBySessionRef.current, sid).turns;
        debugBySessionRef.current.set(sid, {
          turns: live,
          assistantTurnIds: buildAssistantTurnIds(
            transcriptItems ?? itemsRef.current,
            live,
          ),
          loading: false,
        });
      }
      setDebugTick((t) => t + 1);
    },
    [],
  );

  const switchConversation = useCallback(
    async (id: string) => {
      if (busy || id === sessionIdRef.current) return;
      setRenamingId(null);
      await persistCurrent();
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const record = (await res.json()) as {
        sessionId: string;
        items: TranscriptItem[];
        anchor: AgentAnchor | null;
      };
      applyConversation(record);
      void refreshSessionDebugTurns(id, record.items);
    },
    [applyConversation, busy, persistCurrent, refreshSessionDebugTurns],
  );

  const commitRename = useCallback(
    async (id: string, title: string) => {
      const t = title.trim();
      setRenamingId(null);
      if (!t) return;
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      if (res.ok) await refreshConversationList();
    },
    [refreshConversationList],
  );

  const deleteConversationById = useCallback(
    async (id: string) => {
      if (busy) return;
      if (!window.confirm("确定删除此对话？删除后不可恢复。")) return;
      const wasCurrent = id === sessionIdRef.current;
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      const list = await refreshConversationList();
      if (wasCurrent) {
        if (list.length > 0) {
          await switchConversation(list[0]!.sessionId);
        } else {
          await startNewConversation();
        }
      }
    },
    [busy, refreshConversationList, startNewConversation, switchConversation],
  );

  const setChatModePersist = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    chatModeRef.current = mode;
    sessionStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
    void persistCurrent();
  }, [persistCurrent]);

  const exportPrimaryMarkdown = useCallback(() => {
    const title =
      conversations.find((c) => c.sessionId === sessionId)?.title ?? "letsTalk-需求";
    const safeName = title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
    const mode = chatModeRef.current;
    const draft = requirementDraftRef.current;
    const md =
      mode === "prd" && draft && draft.items.length > 0
        ? buildRequirementPrimaryMarkdown(draft, {
            title,
            anchor: anchorRef.current,
          })
        : buildConversationMarkdown(itemsRef.current, {
            title,
            chatMode: mode,
            anchor: anchorRef.current,
          });
    const suffix = mode === "prd" && draft?.items.length ? "PM定稿" : "对话";
    downloadMarkdown(`${safeName}-${suffix}.md`, md);
  }, [conversations, sessionId]);

  const exportWithDevAppendix = useCallback(async () => {
    const sid = sessionIdRef.current;
    const draft = requirementDraftRef.current;
    if (!sid || !draft?.items.length || chatModeRef.current !== "prd") {
      exportPrimaryMarkdown();
      return;
    }
    const title =
      conversations.find((c) => c.sessionId === sid)?.title ?? "letsTalk-需求";
    const safeName = title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
    setExportAppendixBusy(true);
    try {
      const res = await fetch("/api/export/dev-appendix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          title,
          anchor: anchorRef.current,
        }),
      });
      const data = (await res.json()) as {
        primary?: string;
        appendix?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const merged = mergePrimaryAndDevAppendix(
        data.primary ?? buildRequirementPrimaryMarkdown(draft, { title, anchor: anchorRef.current }),
        data.appendix ?? "",
      );
      downloadMarkdown(`${safeName}-完整含研发附录.md`, merged);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "生成研发附录失败，可先导出 PM 定稿",
      );
    } finally {
      setExportAppendixBusy(false);
    }
  }, [conversations, exportPrimaryMarkdown]);

  const exportMarkdown = exportPrimaryMarkdown;

  useEffect(() => {
    setAnchor(loadStoredAnchor());
    anchorRef.current = loadStoredAnchor();
    const storedMode = loadStoredChatMode();
    setChatMode(storedMode);
    chatModeRef.current = storedMode;

    void (async () => {
      try {
        const [list] = await Promise.all([
          refreshConversationList(),
          fetch("/api/workspace")
            .then((r) => r.json())
            .then(
              (d: {
                workspaceRoot?: string;
                frontendRel?: string;
                backendRel?: string;
              }) =>
                setWorkspace({
                  root: d.workspaceRoot ?? null,
                  front: d.frontendRel ?? null,
                  back: d.backendRel ?? null,
                }),
            )
            .catch(() => setWorkspace({ root: null, front: null, back: null })),
          fetch("/api/workspace/anchors")
            .then((r) => r.json())
            .then((d: { anchors?: AgentAnchor[] }) => setAnchorList(d.anchors ?? []))
            .catch(() => setAnchorList([])),
        ]);

        const lastId = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (lastId && list.some((c) => c.sessionId === lastId)) {
          const res = await fetch(`/api/conversations/${lastId}`);
          if (res.ok) {
            applyConversation(await res.json());
            return;
          }
        }
        if (list.length > 0) {
          const res = await fetch(`/api/conversations/${list[0]!.sessionId}`);
          if (res.ok) {
            applyConversation(await res.json());
            return;
          }
        }
        await startNewConversation();
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载
  }, []);

  useEffect(() => {
    scrollTranscriptToBottom(busy ? "auto" : "smooth");
  }, [items, busy, scrollTranscriptToBottom]);

  const appendAssistantDelta = useCallback((delta: string, snapshot: TranscriptItem[]) => {
    assistantBuf.current += delta;
    const last = snapshot[snapshot.length - 1];
    if (last?.kind === "assistant") {
      snapshot[snapshot.length - 1] = {
        kind: "assistant",
        text: assistantBuf.current,
      };
    } else {
      snapshot.push({ kind: "assistant", text: assistantBuf.current });
    }
    setItems([...snapshot]);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    const sid = sessionIdRef.current;
    if (!text || busy || !sid) return;

    setInput("");
    setBusy(true);
    setStatus("connected");
    assistantBuf.current = "";

    const snapshot: TranscriptItem[] = [...itemsRef.current, { kind: "user", text }];
    setItems(snapshot);

    try {
      const res = await fetch("/api/agent/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          message: text,
          anchor: anchorRef.current,
          chatMode: chatModeRef.current,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          //打印每一行完整信息
          console.log("stream返回line", line);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(payload) as SseEvent;
          } catch {
            continue;
          }

          if (event.type === "assistant_delta") {
            appendAssistantDelta(event.text, snapshot);
          } else if (event.type === "context_usage") {
            setContextUsage({
              tokens: event.tokens,
              contextWindow: event.contextWindow,
              percent: event.percent,
            });
          } else if (event.type === "context") {
            snapshot.push({
              kind: "context",
              mode: event.mode,
              anchorRef: event.anchorRef,
              previewLines: event.previewLines,
              m0Refreshed: event.m0Refreshed,
            });
            setItems([...snapshot]);
          } else if (event.type === "memory_refreshed") {
            snapshot.push({
              kind: "context",
              mode: "explore",
              anchorRef: null,
              previewLines: 0,
              m0Refreshed: true,
            });
            setItems([...snapshot]);
          } else if (event.type === "tool_start") {
            lastToolName.current = event.tool;
            snapshot.push({ kind: "tool", tool: event.tool, preview: "…", ok: true });
            setItems([...snapshot]);
          } else if (event.type === "tool_output") {
            const toolName = lastToolName.current;
            for (let i = snapshot.length - 1; i >= 0; i--) {
              const row = snapshot[i];
              if (row?.kind === "tool" && row.tool === toolName && row.preview === "…") {
                snapshot[i] = {
                  kind: "tool",
                  tool: toolName,
                  preview: event.preview,
                  ok: event.ok,
                };
                break;
              }
            }
            setItems([...snapshot]);
          } else if (event.type === "requirement_state") {
            setRequirementDraft(event.draft);
            requirementDraftRef.current = event.draft;
          } else if (event.type === "agent_actions") {
            setAgentActions(event.actions);
          } else if (event.type === "turn_debug") {
            const state = getSessionDebugState(debugBySessionRef.current, sid);
            const merged = mergeTurnDebugSnapshots(state.turns, [
              event.snapshot,
            ]);
            debugBySessionRef.current.set(sid, {
              ...state,
              turns: merged,
              assistantTurnIds: buildAssistantTurnIds(snapshot, merged),
            });
            setDebugTick((t) => t + 1);
          } else if (event.type === "turn_end") {
            // 草稿以 requirement_state SSE 为准；不在此 GET，避免竞态覆盖
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      snapshot.push({
        kind: "assistant",
        text: `错误: ${e instanceof Error ? e.message : String(e)}`,
      });
      setItems([...snapshot]);
    } finally {
      setBusy(false);
      itemsRef.current = snapshot;
      await persistCurrent(snapshot);
    }
  }, [appendAssistantDelta, busy, input, persistCurrent]);

  const applyManualAnchor = () => {
    const ref = manualPath.trim().replace(/^\/+/, "");
    if (!ref) return;
    persistAnchor({ kind: "file", ref, label: ref.split("/").pop() });
  };

  const groups = groupConversationsByDate(conversations);
  const displayItems = useMemo(() => groupTranscriptForDisplay(items), [items]);
  const sessionDebug = sessionId
    ? getSessionDebugState(debugBySessionRef.current, sessionId)
    : { turns: [], assistantTurnIds: [] };
  void debugTick;

  const openDebugModal = useCallback(
    (turnId?: string | null) => {
      const sid = sessionIdRef.current;
      if (sid) void refreshSessionDebugTurns(sid, itemsRef.current);
      setDebugInitialTurnId(turnId ?? null);
      setDebugModalOpen(true);
    },
    [refreshSessionDebugTurns],
  );

  const assistantTurnIds = useMemo(
    () => buildAssistantTurnIds(items, sessionDebug.turns),
    [items, sessionDebug.turns],
  );

  useEffect(() => {
    if (!sessionId || booting) return;
    void refreshSessionDebugTurns(sessionId, items);
    // 仅 sessionId 变化时从磁盘加载；同会话新消息靠 SSE turn_debug
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, booting]);

  if (booting) {
    return (
      <main className="layout boot">
        <p className="muted">加载会话…</p>
      </main>
    );
  }

  return (
    <main className="layout">
      <aside className="conv-sidebar">
        <button
          type="button"
          className="new-chat-btn"
          onClick={() => void startNewConversation()}
          disabled={busy}
        >
          + 开启新对话
        </button>
        <div className="conv-scroll">
          {groups.map((g) => (
            <div key={g.label} className="conv-group">
              <div className="conv-group-label">{g.label}</div>
              <ul className="conv-list">
                {g.sessions.map((c) => (
                  <li key={c.sessionId} className="conv-row">
                    {renamingId === c.sessionId ? (
                      <input
                        className="conv-rename-input"
                        value={renameValue}
                        autoFocus
                        disabled={busy}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void commitRename(c.sessionId, renameValue);
                          }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => void commitRename(c.sessionId, renameValue)}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={
                            c.sessionId === sessionId
                              ? "conv-item active"
                              : "conv-item"
                          }
                          onClick={() => void switchConversation(c.sessionId)}
                          disabled={busy}
                          title={c.title}
                        >
                          {c.title}
                        </button>
                        <div className="conv-actions">
                          <button
                            type="button"
                            className="conv-action-btn"
                            title="重命名"
                            disabled={busy}
                            aria-label="重命名"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(c.sessionId);
                              setRenameValue(c.title);
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="conv-action-btn conv-action-delete"
                            title="删除"
                            disabled={busy}
                            aria-label="删除"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteConversationById(c.sessionId);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="muted small">暂无历史，发送消息后会出现在这里</p>
          )}
        </div>
      </aside>

      <aside className={anchorTab === "menu" ? "anchors anchors--menu" : "anchors"}>
        <h2>锚点</h2>
        <div className="anchor-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={anchorTab === "menu"}
            className={anchorTab === "menu" ? "anchor-tab active" : "anchor-tab"}
            onClick={() => setAnchorTab("menu")}
            disabled={busy}
          >
            系统菜单
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={anchorTab === "file"}
            className={anchorTab === "file" ? "anchor-tab active" : "anchor-tab"}
            onClick={() => setAnchorTab("file")}
            disabled={busy}
          >
            代码文件
          </button>
        </div>
        <button
          type="button"
          className={!anchor ? "anchor-btn active" : "anchor-btn"}
          onClick={() => persistAnchor(null)}
          disabled={busy}
        >
          全库探索
        </button>
        {anchorTab === "menu" ? (
          <MenuAnchorPicker
            anchor={anchor}
            disabled={busy}
            onSelect={persistAnchor}
          />
        ) : (
          <>
            <ul className="anchor-list">
              {anchorList.map((a) => (
                <li key={a.ref}>
                  <button
                    type="button"
                    className={
                      anchor?.ref === a.ref ? "anchor-btn active" : "anchor-btn"
                    }
                    onClick={() => persistAnchor(a)}
                    disabled={busy}
                    title={a.ref}
                  >
                    {a.label ?? a.ref}
                  </button>
                </li>
              ))}
            </ul>
            <div className="manual-anchor">
              <input
                type="text"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="如 src/views/Login.vue"
                disabled={busy}
              />
              <button type="button" onClick={applyManualAnchor} disabled={busy}>
                设为锚点
              </button>
            </div>
          </>
        )}
        {anchor?.kind === "menu" && (
          <p
            className="anchor-current muted small"
            title={anchor.menuUrl ?? anchor.ref}
            onDoubleClick={() => !busy && persistAnchor(null)}
          >
            已选: {anchor.menuName ?? anchor.label}
            {anchor.routePath && anchor.routePath !== anchor.menuUrl && (
              <span className="anchor-route"> · {anchor.routePath}</span>
            )}
            <span className="anchor-clear-hint">（双击取消）</span>
          </p>
        )}
      </aside>

      <div className="main-col">
        <header className="header">
          <div className="header-main">
            <h1>letsTalk Agent</h1>
            <div className="mode-toggle" role="group" aria-label="对话模式">
              <button
                type="button"
                className={chatMode === "explore" ? "mode-btn active" : "mode-btn"}
                onClick={() => setChatModePersist("explore")}
                disabled={busy}
              >
                探索
              </button>
              <button
                type="button"
                className={chatMode === "prd" ? "mode-btn active" : "mode-btn"}
                onClick={() => setChatModePersist("prd")}
                disabled={busy}
              >
                需求整理
              </button>
            </div>
            <span className={`dot ${status === "error" ? "err" : busy ? "on" : ""}`} />
            <span className="muted header-status">
              {busy ? "生成中…" : status === "error" ? "出错" : "就绪"}
              {anchor ? ` · ${anchor.ref}` : " · 全库"}
            </span>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="export-btn"
              onClick={() => openDebugModal()}
              title="查看每轮发给 LLM 的真实内容与 Pi jsonl"
            >
              调试
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={() => setMemoryEditorOpen(true)}
              title="查看与编辑 USER / CORE / INDEX / topics"
            >
              记忆
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={exportMarkdown}
              disabled={items.length === 0}
              title="导出为 Markdown"
            >
              导出
            </button>
            <span className="context-usage" title="Pi 模型上下文占用（估算）">
              {formatContextUsageLabel(contextUsage)}
            </span>
          </div>
        </header>

        <section className="transcript-scroll" aria-label="对话记录">
          <div className="transcript-inner">
          {items.length === 0 && (
            <p className="muted empty-hint">
              {chatMode === "prd"
                ? "需求整理：左侧用口语说就行，右侧会自动整理成清单；选好页面锚点更准确。"
                : "探索模式：选会话或锚点后提问。回答以实际代码为准。"}
            </p>
          )}
          {displayItems.map((item, i) => {
            const assistantIdx =
              item.kind === "assistant"
                ? displayItems
                    .slice(0, i + 1)
                    .filter((x) => x.kind === "assistant").length - 1
                : -1;
            const assistantTurnId =
              assistantIdx >= 0 ? assistantTurnIds[assistantIdx] : undefined;
            return (
            <div
              key={i}
              className={`bubble ${isToolGroup(item) ? "tool-group-wrap" : item.kind}`}
            >
              {isToolGroup(item) && (
                <details className="tool-group">
                  <summary className="tool-group-summary">
                    <span className="tool-group-title">工具调用</span>
                    <span className="tool-group-meta">
                      {item.tools.length} 次
                      {toolGroupFailedCount(item.tools) > 0
                        ? ` · ${toolGroupFailedCount(item.tools)} 失败`
                        : ""}
                    </span>
                  </summary>
                  <ul className="tool-group-list">
                    {item.tools.map((t, j) => (
                      <li key={j}>
                        <details className="tool-block">
                          <summary>
                            {t.tool}
                            {!t.ok ? " (failed)" : ""}
                          </summary>
                          <pre className="tool-preview">{t.preview}</pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {item.kind === "user" && (
                <>
                  <div className="label">You</div>
                  <pre>{item.text}</pre>
                </>
              )}
              {item.kind === "assistant" && (
                <>
                  <div className="label-row">
                    <div className="label">Agent</div>
                    {(assistantTurnId || sessionDebug.turns.length > 0) && (
                      <button
                        type="button"
                        className="bubble-debug-btn"
                        onClick={() => openDebugModal(assistantTurnId || undefined)}
                        title="查看本回合发给 LLM 的内容"
                      >
                        调试
                      </button>
                    )}
                  </div>
                  <pre>{item.text}</pre>
                </>
              )}
              {item.kind === "context" && (
                <p className="muted small">
                  [context] {item.mode}
                  {item.anchorRef ? ` · ${item.anchorRef}` : ""}
                </p>
              )}
            </div>
            );
          })}
          <div ref={transcriptEndRef} className="transcript-anchor" aria-hidden />
          </div>
        </section>

        <footer className="chat-footer">
          <div className="input-row">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                chatMode === "prd"
                  ? "描述需求…（Ctrl/⌘+Enter 发送，Enter 换行）"
                  : "输入消息…（Ctrl/⌘+Enter 发送，Enter 换行）"
              }
              rows={2}
              disabled={busy || !sessionId}
            />
            <button type="button" onClick={() => void send()} disabled={busy || !sessionId}>
              发送
            </button>
          </div>
        </footer>
      </div>

      {chatMode === "prd" && (
        <RequirementCanvas
          draft={requirementDraft}
          actions={agentActions}
          onExport={exportMarkdown}
          onExportWithAppendix={() => void exportWithDevAppendix()}
          exportAppendixBusy={exportAppendixBusy}
          onFinalize={(action) => {
            if (action.kind === "finalize_skip_blast") {
              exportMarkdown();
            }
          }}
        />
      )}

      <MemoryEditorModal
        open={memoryEditorOpen}
        sessionId={sessionId}
        onClose={() => setMemoryEditorOpen(false)}
      />

      <TurnDebugModal
        open={debugModalOpen}
        sessionId={sessionId}
        turns={sessionDebug.turns}
        initialTurnId={debugInitialTurnId}
        source={sessionDebug.source}
        loading={sessionDebug.loading}
        onClose={() => setDebugModalOpen(false)}
      />

      <style jsx>{`
        .layout {
          display: flex;
          height: 100vh;
          width: 100%;
          padding: 0;
          gap: 0;
          overflow: hidden;
        }
        .layout.boot {
          align-items: center;
          justify-content: center;
        }
        .conv-sidebar {
          width: 200px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border);
          padding: 0.75rem 0.5rem 0.75rem 0.75rem;
          min-height: 0;
        }
        .new-chat-btn {
          width: 100%;
          padding: 0.5rem 0.65rem;
          margin-bottom: 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          color: var(--text);
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }
        .new-chat-btn:hover:not(:disabled) {
          border-color: var(--accent);
        }
        .conv-scroll {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        .conv-group-label {
          font-size: 11px;
          color: var(--muted);
          margin: 0.5rem 0 0.25rem;
          padding-left: 0.35rem;
        }
        .conv-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .conv-row {
          display: flex;
          align-items: center;
          gap: 0.15rem;
          margin-bottom: 2px;
        }
        .conv-row:hover .conv-actions {
          opacity: 1;
        }
        .conv-item {
          flex: 1;
          min-width: 0;
          display: block;
          text-align: left;
          padding: 0.4rem 0.5rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .conv-actions {
          display: flex;
          flex-shrink: 0;
          opacity: 0.35;
          gap: 0.1rem;
        }
        .conv-action-btn {
          width: 1.35rem;
          height: 1.35rem;
          padding: 0;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
        }
        .conv-action-btn:hover:not(:disabled) {
          background: var(--panel);
          color: var(--text);
        }
        .conv-action-delete:hover:not(:disabled) {
          color: #f85149;
        }
        .conv-rename-input {
          flex: 1;
          min-width: 0;
          font-size: 12px;
          padding: 0.35rem 0.45rem;
          background: var(--panel);
          border: 1px solid var(--accent);
          color: var(--text);
          border-radius: 6px;
        }
        .conv-item:hover:not(:disabled) {
          background: var(--panel);
        }
        .conv-item.active {
          background: var(--panel);
          border: 1px solid var(--accent);
        }
        .anchors {
          width: 168px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          padding: 0.75rem 0.5rem 0.75rem 0;
          font-size: 12px;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .anchors--menu {
          width: min(460px, 42vw);
        }
        .anchor-tabs {
          display: flex;
          gap: 0.25rem;
          margin-bottom: 0.5rem;
        }
        .anchor-tab {
          flex: 1;
          font-size: 10px;
          padding: 0.25rem 0.2rem;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
        }
        .anchor-tab.active {
          color: var(--accent);
          border-color: var(--accent);
        }
        .anchor-current {
          margin-top: 0.35rem;
          word-break: break-all;
          cursor: default;
        }
        .anchor-route {
          color: var(--accent);
        }
        .anchor-clear-hint {
          opacity: 0.65;
          font-size: 10px;
        }
        .anchors h2 {
          font-size: 11px;
          margin: 0 0 0.5rem;
          color: var(--muted);
          font-weight: 600;
          text-transform: uppercase;
        }
        .anchor-list {
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 28vh;
          overflow-y: auto;
        }
        .anchor-btn {
          display: block;
          width: 100%;
          text-align: left;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text);
          padding: 0.3rem 0.4rem;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          margin-bottom: 2px;
        }
        .anchor-btn.active {
          border-color: var(--accent);
          background: var(--panel);
        }
        .manual-anchor {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          margin-top: 0.5rem;
        }
        .manual-anchor input {
          font-size: 10px;
          padding: 0.3rem;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 4px;
        }
        .manual-anchor button {
          font-size: 10px;
          padding: 0.3rem;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          color: var(--text);
        }
        .main-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 280px;
          min-height: 0;
          padding: 0.75rem 0.5rem 0.75rem 0.5rem;
        }
        .header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.65rem;
          margin-bottom: 0;
        }
        .header-main {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          min-width: 0;
          flex-wrap: wrap;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-shrink: 0;
        }
        .mode-toggle {
          display: inline-flex;
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
        }
        .mode-btn {
          padding: 0.2rem 0.55rem;
          font-size: 11px;
          border: none;
          background: var(--panel);
          color: var(--muted);
          cursor: pointer;
        }
        .mode-btn.active {
          background: var(--accent);
          color: #000;
          font-weight: 600;
        }
        .export-btn {
          font-size: 11px;
          padding: 0.25rem 0.55rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--panel);
          color: var(--text);
          cursor: pointer;
        }
        .export-btn:hover:not(:disabled) {
          border-color: var(--accent);
        }
        .header h1 {
          font-size: 1rem;
          margin: 0;
          white-space: nowrap;
        }
        .header-status {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .context-usage {
          flex-shrink: 0;
          font-size: 11px;
          color: var(--accent);
          font-variant-numeric: tabular-nums;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--muted);
        }
        .dot.on {
          background: var(--accent);
        }
        .dot.err {
          background: #f85149;
        }
        .muted {
          color: var(--muted);
          font-size: 12px;
        }
        .small {
          font-size: 11px;
        }
        .transcript-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          margin: 0 -0.25rem;
          padding: 0 0.25rem;
        }
        .transcript-inner {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 0.75rem 0 0.5rem;
        }
        .transcript-anchor {
          height: 1px;
          flex-shrink: 0;
        }
        .empty-hint {
          margin-top: 2rem;
          text-align: center;
        }
        .bubble {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem;
        }
        .bubble.user {
          background: var(--user);
        }
        .bubble.assistant {
          background: var(--assistant);
        }
        .bubble.tool,
        .bubble.tool-group-wrap {
          background: var(--tool);
          border-style: dashed;
          padding: 0.5rem 0.65rem;
        }
        .tool-group > summary,
        .tool-block > summary {
          cursor: pointer;
          list-style: none;
        }
        .tool-group > summary::-webkit-details-marker,
        .tool-block > summary::-webkit-details-marker {
          display: none;
        }
        .tool-group-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-size: 12px;
          color: var(--muted);
          user-select: none;
        }
        .tool-group-summary::before {
          content: "▸";
          display: inline-block;
          margin-right: 0.35rem;
          color: var(--accent);
          transition: transform 0.15s ease;
        }
        .tool-group[open] > .tool-group-summary::before {
          transform: rotate(90deg);
        }
        .tool-group-title {
          color: var(--text);
          font-weight: 600;
        }
        .tool-group-meta {
          font-variant-numeric: tabular-nums;
        }
        .tool-group-list {
          list-style: none;
          margin: 0.5rem 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .tool-group-list .tool-block {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.35rem 0.5rem;
          background: var(--panel);
        }
        .tool-block > summary {
          font-size: 11px;
          color: var(--accent);
        }
        .tool-block > summary::before {
          content: "▸ ";
          color: var(--muted);
        }
        .tool-block[open] > summary::before {
          content: "▾ ";
        }
        .tool-preview {
          margin-top: 0.35rem;
          max-height: 10rem;
          overflow: auto;
          font-size: 11px;
          color: var(--muted);
        }
        .label {
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 0.35rem;
        }
        .label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }
        .label-row .label {
          margin-bottom: 0;
        }
        .bubble-debug-btn {
          font-size: 10px;
          padding: 0.1rem 0.4rem;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
        }
        .bubble-debug-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
        }
        pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .chat-footer {
          flex-shrink: 0;
          border-top: 1px solid var(--border);
          padding-top: 0.65rem;
          margin-top: 0;
          background: var(--bg);
        }
        .input-row {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
        }
        textarea {
          flex: 1;
          resize: none;
          min-height: 2.75rem;
          max-height: 8rem;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 8px;
          padding: 0.55rem 0.65rem;
          line-height: 1.45;
        }
        .input-row > button {
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 6px;
          padding: 0 1rem;
          font-weight: 600;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}
