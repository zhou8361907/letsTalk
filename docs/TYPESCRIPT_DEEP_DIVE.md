# letsTalk 进阶导读：事件体系与深层 TypeScript

> 接续 [TYPESCRIPT_FOR_BEGINNERS.md](./TYPESCRIPT_FOR_BEGINNERS.md)。  
> 本文重点：**事件从哪来、到哪去**，以及读代码时常见的「高级但本项目里很常用」的 TS 写法。  
> **按功能查语法**见 [TYPESCRIPT_BY_FEATURE.md](./TYPESCRIPT_BY_FEATURE.md)。

---

## 1. 先建立全景：三层「事件」

读 letsTalk 时最容易晕的是：**名字都叫 event，其实不是一回事**。

```text
┌─────────────────────────────────────────────────────────────────┐
│ 第 1 层：Pi SDK 内部事件（npm 包，类型不完整，常当 unknown）      │
│   message_update / tool_execution_start / tool_execution_end …   │
└────────────────────────────┬────────────────────────────────────┘
                             │ piEventToSse()  只映射一部分
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 第 2 层：SseEvent（shared-types，服务端 → 浏览器，走 HTTP SSE）   │
│   assistant_delta / tool_start / requirement_state / turn_end …  │
└────────────────────────────┬────────────────────────────────────┘
                             │ page.tsx 解析 JSON
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 第 3 层：UI 状态（React state + TranscriptItem 持久化）          │
│   items[] / requirementDraft / agentActions                      │
└─────────────────────────────────────────────────────────────────┘
```

还有 **第 1.5 层旁路**（不经过 Pi 事件）：

```text
update_requirement_draft 工具
  → notifyDraftUpdated
  → onDraftUpdated
  → 直接 onEvent({ type: "requirement_state" })
```

**记忆口诀**：Pi 说话用 `subscribe`；我们对外说话用 `onEvent(SseEvent)`；网页记下来用 `TranscriptItem` + `useState`。

---

## 2. `SseEvent` 完整字典（第二层）

定义在 `packages/shared-types/src/index.ts`。  
线上格式：一行 `data: ${JSON.stringify(event)}\n\n`。

### 2.1 一轮 explore 对话里典型顺序

```text
session          → 本轮开始（模型名、cwd）
context_usage    → prompt 前 token 占用
context          → JIT 摘要（mode、锚点、预览行数）
assistant_delta  → 多次，流式文本碎片
tool_start       → 可选，每次工具开始
tool_output      → 可选，每次工具结束
context_usage    → prompt 后 token 占用
turn_end         → 本轮正常结束
```

### 2.2 每个分支字段说明

| `type` | 谁发出 | 前端主要干什么 |
|--------|--------|----------------|
| `session` | `run-chat.ts` 阶段 2 | 一般可忽略展示 |
| `context_usage` | `emitContextUsage` | 头部显示 token 百分比 |
| `context` | `buildAgentContext` 后 | 往 Transcript 插一条 `kind:"context"` |
| `assistant_delta` | `piEventToSse` | 拼接到助手气泡 |
| `tool_start` | `piEventToSse` | Transcript 加工具块「执行中…」 |
| `tool_output` | `piEventToSse` | 更新工具块 preview |
| `turn_end` | `run-chat.ts` prompt 后 | 刷新需求草稿等 |
| `requirement_state` | `emitDraftEvents` | `setRequirementDraft` |
| `agent_actions` | `emitDraftEvents` | `setAgentActions`（导出按钮等） |
| `error` | `route.ts` catch | 显示错误气泡 |

### 2.3 TypeScript 如何表达「看 type 就知道有哪些字段」

```typescript
export type SseEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "tool_start"; callId: string; tool: string; argsSummary?: string }
  | { type: "turn_end" }
  // ...
```

这叫 **可辨识联合（discriminated union）**，`type` 是 **辨识字段（discriminant）**。

前端处理模式（`page.tsx`）：

```typescript
if (event.type === "assistant_delta") {
  // TS 自动知道：此处 event 一定有 text，没有 tool
  appendAssistantDelta(event.text, snapshot);
} else if (event.type === "tool_start") {
  // 此处 event 一定有 tool、callId
  lastToolName.current = event.tool;
}
```

**如果你写 `event.text` 但没先判断 type，编译器会报错**——这是在保护你。

### 2.4 `context_usage` 的巧妙写法：对象展开

```typescript
// run-chat.ts
emitContextUsage(session, (snap) => {
  options.onEvent({ type: "context_usage", ...snap });
});
```

`ContextUsageSnapshot` 是：

```typescript
{ tokens: number | null; contextWindow: number; percent: number | null }
```

展开后等价于：

```typescript
{
  type: "context_usage",
  tokens: snap.tokens,
  contextWindow: snap.contextWindow,
  percent: snap.percent,
}
```

