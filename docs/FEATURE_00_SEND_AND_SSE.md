# 功能 0 详解：发消息 + SSE 流式回复

> 专门讲「点发送 → 看到字一个个出来」这一条链路。  
> 其它功能（锚点、PRD、会话）都 **复用** 这条链路，只是请求体多几个字段、SSE 多几种 `type`。

相关文档：[TYPESCRIPT_BY_FEATURE.md](./TYPESCRIPT_BY_FEATURE.md) · [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) · [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md)

---

## 1. 用生活比喻理解

| 普通网页请求 | letsTalk 发消息 |
|--------------|-----------------|
| 你点外卖，等很久，**一次性** 送来一整份 | 你点外卖，骑手 **一路播报**：「已接单」「正在做」「出餐了」 |
| HTTP：请求一次，响应 **一整块 JSON** | **SSE**：连接不断开，服务器 **连续推很多条小消息** |

letsTalk 里：

- **浏览器** = 你（听播报的人）
- **`POST /api/agent/chat/stream`** = 电话线（一直保持畅通）
- **每一条 `data: {...}`** = 一句播报（一个 `SseEvent`）
- **`runChat` + Pi** = 厨房（真正干活的地方）

---

## 2. 总览：四个角色、一条水管

```text
┌──────────────┐     POST JSON      ┌─────────────────────┐
│  page.tsx    │ ─────────────────► │  route.ts           │
│  send()      │                    │  POST /api/.../stream│
└──────┬───────┘                    └──────────┬──────────┘
       │                                       │
       │  fetch 读流                           │ runChat({ onEvent: enqueue })
       │  解析 data: ...                       ▼
       │                              ┌─────────────────────┐
       │ ◄──── SSE 多行 data: ────────│  run-chat.ts        │
       │                              │  options.onEvent()  │
       │                              └──────────┬──────────┘
       │                                         │
       │                                         ▼
       │                              ┌─────────────────────┐
       │                              │  Pi AgentSession    │
       │                              │  prompt + subscribe │
       └──────────────────────────────┴─────────────────────┘
```

**你只要记住**：

1. 前端只认识 **`SseEvent`**（`type` + 各字段）
2. 服务端 **`onEvent` 每调一次** = 往水管里塞一条
3. `route.ts` 的 **`enqueue`** 把 `SseEvent` 变成字符串 `data: ...\n\n`
4. 前端 **`reader.read()`** 循环读，按行 `JSON.parse`

---

## 3. 第一步：浏览器发出去什么？

文件：`apps/web/app/page.tsx`，函数 `send()`。

### 3.1 发送前检查

```typescript
const text = input.trim();           // 输入框里的字
const sid = sessionIdRef.current;    // 当前会话 id（UUID）
if (!text || busy || !sid) return;   // 没字、正在生成、没会话 → 不发
```

### 3.2 立刻更新 UI（不等服务器）

```typescript
setInput("");                        // 清空输入框
setBusy(true);                       // 禁用发送按钮
assistantBuf.current = "";           // 清空「助手回复缓冲区」

const snapshot = [...itemsRef.current, { kind: "user", text }];
setItems(snapshot);                  // 对话区先显示用户这条
```

这里用的是 **`TranscriptItem`**（持久化用的历史结构），不是 `SseEvent`。  
用户话 **只出现一次**，不会从 SSE 里再来。

### 3.3 `fetch` 请求体（`ChatStreamRequest`）

```409:417:apps/web/app/page.tsx
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
```

JSON 长这样（示例）：

```json
{
  "sessionId": "a1b2c3d4-....",
  "message": "这个项目是做什么的？",
  "anchor": null,
  "chatMode": "explore"
}
```

| 字段 | 含义 |
|------|------|
| `sessionId` | 哪一场对话（新建会话时 API 返回的 UUID） |
| `message` | **你打的原话**（不含后面的 JIT 上下文） |
| `anchor` | 左侧选的锚点；`null` = 全库探索 |
| `chatMode` | `"explore"` 或 `"prd"` |

类型定义在 `packages/shared-types/src/index.ts` 的 `ChatStreamRequest`。

### 3.4 如果 HTTP 状态码不是 200

```420:423:apps/web/app/page.tsx
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
```

例如没配 `LLM_API_KEY` 会 **503 + JSON**，**不是** SSE 流。  
只有 `res.ok === true` 才会继续读流。

