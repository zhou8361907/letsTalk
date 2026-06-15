/**
 * 创建 Pi Agent 会话（最简版）
 *
 * 和官方示例几乎一样：packages/coding-agent/examples/sdk/01-minimal.ts
 *   const { session } = await createAgentSession();
 *
 * 我们只多传：
 *   1. cwd         — WORKSPACE_ROOT（letsTalk 运行根，含 workFront / workBack）
 *   2. API Key     — LLM_API_KEY
 *   3. useTools    — 只读 + write/edit(.agent) + Java AST + Pull +（prd）草稿
 *   4. resourceLoader — AGENTS.md + letsTalk append → Pi system prompt（非每轮 user 前缀）
 */

import { dirname, resolve } from "node:path";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  createExportAppendixResourceLoader,
  createLetsTalkResourceLoader,
  createSelfImprovementReviewResourceLoader,
  createTitleSummaryResourceLoader,
} from "./pi-resource-loader.js";
import { captureSystemPromptFromLoader } from "./system-prompt-snapshot.js";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type {
  AgentAnchor,
  ChatMode,
  SystemPromptSnapshot,
} from "@lets-talk/shared-types";
import { createScopedWriteTools } from "./agent-scoped-write-tools.js";
import {
  isMemoryToolsEnabled,
  isScopedWriteEnabled,
} from "./agent-write-policy.js";
import { createContextPullTools } from "./context-pull-tools.js";
import { createJavaAstTools } from "./java-ast-tools.js";
import { createMemoryTools, createMemoryOnlyTool } from "./memory-tools.js";
import { createRequirementDraftTools } from "./requirement-draft-tools.js";
import {
  createSkillManageOnlyTool,
  createSkillTools,
} from "./skill-tools.js";
import { isSkillsEnabled } from "@lets-talk/skills";
import {
  createSessionSearchTools,
  isSessionSearchAvailable,
} from "./session-search-tools.js";
import { wrapToolsWithOutputLimit } from "./tool-output-truncate.js";
import {
  getDraft,
  getDraftRevision,
} from "./requirement-draft-store.js";

/**
 * 内存中缓存的 Pi 会话句柄。
 * run-chat 按 sessionId 复用，避免每轮重建 AgentSession。
 */
export interface PiSessionHandle {
  /** Pi SDK 会话对象，负责 prompt / subscribe / getContextUsage */
  session: AgentSession;
  /** 已 resolve 的 WORKSPACE_ROOT */
  cwd: string;
  /** 如 deepseek/deepseek-chat，用于 SSE session 事件 */
  modelLabel: string;
  /** Pi 多轮上下文 jsonl 的绝对路径 */
  piSessionFile: string;
  /** 创建句柄时的 chatMode；变化时需重建以更新工具集 */
  chatMode: ChatMode;
  /** 会话创建时冻结的 system prompt 快照 */
  systemPromptSnapshot: SystemPromptSnapshot;
  /** 注册的工具名（与 Pi 实际暴露一致） */
  activeTools: string[];
  /** 句柄创建时刻（用于 M0 mtime 前缀刷新） */
  sessionCreatedAtMs: number;
  /** 进程内释放 Pi 资源；切换 cwd 或 evict 缓存时调用 */
  dispose: () => void;
}

/** Pi 内置只读工具 + 我们注册的 list_methods/read_method 名称 */
const READONLY_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "list_methods",
  "read_method",
] as const;

const CONTEXT_PULL_TOOLS = [
  "get_anchor_preview",
  "get_business_hints",
  "resolve_memory_terms",
] as const;

const PRD_PULL_TOOLS = ["get_requirement_draft"] as const;

export type PiSessionKind =
  | "default"
  | "memory-review"
  | "self-improvement-review"
  | "export-appendix"
  | "title-summary";

export interface CreatePiSessionOptions {
  /** 已有 jsonl 时 open 恢复；省略则由 SessionManager.create 新建 */
  piSessionFile?: string;
  /** 传入后启用 PRD 草稿与 pull 工具 */
  sessionId?: string;
  chatMode?: ChatMode;
  /** 后台 memory review：仅 memory 工具 + 极简 system */
  sessionKind?: PiSessionKind;
  /** 草稿工具写入 anchorRef 时读取当前锚点 */
  getAnchorRef?: () => string | null;
  getAnchor?: () => AgentAnchor | null;
  /** 会话归属 Actor；USER 画像按此隔离 */
  actorId?: string;
}

/**
 * 创建或恢复 Pi AgentSession。
 *
 * @param cwd WORKSPACE_ROOT
 * @param useTools false 时等价阶段 0 冒烟（noTools: all）
 */
