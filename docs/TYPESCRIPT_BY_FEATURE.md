# 按功能学 TypeScript：letsTalk 学习路线图

> 顺着 **你会用到的主要功能** 学语法，而不是按 TS 教科书章节。  
> 每条语法都链到 [初学者篇](./TYPESCRIPT_FOR_BEGINNERS.md)（基）或 [进阶篇](./TYPESCRIPT_DEEP_DIVE.md)（深）。

---

## 怎么用本文

1. 先确认你关心哪个 **功能**（下表 §1）。  
2. 打开该功能的 **必读文件**，边读边在 IDE 里跳转。  
3. 遇到不懂的符号，查该功能下的 **语法清单** 跳转到基/深文档。  
4. 用 **自测** 确认看懂。

**建议学习顺序**（与产品主路径一致）：

```text
功能 0 公共底座（类型包 + 发消息链路）
  → 功能 1 探索对话
  → 功能 2 锚点
  → 功能 3 会话列表
  → 功能 4 需求整理（PRD）
  → 功能 5 导出
  → 功能 6 Java 查代码（研发向）
```

---

## 1. 功能总览

| # | 功能 | UI 上在哪 | 核心类型 | 核心文件 |
|---|------|-----------|----------|----------|
| 0 | 发消息 + SSE 流 | 右侧输入框 | `ChatStreamRequest`, `SseEvent` | `page.tsx`, `route.ts`, `run-chat.ts` |
| 1 | 探索对话 | 顶部「探索」 | `ChatMode`, `TranscriptItem` | 同上 + `shared-types` |
| 2 | 锚点 | 左侧锚点栏 | `AgentAnchor` | `build-context.ts`, `MenuAnchorPicker` |
| 3 | 会话列表 | 最左会话栏 | `ConversationRecord` | `conversation/store.ts`, `page.tsx` |
| 4 | 需求整理 | 顶部「需求整理」 | `RequirementDraftState` | `requirement-draft-*.ts`, `RequirementCanvas` |
| 5 | 导出 PRD | 头部「导出」 | `AgentAction` | `export-prd.ts` |
| 6 | Java 手术刀 | 探索时 Agent 自动调 | `ToolDefinition` | `java-ast-tools.ts`, `ast-tools` |
| 7 | Agent 能力开关 | 无直接 UI | `PiSessionHandle` | `create-session.ts` |

---

## 功能 0：发消息与 SSE（所有功能的基础）

### 你在产品上做什么

输入一句话 → 点发送 → 看到流式回复（可能夹工具块）。

### 详细专题（推荐先读这篇）

**[FEATURE_00_SEND_AND_SSE.md](./FEATURE_00_SEND_AND_SSE.md)** — 从 `fetch` 到 `data:` 行、`onEvent`、`assistant_delta`，配时间线与示例字节。

### 必读文件（按顺序）

1. `apps/web/app/page.tsx` — `send()`  
2. `apps/web/app/api/agent/chat/stream/route.ts`  
3. `packages/agent-runtime/src/run-chat.ts`  
4. `packages/shared-types/src/index.ts` — `SseEvent`, `ChatStreamRequest`

### 本功能涉及的语法

| 语法 | 在本功能里长什么样 | 去学 |
|------|-------------------|------|
| `async` / `await` | `const send = useCallback(async () => { await fetch(...); while(await reader.read())` | 基 §7 |
| `import type` | `import type { SseEvent, ChatStreamRequest }` | 基 §1.2 |
| `interface` 请求体 | `ChatStreamRequest { sessionId, message, anchor?, chatMode? }` | 基 §2、§4 |
| 联合类型 `\|` | `export type SseEvent = \| { type: "assistant_delta"; ... } \| ...` | 基 §5、深 §2 |
| `if (event.type === "...")` 收窄 | `page.tsx` 里一长串 `else if` | 基 §5、深 §2.3 |
| `as` 断言 | `JSON.parse(payload) as SseEvent` | 基 §10、深 §12 |
| 函数类型回调 | `onEvent: (event: SseEvent) => void` | 基 §7.3、深 §6 |
| 动态 `import()` | `await import("@lets-talk/agent-runtime")` | 基 §1.4 |
| `Parameters<typeof fn>` | `enqueue` 的参数类型 | 基 §12.3、深 §10.1 |
| 模板字符串 | `` `data: ${JSON.stringify(event)}\n\n` `` | 基 §14 |
| `??` | `body.chatMode ?? "explore"` | 基 §9.2 |
| `useState` / `useRef` / `useCallback` | `page.tsx` 全文 | 基 §13 |
| `unknown` 边界 | `piEvent: unknown` → `piEventToSse` | 深 §3 |

### 关键类型（背下来）