---

## 4. 第二步：API 接到请求后干什么？

文件：`apps/web/app/api/agent/chat/stream/route.ts`。

### 4.1 校验 body

```18:33:apps/web/app/api/agent/chat/stream/route.ts
export async function POST(request: Request) {
  let body: ChatStreamRequest;
  try {
    body = (await request.json()) as ChatStreamRequest;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }

  if (!body.sessionId || !body.message?.trim()) {
    return Response.json({ error: "需要 sessionId 和 message" }, { status: 400 });
  }

  if (!process.env.LLM_API_KEY) {
    return Response.json({ error: "未配置 LLM_API_KEY（.env）" }, { status: 503 });
  }
```

### 4.2 动态加载 `runChat`

```38:42:apps/web/app/api/agent/chat/stream/route.ts
  const { runChat } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );
```

Pi 相关代码 **不能** 在网页里跑，所以放在 `agent-runtime` 包，运行时再 `import`。

### 4.3 核心：造一根「水管」`ReadableStream`

```44:73:apps/web/app/api/agent/chat/stream/route.ts
  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (event: Parameters<typeof formatSseData>[0]) => {
        if (controller.desiredSize === null) return;
        try {
          controller.enqueue(encoder.encode(formatSseData(event)));
        } catch {
          // 流已关闭时忽略
        }
      };

      runChat({
        sessionId: body.sessionId,
        message: body.message.trim(),
        anchor: body.anchor ?? null,
        chatMode: body.chatMode ?? "explore",
        useTools: true,
        onEvent: enqueue,
      })
        .catch(...)
        .finally(() => controller.close());
    },
  });
```

**关键绑定**：

```text
runChat 里每次 options.onEvent(某个 SseEvent)
    = route 里的 enqueue(同一个 event)
    = formatSseData 变成一行字符串
    = 塞进 HTTP 响应流
```

`enqueue` 的类型和 `SseEvent` 相同（通过 `Parameters<typeof formatSseData>[0]` 推导）。

### 4.4 返回响应头

```75:80:apps/web/app/api/agent/chat/stream/route.ts
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
```

`text/event-stream` 告诉浏览器：这是 **SSE**，请用流式读，不要等整包 JSON。

---

## 5. 第三步：`runChat` 里何时调用 `onEvent`？

文件：`packages/agent-runtime/src/run-chat.ts`。

`onEvent` 就是 **route.ts 传进来的 `enqueue`**。

### 5.1 时间线（一轮 explore 对话）

```text
时间 ─────────────────────────────────────────────────────────────►

onEvent({ type: "session" })           ← 告诉你用的模型、cwd
onEvent({ type: "context_usage" })     ← prompt 前 token 占用
onEvent({ type: "context" })           ← 本轮 JIT 摘要（锚点、行数）
        │
        │  await session.prompt(userText)  ← 可能持续几秒～几十秒
        │       │
        │       ├─ onEvent({ type: "assistant_delta", text: "你" })
        │       ├─ onEvent({ type: "assistant_delta", text: "好" })
        │       ├─ onEvent({ type: "tool_start", tool: "grep" })
        │       ├─ onEvent({ type: "tool_output", preview: "..." })
        │       ├─ onEvent({ type: "assistant_delta", text: "根据" })
        │       └─ ... 很多次
        │
onEvent({ type: "context_usage" })     ← prompt 后 token 占用
onEvent({ type: "turn_end" })          ← 本轮结束，前端可以收尾
```

PRD 模式还会在开头/中间多 `requirement_state`、`agent_actions`（见 [TYPESCRIPT_DEEP_DIVE.md](./TYPESCRIPT_DEEP_DIVE.md)），但 **水管机制相同**。

### 5.2 谁产生 `assistant_delta`？

Pi 内部推事件 → `session.subscribe` → `piEventToSse` → `onEvent`：

```267:308:packages/agent-runtime/src/run-chat.ts
  const unsub = session.subscribe((piEvent: unknown) => {
    // ... 调试日志略 ...

    const sse = piEventToSse(piEvent);
    if (sse) options.onEvent(sse);
  });
```

`piEventToSse` 只做 **翻译**（Pi 方言 → letsTalk 方言）：

