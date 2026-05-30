# letsTalk 项目 TypeScript 语法导读

> 面向初学者：只讲 **本仓库里真的会出现** 的写法，每条都配上项目里的真实例子。  
> 不必先读完 TypeScript 官方手册；遇到看不懂的代码，用本文当字典查。  
> **按功能学习路线**见 [TYPESCRIPT_BY_FEATURE.md](./TYPESCRIPT_BY_FEATURE.md)（探索 / 锚点 / PRD 等）。

---

## 0. TypeScript 在本项目是干什么的？

TypeScript = JavaScript + **类型标注**。

类型不改变运行结果，主要帮你：

- 编辑器能 **自动补全**、**标红错误**
- 读代码时知道「这个变量里到底有什么字段」

本仓库全部是 TypeScript（`.ts` / `.tsx`），编译或打包后才变成 Node / 浏览器能跑的 JavaScript。

---

## 1. 文件与模块：import / export

### 1.1 为什么 import 路径写 `.js`，文件却是 `.ts`？

```typescript
// packages/agent-runtime/src/run-chat.ts
import { createPiSession } from "./create-session.js";
```

这是 **ESM（ES Module）** 约定：源码写 `.ts`，但 `import` 里写编译后的 `.js`。  
**不用改**，照抄项目风格即可。

### 1.2 `import` 和 `import type`

```typescript
// 运行时真的会加载的代码
import { formatSseData } from "@lets-talk/shared-types";

// 只导入「类型」，编译后会被擦掉，不增加打包体积
import type { ChatStreamRequest } from "@lets-talk/shared-types";
```

| 写法 | 含义 |
|------|------|
| `import { foo }` | 导入函数、常量等 **值** |
| `import type { Foo }` | 只导入 **类型**（interface、type） |
| `import { foo, type Bar }` | 混写（route.ts 里常见） |

### 1.3 `export`

```typescript
export async function runChat(...) { ... }     // 导出函数
export interface RunChatOptions { ... }        // 导出类型
export type { AgentAnchor } from "./anchor.js"; // 转导出类型
```

别的文件才能 `import { runChat } from "..."`。

### 1.4 动态 import（延迟加载）

```typescript
// apps/web/app/api/agent/chat/stream/route.ts
const { runChat } = await import("@lets-talk/agent-runtime");
```

- 普通 `import` 在文件顶部，**一加载就执行**
- `await import(...)` 在 **运行到这一行时** 才加载  
  这里是为了避免 Webpack 把 Pi SDK 打进浏览器包。

---

## 2. interface 和 type：描述「对象长什么样」

### 2.1 `interface`（接口）

描述一个对象的字段：

```typescript
// packages/shared-types/src/index.ts
export interface ChatStreamRequest {
  sessionId: string;      // 必填：字符串
  message: string;
  anchor?: AgentAnchor | null;  // 可选（见下文 ?）
  chatMode?: ChatMode;
}
```

读法：`ChatStreamRequest` 类型的对象 **至少** 要有 `sessionId`、`message`；`anchor` 可以没有。

### 2.2 `type`（类型别名）

可以给联合类型、复杂类型起名字：

```typescript
export type ChatMode = "explore" | "prd";
```

读法：`chatMode` 只能是 `"explore"` 或 `"prd"` 两个字符串之一。

### 2.3 `interface` 和 `type` 用哪个？

在本项目里：

| 场景 | 常用 |
|------|------|
| 普通对象结构 | `interface` |
| 字符串联合、多形态联合 | `type` |
| 继承扩展 | `interface extends` |

不必纠结「绝对正确」，团队已混用，**能读懂即可**。

### 2.4 `extends`（继承）

```typescript
// packages/shared-types/src/conversation.ts
export interface ConversationRecord extends ConversationSummary {
  anchor: AgentAnchor | null;
  items: TranscriptItem[];
  // ... 在 ConversationSummary 基础上多加字段
}
```

`ConversationRecord` = `ConversationSummary` 的所有字段 + 自己的字段。

---

## 3. 基础类型与 `null`

```typescript
sessionId: string;           // 字符串
tokens: number | null;        // 数字 或 null（没有值）
anchor: AgentAnchor | null;   // 对象 或 null
busy: boolean;                // true / false
```

### `null` vs `undefined`

| | 含义 | 本项目例子 |
|---|------|-----------|
| `null` | 故意表示「没有」 | `anchor: null` 表示没选锚点 |
| `undefined` | 没传、没赋值 | 可选字段 `anchor?` 省略时 |