```typescript
// 浏览器 → 服务端
interface ChatStreamRequest {
  sessionId: string;
  message: string;
  anchor?: AgentAnchor | null;
  chatMode?: "explore" | "prd";
}

// 服务端 → 浏览器（每一行 SSE 解析成一个）
type SseEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "tool_start"; callId: string; tool: string }
  | { type: "tool_output"; callId: string; ok: boolean; preview: string; ... }
  | { type: "turn_end" }
  | ... // 见 shared-types
```

### 自测

- [ ] 能说出 `options.message` 和模型实际收到的 `userText` 区别  
- [ ] 能列举 3 种 `SseEvent.type` 及前端如何处理  
- [ ] 知道 `onEvent` 在 `route.ts` 里叫什么名字（`enqueue`）

---

## 功能 1：探索对话（查代码、看工具）

### 你在产品上做什么

顶部选 **「探索」**，问代码问题；Transcript 里出现「工具调用」折叠块（grep/read）。

### 在功能 0 之上多读

| 文件 | 关注点 |
|------|--------|
| `run-chat.ts` | `piEventToSse`、`session.subscribe` |
| `create-session.ts` | `READONLY_TOOLS`、`tools` 白名单 |
| `apps/web/lib/group-transcript.ts` | 工具条合并展示 |

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| `TranscriptItem` 联合 | `kind: "user" \| "assistant" \| "tool" \| "context"` | 基 §5、深 §5 |
| `Extract<..., { kind: "tool" }>` | `ToolTranscriptItem` | 深 §5.2 |
| 类型谓词 `item is ToolGroupItem` | `isToolGroup()` | 深 §5.4 |
| `as const` 工具名数组 | `READONLY_TOOLS = [...] as const` | 基 §6 |
| spread 拼数组 | `toolNames: string[] = [...READONLY_TOOLS, ...]` | 基 §6 |
| 条件 spread 拼对象 | `...(useTools ? { tools, customTools } : { noTools })` | 基 §6 |
| `Map` 缓存会话 | `sessions = new Map<string, PiSessionHandle>()` | 基 §12.1、深 §10.7 |
| `Promise<void>` | `runChat` 无返回值 | 基 §7.4 |

### 一轮 explore 的 SSE 顺序（对照调试）

`session` → `context_usage` → `context` → `assistant_delta`×N → `tool_start`/`tool_output`×N → `context_usage` → `turn_end`

见 [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) §3。

### 自测

- [ ] `TranscriptItem` 和 `SseEvent` 为什么不是一一对应？  
- [ ] `tool_start` 和 `tool_output` 如何合成一条 `kind:"tool"`？

---

## 功能 2：锚点（聚焦页面 / 菜单）

### 你在产品上做什么

左侧选 **系统菜单** 或 **代码文件**，或「全库探索」；头部显示 `· 锚点 ref`。

### 必读文件

| 文件 | 关注点 |
|------|--------|
| `packages/shared-types/src/anchor.ts` | `AgentAnchor` |
| `packages/context/src/build-context.ts` | `mode: explore \| focused` |
| `packages/context/src/format-block.ts` | `<anchor kind="..." ref="..." />` |
| `apps/web/components/MenuAnchorPicker.tsx` | 菜单树 UI |
| `page.tsx` | `persistAnchor`, `sessionStorage` |

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| 多字段 `interface` | `AgentAnchor` 的 `menuId?`, `routePath?` | 基 §2、§4 |
| 字面量联合 `kind` | `"vue" \| "java" \| "menu" \| ...` | 基 §5 |
| 可选链 `?.` | `anchor?.ref?.trim()` | 基 §9.3 |
| 三元分支 | 菜单锚点 vs 文件锚点不同预览逻辑 | 基 §9.1 |
| `useState<AgentAnchor \| null>` | 锚点 state | 基 §12.2、§13 |
| `JSON.parse(...) as AgentAnchor` | 从 sessionStorage 恢复 | 基 §10 |

### 关键类型

```typescript
interface AgentAnchor {
  kind: "vue" | "java" | "route" | "file" | "menu";
  ref: string;           // 文件路径或路由
  label?: string;
  menuId?: string;       // 菜单专有
  menuUrl?: string;
  routePath?: string;
  // ...
}
```

JIT 里：`anchor` 有值 → `mode: "focused"`；无 → `mode: "explore"`（与 `chat_mode` 无关，见深 §9）。

### 自测

- [ ] `AgentAnchor.ref` 对菜单和文件分别是什么意思？  
- [ ] `build-context` 里菜单锚点为什么不 `read` 整个 vue 文件？

---

## 功能 3：会话列表与历史

### 你在产品上做什么

