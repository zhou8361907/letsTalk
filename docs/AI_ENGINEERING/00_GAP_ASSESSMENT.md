# 00 — 项目成熟度评估（Gap Assessment）

| 项目 | 内容 |
|------|------|
| 版本 | V3.0 |
| 日期 | 2026-06-10 |
| 北极星 | 向 **Mastra 工程成熟度**靠拢（不迁移、不复刻） |
| 定位 | **Mastra 对照矩阵** · 成熟度评分 · Gap · 优先级 · 运行时总图 |
| 不负责 | 学习笔记 · 实现细节 · Checklist（见 01～99） |

> 知识细节 → [README.md](./README.md)  
> 上线勾选 → [99_PRODUCTION_CHECKLIST.md](./99_PRODUCTION_CHECKLIST.md)

---

## 一、项目目标（v2）

### 旧目标（废弃为北极星）

```text
实现更多功能 · 补齐 Agent 能力 · 加 Memory · 加 Workflow
```

### 新目标

```text
提高 letsTalk 工程成熟度
→ 可靠性 · 可观测性 · 可测试性 · 可恢复性 · 可维护性 · 可演进性
```

**功能数量 ≠ 成熟度。工程能力才是。**

### 长期公式

```text
Pi Runtime + Mastra Engineering + Langfuse (+ OTel) + Promptfoo + 业务知识 = 企业级 letsTalk
```

### 决策三问（每周复盘时用）

1. Mastra **为什么**有这个模块？
2. 它解决什么**生产**问题？
3. letsTalk **会不会**遇到同样的问题？

仅当 (3) 为「会」→ 才排期。见 [98_ANTI_PATTERNS](./98_ANTI_PATTERNS.md)。