代码里常见：

```typescript
anchor: body.anchor ?? null,   // 如果是 undefined，改成 null
```

`??` 叫 **空值合并**：左边是 `null` 或 `undefined` 时才用右边（见 §9）。

---

## 4. 可选属性 `?`

```typescript
anchor?: AgentAnchor | null;
chatMode?: ChatMode;
```

- `anchor?`：调用时可以 **不写** `anchor` 这个 key
- 和 `anchor: AgentAnchor | null` 不同：后者 key 必须存在，值可以是 `null`

函数参数也同理：

```typescript
export async function createPiSession(
  cwd: string,
  useTools = true,              // 默认值 true，可不传
  options?: CreatePiSessionOptions,  // 整个参数可不传
)
```

---

## 5. 联合类型 `|`（「或」）

```typescript
type ChatMode = "explore" | "prd";

const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");
```

表示：**只能是列出的几种之一**。

### 5.1 可辨识联合（项目里非常重要）

多个「形状不同」的对象用 **同一个字段** 区分，叫 **可辨识联合（discriminated union）**。

**例子 1：SSE 事件**

```typescript
// packages/shared-types/src/index.ts
export type SseEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "tool_start"; callId: string; tool: string }
  | { type: "turn_end" }
  | { type: "error"; code: string; message: string };
  // ... 还有更多
```

每个对象都有 `type` 字段，值不同则 **其它字段也不同**。

前端处理时：

```typescript
// apps/web/app/page.tsx（简化）
if (event.type === "assistant_delta") {
  appendAssistantDelta(event.text, snapshot);  // 这里 TS 知道有 text
} else if (event.type === "tool_start") {
  lastToolName.current = event.tool;           // 这里 TS 知道有 tool
}
```

**读代码技巧**：先看 `event.type` 或 `item.kind`，再知道后面有哪些字段。

**例子 2：Transcript 一条记录**

```typescript
export type TranscriptItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; tool: string; preview: string; ok: boolean };
```

---

## 6. 字面量类型与 `as const`

### 6.1 字面量类型

```typescript
thinkingLevel: "off" as const,
noTools: "all" as const,
```

`"off"` 不是任意 string，而是 **只能是这个字符串**。

### 6.2 `as const` 用在数组上

```typescript
const READONLY_TOOLS = [
  "read",
  "grep",
  "find",
] as const;
```

整个数组变成 **只读 + 元素类型固定**，不能 push 别的字符串。

### 6.3 展开进新数组

```typescript
const toolNames: string[] = [
  ...READONLY_TOOLS,   // 把 READONLY_TOOLS 里每一项展开进来
  ...(draftTools.length ? (["update_requirement_draft"] as const) : []),
];
```

`...` 叫 **展开运算符（spread）**：把数组或对象「摊平」拷贝进新的。

对象展开：

```typescript
const piOptions = {
  cwd: workspace,
  authStorage,
  ...(useTools
    ? { tools: toolNames, customTools: [...] }
    : { noTools: "all" as const }),
};
```

含义：如果 `useTools` 为真，对象里 **多** `tools` 和 `customTools` 字段；否则多 `noTools` 字段。

---

## 7. `Record`、数组、函数类型

### 7.1 数组

```typescript
items: TranscriptItem[];
tools: ToolDefinition[];
```

等价于「元素类型为 X 的数组」。

### 7.2 `Record<键类型, 值类型>`

```typescript
export const REQUIREMENT_FIELD_LABELS: Record<RequirementFieldKey, string> = {
  page: "在哪个页面",
  control: "改哪里",
  // 每个 RequirementFieldKey 都必须有一个 string
};
```

读法：一个对象，key 是 `RequirementFieldKey`，value 是 `string`。

### 7.3 函数类型

```typescript
// 字段类型是「函数」
dispose: () => void;                    // 无参，无返回值
getAnchorRef?: () => string | null;     // 无参，返回 string 或 null

// 参数是回调
onEvent: (event: SseEvent) => void;     // 接收一个 SseEvent，无返回
```

`void` = 「不关心返回值」，不是返回 `undefined` 的意思那么简单，表示 **副作用函数**。

### 7.4 `Promise` 与 `async` / `await`

```typescript
export async function runChat(options: RunChatOptions): Promise<void> {
  const handle = await getOrCreatePiHandle(...);
  await session.prompt(userText);
}
```

