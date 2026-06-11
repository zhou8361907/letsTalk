# 01 — Logging & Cost

| 档位 | 优先级 | Mastra 矩阵 |
|------|--------|---------------|
| L2 | 🔴 P0 | Logging ⚠️ · Trace ⚠️ |

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> **Week 1**：与 [05 Metrics 基础](./05_OBSERVABILITY.md#核心-metrics) 同步推进 — Log 与 Metric 字段对齐。

---

## 1. 目标

能回答：

- 用户做了什么？
- 哪一步失败？
- 消耗多少 token / 多少钱？

---

## 2. letsTalk 现状

### 已有

| 能力 | 位置 |
|------|------|
| sessionId 贯穿 | `.agent/conversations/` · `run-chat.ts` · `session-db.ts` |
| 开发期 JSONL | `packages/agent-runtime/src/debug-logger.ts` → `.agent/debug/{sessionId}/` |
| turn id | `nextTurnId()` → `turn-001-...` |
| 工具记录 | `DebugToolRecord`；SSE `tool_start` / `tool_output` |
| 上下文占用 | `context-usage.ts` → SSE `context_usage` |
| 调试开关 | `LETS_TALK_DEBUG=1` — [DEBUG_LOGGING.md](../DEBUG_LOGGING.md) |

### 缺口

| 缺口 | 影响 |
|------|------|
| pino / 统一 logger | 生产无法检索 |
| trace_id | 无法关联 HTTP → Tool 链 |
| step_id 规范 | tool/llm 子步骤不可辨 |
| cost 账本 | 无法计费、告警 |
| prod vs debug 分工 | 易误把 debug 当运维手段 |

---

## 3. 核心概念

### 3.1 Structured Log 最小字段

> `step` 采用 `domain.action` 格式，与 [00 §命名规范](./00_GAP_ASSESSMENT.md#命名规范) trace span **共用同一套名称**。

```typescript
{
  sessionId: string;
  traceId: string;      // 单次 HTTP 请求
  stepId?: string;      // turn 内子步骤
  step: "route.auth_parse" | "session.get_or_create" | "context.build_prefix"
      | "llm.call" | "tool.execute" | "artifact.persist_draft"
      | "background.memory_review" | "sse.flush";
  durationMs: number;
  tokenUsage?: { input?: number; output?: number; total?: number };
  costUsd?: number;
  model?: string;
  toolName?: string;
  success: boolean;
  error?: string;
}
```

### 3.2 sessionId vs traceId

| ID | 生命周期 | 用途 |
|----|----------|------|
| sessionId | 多轮对话 | 业务会话、持久化路径 |
| traceId | 单次 POST | 排障、Tracing、成本归因 |

### 3.3 日志 vs Debug Artifact

| | 生产 Log | Debug Artifact |
|--|----------|----------------|
| 目的 | 运维检索、告警 | 开发深度调试 |
| 内容 | 摘要 + 结构化字段 | 完整 request/response |
| 存储 | stdout / 日志管道 | `.agent/debug/` |
| 环境 | 始终（可控级别） | `LETS_TALK_DEBUG=1` |

### 3.4 敏感信息脱敏

生产 log **默认摘要**；完整对话原文仅进 debug artifact（`LETS_TALK_DEBUG=1`）。

| 字段 | 生产 log | debug artifact |
|------|----------|----------------|
| 用户消息原文 | ❌ 仅 hash + 长度 | ✅ 全文 |
| tool 输出 | 前 200 字 + `truncated` 标记 | ✅ 全文 |
| 文件绝对路径 | 相对 `WORKSPACE_ROOT` | ✅ 绝对路径 |
| API key / token | ❌ 永不记录 | ❌ |
| requirementDraft 全文 | ❌ 仅 revision/id | ✅ 快照 |

---

## 4. Token & Cost

### 4.1 计量层次

| 层次 | letsTalk | 用途 |
|------|----------|------|
| Context window 占用 | ✅ `getContextUsage()` | compact 触发 |
| 每 API call in/out | ❌ | 计费 |
| 每 session 累计 | ❌ | 配额、报表 |
| per-tool 归因 | ❌ | 优化 grep 策略 |

### 4.2 Cost 公式（概念）

```text
cost = (input_tokens × price_in + output_tokens × price_out) / 1e6
```

**价格表独立为配置**（非业务代码）：

```text
packages/agent-runtime/src/model-pricing.ts   # 单价表 + 版本注释
```

`create-session.ts` 只读取 pricing 模块；模型调价改数据文件，不改 session 逻辑。

### 4.3 与 Runtime 的关系

- **Prefix 构建**、**Tool 输出** 是 token 黑洞 → 见 [06_CONTEXT](./06_CONTEXT_ENGINEERING.md)
- 每 turn 成本应写入 Persist 或 Metrics → 见 [05_OBSERVABILITY](./05_OBSERVABILITY.md)

---

## 5. 改造锚点（实施时）

```text
apps/web/app/api/agent/chat/stream/route.ts   trace_id 生成
packages/agent-runtime/src/run-chat.ts        主循环逐步 log
packages/agent-runtime/src/debug-logger.ts    复用字段，拆 prod/dev
packages/agent-runtime/src/context-usage.ts   token 快照写入 log
```

---

## 6. 学习资源

| 资源 | 重点 |
|------|------|
| [Pino 文档](https://getpino.io/) | Child loggers · Next.js |
| [Mastra](https://mastra.ai/) | step 记录模式 |
| [DEBUG_LOGGING.md](../DEBUG_LOGGING.md) | 现有 debug 能力 |
| [DEBUG_GUIDE.md](../DEBUG_GUIDE.md) | 跟一条 turn |

---

## 7. 自检

- [ ] 能画一次请求的 log 时间线（≥5 step）
- [ ] 能说明「查昨天失败」用哪个 id
- [ ] 能解释 debug JSONL 与 prod log 分工
- [ ] 能设计单 turn 成本记录 schema

---

## 8. Week 1 计划（学习 + 交付物）

| 天 | 内容 |
|----|------|
| 1-2 | pino · trace_id · [命名规范](./00_GAP_ASSESSMENT.md#命名规范) |
| 3 | pino 接入 `run-chat.ts` |
| 4 | `model-pricing.ts` 初稿 · cost 写入 log |
| 5 | **验收**：一条请求 grep ≥5 条结构化 log；档位 Logging L2→L3 |
