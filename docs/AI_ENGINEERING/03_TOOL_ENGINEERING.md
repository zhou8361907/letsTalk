# 03 — Tool Engineering

| 档位 | 优先级 | Mastra 矩阵 |
|------|--------|---------------|
| L2 | 🔴 P0 | Tool ⚠️ · Tool Approval ❌ P2 |

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> **Mastra 视角**：Tool 是 Agent 与外部世界的边界；生产环境必须可超时、可重试、可观测（Approval → P2）。  
> **原则**：复杂度在 Tool，不在 Prompt。

---

## 1. 目标

- 所有 tool 返回统一结构，**禁止 throw 中断 workflow**（不可恢复 bug 除外）
- 可配置 timeout、retry、fallback
- 写操作有权限边界与幂等意识
- Tool 层可观测（纳入 trace / metrics）

---

## 2. 统一契约：ToolResult

> `errorCode` 为**封闭枚举**，集中定义于 `tool-error-codes.ts` — 见 [00 §命名规范](./00_GAP_ASSESSMENT.md#命名规范)。  
> 下游消费者：LLM 自愈策略（prompt 教模型按 code 应对）+ metrics label（防 cardinality 失控）。

```typescript
type ToolErrorCode =
  | "TIMEOUT"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "PARTIAL_FAILURE"
  | "INTERNAL";

interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;           // 给 LLM 看的可行动文案
  errorCode?: ToolErrorCode;
  partial?: boolean;
  meta?: {
    durationMs: number;
    retries: number;
    truncated?: boolean;
    traceId?: string;       // 与 01 log schema 打通
    stepId?: string;
  };
}
```

Pi SDK 当前返回 `{ content, details }` — 实施时在 wrapper 内映射为 ToolResult，再序列化进 `content`。

---

## 3. 能力清单

### 3.1 已有

| 能力 | 位置 |
|------|------|
| 输出字符软顶 | `tool-output-truncate.ts` |
| 写权限沙箱 | `agent-write-policy.ts` |
| Scoped write | `agent-scoped-write-tools.ts` |
| Pi tool loop | `create-session.ts` · `defineTool` |

### 3.2 待补

| 能力 | 说明 |
|------|------|
| **timeout** | grep 大仓库、read 巨型文件 |
| **retry** | 幂等读可重试；写操作谨慎 |
| **fallback** | read 失败 → 返回路径+大小摘要 |
| **cache** | 同 session 重复 grep（可选） |
| **idempotency** | save_memory、update draft |
| **cancellation** | 用户中止时中断 tool |
| **observability** | 每 tool span + tool_success metric |
| **concurrency** | 并行 tool 上限（若 Pi 支持） |
| **partial success** | 批量操作部分失败 |
| **approval** | Mastra Tool Approval — **P2 延后**（见 §3.3） |

### 3.3 Tool Approval — P2 延后 {#tool-approval-p2}

> **决策三问结论**：内网单用户 + `agent-write-policy.ts` 已限 `.agent/` 写范围 + PRD 定稿已有 HITL → **当前不会**遇到「未授权写造成生产事故」。不排实施，Q3 保留设计稿即可。

| 场景 | 现状 | P2 目标（若未来多用户） |
|------|------|------------------------|
| save_memory | write policy 允许即写 | 可选 HITL gate |
| update_requirement_draft | 直接写 | PRD 定稿前已有 HITL ✅ |
| scoped write | 沙箱内自动 | 高危写可 interrupt |

与 [04 Runtime HITL](./04_RUNTIME_ENGINEERING.md#7-hitlhuman-in-the-loop) 交叉。

---

## 4. Timeout & Retry

### 4.1 建议默认值（初稿）

| Tool 类 | timeout | retry |
|---------|---------|-------|
| grep / find / ls | 30s | 2（幂等） |
| read | 15s | 1 |
| list_methods / read_method | 20s | 1 |
| memory / save_memory | 10s | 写：0 |
| get_anchor_preview | 15s | 1 |
| update_requirement_draft | 10s | 0 |

### 4.2 Retry 分类

| 类型 | 可重试 | 策略 |
|------|--------|------|
| 幂等读 | ✅ | 有限次 + backoff |
| 写操作 | ❌* | *除非 idempotency key |
| LLM provider 5xx | ✅ | exponential backoff |
| 超时 | ⚠️ | 读可重试；写需评估 |

### 4.3 Wrapper 模式

```text
defineTool(
  withObservability(
    withTimeout(
      withRetry(handler, { max: 2 }),
      { ms: 30_000 }
    )
  )
)
```

参考：Mastra tools · Vercel AI SDK tool wrapper。

---

## 5. Permission & Write Policy

已有 `agent-write-policy.ts`：

- 仅 `.agent/` 可写（memory、skills、prompt）
- conversations / debug 禁止 Agent 写

**待文档化 / 强化**：

- Tool 级 permission 矩阵（prd 模式 vs explore）
- 写前 HITL（可选，见 [04_RUNTIME](./04_RUNTIME_ENGINEERING.md)）

---

## 6. 错误是数据，不是控制流

| 场景 | 做法 |
|------|------|
| grep 无结果 | `success: true, data: []` 或明确 empty |
| read 文件不存在 | `success: false, error: "..."` → LLM 换策略 |
| 编程 bug | throw → route 层 500 |
| 配置缺失 WORKSPACE_ROOT | throw（启动时） |

---

## 7. 改造锚点

```text
packages/agent-runtime/src/create-session.ts      工具注册
packages/agent-runtime/src/tool-output-truncate.ts  现有 wrapper 参考
packages/agent-runtime/src/agent-write-policy.ts    权限
packages/agent-runtime/src/run-chat.ts              tool_execution 事件
```

---

## 8. 学习资源

| 资源 | 重点 |
|------|------|
| Mastra tools 文档 | execution · error handling |
| [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) | Tool reliability |
| [98_ANTI_PATTERNS](./98_ANTI_PATTERNS.md) | tool throw 误区 |

---

## 9. 自检

- [ ] 列出所有已注册 tool 及 timeout/retry 建议
- [ ] 设计 grep 超时后 LLM 看到的 error 文案
- [ ] 区分绝不可 blind retry 的 tool

---

## 10. Week 3 计划（学习 + 交付物）

| 天 | 内容 |
|----|------|
| 1-2 | ToolResult · errorCode 枚举 · 错误即数据 |
| 3 | wrapper 落地 · ≥3 tool 接 timeout |
| 4 | meta.traceId/stepId 与 01 对齐 |
| 5 | **验收**：人为超时 → LLM 收到结构化 error；档位 Tool L2→L3 |