工程铁律权威出处 → [02 §1.1](./02_EVALUATION.md#11-工程铁律与-prompt-冻结)。

---

## 一点五、成熟度五档标尺 {#成熟度标尺}

> **百分比仅供参考**；**档位（L0～L4）是验收单位**。档位变更须附 PR 链接或测试文件路径，填入每周更新记录。

| 档位 | 名称 | 客观判据 |
|------|------|----------|
| **L0** | 缺失 | 无实现，或仅手工流程 |
| **L1** | 局部 | 有代码但无契约/类型，仅 dev 可用 |
| **L2** | 契约 | 有统一接口（如 ToolResult），主链路覆盖 <50% |
| **L3** | 覆盖 | 主链路全覆盖，有基本测试 |
| **L4** | 生产 | 有测试 + 文档 + 监控告警，可演示 |

**Mastra 文档版本**：每**季度**记录一次对标的 [Mastra docs](https://mastra.ai/docs) 快照日期（防止矩阵随上游漂移）；**每周**只更新 letsTalk 档位与证据。

---

## 一点六、命名与观测统一规范 {#命名规范}

> 01 log `step`、05 trace `span`、03 `errorCode`、04 SSE 事件 — **共用 `domain.action` 格式**。各章引用本表，禁止各写一套。

### step / span（共用）

| 名称 | 阶段 | 用于 log.step · trace span |
|------|------|---------------------------|
| `route.bundle_load` | 动态加载 runtime | route.ts（Next dynamic import） |
| `route.auth_parse` | HTTP 入口 | route.ts |
| `session.get_or_create` | 会话 | run-chat.ts |
| `context.build_prefix` | 前缀 | turn-prefix.ts |
| `llm.call` | LLM 调用 | run-chat subscribe |
| `tool.execute` | 工具 | tool wrapper |
| `artifact.persist_draft` | 草案 | requirement-draft-store |
| `background.memory_review` | 异步 | background-memory-review |
| `sse.flush` | 推送 | route SSE |

### errorCode（封闭枚举）

定义于 `packages/agent-runtime/src/tool-error-codes.ts`（实施时创建）：

`TIMEOUT` · `NOT_FOUND` · `PERMISSION_DENIED` · `RATE_LIMITED` · `INVALID_INPUT` · `PARTIAL_FAILURE` · `INTERNAL`

### SSE 事件（shared-types，不改名）

`assistant_delta` · `tool_start` · `tool_output` · `requirement_state` · `context_usage` · `error` · `turn_debug` · `agent_actions`

---

## 二、Mastra 对照矩阵 {#mastra-矩阵}

> **每周维护本表**，不维护 Feature List。  
> 对照 [Mastra 文档](https://mastra.ai/docs) 各模块，记录 letsTalk 等价物与 Gap。

**图例**：✅ 已有 · ⚠️ 部分 · ❌ 缺失 · — 不适用 · **概念对标** = 行业通用能力，非 Mastra 一级模块

| Mastra 模块 | 解决的生产问题 | letsTalk 等价 | 档位 | 状态 | Mastra 文档锚点 | 目标章 |
|-------------|----------------|---------------|------|------|-----------------|--------|
| **Agent** | 统一执行入口 | `runChat` / Pi loop | L2 | ⚠️ | [agents/overview](https://mastra.ai/docs/agents/overview) | [04](./04_RUNTIME_ENGINEERING.md) |
| **Memory** | 跨会话状态 | M0/M1/M2 + episodic | L3 | ✅ **冻结** | [memory/overview](https://mastra.ai/docs/memory/overview) | [07](./07_MEMORY.md) |
| **Artifact** | 大对象与 messages 分离 | `RequirementDraft` | L3 | ✅ | **概念对标** | [04](./04_RUNTIME_ENGINEERING.md) |
| **Workflow** | 固定步骤编排 | `background-memory-review` 等 | — | **N/A** | [workflows/overview](https://mastra.ai/docs/workflows/overview) | [08](./08_ENTERPRISE.md) |
| **HITL** | 人工确认 / 暂停 | `blockingQuestion` · `readyToFinalize` | L2 | ⚠️ | [workflows/suspend-and-resume](https://mastra.ai/docs/workflows/suspend-and-resume) | [04](./04_RUNTIME_ENGINEERING.md) |
| **Checkpoint** | 失败恢复 | Pi session jsonl | L2 | ⚠️ | [workflows/snapshots](https://mastra.ai/docs/workflows/snapshots) | [04](./04_RUNTIME_ENGINEERING.md) |
| **Tool** | 外部能力调用 | `create-session` tools | L2 | ⚠️ | [tools-mcp/overview](https://mastra.ai/docs/tools-mcp/overview) | [03](./03_TOOL_ENGINEERING.md) |
| **Trace** | 链路排障 | `debug-logger`（dev only） | L1 | ⚠️ | **概念对标** | [01](./01_LOGGING.md) · [05](./05_OBSERVABILITY.md) |
| **Eval** | 回归与量化 | `TEST_SCENARIO_*.md` 手工 | L0 | ❌ | [evals/overview](https://mastra.ai/docs/evals/overview) | [02](./02_EVALUATION.md) |
| **Metrics** | 系统健康 | 无 | L0 | ❌ | **概念对标** | [05](./05_OBSERVABILITY.md) |
| **Tool Approval** | 写操作人工批准 | write policy only | L1 | ❌ P2 | **概念对标** | [03](./03_TOOL_ENGINEERING.md) |
| **Replay** | 重现 / _fork 会话 | 无 | L0 | ❌ P2 | **概念对标** | [04](./04_RUNTIME_ENGINEERING.md) |
| **Dataset** | Eval 数据集 | scenario md 未结构化 | L0 | ❌ | [evals/overview](https://mastra.ai/docs/evals/overview) | [02](./02_EVALUATION.md) |
| **Lifecycle** | 请求全生命周期 | 隐式于 run-chat | L2 | ⚠️ | **概念对标** | [04](./04_RUNTIME_ENGINEERING.md) |
| **Streaming** | 流式输出 | SSE | L3 | ✅ | [agents/overview](https://mastra.ai/docs/agents/overview) | [04](./04_RUNTIME_ENGINEERING.md) |
| **Cancellation** | 用户中止 | 未系统化 | L0 | ❌ P2 | **概念对标** | [04](./04_RUNTIME_ENGINEERING.md) |
| **Logging** | 生产可检索日志 | console + debug JSONL | L2 | ⚠️ | **概念对标** | [01](./01_LOGGING.md) |

### 每周更新记录

| 周次 | 日期 | 档位变更（行 → 新档位） | 证据（PR / 测试路径） |
|------|------|-------------------------|----------------------|
| W0 基线 | 2026-06-10 | 初版 L 档位 | — |
| W1 | | | |
| W2 | | | |
| W3 | | | |
| W4 | | | |
| W5 | | | |
| W6 | | | |

---

## 三、核心结论

| 维度 | 状态 |
|------|------|
| **Runtime / 领域** | 较强 — Pi + PRD + Artifact 是护城河（L2～L3） |
| **Tool / Eval / Metrics** | 弱 — Mastra 生产模块最大 Gap（L0～L2） |
| **Memory / Context** | 足够 — **冻结扩展**，Eval 驱动（L3） |
| **Workflow 平台** | **N/A** — Pi 单循环，非缺陷 |

**整体**：领域 Agent L2～L3；**Mastra 工程对齐 L1～L2**（有意追赶项：Eval L0、Observability L1）。

### 工程铁律

权威定义与 Prompt 冻结政策 → [02 §1.1](./02_EVALUATION.md#11-工程铁律与-prompt-冻结)。

---

## 四、运行时生命周期 {#运行时生命周期}

Runtime Engineering 是 Mastra **Lifecycle** 在 letsTalk 的落地载体。

```text
User → Route → Session → Prefix → LLM → Tool → Artifact
  → Memory Review → Persist → SSE
```

（详图与 v1 相同，见各节点说明于 [04_RUNTIME](./04_RUNTIME_ENGINEERING.md)。）

**横切关注点**

| 关注点 | Mastra | letsTalk 现状 | 章 |
|--------|--------|---------------|-----|
| Log | ✅ | debug only | 01 |
| Trace | ✅ | ❌ | 05 |
| Metrics | ✅ | ❌ | 05 |
| Tool 契约 | ✅ | ⚠️ | 03 |
| Eval | ✅ | ❌ | 02 |

---

## 五、域成熟度矩阵

| 域 | vs Mastra | 档位 | 优先级 | 详情 |
|----|-----------|------|--------|------|
| **Evaluation** | 明显落后 | L0 | 🔴 **最高** | [02](./02_EVALUATION.md) |
| **Tool Engineering** | 明显落后 | L2 | 🔴 P0 | [03](./03_TOOL_ENGINEERING.md) |
| **Observability** | 明显落后 | L1 | 🔴 P0 | [05](./05_OBSERVABILITY.md) |
| **Logging & Cost** | 部分对齐 | L2 | 🔴 P0 | [01](./01_LOGGING.md) |
| **Runtime Engineering** | 部分对齐 | L2 | 🔴 P0 | [04](./04_RUNTIME_ENGINEERING.md) |
| **Context Engineering** | 领先于 Mastra 对标需求 | L3 | 🟢 巩固 | [06](./06_CONTEXT_ENGINEERING.md) |
| **Memory** | 足够 | L3 | 🟢 **冻结** | [07](./07_MEMORY.md) |
| **Workflow** | — | **N/A** | — | 见 §Workflow |
| **Enterprise** | 未起步 | ~15% | ⚪ 延后 | [08](./08_ENTERPRISE.md) |

---

## 六、分域 Gap 摘要

### Evaluation（L0）— 最高优先级

Mastra 有 Eval / Dataset；letsTalk 几乎空白。

| 已有 | 缺口 |
|------|------|
| TEST_SCENARIO_*.md | Promptfoo harness |
| smoke | Regression · CI gate |
| | success_rate · premature_finalize_rate · memory_hit_rate |

### Tool Engineering（L2）

| 已有 | 缺口 |
|------|------|
| write policy、截断 | ToolResult · timeout · retry · fallback |
| | idempotency · partial success（Tool Approval → **P2**，见 03） |

### Observability（L1）— 三支柱须齐

| 支柱 | 问题 | letsTalk |
|------|------|----------|
| Logs | 发生了什么？ | debug only |
| Traces | 卡在哪？ | ❌ |
| Metrics | 健康吗？ | ❌ |

核心指标 → [05 §Metrics](./05_OBSERVABILITY.md#核心-metrics)

### Runtime Engineering（L2）— P0 巩固

| 已有 | 缺口 |
|------|------|
| jsonl、SSE、draft、HITL 数据模型 | 显式 checkpoint · **Replay** |
| background-review | Cancellation · Lifecycle 文档化 |

### Memory（L3）— 停止扩展

暂停：graph / vector / 复杂反思 / 知识图谱。  
**Eval 证明瓶颈前不投入。** 见 [07](./07_MEMORY.md)。

### Workflow（N/A）{#workflow-na}

```text
项目选择：Pi 单循环 Runtime
不追求：DAG · LangGraph · Workflow DSL
Workflow「缺失」= 架构选择，不是 Gap 扣分项
```

---

## 七、优先级总览（v2）

```text
P0 · 最高
  02 Evaluation        ← 第二周先攻；约束一切 Prompt/Memory 变更
  03 Tool Engineering
  01 Logging + 05 Metrics 基础（第一周）
  04 Runtime 巩固（第四、六周）

P1
  05 Trace 深化（Langfuse PoC → 自托管部署）

P2
  Tool Approval · Replay · Cancellation

巩固 / 冻结
  06 Context
  07 Memory（Eval 驱动，非兴趣驱动）

N/A / 延后
  Workflow 平台 · 迁移 Mastra · Multi-agent · Enterprise
```

---

## 八、六周计划（学习 + 交付物）{#六周计划}

> **方案 A**：每周 Day 1～2 学习，Day 3～5 代码交付。档位变更须有 PR/测试证据。

| 周 | 主题 | 前置依赖 | 交付物（Day 3～5） | 验收标准 | 矩阵预期 |
|----|------|----------|-------------------|----------|----------|
| **1** | Log · Token · Metrics M0 | — | pino 接入 `run-chat.ts`；`traceId` 贯穿一次请求 | 一条请求 grep 出 ≥5 条结构化 log | Logging L2→L3 |
| **2** | Eval · Promptfoo | W1 token/cost 字段 | `promptfoo` config + ≥3 单轮 scenario；`pnpm eval` | `pnpm eval` 存在且通过 | Eval L0→L2 |
| **3** | Tool · ToolResult | W1 trace 字段 | wrapper + ≥3 tool 接 timeout | 人为超时，LLM 收到结构化 error | Tool L2→L3 |
| **4** | Runtime · 状态持久化 | — | 消灭进程内孤儿状态；SoT 表落地 | 重启后 draft revision 不丢 | Runtime L2→L3 |
| **5** | Langfuse Trace | W1 traceId；**⭐ 数据出域决策** | `Tracer` 接口 + Langfuse adapter；`llm.call`/`tool.execute` span | Langfuse UI 见完整 trace 树 | Trace L1→L3 |
| **6** | Runtime 定稿 · 矩阵复盘 | W1～W5 | 04 架构文档定稿；矩阵复盘 | ≥4 行档位提升且有 PR 证据 | 多行文档化 |

---

## 九、进度追踪

### 域档位（季度）

| 域 | 2026-06 基线 | Q3 目标 | 证据 |
|----|-------------|---------|------|
| Evaluation | L0 | L3 | `pnpm eval` + 3 scenario |
| Tool | L2 | L3 | ToolResult wrapper PR |
| Observability | L1 | L3 | Langfuse trace PR |
| Logging | L2 | L3 | pino + traceId PR |
| Runtime | L2 | L3 | SoT 持久化 PR |
| Memory | L3 | L3（冻结） | — |

### Mastra 矩阵关键行（季度）

| 行 | 基线 | Q3 目标 |
|----|------|---------|
| Eval | L0 ❌ | L3 · Promptfoo + 3 scenario |
| Metrics | L0 ❌ | L2 · log 级 + Langfuse 承接 |
| Trace | L1 ⚠️ | L3 · Langfuse PoC |
| Tool Approval | L1 ❌ P2 | 设计稿 only |
| Replay | L0 ❌ P2 | 不排 |

---

## 十、与 IMPLEMENTATION_PHASES 的关系

| 文档 | 跟踪 |
|------|------|
| [IMPLEMENTATION_PHASES.md](../IMPLEMENTATION_PHASES.md) | **功能**列表 |
| **本文 Mastra 矩阵** | **工程**成熟度 |

Backlog 写法：`[ ] Mastra 矩阵行：Eval → 见 02`

---

## 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| V1.0 | 2026-06-10 | 从单体文档拆出 |
| V2.0 | 2026-06-10 | 北极星改为 Mastra；新增对照矩阵；Runtime/Eval 优先级；Workflow N/A |
| V2.1 | 2026-06-10 | 章节编号对齐六周顺序；Trace 落地选型定为 Langfuse |
| V3.0 | 2026-06-10 | 五档标尺；六周交付物；Mastra 锚点列；命名规范；方案 A |
