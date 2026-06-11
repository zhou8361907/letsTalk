# letsTalk AI Engineering Handbook

| 项目 | 内容 |
|------|------|
| 版本 | V3.0 |
| 日期 | 2026-06-10 |
| 北极星 | **向 [Mastra](https://mastra.ai/) 的工程成熟度逐步靠拢**（学习设计理念，不迁移、不复刻） |
| 姊妹文档 | [00_GAP_ASSESSMENT.md](./00_GAP_ASSESSMENT.md)（Mastra 对照矩阵 · 成熟度 · 优先级） |

---

## 项目目标（v2）

**不再以**「完成 Agent Engineering Roadmap / 堆更多功能」为目标。

**改为**：提高 letsTalk 的工程成熟度，使其逐渐具备：

```text
可靠性 · 可观测性 · 可测试性 · 可恢复性 · 可维护性 · 可演进性
```

功能数量不是成熟度指标。**工程能力才是。**

### 长期公式

```text
Pi Runtime
  + Mastra Engineering（设计理念吸收）
  + Langfuse Observability（+ OTel 导出）
  + Promptfoo Evaluation
  + 业务知识（SMIFC / PM 域）
  = 企业级 letsTalk
```

### 成熟度参考对象

| 参考 | 角色 |
|------|------|——
| **[Mastra](https://mastra.ai/)** | **唯一对标** — Agent 世界的 Spring Boot；生产问题已抽象为模块 |
| Pi SDK | **运行时** — 不替换 |
| **Langfuse** / OTel | Observability 落地选型（学习 + 自托管部署） |
| Promptfoo | Evaluation 落地选型 |

**不作为成熟度对标**：Claude Code、Hermes、LangGraph、各类 Agent Demo。  
领域设计（Memory 分层、PRD 模式）可继续读 Hermes 文档，但**工程进度以 Mastra 对照矩阵为准**。

### 决策原则（最重要）

不要问：「还能加什么功能？」

而要问：

1. **Mastra 为什么会有这个模块？**
2. **它解决了什么生产问题？**
3. **letsTalk 是否会遇到同样的问题？**

只有第三问答案是 **「会」** 时，才实现它。

```text
需求驱动 · 不是功能驱动
Eval 驱动 Memory · 不是兴趣驱动 Memory
```

工程铁律（含 Prompt 冻结政策）→ [02 §1.1](./02_EVALUATION.md#11-工程铁律与-prompt-冻结)。

### 毕业标准（追赶模式 → 维护模式）

当 Mastra 矩阵满足以下条件时，Handbook 从**追赶模式**转入**维护模式**（矩阵改为月度更新、六周计划不再滚动）：

```text
所有 🔴 P0 行档位 ≥ L3
且 Eval · Logging · Tool 三行档位 = L3 以上（有 PR/测试证据）
```

详见 [00 §成熟度标尺](./00_GAP_ASSESSMENT.md#成熟度标尺) · [00 §六周计划](./00_GAP_ASSESSMENT.md#六周计划)。

---

## 怎么用这套文档

```text
每周维护 Mastra 对照矩阵     → 00_GAP_ASSESSMENT.md §Mastra 矩阵
想知道缺什么、先补什么         → 00_GAP_ASSESSMENT.md
深入某一主题                   → 01～08
上线前勾选                     → 99_PRODUCTION_CHECKLIST.md
避坑                           → 98_ANTI_PATTERNS.md
```

**原则**：00 只维护矩阵与分数；知识细节在 01～08 增量写，避免单体文档失控。

---

## 文档索引

| 编号 | 文档 | 主题 | 档位 | 优先级 |
|------|------|------|------|--------|
| **00** | [00_GAP_ASSESSMENT.md](./00_GAP_ASSESSMENT.md) | 矩阵 · **五档标尺** · [命名规范](./00_GAP_ASSESSMENT.md#命名规范) · 六周交付物 | — | 每周维护 |
| **01** | [01_LOGGING.md](./01_LOGGING.md) | Log · trace · token/cost | L2 | 🔴 P0 · Week 1 |
| **02** | [02_EVALUATION.md](./02_EVALUATION.md) | Scenario · Regression · Promptfoo | L0 | 🔴 **最高** · Week 2 |
| **03** | [03_TOOL_ENGINEERING.md](./03_TOOL_ENGINEERING.md) | ToolResult · timeout · errorCode | L2 | 🔴 P0 · Week 3 |
| **04** | [04_RUNTIME_ENGINEERING.md](./04_RUNTIME_ENGINEERING.md) | Session · SoT · HITL · Stream | L2 | 🔴 P0 · Week 4/6 |
| **05** | [05_OBSERVABILITY.md](./05_OBSERVABILITY.md) | Tracer · Langfuse · Metrics | L1 | 🔴 P0 · Week 1/5 |
| **06** | [06_CONTEXT_ENGINEERING.md](./06_CONTEXT_ENGINEERING.md) | JIT · Prompt 分层 · 预算 | L3 | 🟢 巩固 |
| **07** | [07_MEMORY.md](./07_MEMORY.md) | M0/M1/M2 · **Eval 驱动扩展** | L3 | 🟢 冻结 |
| **08** | [08_ENTERPRISE.md](./08_ENTERPRISE.md) | 企业级 · Workflow N/A | L1 | ⚪ 延后 |
| **98** | [98_ANTI_PATTERNS.md](./98_ANTI_PATTERNS.md) | 常见误区 | — | 必读 |
| **99** | [99_PRODUCTION_CHECKLIST.md](./99_PRODUCTION_CHECKLIST.md) | 上线勾选 | — | 上线用 |

**架构决策（非缺陷）**

| 主题 | 状态 |
|------|------|
| Workflow / LangGraph / DAG | **N/A** — Pi 单循环，见 [00 §Workflow](./00_GAP_ASSESSMENT.md#workflow-na) |
| 迁移到 Mastra | **N/A** — 只吸收工程理念 |
| Multi-agent 平台 | **延后** |

---

## 统一运行时模型

各章映射同一条生命周期（详见 [00](./00_GAP_ASSESSMENT.md#运行时生命周期)）：

```text
User → Route → Session → Prefix → LLM → Tool → Artifact
  → Memory Review → Persist → SSE
```

**Runtime Engineering（04）** 是这条链的「所有权」章节 — letsTalk 的核心护城河。

---

## 六周优先级（v3 · 学习 + 交付物）

> 完整表（前置依赖 · 验收标准 · 矩阵预期）→ [00 §八](./00_GAP_ASSESSMENT.md#六周计划)

| 周 | 主题 | 交付物摘要 | 文档 |
|----|------|------------|------|
| **1** | Logging · Metrics M0 | pino + traceId 贯穿请求 | [01](./01_LOGGING.md) · [05](./05_OBSERVABILITY.md) |
| **2** | Evaluation | `pnpm eval` + 3 单轮 scenario | [02](./02_EVALUATION.md) |
| **3** | Tool | ToolResult wrapper + timeout | [03](./03_TOOL_ENGINEERING.md) |
| **4** | Runtime | 消灭进程内孤儿状态 | [04](./04_RUNTIME_ENGINEERING.md) |
| **5** | Langfuse Trace | Tracer 接口 + 2 span 可见 | [05](./05_OBSERVABILITY.md) |
| **6** | 定稿 · 复盘 | 04 架构文档 + 矩阵 ≥4 行升档 | [04](./04_RUNTIME_ENGINEERING.md) · [00](./00_GAP_ASSESSMENT.md) |

**穿插**： [06_CONTEXT](./06_CONTEXT_ENGINEERING.md) · [07_MEMORY](./07_MEMORY.md)（只读）· [98_ANTI_PATTERNS](./98_ANTI_PATTERNS.md)

---

## 与项目其它文档的关系

| 文档 | 分工 |
|------|------|
| [IMPLEMENTATION_PHASES.md](../IMPLEMENTATION_PHASES.md) | **功能**做什么（Feature List） |
| **本 Handbook** | **工程**做得够不够（Mastra 矩阵） |
| [MEMORY_V1.md](../MEMORY_V1.md) | 记忆领域规格（与 07 配合，扩展由 Eval 驱动） |
| [CODEBASE_GUIDE.md](../CODEBASE_GUIDE.md) | 代码结构与请求链路 |

---

## 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| V1.0 | 2026-06-10 | 自单体评估文档拆分为 Handbook |
| V2.0 | 2026-06-10 | 北极星改为 Mastra 工程成熟度；Runtime/Eval 优先级调整 |
| V2.1 | 2026-06-10 | 章节编号对齐六周学习顺序；Observability 落地选型改为 Langfuse |
| V3.0 | 2026-06-10 | 五档标尺；六周交付物验收；毕业标准；评审意见落地 |