最左 **新建 / 切换 / 删除** 会话；刷新后 Transcript 还在。

### 必读文件

| 文件 | 关注点 |
|------|--------|
| `packages/conversation/src/store.ts` | `createConversation`, `saveConversation` |
| `apps/web/app/api/conversations/route.ts` | GET 列表 / POST 新建 |
| `apps/web/app/api/conversations/[id]/route.ts` | GET / PUT / DELETE |
| `page.tsx` | `persistCurrent`, `applyConversation` |

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| `interface extends` | `ConversationRecord extends ConversationSummary` | 基 §2.4 |
| 嵌套类型 | `items: TranscriptItem[]` | 基 §7.1 |
| `async` 读写文件 | `readFile` / `writeFile` + `JSON.parse` | 基 §7.4 |
| `export async function POST()` | Next.js Route Handler | 基 §1 |
| 解构 + 默认值 | `saveConversation` 合并 `existing` | 基 §8 |
| `void` 丢弃 Promise | `void refreshConversationList()` | 基 §16 |

### 两套持久化（别混）

| 存什么 | 路径 | 谁写 |
|--------|------|------|
| UI Transcript、锚点、草稿 | `.agent/conversations/{id}.json` | 前端 `PUT`；草稿工具也会写 |
| Pi 多轮 LLM 上下文 | `.agent/conversations/pi/{id}.jsonl` | `bindPiSessionFile` |

### 自测

- [ ] `ConversationRecord` 比 `ConversationSummary` 多哪些字段？  
- [ ] 切换会话时 `page.tsx` 如何恢复 `items` 和 `anchor`？

---

## 功能 4：需求整理（PRD / 任务清单）

### 你在产品上做什么

顶部 **「需求整理」**；右侧 **需求清单** 随对话更新；可导出 Markdown。

### 必读文件

| 文件 | 关注点 |
|------|--------|
| `packages/shared-types/src/requirement-draft.ts` | 全部需求类型 |
| `packages/agent-runtime/src/requirement-draft-tools.ts` | `update_requirement_draft` |
| `packages/agent-runtime/src/requirement-draft-store.ts` | 内存合并逻辑 |
| `packages/agent-runtime/src/requirement-draft-runtime.ts` | listener 旁路 |
| `run-chat.ts` | `onDraftUpdated`, `emitDraftEvents` |
| `apps/web/components/RequirementCanvas.tsx` | 右侧 UI |

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| 嵌套 `interface` | `DraftState` → `items[]` → `fields[]` | 基 §2 |
| 多个小枚举 `type` | `RequirementItemStatus`, `FieldStatus` | 基 §5 |
| `Record<Key, string>` 标签表 | `REQUIREMENT_FIELD_LABELS` | 基 §7.2 |
| `version: 1` 字面量 | 草稿版本固定为 1 | 深 §8.3 |
| 类型别名函数 | `type DraftListener = (draft) => void` | 深 §4 |
| `Map` + listener | `setDraftListener` / `notifyDraftUpdated` | 深 §4、§10.7 |
| 旁路 SSE（非 Pi） | `requirement_state`, `agent_actions` | 深 §4 |
| TypeBox `Type.Object` | 工具参数 schema | 深 §10.4 |
| `chatMode === "prd"` 分支 | 注入 `pm_rules`、注册草稿工具 | 深 §9 |

### 关键类型

```typescript
interface RequirementDraftState {
  version: 1;
  items: RequirementItem[];
  openQuestions: string[];
  blockingQuestion: string | null;
  readyToFinalize: boolean;
}

interface RequirementItem {
  id: string;
  title: string;
  type: "modify" | "add" | "unknown";
  status: "draft" | "ready" | "blocked" | "conflict";
  fields: RequirementField[];
}
```

### PRD 专属 SSE（探索模式没有）

| type | 何时 |
|------|------|
| `requirement_state` | 草稿全量更新 |
| `agent_actions` | 底部按钮（如导出） |

### 自测

- [ ] 草稿更新为什么 **不** 走 `piEventToSse`？  
- [ ] `readyToFinalize` 为 true 时 `AgentAction` 会出现什么？

---

## 功能 5：导出 PRD / 研发附录

### 你在产品上做什么

头部 **「导出」** → 下载 Markdown；可选含研发附录。

### 必读文件

| 文件 | 关注点 |
|------|--------|
| `apps/web/lib/export-prd.ts` | 拼 Markdown |
| `apps/web/app/api/export/dev-appendix/route.ts` | 研发附录 API |
| `packages/agent-runtime/src/generate-dev-appendix.ts` | 后端生成逻辑 |

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| 纯函数 + 字符串拼接 | `buildRequirementPrimaryMarkdown(draft, opts)` | 基 §14 |
| 可选参数对象 | `{ title?, anchor? }` | 基 §4 |
| `export const` 常量 | `EXPORT_PRIMARY_APPENDIX_DIVIDER` | 基 §1.3 |
| 数组 `.map` / `.filter` | 遍历 `draft.items` | JS 基础 |

