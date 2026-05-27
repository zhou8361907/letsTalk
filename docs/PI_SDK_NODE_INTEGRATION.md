# Pi Coding Agent SDK → Node 后端接入教程

> 基于本地示例：  
> `/Users/zs/IdeaProjects/learn/pi/packages/coding-agent/examples/sdk`  
> 官方文档：[coding-agent docs/sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)

目标：**尽快在 Node 后端跑通** `createAgentSession` → `session.prompt` → 事件流 → HTTP/SSE。

> 产品架构以 [AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md) 为准（M0–M1 仅对话+工具，无 Skill）。下文部分章节含历史「Skill / Python compiler」示例，实现 M0 时可忽略。

---

## 0. SDK 心智模型（5 分钟）

```text
AuthStorage + ModelRegistry     ← 密钥与模型
        ↓
createAgentSession(options)     ← 工厂：cwd、tools、prompt、session 持久化
        ↓
AgentSession                    ← 一个对话实例
  · subscribe(event)            ← 流式文本、工具开始/结束
  · prompt("用户话")           ← 阻塞直到本轮 agent 结束
  · dispose()                   ← 释放
```

**和 CLI 的关系：** `hermes` / `pi` 命令行内部也是这套 SDK；你用 SDK 等于「自己写 server 版 pi」。

**示例文件学习顺序（建议）：**

| 顺序 | 文件 | 你要学会什么 |
|------|------|----------------|
| 1 | `01-minimal.ts` | 最少代码跑通 |
| 2 | `02-custom-model.ts` | 指定模型 |
| 3 | `09-api-keys-and-oauth.ts` | API Key |
| 4 | `05-tools.ts` | 只要 read/grep，不要 edit |
| 5 | `07-context-files.ts` | AGENTS.md 业务规则 |
| 6 | `06-extensions.ts` | **自定义 tool**（Skill 编译放这里） |
| 7 | `11-sessions.ts` | 内存 vs 持久化 session |
| 8 | `12-full-control.ts` | 关掉自动发现，全显式配置（生产推荐） |
| 9 | `13-session-runtime.ts` | 多用户切换 cwd / 换 session |

本地跑示例：

```bash
cd /Users/zs/IdeaProjects/learn/pi/packages/coding-agent
npx tsx examples/sdk/01-minimal.ts
```

---

## 1. 在 letsTalk 里安装依赖

在将来的 `apps/agent-server`（或临时 playground）：

```bash
pnpm add @earendil-works/pi-coding-agent @earendil-works/pi-ai
pnpm add -D typescript tsx @types/node
```

**使用本地 pi 源码（你已在 learn/pi 克隆）：**

```json
{
  "dependencies": {
    "@earendil-works/pi-coding-agent": "file:../../../learn/pi/packages/coding-agent",
    "@earendil-works/pi-ai": "file:../../../learn/pi/packages/ai"
  }
}
```

改路径后 `pnpm install`。本地包需先 build：

```bash
cd /Users/zs/IdeaProjects/learn/pi
npm install && npm run build
```

`package.json` 设 `"type": "module"`（Pi 为 ESM）。

---

## 2. 第一步：最小可运行脚本（对应 01-minimal）

创建 `apps/agent-server/scripts/smoke-minimal.ts`：

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  authStorage,
  modelRegistry,
  sessionManager: SessionManager.inMemory(),
  cwd: process.env.WORKSPACE_ROOT ?? process.cwd(),
});

try {
  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.error(`\n[tool] ${event.toolName}`);
    }
  });

  await session.prompt("用一句话说明当前目录是做什么项目的。");
  console.log("\n");
} finally {
  session.dispose();
}
```

```bash
WORKSPACE_ROOT=/Users/zs/IdeaProjects/work/letsTalk/legacy/test-project/RunningAccount-master \
  npx tsx apps/agent-server/scripts/smoke-minimal.ts
```

通过标准：终端有流式文字；若模型可用，可能出现 `[tool] read` 等。

---

## 3. 配置 DeepSeek / OpenAI 兼容（对应 02 + 09）

### 3.1 运行时 Key（最快）

```typescript
const authStorage = AuthStorage.create();
authStorage.setRuntimeApiKey("deepseek", process.env.LLM_API_KEY!);
// 或 openai / openrouter 等，provider 名与 models.json 一致
```

### 3.2 models.json（推荐，和 pi CLI 一致）

在 `agent-server` 专用目录放配置，例如 `./.pi-agent/models.json`：

```json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "api": "openai-completions",
      "apiKey": "DEEPSEEK",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "deepseek-chat",
          "name": "DeepSeek Chat",
          "reasoning": false,
          "contextWindow": 64000,
          "maxTokens": 8192
        }
      ]
    }
  }
}
```

```typescript
import { getModel } from "@earendil-works/pi-ai";

const authStorage = AuthStorage.create("./.pi-agent/auth.json");
authStorage.setRuntimeApiKey("deepseek", process.env.LLM_API_KEY!);

