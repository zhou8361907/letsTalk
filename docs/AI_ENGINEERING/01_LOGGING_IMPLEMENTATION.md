# 01 — Logging 实施文档 & 进度

| 项目 | 内容 |
|------|------|
| 父文档 | [01_LOGGING.md](./01_LOGGING.md) |
| 命名规范 | [00 §命名规范](./00_GAP_ASSESSMENT.md#命名规范) |
| 档位目标 | Logging **L2 → L3** |
| 开始日期 | 2026-06-11 |

---

## 决策记录（已确认）

| 项 | 选择 | 说明 |
|----|------|------|
| 日志目的地 | **stdout JSON** | 先不接 ELK/Loki；字段设计兼容后续管道 |
| traceId 给前端 | **是** | SSE `session` 事件携带，便于用户报障 |
| Cost MVP | **context 占用 + costUsd 占位** | Pi SDK 若无单次 API token，cost 记 `null` |
| debug 分工 | **不动** | `LETS_TALK_DEBUG` JSONL 保持；prod log 并行新增 |

---

## 进度总览

| Phase | 内容 | 状态 | 证据 |
|-------|------|------|------|
| **0** | pino + `agent-logger` + `log-steps` + `log-redact` + `model-pricing` | ✅ 完成 | `packages/agent-runtime/src/agent-logger.ts` 等 |
| **1** | `traceId` + 主链路 step log（route / session / context / llm / tool / sse） | ✅ 完成 | `route.ts` · `run-chat.ts` · `shared-types` |
| **2** | 单次 API token + cost 账本 + session 累计 | ⬜ 待做 | 依赖 Pi SDK 能力确认 |
| **验收** | 一条 POST grep ≥5 条结构化 log | 🟡 待本地验证 | 见下方验收命令 |

> 每周更新「状态」列；档位变更须附 PR 或本地验证命令。

---

## Phase 0 — 基础设施

### 新建文件

| 文件 | 职责 | 状态 |
|------|------|------|
| `packages/agent-runtime/src/log-steps.ts` | `LogStep` 枚举 + `AgentStepLogFields` 类型 | ✅ |
| `packages/agent-runtime/src/log-redact.ts` | hash / 截断 / 路径相对化 | ✅ |
| `packages/agent-runtime/src/agent-logger.ts` | pino 根实例 + `createRequestLogger` + `logAgentStep` | ✅ |
| `packages/agent-runtime/src/model-pricing.ts` | 模型单价表 + `estimateCostUsd` | ✅ |

### 依赖

```bash
pnpm --filter @lets-talk/agent-runtime add pino
```

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LOG_LEVEL` | `info` | pino level |
| `LETS_TALK_DEBUG` | off | 仍控制 debug artifact，与 prod log 无关 |

---

## Phase 1 — 主链路 step

### 改动文件

| step | 文件 | 状态 |
|------|------|------|
| `route.auth_parse` | `apps/web/app/api/agent/chat/stream/route.ts` | ✅ |
| `session.get_or_create` | `packages/agent-runtime/src/run-chat.ts` | ✅ |
| `context.build_prefix` | `packages/agent-runtime/src/run-chat.ts` | ✅ |
| `llm.call` | `packages/agent-runtime/src/run-chat.ts` | ✅ |
| `tool.execute` | `packages/agent-runtime/src/run-chat.ts`（subscribe） | ✅ |
| `artifact.persist_draft` | `packages/agent-runtime/src/run-chat.ts`（persistDraft） | ✅ |
| `sse.flush` | `route.ts`（runChat finally） | ✅ |
| `traceId` → SSE | `packages/shared-types/src/index.ts` | ✅ |

### RunChatOptions 新增

```typescript
traceId?: string;  // route 生成；脚本未传时 runChat 内 randomUUID
```

---

## 结构化 log 字段（生产最小集）

与 [01_LOGGING.md §3.1](./01_LOGGING.md#31-structured-log-最小字段) 一致：

```typescript
{
  traceId, sessionId, turnId?, step, stepId?,
  durationMs, success, error?,
  model?, toolName?, chatMode?,
  tokenUsage?, costUsd?,
  userMessageHash?, userMessageLen?,  // 脱敏
  preview?, truncated?,               // tool 输出摘要
}
```

---

## 验收命令

```bash
# 1. 启动 dev
pnpm dev

# 2. 发一条对话后，在终端 grep（替换为实际 traceId）
pnpm dev 2>&1 | grep '"step":"llm.call"'

# 3. 期望 ≥5 种 step：
# route.auth_parse · session.get_or_create · context.build_prefix · llm.call · sse.flush
# （有工具时另有 tool.execute）
```

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-06-11 | 创建本文档；前置 commit `db33276` 已 push（Handbook + 菜单改造） |
| 2026-06-11 | Phase 0/1 代码落地：pino 结构化 log + traceId + 主链路 7 step |