| Pi 事件 | 变成 SseEvent |
|---------|----------------|
| `message_update` + `text_delta` | `{ type: "assistant_delta", text: "..." }` |
| `tool_execution_start` | `{ type: "tool_start", tool: "grep", ... }` |
| `tool_execution_end` | `{ type: "tool_output", preview: "...", ok: true }` |
| 其它 | `null`（不推给浏览器） |

```160:167:packages/agent-runtime/src/run-chat.ts
  if (e.type === "message_update") {
    const inner = e.assistantMessageEvent as { type?: string; delta?: string };
    if (inner?.type === "text_delta" && inner.delta) {
      return { type: "assistant_delta", text: inner.delta };
    }
    return null;
  }
```

### 5.3 重要：`message` 和模型看到的 `userText` 不是一回事

```332:336:packages/agent-runtime/src/run-chat.ts
    const prefix = formatAgentContextBlock(ctx);
    const userText = prefix.trim()
      ? `${prefix}\n\n${options.message}`
      : options.message;
```

| 变量 | 内容 |
|------|------|
| `options.message` | 你输入的那句话（也是 `fetch` body 里的 `message`） |
| `prefix` | `<agent_context>...</agent_context>` 整段 XML |
| `userText` | **prefix + 你的问题**，交给 `session.prompt` |

持久化到 Transcript 的 **用户条** 只存 `message`，不存 `prefix`。  
调试可看 `.agent/debug/.../turn-001_request.md`（`LETS_TALK_DEBUG=1`）。

---

## 6. 第四步：SSE 长什么样？（线上字节）

函数 `formatSseData`：

```108:111:packages/shared-types/src/index.ts
export function formatSseData(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
```

**每一则事件** 在 HTTP 响应体里是两行（严格说是一条 `data:` 行 + 空行）：

```text
data: {"type":"session","sessionId":"xxx","cwd":"/Users/.../letsTalk","model":"deepseek/deepseek-chat"}

data: {"type":"assistant_delta","text":"你"}

data: {"type":"assistant_delta","text":"好"}

data: {"type":"tool_start","callId":"abc","tool":"grep"}

data: {"type":"tool_output","callId":"abc","ok":true,"preview":"workFront/...","durationMs":0}

data: {"type":"turn_end"}

```

规则：

- 以 `data: ` 开头（注意有空格）
- 后面是 **一整段 JSON**（一个 `SseEvent` 对象）
- 以 **两个换行** `\n\n` 结束一条

浏览器不是一次性收到上面全部，而是 **TCP 一块一块** 到达；所以前端要做 **缓冲 + 按行切分**。

---

## 7. 第五步：浏览器怎么读流？

仍在 `page.tsx` 的 `send()` 里。

### 7.1 拿到 Reader

```425:426:apps/web/app/page.tsx
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
```

`res.body` 是 **ReadableStream**（和服务器 `new ReadableStream` 对应）。

### 7.2 循环读 + 拼 buffer

```428:436:apps/web/app/page.tsx
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
```

为什么需要 `buffer`？

网络可能把两条 SSE **拆成半行** 送来，例如先收到 `data: {"type":"assist`，下一包才收到 `ant_delta"...}\n\n`。  
所以先攒在 `buffer`，按 `\n` 切行，**最后一行可能不完整**，留到下一轮（`lines.pop()`）。

### 7.3 解析每一行

```438:447:apps/web/app/page.tsx
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(payload) as SseEvent;
          } catch {
            continue;
          }
```

- 只处理以 `data: ` 开头的行
- `slice(6)` 去掉 `data: ` 前缀
- `JSON.parse` 得到 JavaScript 对象，当成 `SseEvent`

### 7.4 按 `event.type` 更新界面

```449:493:apps/web/app/page.tsx
          if (event.type === "assistant_delta") {
            appendAssistantDelta(event.text, snapshot);
          } else if (event.type === "context_usage") {
            setContextUsage({ ... });
          } else if (event.type === "context") {
            snapshot.push({ kind: "context", ... });
            setItems([...snapshot]);
          } else if (event.type === "tool_start") {
            ...
          } else if (event.type === "tool_output") {
            ...
          } else if (event.type === "turn_end") {
            await refreshRequirementDraft(sid);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
```

TypeScript 里写 `event.type === "assistant_delta"` 之后，编译器知道 **`event.text` 一定存在**（可辨识联合）。

