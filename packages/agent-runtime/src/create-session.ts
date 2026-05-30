/**
 * 创建 Pi Agent 会话（最简版）
 *
 * 和官方示例几乎一样：packages/coding-agent/examples/sdk/01-minimal.ts
 *   const { session } = await createAgentSession();
 *
 * 我们只多传：
 *   1. cwd         — WORKSPACE_ROOT（letsTalk 运行根，含 workFront / workBack）
 *   2. API Key     — LLM_API_KEY
 *   3. useTools    — 只读 + Java AST + Context Pull +（prd）草稿工具
 */

import { dirname, resolve } from "node:path";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";
import { createContextPullTools } from "./context-pull-tools.js";
import { createJavaAstTools } from "./java-ast-tools.js";
import { createMemoryTools } from "./memory-tools.js";
import { createRequirementDraftTools } from "./requirement-draft-tools.js";
import {
  getDraft,
  getDraftRevision,
} from "./requirement-draft-store.js";

/** 阶段 4 Agent 自动记忆暂缓；代码保留，想开再改 true */
const ENABLE_MEMORY_TOOLS = false;

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
] as const;

const PRD_PULL_TOOLS = ["get_requirement_draft"] as const;

export interface CreatePiSessionOptions {
  /** 已有 jsonl 时 open 恢复多轮上下文；新建会话时由 SessionManager.create */
  piSessionFile: string;
  /** 传入后启用 PRD 草稿与 pull 工具 */
  sessionId?: string;
  chatMode?: ChatMode;
  /** 草稿工具写入 anchorRef 时读取当前锚点 */
  getAnchorRef?: () => string | null;
  getAnchor?: () => AgentAnchor | null;
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

  const memoryTools = ENABLE_MEMORY_TOOLS ? createMemoryTools(workspace) : [];

  const pullTools =
    useTools && options?.sessionId
      ? createContextPullTools({
          sessionId: options.sessionId,
          workspaceRoot: workspace,
          chatMode,
          getAnchor: options.getAnchor ?? (() => null),
          getDraft: () =>
            options.sessionId ? (getDraft(options.sessionId) ?? null) : null,
          getDraftRevision: () =>
            options.sessionId ? getDraftRevision(options.sessionId) : 0,
        })
      : [];

  const draftTools =
    useTools && options?.sessionId && chatMode === "prd"
      ? createRequirementDraftTools({
          sessionId: options.sessionId,
          getAnchorRef: options.getAnchorRef ?? (() => null),
          workspaceRoot: workspace,
        })
      : [];

  const pullToolNames: string[] = [...CONTEXT_PULL_TOOLS];
  if (chatMode === "prd") {
    pullToolNames.push(...PRD_PULL_TOOLS);
  }

  const toolNames: string[] = [
    ...READONLY_TOOLS,
    ...(ENABLE_MEMORY_TOOLS ? (["save_memory", "read_memory"] as const) : []),
    ...pullToolNames,
    ...(draftTools.length ? (["update_requirement_draft"] as const) : []),
  ];

  const registeredPullTools = pullTools;

  const piOptions = {
    cwd: workspace,
    authStorage,
    modelRegistry,
    sessionManager,
    thinkingLevel: "off" as const,
    ...(useTools
      ? {
          tools: toolNames,
          customTools: [
            ...createJavaAstTools(workspace),
            ...memoryTools,
            ...registeredPullTools,
            ...draftTools,
          ],
        }
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

  return {
    session,
    cwd: workspace,
    modelLabel: `${model.provider}/${model.id}`,
    piSessionFile: resolve(piSessionFile),
    chatMode,
    dispose: () => session.dispose(),
  };
}