| 关键字 | 含义 |
|--------|------|
| `async` | 函数里可以用 `await`，返回值自动包成 `Promise` |
| `await` | 等待异步完成，得到结果 |
| `Promise<void>` | 异步函数，完成后不返回有用值 |

没有 `async` 不能写 `await`。

---

## 8. 解构赋值

从对象/数组里 **拆出** 变量：

```typescript
const { session, modelLabel } = handle;
const { runChat } = await import("@lets-talk/agent-runtime");

const { session, modelFallbackMessage } = await createAgentSession(piOptions);
```

数组解构：

```typescript
const [sessionId, setSessionId] = useState("");
// 等价于：useState 返回 [值, 改值的函数]
```

---

## 9. 三元运算符 `? :` 与 `??`

### 9.1 三元 `条件 ? A : B`

```typescript
const userText = prefix.trim()
  ? `${prefix}\n\n${options.message}`
  : options.message;

const memoryTools = ENABLE_MEMORY_TOOLS ? createMemoryTools(workspace) : [];
```

等于简写的 if/else **表达式**（有值）。

### 9.2 空值合并 `??`

```typescript
chatMode: body.chatMode ?? "explore",
getAnchorRef: options.getAnchorRef ?? (() => null),
```

仅当左边是 `null` 或 `undefined` 时用右边。  
注意：和 `||` 不同，`0` 或 `""` 不会触发 `??`。

### 9.3 可选链 `?.`

```typescript
const apiKey = process.env.LLM_API_KEY?.trim();
if (!body.message?.trim()) { ... }

return anchor?.ref?.trim() || null;
```

左边是 `null` / `undefined` 时，整条表达式短路为 `undefined`，**不报错**。

---

## 10. 类型断言 `as`

告诉编译器：「我确定这个值是什么类型」。

```typescript
body = (await request.json()) as ChatStreamRequest;
event = JSON.parse(payload) as SseEvent;
return JSON.parse(raw) as AgentAnchor;
```

`as` **不做运行时检查**，只是编译期相信。JSON 解析错了，运行时仍可能炸。

和 `as const` 不同：

| 写法 | 作用 |
|------|------|
| `as ChatStreamRequest` | 断言成某个类型 |
| `as const` | 把值收窄成最窄的字面量类型 |

---

## 11. `unknown` 与错误处理

```typescript
.catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
})
```

`catch` 里推荐用 `unknown` 而不是 `any`：  
先判断是不是 `Error`，再取 `.message`。

`piEvent: unknown` 同理：从外面来的事件先当「不知道类型」，再自己判断 `e.type`。

---

## 12. `Map`、泛型入门

### 12.1 `Map`

```typescript
const sessions = new Map<string, PiSessionHandle>();
sessions.set(sessionId, handle);
let handle = sessions.get(sessionId);
```

键值对容器；`Map<string, PiSessionHandle>` 表示 key 是 string，value 是 `PiSessionHandle`。

### 12.2 泛型 `<T>`（泛型参数）

```typescript
useState<TranscriptItem[]>([]);
useState<AgentAnchor | null>(null);
useRef<HTMLDivElement | null>(null);
```

`useState` 后面尖括号里写 **状态里存什么类型**。

```typescript
new Map<string, PiSessionHandle>()
```

尖括号里是 Map 的 key、value 类型。

**初学者记法**：看到 `<...>`，就是「把类型填进模板里」。

### 12.3 `Parameters<typeof fn>`

```typescript
const enqueue = (event: Parameters<typeof formatSseData>[0]) => { ... };
```

含义：`formatSseData` 的第一个参数类型是什么，就让 `event` 是什么。  
不用手写两遍类型，和 `formatSseData` 保持同步。

---

## 13. React / 前端特有（`page.tsx`）

### 13.1 `"use client"`

文件第一行：这是 **客户端组件**，能在浏览器里用 `useState`、`fetch` 等。

### 13.2 `useState`

```typescript
const [input, setInput] = useState("");
const [items, setItems] = useState<TranscriptItem[]>([]);
```

- `input`：当前值
- `setInput`：更新值的函数
- 更新后组件会 **重新渲染**

### 13.3 `useRef`

```typescript
const assistantBuf = useRef("");
assistantBuf.current += delta;
```

`.current` 里存可变值，**改它不会触发重新渲染**。  
适合流式拼接、在回调里读「最新 sessionId」等。

