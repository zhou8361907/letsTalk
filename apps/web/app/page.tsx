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
import { ActorPickerModal } from "../components/ActorPickerModal";
import { MenuAnchorPicker } from "../components/MenuAnchorPicker";
import { MemoryEditorModal } from "../components/MemoryEditorModal";
import {
  actorFetch,
  loadStoredActorId,
  loadStoredActorName,
  persistActorChoice,
} from "../lib/actor-client";
import { RequirementCanvas } from "../components/RequirementCanvas";
import { QATestConsole } from "../components/QATestConsole";
import { TurnDebugModal } from "../components/TurnDebugModal";
import {
  evaluateContextBudget,
  type AgentAction,
  type AgentAnchor,
  type ChatMode,
  type ContextBudgetHint,
  type ContextUsageSnapshot,
  type ConversationSummary,
  type DevAppendixExportJob,
  type RequirementDraftState,
  type SseEvent,
  type TranscriptItem,
  type TurnDebugSnapshot,
  type Actor,
  ANONYMOUS_ACTOR_ID,
} from "@lets-talk/shared-types";

const ANCHOR_STORAGE_KEY = "letsTalk.anchor";
const SESSION_STORAGE_KEY = "letsTalk.sessionId";
const CHAT_MODE_STORAGE_KEY = "letsTalk.chatMode";

function findDevAppendixExportReady(items: TranscriptItem[]) {
  return items.find(
    (i) => i.kind === "export_ready" && i.exportKind === "dev_appendix",
  ) as
    | { kind: "export_ready"; exportKind: "dev_appendix"; label: string; filename: string; markdown: string; completedAt: string }
    | undefined;
}

function toSafeExportBasename(title: string): string {
  return title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
}

/** 客户端保存时保留服务端已写入的「含附录」导出气泡，避免 PUT 冲掉后台结果 */
function mergeItemsPreservingExportReady(
  clientItems: TranscriptItem[],
  serverItems: TranscriptItem[],
): TranscriptItem[] {
  const serverReady = serverItems.filter(
    (i) => i.kind === "export_ready" && i.exportKind === "dev_appendix",
  );
  if (serverReady.length === 0) return clientItems;
  const without = clientItems.filter(
    (i) => !(i.kind === "export_ready" && i.exportKind === "dev_appendix"),
  );
  return [...without, ...serverReady];
}