const modelRegistry = ModelRegistry.create(authStorage, "./.pi-agent/models.json");
const model = getModel("deepseek", "deepseek-chat");
if (!model) throw new Error("model not found");
```

详见 pi 文档：[models.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md)。

---

## 4. 业务 Agent 推荐配置（对应 05 + 12）

letsTalk 第一版：**只读代码 + 自定义 Skill 工具**，不要默认 `bash`/`edit`。

```typescript
import { getModel } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";

const WORKSPACE = process.env.WORKSPACE_ROOT!;

const authStorage = AuthStorage.create(".pi-agent/auth.json");
authStorage.setRuntimeApiKey("deepseek", process.env.LLM_API_KEY!);
const modelRegistry = ModelRegistry.create(authStorage, ".pi-agent/models.json");
const model = getModel("deepseek", "deepseek-chat")!;

const loader = new DefaultResourceLoader({
  cwd: WORKSPACE,
  systemPromptOverride: (base) => `${base}

你是 Vue + Spring Boot 业务架构助手。
- 有当前页时先查 Skill（read_page_skill），没有则 compile_page_skill。
- 回答标注【Skill】或【代码 path】来源。`,
  // 也可 agentsFilesOverride 注入虚拟 AGENTS.md，见 07-context-files.ts
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: WORKSPACE,
  model,
  thinkingLevel: "off",
  authStorage,
  modelRegistry,
  resourceLoader: loader,
  tools: ["read", "grep", "find", "ls"], // 内置只读
  sessionManager: SessionManager.inMemory(WORKSPACE),
  settingsManager: SettingsManager.inMemory(),
});
```

更接近生产的写法：用 `12-full-control.ts` 关掉 skills/extensions 自动发现，只留你写的 extension（下一节）。

---

## 5. 自定义工具：Skill / 编译（对应 06-extensions）

Pi **自定义 tool 走 Extension**，在 extension 里 `pi.registerTool()`。

`apps/agent-server/extensions/lets-talk-tools.ts`：

```typescript
import { Type } from "@sinclair/typebox"; // pi 使用 typebox，与 06 示例一致
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "read_page_skill",
    label: "Read Page Skill",
    description: "读取当前或指定页面的业务地图 Skill（summary + map 摘要）",
    parameters: Type.Object({
      pageKey: Type.Optional(Type.String()),
    }),
    execute: async (_id, params) => {
      // TODO: 读 .agent/skills/{pageKey}/summary.md
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "miss", pageKey: params.pageKey }) }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "compile_page_skill",
    label: "Compile Page Skill",
    description: "无 Skill 或过期时，编译页面地图（调用 Python compiler 或 legacy 分析）",
    parameters: Type.Object({
      pageKey: Type.Optional(Type.String()),
      force: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, params) => {
      // TODO: fetch COMPILER_PY_URL/v1/compile/page
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, pageKey: params.pageKey }) }],
        details: {},
      };
    },
  });
}
```

注册 extension：

```typescript
const resourceLoader = new DefaultResourceLoader({
  cwd: WORKSPACE,
  additionalExtensionPaths: [new URL("./extensions/lets-talk-tools.ts", import.meta.url).pathname],
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  cwd: WORKSPACE,
  model,
  authStorage,
  modelRegistry,
  resourceLoader,
  tools: ["read", "grep", "find", "ls", "read_page_skill", "compile_page_skill"],
  sessionManager: SessionManager.inMemory(WORKSPACE),
});
```

**Harness 注入方式：** 在 `execute` 里读 `process.env.WORKSPACE_ROOT`，或 extension 闭包持有 `LetsTalkContext`（见 §7）。

---

## 6. Node HTTP + SSE（尽快对接前端）

### 6.1 Session 池

每个浏览器 tab 一个 `sessionId` → 一个 `AgentSession`（参考 `11-sessions` 内存模式）。

```typescript
type SessionEntry = {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  unsubscribe: () => void;
};

const pool = new Map<string, SessionEntry>();

async function getOrCreateSession(sessionId: string, cwd: string) {
  let entry = pool.get(sessionId);
  if (entry) return entry;

  const { session } = await createAgentSession({ /* ... */ cwd, sessionManager: SessionManager.inMemory(cwd) });
  const unsubscribe = session.subscribe((event) => broadcast(sessionId, event));
  entry = { session, unsubscribe };
  pool.set(sessionId, entry);
  return entry;
}
```

### 6.2 事件 → SSE（对齐设计报告）

```typescript
function piEventToSse(event: unknown): object | null {
  const e = event as { type: string; [k: string]: unknown };
  switch (e.type) {
    case "message_update": {
      const inner = e.assistantMessageEvent as { type: string; delta?: string };
      if (inner?.type === "text_delta" && inner.delta) {
        return { type: "assistant_delta", text: inner.delta };
      }
      return null;
    }
    case "tool_execution_start":
      return { type: "tool_start", callId: String(e.toolCallId ?? ""), tool: e.toolName, argsSummary: "" };
    case "tool_execution_end":
      return { type: "tool_output", callId: String(e.toolCallId ?? ""), ok: true, preview: String(e.result ?? "").slice(0, 2048), durationMs: 0 };
    case "agent_end":
      return { type: "turn_end", turn: 0 };
    default:
      return null;
  }
}
```

### 6.3 Hono 路由骨架

```typescript
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const app = new Hono();