### 7.5 流式文字怎么「一个字一个字」显示？

```381:393:apps/web/app/page.tsx
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
```

逻辑：

1. 每个 `assistant_delta` 带一小段 `text`（可能是一个字、一个词）
2. 累加到 `assistantBuf.current`
3. Transcript 里 **只有一条** `kind: "assistant"`，不断改它的 `text`
4. `setItems` 触发 React 重绘 → 你看到打字机效果

### 7.6 工具块：先 `tool_start` 再 `tool_output`

```465:482:apps/web/app/page.tsx
          } else if (event.type === "tool_start") {
            lastToolName.current = event.tool;
            snapshot.push({ kind: "tool", tool: event.tool, preview: "…", ok: true });
          } else if (event.type === "tool_output") {
            const toolName = lastToolName.current;
            for (let i = snapshot.length - 1; i >= 0; i--) {
              if (row?.kind === "tool" && row.tool === toolName && row.preview === "…") {
                snapshot[i] = { kind: "tool", tool: toolName, preview: event.preview, ok: event.ok };
                break;
              }
            }
```

- `tool_start`：先插一条，预览显示 `…`（执行中）
- `tool_output`：从后往前找同名工具，把 `preview` 换成真实结果

### 7.7 流结束后的 `finally`

```504:509:apps/web/app/page.tsx
    } finally {
      setBusy(false);
      itemsRef.current = snapshot;
      await refreshRequirementDraft(sid);
      await persistCurrent(snapshot);
    }
```

- `reader.read()` 直到 `done`（服务器 `controller.close()`）
- 解除 busy，**PUT** 保存 Transcript 到 `.agent/conversations/{id}.json`

---

## 8. `SseEvent` 速查表（探索模式最常见）

定义：`packages/shared-types/src/index.ts`。

| type | 何时推送 | 前端干什么 | 你会在界面上看到 |
|------|----------|------------|------------------|
| `session` | `runChat` 开头 | 一般无 UI | — |
| `context_usage` | prompt 前/后 | 更新头部 token 百分比 | 右上角上下文占用 |
| `context` | 拼好 JIT 后 | 插入一条 context 记录 | Transcript 里上下文摘要 |
| `assistant_delta` | 模型流式输出 | `appendAssistantDelta` | 助手气泡变长 |
| `tool_start` | Agent 调工具 | 加 tool 条，`preview: "…"` | 「工具调用」折叠块出现 |
| `tool_output` | 工具返回 | 更新同一条 tool 的 preview | 块里显示 grep 结果等 |
| `turn_end` | `prompt` 结束 | 刷新草稿等 | 生成中状态结束 |
| `error` | 异常 | `throw`，进 catch | 红色错误气泡 |
| `requirement_state` | PRD 专用 | 更新右侧清单 | 需求整理模式才有 |
| `agent_actions` | PRD 专用 | 更新底部按钮 | 需求整理模式才有 |

---

## 9. 两个「历史」别混：SSE vs Transcript

| | SSE (`SseEvent`) | Transcript (`TranscriptItem`) |
|---|------------------|-------------------------------|
| **方向** | 服务器 → 浏览器，**实时** | 浏览器存盘，**刷新后还在** |
| **粒度** | 很细（每个字一条 delta） | 较粗（助手全文一条） |
| **存在哪** | 不单独存文件，只在内存里处理 | `.agent/conversations/{id}.json` |
| **用户消息** | 不发 SSE | 发送时直接 `push { kind: "user" }` |

```text
用户点发送
  → 立刻写入 Transcript: { kind: "user", text: "..." }
  → 然后才开始收一堆 SseEvent
  → 流结束后 persistCurrent 把整个 snapshot  PUT 回服务器
```

---

## 10. 和 TypeScript 的关系（本功能必会）

| 语法 | 在本功能哪出现 | 详解 |
|------|----------------|------|
| `interface ChatStreamRequest` | fetch body | [初学者 §2](./TYPESCRIPT_FOR_BEGINNERS.md) |
| `type SseEvent = \| { type: "..." } \| ...` | 事件分支 | [初学者 §5](./TYPESCRIPT_FOR_BEGINNERS.md) · [进阶 §2](./TYPESCRIPT_DEEP_DIVE.md) |
| `if (event.type === "...")` | page.tsx | 进阶 §2.3 |
| `as SseEvent` | JSON.parse 后 | 初学者 §10 |
| `(event: SseEvent) => void` | onEvent 回调 | 初学者 §7.3 |
| `async/await` + `while` | send、runChat | 初学者 §7 |
| `?? null` | anchor、chatMode 默认 | 初学者 §9.2 |
| `Parameters<typeof formatSseData>[0]` | enqueue 参数类型 | 进阶 §10.1 |