语法相对简单；重点是读懂 `RequirementDraftState` 各字段含义（功能 4）。

### 自测

- [ ] 导出用的是内存里的 `requirementDraft` 还是重新请求 API？

---

## 功能 6：Java 方法级查代码（研发向）

### 你在产品上做什么

探索模式下问 Java 接口；Agent 调 `list_methods` / `read_method`，不 read 整文件。

### 必读文件

| 文件 | 关注点 |
|------|--------|
| `packages/agent-runtime/src/java-ast-tools.ts` | Pi `defineTool` |
| `packages/ast-tools/src/java/parse.ts` | 解析 Java 源码 |
| `create-session.ts` | `customTools` 注册 |

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| `export function ...(): ToolDefinition[]` | 返回工具数组 | 基 §7 |
| 箭头函数闭包 | `const resolveFile = (p) => resolveJavaFile(workspace, p)` | 基 §15 |
| `interface` 返回值 | `ListMethodsResult`, `JavaMethodInfo` | 基 §2 |
| 泛型外部类型 | `ToolDefinition`（来自 Pi 包） | 基 §12.2 |
| `execute: async (_id, params) =>` | 工具执行体 | 基 §7、§15 |

### 自测

- [ ] `list_methods` 和 `read` 在类型上如何区分？（都在 `toolNames` 里，实现一个在 `customTools`）

---

## 功能 7：创建 Agent（能力总开关）

### 你在产品上做什么

无直接 UI；决定 Agent 能用什么模型、哪些工具、工作目录在哪。

### 必读文件

`packages/agent-runtime/src/create-session.ts`（全文）

### 本功能涉及的语法

| 语法 | 例子 | 去学 |
|------|------|------|
| `interface` 返回值句柄 | `PiSessionHandle` | 基 §2 |
| 可选参数 `options?` | `CreatePiSessionOptions` | 基 §4 |
| 默认参数 | `useTools = true` | 基 §4 |
| `as const` + 三元 + spread | 拼 `piOptions` | 基 §6 |
| 解构赋值 | `const { session, modelFallbackMessage } = await createAgentSession(...)` | 基 §8 |
| 函数属性类型 | `dispose: () => void` | 基 §7.3 |

### 自测

- [ ] `useTools: false` 时 `piOptions` 长什么样？  
- [ ] 什么条件下会注册 `update_requirement_draft`？

---

## 2. 语法 ↔ 功能 反向索引

「我在代码里看到这个，是哪个功能？」

| 语法 / 类型 | 主要出现在功能 |
|-------------|----------------|
| `SseEvent` | 0, 1, 4 |
| `TranscriptItem` | 0, 1, 3 |
| `ChatStreamRequest` | 0, 1, 2, 4 |
| `AgentAnchor` | 0, 2, 4 |
| `ChatMode` | 1, 4 |
| `RequirementDraftState` | 4, 5 |
| `ConversationRecord` | 3 |
| `piEventToSse` / `unknown` | 1 |
| `Extract` / `item is` | 1 |
| `notifyDraftUpdated` | 4 |
| `createPiSession` | 0, 1, 6, 7 |
| `Record<..., string>` | 4 |
| `useRef` + `.current` | 0, 3 |

---

## 3. 四周学习计划（按功能）

| 周 | 功能 | 目标 |
|----|------|------|
| 第 1 周 | 0 + 1 | 能跟完 `send` → `runChat` → `SseEvent`；读懂 `TranscriptItem` |
| 第 2 周 | 2 + 3 | 读懂锚点 JIT；会话 JSON 结构 |
| 第 3 周 | 4 | 读懂草稿旁路与 `RequirementCanvas` |
| 第 4 周 | 5 + 6 + 7 | 导出、Java 工具、`create-session` |

每周配合 [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) 打一轮断点。

---

## 4. 文档导航

| 文档 | 用途 |
|------|------|
| **本文** | 按功能查该学哪些语法 |
| [TYPESCRIPT_FOR_BEGINNERS.md](./TYPESCRIPT_FOR_BEGINNERS.md) | 语法字典（基） |
| [TYPESCRIPT_DEEP_DIVE.md](./TYPESCRIPT_DEEP_DIVE.md) | 事件与进阶（深） |
| [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md) | 模块与目录 |
| [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) | 断点跟读 |

---

*功能与文件以当前仓库为准；语法章节号随基/深文档更新可能略有变化，以文档内标题为准。*