function resolveAppendixJobStatus(
  job?: DevAppendixExportJob | null,
  items?: TranscriptItem[],
): "idle" | "running" | "done" | "failed" {
  const status = job?.status;
  if (status === "running") return "running";
  if (status === "done" || findDevAppendixExportReady(items ?? [])) return "done";
  if (status === "failed") return "failed";
  return "idle";
}

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
  if (v === "prd") return "prd";
  if (v === "qa") return "qa";
  return "explore";
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
  const [currentActor, setCurrentActor] = useState<Actor | null>(null);
  const [actorPickerOpen, setActorPickerOpen] = useState(false);

  const [anchor, setAnchor] = useState<AgentAnchor | null>(null);
  const [anchorList, setAnchorList] = useState<AgentAnchor[]>([]);
  const [anchorCollapsed, setAnchorCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [exportAppendixBusy, setExportAppendixBusy] = useState(false);
  const [appendixJobStatus, setAppendixJobStatus] = useState<
    "idle" | "running" | "done" | "failed"
  >("idle");
  const [manualPath, setManualPath] = useState("");
  const [anchorTab, setAnchorTab] = useState<"file" | "menu">("menu");

  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");
  const [contextUsage, setContextUsage] = useState<ContextUsageSnapshot | null>(
    null,
  );
  const [contextBudgetHint, setContextBudgetHint] =
    useState<ContextBudgetHint | null>(null);
  const [compactionStatus, setCompactionStatus] = useState<string | null>(
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
  /** 当前 assistant 段在 assistantBuf 中的起始下标；tool_start 后递增，避免重复展示前文 */
  const assistantSegmentStart = useRef(0);
  const lastToolName = useRef<string>("tool");
  const itemsRef = useRef<TranscriptItem[]>([]);
  const sessionIdRef = useRef("");
  const anchorRef = useRef<AgentAnchor | null>(null);
  const chatModeRef = useRef<ChatMode>("explore");
  const requirementDraftRef = useRef<RequirementDraftState | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const convScrollRef = useRef<HTMLDivElement | null>(null);
  const prevSessionIdForScrollRef = useRef("");
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
      const res = await actorFetch(`/api/conversations/${id}`);
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
      setContextBudgetHint(null);
      setCompactionStatus(null);
      return;
    }
    try {
      const res = await actorFetch(`/api/conversations/${id}/context`);
      if (!res.ok) return;
      const usage = (await res.json()) as ContextUsageSnapshot;
      setContextUsage(usage);
      setContextBudgetHint(evaluateContextBudget(usage));
      setCompactionStatus(null);
    } catch {
      // ignore
    }
  }, []);

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const run = () => {
      const el = transcriptScrollRef.current;
      if (!el) return;
      const top = el.scrollHeight - el.clientHeight;
      if (behavior === "auto") {
        el.scrollTop = top;
      } else {
        el.scrollTo({ top, behavior: "smooth" });
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, []);

  const isTranscriptNearBottom = useCallback(() => {
    const el = transcriptScrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const refreshConversationList = useCallback(async () => {
    const scrollEl = convScrollRef.current;
    const savedScrollTop = scrollEl?.scrollTop ?? 0;
    const res = await actorFetch("/api/conversations");
    if (!res.ok) return [];
    const data = (await res.json()) as { conversations?: ConversationSummary[] };
    const list = data.conversations ?? [];
    setConversations(list);
    requestAnimationFrame(() => {
      if (scrollEl) scrollEl.scrollTop = savedScrollTop;
    });
    return list;
  }, []);

  const persistCurrent = useCallback(
    async (snapshot?: TranscriptItem[]) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      const exists = await actorFetch(`/api/conversations/${sid}`);
      if (!exists.ok) return;
      const server = (await exists.json()) as { items?: TranscriptItem[] };
      const clientItems = snapshot ?? itemsRef.current;
      const items = mergeItemsPreservingExportReady(
        clientItems,
        server.items ?? [],
      );

      const draft = requirementDraftRef.current;
      const body: Record<string, unknown> = {
        items,
        anchor: anchorRef.current,
        chatMode: chatModeRef.current,
      };
      if (draft) {
        body.requirementDraft = draft;
      }
      await actorFetch(`/api/conversations/${sid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refreshConversationList();
    },
    [refreshConversationList],
  );

  const resetActiveSessionLocal = useCallback(() => {
    sessionIdRef.current = "";
    setSessionId("");
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setItems([]);
    itemsRef.current = [];
    setRequirementDraft(null);
    requirementDraftRef.current = null;
    setAgentActions([]);
    setContextUsage(null);
    setContextBudgetHint(null);
    setCompactionStatus(null);
    setRenamingId(null);
  }, []);

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
      const mode: ChatMode =
        record.chatMode === "prd" ? "prd" :
        record.chatMode === "qa" ? "qa" : "explore";
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
    },
    [persistAnchor, refreshContextUsage],
  );

  const startNewConversation = useCallback(async () => {
    if (busy) return;
    if (sessionIdRef.current) {
      await persistCurrent();
    }
    const res = await actorFetch("/api/conversations", { method: "POST" });
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
    setContextBudgetHint(null);
    setCompactionStatus(null);
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
        const res = await actorFetch(`/api/debug/session/${sid}/turns`);
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

  const requestSummarizeTitle = useCallback(
    async (sid?: string): Promise<string | null> => {
      const id = sid ?? sessionIdRef.current;
      if (!id || chatModeRef.current !== "prd") return null;
      try {
        const res = await actorFetch(`/api/conversations/${id}/summarize-title`, {
          method: "POST",
        });
        if (res.ok) {
          const data = (await res.json()) as { title?: string };
          if (data.title?.trim()) {
            await refreshConversationList();
            return data.title.trim();
          }
        }
      } catch {
        // 标题摘要失败不影响导出
      }
      return null;
    },
    [refreshConversationList],
  );

  const syncAppendixJobFromRecord = useCallback(
    (job?: DevAppendixExportJob | null, items?: TranscriptItem[]) => {
      setAppendixJobStatus(resolveAppendixJobStatus(job, items));
    },
    [],
  );

  const loadConversationById = useCallback(
    async (id: string) => {
      const res = await actorFetch(`/api/conversations/${id}`);
      if (!res.ok) return false;
      const record = (await res.json()) as {
        sessionId: string;
        items: TranscriptItem[];
        anchor: AgentAnchor | null;
        chatMode?: ChatMode;
        requirementDraft?: RequirementDraftState | null;
        devAppendixExport?: DevAppendixExportJob | null;
      };
      applyConversation(record);
      syncAppendixJobFromRecord(record.devAppendixExport, record.items);
      void refreshSessionDebugTurns(id, record.items);
      return true;
    },
    [applyConversation, refreshSessionDebugTurns, syncAppendixJobFromRecord],
  );

  const switchConversation = useCallback(
    async (id: string) => {
      if (busy || id === sessionIdRef.current) return;
      setRenamingId(null);
      await persistCurrent();
      await loadConversationById(id);
    },
    [busy, loadConversationById, persistCurrent],
  );

  const commitRename = useCallback(
    async (id: string, title: string) => {
      const t = title.trim();
      setRenamingId(null);
      if (!t) return;
      const res = await actorFetch(`/api/conversations/${id}`, {
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
      const res = await actorFetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(err.error ?? "删除失败");
        return;
      }

      debugBySessionRef.current.delete(id);
      if (renamingId === id) {
        setRenamingId(null);
      }

      const list = await refreshConversationList();

      if (wasCurrent) {
        resetActiveSessionLocal();
        if (list.length > 0) {
          await loadConversationById(list[0]!.sessionId);
        } else {
          const createRes = await actorFetch("/api/conversations", { method: "POST" });
          if (createRes.ok) {
            const record = (await createRes.json()) as {
              sessionId: string;
              items: TranscriptItem[];
              anchor: AgentAnchor | null;
            };
            applyConversation(record);
            void refreshSessionDebugTurns(record.sessionId, record.items);
            await refreshConversationList();
          }
        }
      }
    },
    [
      applyConversation,
      busy,
      loadConversationById,
      refreshConversationList,
      refreshSessionDebugTurns,
      renamingId,
      resetActiveSessionLocal,
    ],
  );

  const setChatModePersist = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    chatModeRef.current = mode;
    sessionStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
    void persistCurrent();
  }, [persistCurrent]);

  const exportPrimaryMarkdown = useCallback(async () => {
    const sid = sessionIdRef.current;
    const fallback =
      conversations.find((c) => c.sessionId === sid)?.title ?? "letsTalk-需求";
    const mode = chatModeRef.current;
    const draft = requirementDraftRef.current;
    let title = fallback;
    if (mode === "prd" && draft?.items.length && sid) {
      title = (await requestSummarizeTitle(sid)) ?? fallback;
    }
    const safeName = toSafeExportBasename(title);
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
  }, [conversations, requestSummarizeTitle]);

  const exportWithDevAppendix = useCallback(async () => {
    const sid = sessionIdRef.current;
    const draft = requirementDraftRef.current;
    if (!sid || !draft?.items.length || chatModeRef.current !== "prd") {
      await exportPrimaryMarkdown();
      return;
    }
    const fallback =
      conversations.find((c) => c.sessionId === sid)?.title ?? "letsTalk-需求";

    setExportAppendixBusy(true);
    const title = (await requestSummarizeTitle(sid)) ?? fallback;
    const safeName = toSafeExportBasename(title);
    const primary = buildRequirementPrimaryMarkdown(draft, {
      title,
      anchor: anchorRef.current,
    });

    downloadMarkdown(`${safeName}-PM定稿.md`, primary);

    setAppendixJobStatus("running");
    try {
      const res = await actorFetch("/api/export/dev-appendix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          title,
          anchor: anchorRef.current,
          background: true,
        }),
      });
      const data = (await res.json()) as {
        status?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText);
      }
    } catch (e) {
      setAppendixJobStatus("failed");
      window.alert(
        e instanceof Error ? e.message : "启动研发附录任务失败，可先使用 PM 定稿",
      );
    } finally {
      setExportAppendixBusy(false);
    }
  }, [conversations, exportPrimaryMarkdown, requestSummarizeTitle]);

  const exportMarkdown = exportPrimaryMarkdown;

  const downloadMergedAppendix = useCallback(() => {
    const ready = findDevAppendixExportReady(itemsRef.current);
    if (ready) {
      downloadMarkdown(ready.filename, ready.markdown);
      return;
    }
    window.alert("未找到含附录文档，请稍候或重新生成。");
  }, []);

  const handleActorSelect = useCallback(
    (actor: Actor) => {
      setActorPickerOpen(false);
      if (currentActor?.id === actor.id) return;
      persistActorChoice(actor);
      setCurrentActor(actor);
      resetActiveSessionLocal();
    },
    [resetActiveSessionLocal, currentActor?.id],
  );

  useEffect(() => {
    setAnchor(loadStoredAnchor());
    anchorRef.current = loadStoredAnchor();
    const storedMode = loadStoredChatMode();
    setChatMode(storedMode);
    chatModeRef.current = storedMode;

    const storedId = loadStoredActorId();
    const storedName = loadStoredActorName();
    if (storedId) {
      setCurrentActor({
        id: storedId,
        displayName:
          storedName ?? (storedId === ANONYMOUS_ACTOR_ID ? "匿名" : storedId),
        kind: storedId === ANONYMOUS_ACTOR_ID ? "anonymous" : "named",
        createdAt: "",
      });
    } else {
      setActorPickerOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!currentActor) return;

    setBooting(true);
    void (async () => {
      try {
        const [list] = await Promise.all([
          refreshConversationList(),
          actorFetch("/api/workspace")
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
          actorFetch("/api/workspace/anchors")
            .then((r) => r.json())
            .then((d: { anchors?: AgentAnchor[] }) => setAnchorList(d.anchors ?? []))
            .catch(() => setAnchorList([])),
        ]);

        const restoreRecord = (record: {
          sessionId: string;
          devAppendixExport?: DevAppendixExportJob | null;
          items?: TranscriptItem[];
          anchor?: AgentAnchor | null;
          chatMode?: ChatMode;
          requirementDraft?: RequirementDraftState | null;
        }) => {
          applyConversation(record);
          setAppendixJobStatus(
            resolveAppendixJobStatus(record.devAppendixExport, record.items),
          );
        };

        const lastId = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (lastId && list.some((c) => c.sessionId === lastId)) {
          const res = await actorFetch(`/api/conversations/${lastId}`);
          if (res.ok) {
            restoreRecord(await res.json());
            return;
          }
        }
        if (list.length > 0) {
          const res = await actorFetch(`/api/conversations/${list[0]!.sessionId}`);
          if (res.ok) {
            restoreRecord(await res.json());
            return;
          }
        }
        await startNewConversation();
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentActor 变化时重载会话
  }, [currentActor]);

  useEffect(() => {
    if (booting || !sessionId) return;

    const switched = prevSessionIdForScrollRef.current !== sessionId;
    prevSessionIdForScrollRef.current = sessionId;

    if (switched) {
      scrollTranscriptToBottom("auto");
      return;
    }
    if (busy || isTranscriptNearBottom()) {
      scrollTranscriptToBottom(busy ? "auto" : "smooth");
    }
  }, [
    booting,
    busy,
    isTranscriptNearBottom,
    items,
    scrollTranscriptToBottom,
    sessionId,
  ]);

  useEffect(() => {
    if (appendixJobStatus !== "running" || !sessionId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await actorFetch(
          `/api/export/dev-appendix?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          devAppendixExport?: DevAppendixExportJob;
          items?: TranscriptItem[];
          title?: string;
        };
        const job = data.devAppendixExport;
        const items = data.items;
        const settled = resolveAppendixJobStatus(job, items);
        if (settled === "done") {
          setAppendixJobStatus("done");
          if (items) {
            setItems(items);
            itemsRef.current = items;
          }
          scrollTranscriptToBottom("smooth");
          await refreshConversationList();
        } else if (settled === "failed") {
          setAppendixJobStatus("failed");
          if (job?.error) {
            window.alert(`研发附录生成失败：${job.error}`);
          }
        }
      } catch {
        // 下轮再试
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    appendixJobStatus,
    refreshConversationList,
    scrollTranscriptToBottom,
    sessionId,
  ]);

  const appendAssistantDelta = useCallback((delta: string, snapshot: TranscriptItem[]) => {
    assistantBuf.current += delta;
    const segmentText = assistantBuf.current.slice(assistantSegmentStart.current);
    const last = snapshot[snapshot.length - 1];
    if (last?.kind === "assistant") {
      snapshot[snapshot.length - 1] = {
        kind: "assistant",
        text: segmentText,
      };
    } else {
      snapshot.push({ kind: "assistant", text: segmentText });
    }
    setItems([...snapshot]);
  }, []);

  /** 按住说话：按下开始识别，松开停止 */
  const voiceRecognitionRef = useRef<any>(null);

  const onMicMouseDown = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // 避免重复启动
    if (voiceRecognitionRef.current) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      setInput((prev) => prev + transcript);
    };

    recognition.onerror = () => {
      setVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    recognition.onend = () => {
      setVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    voiceRecognitionRef.current = recognition;
    recognition.start();
    setVoiceListening(true);
  }, []);

  const onMicMouseUp = useCallback(() => {
    const r = voiceRecognitionRef.current;
    if (r) {
      r.stop();
      // onend 会清理 state
    } else {
      setVoiceListening(false);
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    const sid = sessionIdRef.current;
    if (!text || busy || !sid) return;

    setInput("");
    setBusy(true);
    setStatus("connected");
    assistantBuf.current = "";
    assistantSegmentStart.current = 0;

    const snapshot: TranscriptItem[] = [...itemsRef.current, { kind: "user", text }];
    setItems(snapshot);

    try {
      const res = await actorFetch("/api/agent/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          message: text,
          anchor: anchorRef.current,
          chatMode: chatModeRef.current,
          qaFocusedRequest: (() => {
            try {
              const raw = sessionStorage.getItem("qa_focused_req");
              return raw ? JSON.parse(raw) : null;
            } catch { return null; }
          })(),
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
            const usage = {
              tokens: event.tokens,
              contextWindow: event.contextWindow,
              percent: event.percent,
            };
            setContextUsage(usage);
            setContextBudgetHint(evaluateContextBudget(usage));
          } else if (event.type === "context_budget_hint") {
            setContextBudgetHint({
              level: event.level,
              message: event.message,
            });
          } else if (event.type === "context_compaction") {
            if (event.phase === "start") {
              setCompactionStatus("正在压缩较早对话…");
            } else if (event.ok) {
              const before =
                event.tokensBefore != null
                  ? `（压缩前约 ${Math.round(event.tokensBefore / 1000)}k tokens）`
                  : "";
              setCompactionStatus(`对话已压缩${before}`);
            } else {
              setCompactionStatus(
                event.message
                  ? `压缩未完成：${event.message}`
                  : "压缩未完成",
              );
            }
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
            assistantSegmentStart.current = assistantBuf.current.length;
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

  if (booting || !currentActor) {
    return (
      <>
        <ActorPickerModal
          open={!currentActor || actorPickerOpen}
          mode={currentActor ? "switch" : "welcome"}
          currentActorId={currentActor?.id}
          onClose={() => setActorPickerOpen(false)}
          onSelect={handleActorSelect}
        />
        {!currentActor ? null : (
          <main className="layout boot">
            <p className="muted">加载会话…</p>
          </main>
        )}
      </>
    );
  }

  return (
    <>
    <ActorPickerModal
      open={actorPickerOpen}
      mode="switch"
      currentActorId={currentActor.id}
      onClose={() => setActorPickerOpen(false)}
      onSelect={handleActorSelect}
    />
    <main className="layout">
      <aside className={`conv-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "展开会话" : "折叠会话"}
          >
            {sidebarCollapsed ? "☰" : "◀"}
          </button>
          {!sidebarCollapsed && (
            <button
              type="button"
              className="new-chat-btn"
              onClick={() => void startNewConversation()}
              disabled={busy}
            >
              + 开启新对话
            </button>
          )}
        </div>
        {!sidebarCollapsed && <div className="conv-scroll" ref={convScrollRef}>
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
                          onMouseDown={(e) => e.preventDefault()}
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
        </div>}
      </aside>

      <aside className={`anchors${anchorCollapsed ? " collapsed" : ""}${anchorTab === "menu" ? " anchors--menu" : ""}`}>
        <div className="anchor-header">
          <h2>锚点</h2>
          <button
            type="button"
            className="anchor-collapse-btn"
            onClick={() => setAnchorCollapsed(!anchorCollapsed)}
            title={anchorCollapsed ? "展开锚点" : "折叠锚点"}
          >
            {anchorCollapsed ? "▶" : "◀"}
          </button>
        </div>
        {!anchorCollapsed && <><button
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
        ) : null}
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
        </>}
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
              <button
                type="button"
                className={chatMode === "qa" ? "mode-btn active" : "mode-btn"}
                onClick={() => setChatModePersist("qa")}
                disabled={busy}
              >
                测试辅助
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
              className="actor-btn"
              onClick={() => setActorPickerOpen(true)}
              disabled={busy}
              title="切换身份（部门内会话隔离）"
            >
              <span className="actor-btn-icon" aria-hidden>
                ◉
              </span>
              <span className="actor-btn-name">{currentActor.displayName}</span>
              <span className="actor-btn-caret" aria-hidden>
                ▾
              </span>
            </button>
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
            <span
              className={`context-usage${
                contextBudgetHint?.level === "critical"
                  ? " critical"
                  : contextBudgetHint?.level === "warn"
                    ? " warn"
                    : ""
              }`}
              title="Pi 模型上下文占用（估算）"
            >
              {formatContextUsageLabel(contextUsage)}
            </span>
          </div>
        </header>

        {(contextBudgetHint || compactionStatus) && (
          <div
            className={`context-budget-banner context-budget-${
              compactionStatus
                ? "compacting"
                : contextBudgetHint?.level ?? "warn"
            }`}
            role="status"
          >
            {compactionStatus ?? contextBudgetHint?.message}
          </div>
        )}

        <section
          className="transcript-scroll"
          aria-label="对话记录"
          ref={transcriptScrollRef}
        >
          <div className="transcript-inner">
          {items.length === 0 && (
            <p className="muted empty-hint">
              {chatMode === "prd"
                ? "需求整理：左侧用口语说就行，右侧会自动整理成清单；选好页面锚点更准确。"
                : chatMode === "qa"
                  ? "测试辅助：点击右侧面板「打开浏览器」启动录制，操作后回来分析。"
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
              className={`bubble ${
                isToolGroup(item)
                  ? "tool-group-wrap"
                  : item.kind === "export_ready"
                    ? "export-ready"
                    : item.kind
              }`}
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
              {item.kind === "export_ready" && (
                <div className="export-ready-bubble">
                  <div className="label">导出</div>
                  <p>{item.label}</p>
                  <button
                    type="button"
                    className="export-ready-btn"
                    onClick={() =>
                      downloadMarkdown(item.filename, item.markdown)
                    }
                  >
                    下载 {item.filename}
                  </button>
                </div>
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
            <button
              type="button"
              className={`mic-btn${voiceListening ? " listening" : ""}`}
              onMouseDown={onMicMouseDown}
              onMouseUp={onMicMouseUp}
              onMouseLeave={onMicMouseUp}
              disabled={busy || !sessionId}
              title={voiceListening ? "松开停止" : "按住说话"}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
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
          onDownloadMergedAppendix={downloadMergedAppendix}
          exportAppendixBusy={
            exportAppendixBusy || appendixJobStatus === "running"
          }
          appendixJobStatus={appendixJobStatus}
          onFinalize={(action) => {
            if (action.kind === "finalize_skip_blast") {
              exportMarkdown();
            }
          }}
        />
      )}

      {chatMode === "qa" && (
        <QATestConsole
          chatSessionId={sessionId}
          onPageChange={(pageLabel) => {
            if (!pageLabel) return;
            persistAnchor({ kind: "route", ref: pageLabel, label: pageLabel });
          }}
          onFocusRequest={(req) => {
            // 关注请求存入全局状态，agent 对话时可读到
            if (req) {
              sessionStorage.setItem("qa_focused_req", JSON.stringify(req));
            } else {
              sessionStorage.removeItem("qa_focused_req");
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
          transition: width 0.15s ease;
          overflow: hidden;
        }
        .conv-sidebar.collapsed {
          width: 36px;
          padding: 0.75rem 0.25rem;
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin-bottom: 0.5rem;
        }
        .sidebar-toggle {
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sidebar-toggle:hover {
          color: var(--text);
          border-color: var(--accent);
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
          transition: width 0.15s ease;
        }
        .anchors.collapsed {
          width: 32px;
          padding: 0.75rem 0.15rem;
          overflow: hidden;
        }
        .anchors--menu {
          width: min(460px, 42vw);
        }
        .anchor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-right: 0.25rem;
          margin-bottom: 0.5rem;
        }
        .anchor-collapse-btn {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: transparent;
          color: var(--muted);
          font-size: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .anchor-collapse-btn:hover {
          color: var(--text);
          border-color: var(--accent);
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
        .actor-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 11px;
          padding: 0.25rem 0.5rem 0.25rem 0.4rem;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--panel);
          color: var(--text);
          cursor: pointer;
          max-width: 9rem;
        }
        .actor-btn:hover:not(:disabled) {
          border-color: var(--accent);
          background: rgba(88, 166, 255, 0.08);
        }
        .actor-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .actor-btn-icon {
          font-size: 10px;
          color: var(--accent);
          line-height: 1;
        }
        .actor-btn-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .actor-btn-caret {
          font-size: 9px;
          color: var(--muted);
          line-height: 1;
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
        .context-usage.warn {
          color: #d29922;
        }
        .context-usage.critical {
          color: #f85149;
        }
        .context-budget-banner {
          flex-shrink: 0;
          margin: 0 0 0.5rem;
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.45;
        }
        .context-budget-warn {
          background: rgba(210, 153, 34, 0.12);
          border: 1px solid rgba(210, 153, 34, 0.45);
          color: #e3b341;
        }
        .context-budget-critical {
          background: rgba(248, 81, 73, 0.12);
          border: 1px solid rgba(248, 81, 73, 0.45);
          color: #ff7b72;
        }
        .context-budget-compacting {
          background: rgba(88, 166, 255, 0.12);
          border: 1px solid rgba(88, 166, 255, 0.45);
          color: var(--accent);
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
        .bubble.export-ready {
          background: var(--panel);
          border-color: var(--accent);
        }
        .export-ready-bubble {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .export-ready-btn {
          align-self: flex-start;
          font-size: 11px;
          padding: 0.35rem 0.65rem;
          border: 1px solid var(--accent);
          border-radius: 6px;
          background: transparent;
          color: var(--accent);
          cursor: pointer;
        }
        .export-ready-btn:hover {
          background: rgba(255, 255, 255, 0.04);
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
        .mic-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          padding: 0 !important;
          border-radius: 50% !important;
          background: transparent !important;
          color: var(--muted) !important;
          border: 1px solid var(--border) !important;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .mic-btn:hover:not(:disabled) {
          color: var(--text) !important;
          border-color: var(--text) !important;
          background: rgba(128,128,128,0.06) !important;
        }
        .mic-btn.listening {
          color: #f44 !important;
          border-color: #f44 !important;
          background: rgba(255,68,68,0.1) !important;
          animation: mic-pulse 1.2s ease-in-out infinite;
        }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,68,68,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(255,68,68,0); }
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </main>
    </>
  );
}