export async function createPiSession(
  cwd: string,
  useTools = true,
  options?: CreatePiSessionOptions,
): Promise<PiSessionHandle> {
  const workspace = resolve(cwd);
  const chatMode = options?.chatMode ?? "explore";
  const sessionKind = options?.sessionKind ?? "default";
  const isSelfImprovementReview =
    sessionKind === "self-improvement-review" ||
    sessionKind === "memory-review";
  const isExportAppendix = sessionKind === "export-appendix";
  const isTitleSummary = sessionKind === "title-summary";
  const isMinimalTask =
    isSelfImprovementReview || isExportAppendix || isTitleSummary;
  const skillsEnabled = isSkillsEnabled();

  // 有 piSessionFile → 恢复历史；否则新建（仅内存，落盘在首轮 prompt 后）
  const sessionManager = options?.piSessionFile
    ? SessionManager.open(
        resolve(options.piSessionFile),
        dirname(resolve(options.piSessionFile)),
        workspace,
      )
    : SessionManager.create(workspace);

  const authStorage = AuthStorage.create();
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (apiKey) {
    authStorage.setRuntimeApiKey("deepseek", apiKey);
  }

  const modelRegistry = ModelRegistry.create(authStorage);

  const memoryTools = isMemoryToolsEnabled()
    ? createMemoryTools(workspace, options?.actorId)
    : [];
  const skillTools = skillsEnabled && !isMinimalTask ? createSkillTools(workspace) : [];
  const memoryOnlyTool =
    isMemoryToolsEnabled() && isSelfImprovementReview
      ? createMemoryOnlyTool(workspace, options?.actorId)
      : null;
  const skillManageOnlyTool =
    skillsEnabled && isSelfImprovementReview
      ? createSkillManageOnlyTool(workspace)
      : null;
  const scopedWriteTools =
    isScopedWriteEnabled() && !isMinimalTask
      ? createScopedWriteTools(workspace)
      : [];

  const pullTools =
    useTools && !isMinimalTask && options?.sessionId
      ? createContextPullTools({
          sessionId: options.sessionId,
          workspaceRoot: workspace,
          chatMode,
          getAnchor: options.getAnchor ?? (() => null),
          getDraft: () =>
            options.sessionId ? (getDraft(options.sessionId) ?? null) : null,
          getDraftRevision: () =>
            options.sessionId ? getDraftRevision(options.sessionId) : 0,
          memoryEnabled: isMemoryToolsEnabled(),
        })
      : [];

  const draftTools =
    useTools && !isMinimalTask && options?.sessionId && chatMode === "prd"
      ? createRequirementDraftTools({
          sessionId: options.sessionId,
          getAnchorRef: options.getAnchorRef ?? (() => null),
          workspaceRoot: workspace,
        })
      : [];

  const sessionSearchTools =
    useTools && !isMinimalTask && isSessionSearchAvailable(workspace)
      ? createSessionSearchTools(workspace, {
          currentSessionId: options?.sessionId,
        })
      : [];

  const pullToolNames: string[] = [...CONTEXT_PULL_TOOLS];
  if (chatMode === "prd") {
    pullToolNames.push(...PRD_PULL_TOOLS);
  }

  const exportAppendixToolNames = [
    ...READONLY_TOOLS,
  ] as const;

  const toolNames: string[] = isTitleSummary
    ? []
    : isSelfImprovementReview
      ? [
          ...(isMemoryToolsEnabled() ? (["memory"] as const) : []),
          ...(skillsEnabled ? (["skill_manage"] as const) : []),
        ]
      : isExportAppendix
        ? [...exportAppendixToolNames]
        : [
            ...READONLY_TOOLS,
            ...(isMemoryToolsEnabled()
              ? ([
                  "memory",
                  "save_memory",
                  "read_memory",
                  "list_memory_index",
                  "update_user_profile",
                  "update_core_memory",
                  "read_user_profile",
                  "read_core_memory",
                ] as const)
              : []),
            ...(skillsEnabled
              ? (["skills_list", "skill_view", "skill_manage"] as const)
              : []),
            ...(isScopedWriteEnabled() ? (["write", "edit"] as const) : []),
            ...pullToolNames.filter(
              (n) => n !== "resolve_memory_terms" || isMemoryToolsEnabled(),
            ),
            ...(draftTools.length ? (["update_requirement_draft"] as const) : []),
            ...(sessionSearchTools.length ? (["session_search"] as const) : []),
          ];

  const resourceLoader = isSelfImprovementReview
    ? await createSelfImprovementReviewResourceLoader(workspace)
    : isExportAppendix
      ? await createExportAppendixResourceLoader(workspace)
      : isTitleSummary
        ? await createTitleSummaryResourceLoader(workspace)
        : await createLetsTalkResourceLoader(workspace, chatMode, options?.actorId);

  const rawCustomTools = isSelfImprovementReview
    ? [
        ...(memoryOnlyTool ? [memoryOnlyTool] : []),
        ...(skillManageOnlyTool ? [skillManageOnlyTool] : []),
      ]
    : isExportAppendix
      ? [...createJavaAstTools(workspace)]
      : isTitleSummary
        ? []
        : [
            ...createJavaAstTools(workspace),
            ...memoryTools,
            ...skillTools,
            ...scopedWriteTools,
            ...pullTools,
            ...draftTools,
            ...sessionSearchTools,
          ];

  const customTools = wrapToolsWithOutputLimit(rawCustomTools);

  const piOptions = {
    cwd: workspace,
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader,
    thinkingLevel: "off" as const,
    ...(useTools
      ? { tools: toolNames, customTools }
      : { noTools: "all" as const }),
  };

  const { session, modelFallbackMessage } = await createAgentSession(piOptions);

  const model = session.model;
  if (!model) {
    throw new Error(
      modelFallbackMessage ??
        "没有可用模型：请检查 .env 里的 LLM_API_KEY，可选 LLM_MODEL=deepseek-v4-flash",
    );
  }

  const piSessionFile =
    session.sessionFile ?? sessionManager.getSessionFile() ?? options?.piSessionFile;
  if (!piSessionFile) {
    throw new Error("Pi session 未绑定落盘文件");
  }

  const modelLabel = `${model.provider}/${model.id}`;
  const systemPromptSnapshot = captureSystemPromptFromLoader(resourceLoader, {
    workspaceRoot: workspace,
    chatMode,
    modelLabel,
    activeTools: useTools ? [...toolNames] : [],
  });

  return {
    session,
    cwd: workspace,
    modelLabel,
    piSessionFile: resolve(piSessionFile),
    chatMode,
    systemPromptSnapshot,
    activeTools: useTools ? [...toolNames] : [],
    sessionCreatedAtMs: Date.now(),
    dispose: () => session.dispose(),
  };
}