### 13.4 `useCallback`

```typescript
const send = useCallback(async () => {
  // ...
}, [appendAssistantDelta, busy, input, persistCurrent]);
```

包一层函数，避免每次渲染都创建新函数；依赖数组里列的变量变了才重建。

### 13.5 内联对象类型

```typescript
const [workspace, setWorkspace] = useState<{
  root: string | null;
  front: string | null;
  back: string | null;
}>({ root: null, front: null, back: null });
```

没单独起 interface 名，直接写在 `useState<...>` 里。

---

## 14. 模板字符串

```typescript
return `data: ${JSON.stringify(event)}\n\n`;
const userText = `${prefix}\n\n${options.message}`;
modelLabel: `${model.provider}/${model.id}`,
```

反引号 `` ` `` 里用 `${表达式}` 插值；`\n` 是换行。

---

## 15. 箭头函数

```typescript
const resolveFile = (filePath: string) => resolveJavaFile(workspaceRoot, filePath);

session.subscribe((piEvent: unknown) => { ... });

getAnchorRef: () => liveAnchorRefs.get(sessionId) ?? null,
```

`(参数) => 表达式` 或 `(参数) => { 多行 }`，常用来写 **短函数** 和 **回调**。

---

## 16. `void` 前缀：故意不等待 Promise

```typescript
void persistDraft(cwd, options.sessionId, draft);
```

表示「这个 Promise 我 **故意不 await**」，避免 ESLint 报「浮动的 Promise」。

---

## 17. 读本项目代码的「解码顺序」

拿到一段 TS，按这个顺序读：

1. **import**：依赖从哪来  
2. **export 的函数/类型**：这个文件对外提供什么  
3. **参数类型**：输入长什么样（看 `interface` / `type`）  
4. **返回值类型**：`Promise<X>` 或 `: X`  
5. **函数体**：业务逻辑  
6. 遇到 `event.type` / `item.kind`：查联合类型有哪些分支  

---

## 18. 按文件查：你会经常遇到的语法

| 你想懂… | 打开 | 重点看 |
|---------|------|--------|
| SSE 事件有哪些 | `packages/shared-types/src/index.ts` | `SseEvent` 联合类型 |
| 请求体字段 | 同上 | `ChatStreamRequest` |
| 对话记录一条 | `packages/shared-types/src/conversation.ts` | `TranscriptItem` |
| 需求清单结构 | `packages/shared-types/src/requirement-draft.ts` | `RequirementDraftState` |
| 创建 Agent | `packages/agent-runtime/src/create-session.ts` | `as const`、spread、`?` |
| 跑一轮对话 | `packages/agent-runtime/src/run-chat.ts` | `async`、`Map`、回调 |
| HTTP + 动态 import | `apps/web/app/api/agent/chat/stream/route.ts` | `as`、`Parameters<typeof>` |
| 前端发消息 | `apps/web/app/page.tsx` | `useState`、`useRef`、`as SseEvent` |
| JIT 上下文 | `packages/context/src/types.ts` | `interface` 可选字段 `?` |

---

## 19. 小练习（对照代码读）

1. 在 `SseEvent` 里找：哪种 `type` 带 `text` 字段？哪种带 `tool`？  
2. 在 `create-session.ts` 里找：`useTools` 为 `false` 时 `piOptions` 比 `true` 时 **少** 哪些字段？（提示：spread + 三元）  
3. 在 `route.ts` 里：`body.chatMode ?? "explore"` 如果请求没传 `chatMode` 会得到什么？  
4. 在 `page.tsx` 里：`event.type === "assistant_delta"` 之后为什么能安全访问 `event.text`？

---

## 20. 相关文档

| 文档 | 内容 |
|------|------|
| [TYPESCRIPT_BY_FEATURE.md](./TYPESCRIPT_BY_FEATURE.md) | **按功能学语法**（推荐入口） |
| [TYPESCRIPT_DEEP_DIVE.md](./TYPESCRIPT_DEEP_DIVE.md) | **进阶**：Pi/SSE/Transcript 事件、Extract、类型谓词 |
| [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md) | 项目结构与请求链路 |
| [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) | 用断点跟读代码 |
| [TypeScript 官方手册（中文）](https://www.typescriptlang.org/zh/docs/) | 系统学习时查阅 |

---

*本文随仓库代码更新；行号与文件名以当前 `packages/`、`apps/` 为准。*
