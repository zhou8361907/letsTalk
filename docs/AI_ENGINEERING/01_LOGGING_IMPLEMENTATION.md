# 01 — Logging 实施文档 & 进度

| 项目 | 内容 |
|------|------|
| 父文档 | [01_LOGGING.md](./01_LOGGING.md) |
| 命名规范 | [00 §命名规范](./00_GAP_ASSESSMENT.md#命名规范) |
| 可观测性姊妹章 | [05_OBSERVABILITY.md](./05_OBSERVABILITY.md) |
| 档位目标 | Logging **L2 → L3**（主链路 + 索引落盘 + CLI） |
| 开始日期 | 2026-06-11 |

---

## 架构：三层日志 + CLI（Mastra Trace 本地方案）

> Mastra 有 Trace + Metrics 模块；letsTalk 用 **TraceRecorder + jsonl 索引** 做等价物，不绑 Langfuse。

```text
┌─ 一眼层（终端）────────────────────────────────────────────┐
│ 单行 step（每步 1 行）+ 回合结束摘要块（dev 默认 6~8 行）      │
└──────────────────────────────────────────────────────────┘
          ↓ traceId / sessionId
┌─ 检索层（.agent/logs/，始终落盘）──────────────────────────┐
│ traces/YYYY-MM-DD.jsonl     每 trace 一条，含 steps[]       │
│ sessions/{sessionId}.jsonl  回合累计 cost/token 账本         │
└──────────────────────────────────────────────────────────┘
          ↓ 深潜
┌─ 显微镜层（LETS_TALK_DEBUG=1）─────────────────────────────┐
│ .agent/debug/{sessionId}/   完整 prompt / 工具输出 / 清单    │
└──────────────────────────────────────────────────────────┘
```

| 层 | 回答问题 | 环境 |
|----|----------|------|
| 一眼 | 这轮慢吗、多少钱 | 终端 |
| 检索 | 昨天哪次失败、session 累计花费 | jsonl + CLI |
| 显微镜 | 模型吃了什么上下文 | debug artifact |

---

## 决策记录（已确认）

| 项 | 选择 | 说明 |
|----|------|------|
| 日志目的地 | **stdout + `.agent/logs/`** | 终端给人看，jsonl 给检索 |
| traceId 给前端 | **是** | SSE `session` 事件 |
| 摘要块 | **dev 默认开** | `LOG_VERBOSE=0` 关闭 |
| debug 分工 | **不动** | prod log 与 debug 并行 |
| Web Trace 面板 | **三期** | 本期 CLI + jsonl |

---

## 进度总览

| Phase | 内容 | 状态 | 证据 |
|-------|------|------|------|
| **0** | pino + agent-logger + log-steps + redact + pricing | ✅ | `agent-logger.ts` |
| **1** | traceId + 主链路 step log | ✅ | `route.ts` · `run-chat.ts` |
| **2a** | 回合摘要块 + trace/session jsonl + bundle_load 拆分 | ✅ | `trace-recorder.ts` · `trace-store.ts` |
| **2b** | `pnpm trace:show` + session 账本 + 日成本汇总 | ✅ | `scripts/trace-show.ts` |
| **3** | Web Trace 面板 · Langfuse Tracer 接口 | ⬜ | [05 §2.4](./05_OBSERVABILITY.md#24-tracer-薄抽象层埋点面向接口) |
| **验收** | 发一条消息 → 终端摘要 + jsonl 可查 | ✅ | `pnpm trace:show` · Actor 隔离 |

---

## 代码地图

| 文件 | 职责 |
|------|------|
| `agent-logger.ts` | pino / 人类单行；挂 TraceRecorder |
| `format-agent-log.ts` | 单行格式化 |
| `format-turn-summary.ts` | 回合摘要块 |
| `trace-recorder.ts` | 单次 HTTP 的 step 收集（≈ Mastra trace root） |
| `trace-store.ts` | traces / sessions jsonl 落盘与查询 |
| `trace-finalize.ts` | 回合结束：落盘 + 打印摘要 |
| `session-token-stats.ts` | Pi `getSessionStats` 差分 |
| `scripts/trace-show.ts` | CLI 查询 |

---

## 落盘路径

```text
.agent/logs/
  traces/2026-06-11.jsonl
  sessions/182e6dd6-0711-4b78-b9ea-e2ab87eca75b.jsonl
```

### trace 记录（每 POST 一行）

```json
{
  "traceId": "a68365e3-...",
  "sessionId": "182e6dd6-...",
  "turnId": "turn-001-...",
  "durationMs": 3050,
  "steps": [{ "step": "llm.call", "durationMs": 2850, "tokenUsage": { "input": 1403, "output": 159 } }],
  "tools": [],
  "turnCostUsd": 0.0002,
  "sessionTokenTotal": 25520,
  "success": true
}
```

### session 账本（每回合 append 一行）

```json
{
  "turnIndex": 3,
  "turnCostUsd": 0.0002,
  "cumulativeCostUsd": 0.0015,
  "cumulativeTokenUsage": { "input": 12000, "output": 3000 },
  "turnCount": 3
}
```

---

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LOG_LEVEL` | `info` | pino（`LOG_JSON=1` 时） |
| `LOG_JSON` | off | `1` 强制 JSON 单行 |
| `LOG_VERBOSE` | on（dev） | `0` 关闭回合摘要块 |
| `LOG_COLOR` | on | `0` 关闭 ANSI |
| `LETS_TALK_DEBUG` | off | 显微镜层，与 prod log 无关 |

---

## 终端预期（dev）

```text
letsTalk 11:31:10 ✓ 加载模块    1.52s · explore · trace a68365e3 · session 182e6dd6
letsTalk 11:31:10 ✓ 解析请求       2ms · explore
letsTalk 11:31:10 ✓ 加载会话     187ms · explore · deepseek-v4-flash
letsTalk 11:31:10 ✓ 组装上下文      4ms · explore · deepseek-v4-flash
letsTalk 11:31:13 ✓ LLM 调用    2.85s · in 1,403 · out 159 · session 25,520 tok · $0.0002
letsTalk 11:31:13 ✓ 流结束      3.05s · trace a68365e3
┌─ turn turn-001 · trace a68365e3 ─ ok
│ 用户 3 字 · explore · deepseek-v4-flash
│ 耗时  模块 1.52s · 解析 2ms · 会话 187ms · 上下文 4ms · LLM 2.85s · 推送 3.05s · 合计 3.05s
│ Token in 1,403 · out 159 · 会话累计 25,520 tok · $0.0002
│ 工具  无
│ 索引  traces/2026-06-11.jsonl
│ 账本  sessions/182e6dd6-....jsonl
└────────────────────────────────────────────────────────
```

---

## CLI

```bash
# 查单次请求（traceId 来自终端或 SSE session 事件）
pnpm trace:show a68365e3-...-...

# 查 session 最近 5 轮
pnpm trace:show --session 182e6dd6-...-... --limit 5

# 今日各 session 成本 Top
pnpm trace:show --cost
pnpm trace:show --cost --date 2026-06-11
```

---

## step 清单

| step | 文件 | 状态 |
|------|------|------|
| `route.bundle_load` | `route.ts` | ✅ |
| `route.auth_parse` | `route.ts` | ✅ |
| `session.get_or_create` | `run-chat.ts` | ✅ |
| `context.build_prefix` | `run-chat.ts` | ✅ |
| `llm.call` | `run-chat.ts` | ✅ |
| `tool.execute` | `run-chat.ts` | ✅ |
| `artifact.persist_draft` | `run-chat.ts` | ✅ |
| `sse.flush` | `route.ts` | ✅ |

---

## 身份演进（Actor · 2026-06-11，与日志同批落地）

部门内共用一页、各看各的会话；**非登录**，header 传 `X-LetsTalk-Actor-Id`。

| 能力 | 路径 / 约定 |
|------|-------------|
| 选人弹窗 | `ActorPickerModal` + `localStorage` |
| 注册表 | `.agent/actors/registry.json` |
| 会话归属 | `ownerActorId` / `ownerDisplayName`；无 owner 的旧会话仅 `anon` 可见，首次访问可 claim |
| USER 画像 | `.agent/memory/actors/{actorId}/USER.md`；**仅 `anon`** 可读 legacy 根 `USER.md`；命名身份从零开始 |
| CORE / topics | 工作区共享 |
| Trace | `TraceRecord.actorId` / `actorDisplayName` |

---

## Phase 3 预告（未实施）

1. `GET /api/agent/traces/[traceId]`（dev only）→ Web 侧栏时间线  
2. `packages/agent-runtime/src/tracer.ts` 薄接口 → Langfuse adapter  
3. 多轮 `llm-2` / `llm-3`（Pi 一次 prompt 内多次 API call 时按 message_end 拆分）

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-06-11 | 创建文档；Phase 0/1 |
| 2026-06-11 | 人类可读单行 + token 差分 |
| 2026-06-11 | **Phase 2a/2b**：摘要块 + jsonl + CLI |
| 2026-06-11 | **Actor 轻量身份**：会话隔离 + USER 按人分目录 + trace 带 actor |
| 2026-06-11 | 记忆编辑器：actor USER 未创建时读 legacy + 保存自动建目录；01 验收 ✅ |