app.post("/api/agent/chat/stream", async (c) => {
  const { sessionId, message, workspaceRoot, currentPage } = await c.req.json();

  return streamSSE(c, async (stream) => {
    const { session } = await getOrCreateSession(sessionId, workspaceRoot);

    const unsub = session.subscribe(async (event) => {
      const payload = piEventToSse(event);
      if (payload) await stream.writeSSE({ data: JSON.stringify(payload) });
    });

    const userText = currentPage
      ? `[当前页面: ${currentPage}]\n\n${message}`
      : message;

    try {
      await session.prompt(userText);
    } finally {
      unsub();
    }
  });
});
```

**注意：** `session.prompt()` 完成前不要 `dispose()` session；仅在整个 WebSocket/SSE 连接关闭或超时时清理。

### 6.4 编译进行中串行（M1）

```typescript
const compiling = new Set<string>();

// 在 compile_page_skill 的 execute 开头：
compiling.add(sessionId);
// 结束时 compiling.delete(sessionId)

// HTTP 层：若 compiling.has(sessionId) 且是新消息 → 409
```

---

## 7. 外部环境 Harness（你给 Pi 的「现场」）

建议统一结构，创建 session 时传入：

```typescript
export interface LetsTalkHarness {
  workspaceRoot: string;
  frontendRoot: string;
  backendRoot: string;
  currentPage: { pageKey: string; vuePath: string; routePath: string } | null;
  compilerUrl: string;
}

// 创建 session 时：
process.env.WORKSPACE_ROOT = harness.workspaceRoot;

// extension 工厂：
export function createLetsTalkExtension(ctx: LetsTalkHarness) {
  return (pi: ExtensionAPI) => {
    pi.registerTool({ /* execute 内使用 ctx */ });
  };
}

const resourceLoader = new DefaultResourceLoader({
  cwd: harness.workspaceRoot,
  extensionFactories: [createLetsTalkExtension(harness)],
});
```

**cwd 至关重要：** Pi 内置 `read`/`grep` 都相对于 `createAgentSession({ cwd })`。  
用户切换仓库 = 新 `sessionId` 或 `AgentSessionRuntime` 换 cwd（见 `13-session-runtime.ts`）。

---

## 8. 推荐实施路线（按天）

| 天 | 任务 | 验收 |
|----|------|------|
| D1 | `smoke-minimal.ts` + DeepSeek models.json | 终端能对话 |
| D2 | `05` 只读 tools + `07` AGENTS.md 业务 prompt | 能 grep/read 仓库 |
| D3 | `06` 注册 `read_page_skill` stub | 模型会调用自定义 tool |
| D4 | Hono SSE + 浏览器打印 delta/tool | Postman 或 curl 见流 |
| D5 | `compile_page_skill` 调 `legacy` Python HTTP | Detail 页首问触发编译 |
| D6 | 左侧路由仅前端；body 带 `currentPage` | 选页后优先 Skill |

---

## 9. 与 letsTalk 设计报告的对照

| 设计报告概念 | Pi SDK 落点 |
|--------------|-------------|
| Agent 循环 | `session.prompt` + 内置 agent，无需自写 while |
| Harness | `cwd` + extension `execute` + env |
| 懒编译 Skill | `compile_page_skill` custom tool |
| TUI Web | `subscribe` → SSE `assistant_delta` / `tool_*` |
| Python compiler | tool 内 `fetch(compilerUrl)` |
| 多用户 | `Map<sessionId, AgentSession>` 或 `createAgentSessionRuntime` |

完整产品架构见：[AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md)。

---

## 10. 常见问题

### Q: 还要不要直接依赖 `pi-agent-core`？

一般 **不用**。`pi-coding-agent` 已 re-export 会话 API；只有你要绕过 coding-agent 自己拼底层时才用 `pi-agent-core`。

### Q: `customTools` 选项和 extension 区别？

README 写 `customTools` 数组，示例里 **推荐 extension `registerTool`**（`06-extensions.ts`）。以示例为准。

### Q: 事件类型不全？

以 `session.subscribe` 实际回调为准，在开发时加：

```typescript
session.subscribe((e) => console.error(JSON.stringify(e)));
```

对照 [sdk.md Events](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)。

### Q: Windows / 路径？

extension 路径建议用 `import.meta.url` + `fileURLToPath`，避免手写绝对路径。

---

## 11. 最小目录清单（Phase 1 playground）

```text
apps/agent-server/
  package.json
  tsconfig.json
  .pi-agent/
    models.json
  extensions/
    lets-talk-tools.ts
  src/
    harness.ts
    session-pool.ts
    pi-event-bridge.ts
    server.ts
  scripts/
    smoke-minimal.ts
```

---

## 12. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-05-26 | 基于 learn/pi examples/sdk 首版 |