**读法**：把 `snap` 里所有字段 **抄进** 新对象，再额外加 `type`。

### 2.5 内联 `import()` 类型（延迟引用）

```typescript
| { type: "requirement_state"; draft: import("./requirement-draft.js").RequirementDraftState }
```

含义：在 **类型位置** 引用另一个文件的类型，避免循环 import。  
你读代码时把它当成 `RequirementDraftState` 即可。

---

## 3. 第一层：Pi 事件 → `piEventToSse`

Pi 事件 **没有** 放进 `shared-types`（来自外部 SDK，形状可能变）。  
桥接函数在 `run-chat.ts`：

```typescript
function piEventToSse(event: unknown): SseEvent | null {
  const e = event as Record<string, unknown>;

  if (e.type === "message_update") {
    const inner = e.assistantMessageEvent as { type?: string; delta?: string };
    if (inner?.type === "text_delta" && inner.delta) {
      return { type: "assistant_delta", text: inner.delta };
    }
    return null;  // 其它 message_update 子类型：忽略
  }
  // tool_execution_start → tool_start
  // tool_execution_end → tool_output
  return null;  // 未映射的 Pi 事件：丢弃
}
```

### 3.1 为什么入口是 `unknown`？

Pi 推来的 `piEvent` 在边界上 **不可信**。流程：

1. 先声明 `unknown`（「我不知道类型」）
2. `as Record<string, unknown>` 当成「有字符串 key 的对象」
3. 用 `e.type === "..."` **手动收窄**
4. 转成我们 **自己的** `SseEvent` 才交给前端

这是 **边界层（boundary）** 常见写法：外部数据 → 内部类型。

### 3.2 映射表

| Pi `e.type` | 条件 | → `SseEvent` |
|-------------|------|--------------|
| `message_update` | 内层 `text_delta` | `assistant_delta` |
| `tool_execution_start` | — | `tool_start` |
| `tool_execution_end` | — | `tool_output` |
| 其它 | — | `null`（不推送） |

### 3.3 `subscribe` 里同一条 Pi 事件走两条路

```typescript
session.subscribe((piEvent: unknown) => {
  // 路 A：调试日志（LETS_TALK_DEBUG）
  if (e.type === "message_update") { debugAssistant += ... }
  if (e.type === "tool_execution_start") { debugTools.push(...) }

  // 路 B：推给浏览器
  const sse = piEventToSse(piEvent);
  if (sse) options.onEvent(sse);
});
```

**同一次工具调用**：日志记完整 preview（8000 字），SSE 只发 2000 字（`piEventToSse` 里 `slice`）。

---

## 4. 旁路事件：需求草稿（不经过 Pi subscribe）

```typescript
// 工具里
notifyDraftUpdated(sessionId, draft);

// requirement-draft-runtime.ts
listeners.get(sessionId)?.(draft);  // 可选链：没 listener 就不调用

// run-chat.ts 里注册的 listener
const onDraftUpdated = (draft: RequirementDraftState) => {
  emitDraftEvents(draft, options.onEvent);
  void persistDraft(...);
};

function emitDraftEvents(draft, onEvent) {
  onEvent({ type: "requirement_state", draft });
  onEvent({ type: "agent_actions", actions: buildAgentActions(draft) });
}
```

一次工具更新 → **两条** SSE：`requirement_state` + `agent_actions`。

TypeScript 里 `DraftListener` 是类型别名：

```typescript
type DraftListener = (draft: RequirementDraftState) => void;
```

和 `onEvent: (event: SseEvent) => void` 是 **同一类东西**：函数类型的参数。

---

## 5. 第三层：`TranscriptItem` 与展示用扩展

### 5.1 持久化结构（和 SSE 不是一一对应）

```typescript
export type TranscriptItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; tool: string; preview: string; ok: boolean }
  | { kind: "context"; mode: string; anchorRef: string | null; previewLines: number };
```

辨识字段是 **`kind`**（不是 `type`）。

| 来源 | 如何变成 TranscriptItem |
|------|-------------------------|
| 用户点发送 | 直接 `push { kind:"user", text }` |
| 多个 `assistant_delta` | 在内存里拼成一条 `assistant` |
| `tool_start` + `tool_output` | 合成一条 `tool` |
| SSE `context` | `push { kind:"context", ... }` |

**SSE 是流式的；Transcript 是「整理后的历史」**。

### 5.2 `Extract`：从联合类型里「抠」出一种

```typescript
// apps/web/lib/group-transcript.ts
export type ToolTranscriptItem = Extract<TranscriptItem, { kind: "tool" }>;
```

读法：从 `TranscriptItem` 里 **只保留** `kind` 为 `"tool"` 的那一种。  
结果等价于 `{ kind: "tool"; tool: string; preview: string; ok: boolean }`。