---

## 11. 自己跟一遍（建议断点）

F5 → `letsTalk: Next 服务端 (推荐)`，只打 4 个断点：

| 顺序 | 文件 | 行 | 看什么 |
|------|------|-----|--------|
| 1 | `page.tsx` | 409 | `body` JSON |
| 2 | `route.ts` | 55 | `runChat` 被调用 |
| 3 | `run-chat.ts` | 308 | `sse` 每次事件（条件：`sse?.type === 'assistant_delta'` 减少停顿） |
| 4 | `page.tsx` | 444 | `event` 解析后 |

发一句短话：`你好`。

不开断点时：`.env` 加 `LETS_TALK_DEBUG=1`，看 `.agent/debug/{sessionId}/turn-001_response.md`。

---

## 12. 常见问题

### Q1：为什么不用 WebSocket？

SSE 是 **单向**（服务器 → 浏览器），实现简单；一轮对话只需 POST 一次，响应流式即可。够用。

### Q2：`fetch` 算 SSE 客户端吗？

标准 EventSource API 只能 GET；这里用 **POST + 手动读 body**，所以是 `fetch` + `getReader()`，格式仍遵守 `data: ...\n\n`。

### Q3：连接会一直开着吗？

一轮对话：从 `runChat` 开始到 `turn_end` 后 `controller.close()`，然后 `reader.read()` 得到 `done`。  
不是永久连接。

### Q4：中途刷新页面会怎样？

进行中的流断开；已 `persistCurrent` 的内容在 JSON 里；Pi 上下文在 jsonl 里。未结束的 assistant 可能只存了一半。

### Q5：`onEvent` 和 `enqueue` 是同一个函数吗？

是。`route.ts` 里 `const enqueue = (event) => {...}`，传给 `runChat({ onEvent: enqueue })`，在 `run-chat.ts` 里叫 `options.onEvent`。

### Q6：为什么终端里 `--inspect` 和调试有关？

那是 Cursor 启动 Next 时挂调试器，和 SSE 协议无关。看到 `Waiting for the debugger to disconnect...` 多半是调试会话结束，不影响理解 SSE。

---

## 13. 一张图串起来（复制到笔记里）

```text
[用户] 输入 "你好" 点发送
    │
    ▼
page.send()
    │  JSON POST { sessionId, message, anchor, chatMode }
    ▼
route.POST()
    │  new ReadableStream
    │  runChat({ onEvent: enqueue })
    ▼
runChat()
    │  onEvent(session)
    │  onEvent(context_usage)
    │  onEvent(context)
    │  session.prompt(userText)  ──► Pi / LLM / 工具
    │       └─► subscribe ──► piEventToSse ──► onEvent(assistant_delta × N)
    │       └─► onEvent(tool_start / tool_output)
    │  onEvent(context_usage)
    │  onEvent(turn_end)
    │  每次 onEvent → formatSseData → enqueue → HTTP 块
    ▼
page: while(reader.read())
    │  按行 parse data: {...}
    │  assistant_delta → 打字机
    │  tool_* → 工具块
    ▼
finally: persistCurrent → 保存 JSON
```

---

## 14. 下一步读什么

| 你已理解功能 0 之后 | 建议 |
|---------------------|------|
| 锚点怎么进 JIT | [CODEBASE_GUIDE](./CODEBASE_GUIDE.md) §5 + 功能 2（BY_FEATURE） |
| PRD 多出来的 SSE | [TYPESCRIPT_DEEP_DIVE](./TYPESCRIPT_DEEP_DIVE.md) §4 |
| 断点跟读 | [DEBUG_GUIDE](./DEBUG_GUIDE.md) §3 |
| 创建 Agent | `create-session.ts` + BY_FEATURE 功能 7 |

---

*文档与当前 `page.tsx`、`route.ts`、`run-chat.ts`、`shared-types` 一致。*
