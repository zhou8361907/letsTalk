/**
 * 创建 Pi Agent 会话（最简版）
 *
 * 和官方示例几乎一样：packages/coding-agent/examples/sdk/01-minimal.ts
 *   const { session } = await createAgentSession();
 *
 * 我们只多传：
 *   1. cwd         — WORKSPACE_ROOT（letsTalk 运行根，含 workFront / workBack）
 *   2. API Key     — LLM_API_KEY
 *   3. useTools    — 只读 + Java AST（memory 工具见下方开关，默认关）
 */

import { dirname, resolve } from "node:path";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { createJavaAstTools } from "./java-ast-tools.js";
import { createMemoryTools } from "./memory-tools.js";
import { createRequirementDraftTools } from "./requirement-draft-tools.js";

/** 阶段 4 Agent 自动记忆暂缓；代码保留，想开再改 true */
const ENABLE_MEMORY_TOOLS = false;

export interface PiSessionHandle {
  session: AgentSession;
  cwd: string;
  modelLabel: string;
  /** Pi 落盘的 jsonl 绝对路径 */
  piSessionFile: string;
  dispose: () => void;
}

const READONLY_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "list_methods",
  "read_method",
] as const;

export async function createPiSession(
  cwd: string,
  useTools = true,
  options?: {
    piSessionFile: string;
    sessionId?: string;
    getAnchorRef?: () => string | null;
  },
): Promise<PiSessionHandle> {
  const workspace = resolve(cwd);

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
  const draftTools =
    useTools && options?.sessionId
      ? createRequirementDraftTools({
          sessionId: options.sessionId,
          getAnchorRef: options.getAnchorRef ?? (() => null),
        })
      : [];

  const toolNames: string[] = [
    ...READONLY_TOOLS,
    ...(ENABLE_MEMORY_TOOLS ? (["save_memory", "read_memory"] as const) : []),
    ...(draftTools.length ? (["update_requirement_draft"] as const) : []),
  ];

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
    dispose: () => session.dispose(),
  };
}