### 5.3 扩展联合：展示专用类型

```typescript
export type ToolGroupItem = {
  kind: "tool_group";
  tools: ToolTranscriptItem[];
};

export type DisplayTranscriptItem = TranscriptItem | ToolGroupItem;
```

持久化里没有 `tool_group`；只在 **UI 渲染前** `groupTranscriptForDisplay` 把相邻 tool 合并。

### 5.4 类型谓词（type predicate）`item is X`

```typescript
export function isToolGroup(item: DisplayTranscriptItem): item is ToolGroupItem {
  return item.kind === "tool_group";
}
```

调用后 TypeScript **知道** item 是 `ToolGroupItem`：

```tsx
{displayItems.map((item, i) => (
  isToolGroup(item) ? (
    <details>...</details>   // 这里 item.tools 有类型提示
  ) : (
    <div className={`bubble ${item.kind}`}>  // 这里 item 是 TranscriptItem
```

**自己写 `isXxx` 函数 + `item is Xxx` 返回值**，是本项目里比 `as` 更安全的收窄方式。

---

## 6. 回调链：从 `runChat` 到浏览器

把类型串起来看：

```typescript
// run-chat.ts
onEvent: (event: SseEvent) => void

// route.ts
const enqueue = (event: Parameters<typeof formatSseData>[0]) => { ... }
// Parameters<typeof formatSseData>[0] 就是 formatSseData 的第一个参数类型 = SseEvent

runChat({ ..., onEvent: enqueue })

// page.tsx（无类型标注，但逻辑上）
const event = JSON.parse(payload) as SseEvent;
```

数据流：

```text
options.onEvent(sse)     // run-chat
  → enqueue(sse)         // route
  → formatSseData(sse)   // 变字符串
  → ReadableStream       // HTTP
  → fetch + reader       // page
  → JSON.parse → SseEvent
```

---

## 7. `AgentAnchor`：多形态对象（无 discriminant 收窄时）

```typescript
kind: "vue" | "java" | "route" | "file" | "menu";
```

很多字段 **只有菜单才有**（`menuId`、`menuUrl`…）。  
TypeScript **不会** 在你写 `if (anchor.kind === "menu")` 后自动删掉其它 kind 的字段检查（除非你用更严格的联合定义）。

`build-context.ts` 里的分支：

```typescript
if (anchor.kind === "menu" || anchor.kind === "route") {
  // 拼菜单预览文本
} else {
  // readAnchorPreview 读文件
}
```

**读代码**：先看 `kind`，再想「这类锚点有哪些可选字段」。

---

## 8. 需求清单：嵌套联合与状态机

### 8.1 三层结构

```text
RequirementDraftState
  └── items: RequirementItem[]
        └── fields: RequirementField[]
```

### 8.2 多个「小枚举」

```typescript
RequirementItemType   = "modify" | "add" | "unknown"
RequirementItemStatus = "draft" | "ready" | "blocked" | "conflict"
RequirementFieldStatus = "ok" | "missing" | "pending" | "conflict"
```

`pmItemStatus` 用 `Record` 当查找表：

```typescript
const map: Record<RequirementItemStatus, { icon: string; label: string }> = {
  ready: { icon: "🟢", label: "信息较完整" },
  draft: { icon: "🟡", label: "还缺一些信息" },
  // ...
};
return map[item.status] ?? { icon: "🟡", label: "整理中" };
```

`Record<键联合, 值类型>` + `??` 默认值：读表式分支，比一长串 if 清晰。

### 8.3 `version: 1` 字面量类型

```typescript
export interface RequirementDraftState {
  version: 1;  // 不是 number，只能是 1
}
```

以后若数据结构大变，可改成 `version: 2`，用版本做迁移。

### 8.4 `AgentAction` 与 `readyToFinalize`

```typescript
if (!draft?.readyToFinalize || draft.items.length === 0) {
  return [];
}
```

`draft?.`：draft 是 `null` 时整句短路，不访问 `.readyToFinalize`。

---

## 9. `AgentContext`：JIT 与 `chat_mode` 双维度

```typescript
mode: "explore" | "focused";   // 有没有锚点（检索范围）
chat_mode: ChatMode;            // explore | prd（对话目的）
```

二维组合示例：

| anchor | chat_mode | 效果 |
|--------|-----------|------|
| 无 | explore | 全库查代码 |
| 有 | explore | 聚焦锚点 + 查代码 |
| 有 | prd | 聚焦 + 写需求 + 草稿工具 |

`BuildAgentContextInput` 里可选字段 + 默认：

```typescript
chatMode?: ChatMode;  // 不传则在 buildAgentContext 里当 "explore"
```

---

## 10. 其它深层写法速查

### 10.1 `Parameters<typeof fn>[N]`

```typescript
(event: Parameters<typeof formatSseData>[0])
```

提取函数第 N 个参数的类型，避免重复写 `SseEvent`。

### 10.2 `Pick` / `Omit` / `Partial`（本项目较少，但值得知）

若看到：

```typescript
type Foo = Pick<Bar, "a" | "b">;     // 只要 Bar 的部分字段
type Baz = Omit<Bar, "c">;           // 去掉某些字段
type Qux = Partial<Bar>;             // 全部变可选
```

### 10.3 `satisfies`（若将来出现）

```typescript
const x = { ... } satisfies SomeType;
```

既检查类型，又 **保留字面量窄类型**；本仓库目前几乎未用。

### 10.4 Pi 工具参数：TypeBox

```typescript
import { Type } from "@sinclair/typebox";

const filePathParam = Type.Object({
  filePath: Type.String({ description: "..." }),
});
```

运行时给 Agent 的 JSON Schema；和 TS 的 `interface` 是 **两套**（一套给模型看，一套给编译器看）。

### 10.5 `ReadableStream` 与泛型回调

```typescript
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode(...));
  },
});
```

`controller` 类型由 TS 推断；`enqueue` 只接受 `Uint8Array`。

### 10.6 `instanceof` 收窄

```typescript
err instanceof Error ? err.message : String(err)
```

`unknown` 的错误对象：先判断是不是 `Error` 再取 `.message`。

### 10.7 `Map` + 泛型 + 可选链

```typescript
const listeners = new Map<string, DraftListener>();
listeners.get(sessionId)?.(draft);
```

`get` 可能 `undefined`，`?.` 表示「有就调用」。

### 10.8 `useRef` 保存「最新值」给闭包用

```typescript
const chatModeRef = useRef<ChatMode>("explore");
chatModeRef.current = chatMode;

// send() 回调里读 chatModeRef.current，避免闭包抓到旧的 chatMode
```

React 里异步回调（`fetch` 流式读）常用此模式。

---

## 11. 自己跟读一轮：建议 Watch 的表达式

在 `run-chat.ts` 的 `session.prompt` 前断点：

| 表达式 | 看什么 |
|--------|--------|
| `options.chatMode` | explore 还是 prd |
| `ctx.mode` / `ctx.chat_mode` | JIT 两维度 |
| `userText.slice(0, 500)` | 上下文前缀 |
| `options.message` | 用户原话 |

在 `subscribe` 里条件断点 `sse?.type === 'tool_start'`：

| 表达式 | 看什么 |
|--------|--------|
| `e.toolName` | Pi 侧工具名 |
| `sse` | 映射后的 SseEvent |

在 `page.tsx` 解析后：

| 表达式 | 看什么 |
|--------|--------|
| `event.type` | 当前 SSE 分支 |
| `snapshot.length` | Transcript 条数 |

---

## 12. 常见困惑 FAQ

### Q：`SseEvent` 和 `TranscriptItem` 为什么要两套？

- **SSE**：实时、细粒度（每个 delta 一条）
- **Transcript**：展示/持久化、粗粒度（助手全文一条）

### Q：为什么 `requirement_state` 不在 `piEventToSse` 里？

草稿更新来自 **我们自己的工具**，不是 Pi 内置事件；走 `notifyDraftUpdated` 旁路。

### Q：`as SseEvent` 安全吗？

`JSON.parse` 后断言 **不验证** 运行时形状。生产环境若担心，可写 **类型守卫**：

```typescript
function isSseEvent(x: unknown): x is SseEvent {
  return typeof x === "object" && x !== null && "type" in x;
}
```

本项目为简便在 `page.tsx` 用了 `as`。

### Q：`turn_end` 之后还能收到事件吗？

正常不应；若工具回调晚于 `turn_end`，`route.ts` 的 `enqueue` 用 try/catch 忽略已关闭的流。

---

## 13. 文档地图

| 文档 | 适合 |
|------|------|
| [TYPESCRIPT_FOR_BEGINNERS.md](./TYPESCRIPT_FOR_BEGINNERS.md) | `?`、`async`、基础联合 |
| **本文** | 事件流、`Extract`、类型谓词、边界层 |
| [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) | 断点跟读 |
| [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md) | 目录与模块 |

---

## 14. 练习（进阶）

1. 画出一次 `grep` 工具调用在 **Pi → SseEvent → TranscriptItem** 上的字段变化。  
2. 在 `SseEvent` 里数：哪些分支带 `callId`？哪些带 `draft`？  
3. 读 `group-transcript.ts`：`Extract` 和 `item is ToolGroupItem` 分别解决什么问题？  
4. PRD 模式下，`requirement_state` 和 `assistant_delta` 谁先谁后？（提示：工具可在 assistant 还在流式时触发）

---

*与 `packages/shared-types`、`run-chat.ts`、`page.tsx` 当前实现一致。*
