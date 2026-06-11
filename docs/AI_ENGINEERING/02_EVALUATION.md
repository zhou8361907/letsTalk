# 02 — Evaluation

| 档位 | 优先级 | Mastra 矩阵 |
|------|--------|---------------|
| L0 | 🔴 **最高** | Eval ❌ · Dataset ❌ |

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> **Mastra 视角**：Eval 是生产 Agent 的「单元测试 + 回归」；没有它，Prompt/Memory/Tool 改动都是盲飞。  
> **学习顺序 Week 2** — 全 Handbook **最高优先级**，早于 Tool 深化与 Langfuse Trace。  
> **前置依赖**：Week 1 的 token/cost 字段（cost 断言依赖 [01](./01_LOGGING.md) 产出）。

---

## 1. 目标

- 改 prompt / tool 前后可量化对比
- 核心 PM 场景不回归
- 建立 Agent 特有 metrics（非仅「输出含某词」）

### 1.1 工程铁律与 Prompt 冻结 {#11-工程铁律与-prompt-冻结}

> **本小节为铁律权威出处**；README / 00 仅引用此处。

```text
没有 Eval，不允许修改 Prompt
没有数据，不优化 Memory
没有指标，不调整 Agent
```

**冷启动政策（Eval 建成前）**：

- `packages/context/src/prompt/` 与 `.agent/prompt/` **默认冻结**
- 紧急修改须：在 [PM_TEST_RECORD.md](../PM_TEST_RECORD.md) 记录修改前后行为对照
- Week 2 交付 `pnpm eval` 后，改 prompt 须先跑 Scenario Bank

Mastra 有 Eval/Dataset；letsTalk 矩阵两行均为 L0 — **最先补齐**。

---

## 2. Eval 双层架构 {#eval-双层架构}

Promptfoo 强在**单轮 prompt 对比**；letsTalk 核心场景（多轮探询、HITL、draft 演进）需分层：

```text
Layer 1（Week 2 落地）— Promptfoo
  适用：单轮断言 — 第 1 轮不 finalize、必须调某 tool、cost 上限
  实现：自定义 provider 调 chat API，返回结构化 JSON

Layer 2（Q3 评估）— 自建 scenario runner
  适用：多轮对话、HITL 暂停/恢复、draft 状态演进
  实现：TS 脚本驱动 session，每轮 assert state；metrics 格式与 Layer 1 一致
  备选：DeepEval 浏览即可；多轮 agent eval 框架均不成熟，建议自研轻量 runner
```

### 2.1 Eval 三层（技术分层）

```text
Unit        episodic 触发词、memory 解析、skills 索引
Scenario    固定输入（+ 可选多轮）→ 断言 draft/工具/结构
Regression  改 prompt 前后 success_rate · cost · latency 对比
```

---

## 3. letsTalk 现状

| 已有 | 路径 |
|------|------|
| 手工 PM 场景 | `docs/TEST_SCENARIO_*.md` |
| 测试记录 | `docs/PM_TEST_RECORD.md` |
| 单元脚本 | `test-session-db.ts`、`test-episodic-prefetch.ts`、`test-skills.ts` |
| Smoke | `smoke-session.ts`、`minimal.ts` |

| 缺失 | |
|------|--|
| Promptfoo / harness | |
| CI eval gate | |
| regression metrics | |

---

## 4. Scenario Bank

### 4.1 现有场景

| 场景 | 文档 | 测什么 |
|------|------|--------|
| 支付批量审批 | [TEST_SCENARIO_PAYMENT_APPROVAL.md](../TEST_SCENARIO_PAYMENT_APPROVAL.md) | 探询、hints、跨省 |
| 银行切换 | [TEST_SCENARIO_BANK_SWITCH.md](../TEST_SCENARIO_BANK_SWITCH.md) | 银行域 |
| 真实需求 | [TEST_SCENARIO_REAL_REQUIREMENT.md](../TEST_SCENARIO_REAL_REQUIREMENT.md) | 端到端 |
| … | `docs/TEST_SCENARIO_*.md` | |

### 4.2 Scenario → Promptfoo 映射（示例）

> **注**：`readyToFinalize` 等结构断言要求 **自定义 provider** 返回 JSON 对象（非纯文本），否则 `javascript` assert 无法读取字段。

```yaml
# 概念示例 — 支付审批第 1 轮（Layer 1 单轮）
description: payment-approval-round-1
providers:
  - id: letsTalk-chat-api
    config:
      # 自定义 provider：POST chat/stream，解析 SSE 聚合为 JSON
      outputSchema: { readyToFinalize: boolean, blockingQuestion: string }
vars:
  message: >
    我们四川医保局那边觉得现在一个个点支付计划太慢了…
  chatMode: prd
assert:
  - type: llm-rubric
    value: 以追问或概要开头，不直接写死 toBe 定论
  - type: javascript
    value: output.readyToFinalize !== true
  - type: cost
    threshold: 0.50   # USD 上限初稿（Promptfoo cost 单位为美元，非 token）
```

### 4.3 Agent 特有断言

| 类型 | 示例 | Layer |
|------|------|-------|
| 结构 | `readyToFinalize` 不应在第 1 轮 true | L1 |
| 工具 | 应 read hints 或 `get_business_hints` | L1 |
| 禁止 | 未验证 toBe 不得写成定论 | L1 |
| 成本 | 单场景 cost < $0.50 | L1（依赖 W1） |
| HITL | `blockingQuestion` 在模糊输入时出现 | L2（多轮 runner） |
| Draft 演进 | 第 3 轮 draft revision 递增 | L2 |

---

## 5. 核心 Metrics（与 05 联动）

| 指标 | Eval 用途 | 采集来源 |
|------|-----------|----------|
| `success_rate` | scenario pass 比例 | Eval 离线 |
| `premature_finalize_rate` | PRD 质量 | Eval 离线 |
| `tool_success_rate` | 工具链健康 | 线上 log / Langfuse |
| `cost` | 改 prompt 是否变贵 | Eval 离线 + Langfuse |
| `latency` | 性能回归 | 线上 trace |

---

## 6. Smoke vs Eval

| | Smoke | Eval |
|--|-------|------|
| 问题 | 链路通吗？ | 行为对吗？ |
| 命令 | `pnpm smoke` / `minimal` | `pnpm eval`（Promptfoo） |
| 频率 | 每次 build | 改 prompt/tool 前 |

---

## 7. 工作流（推荐）

```text
改 packages/context/src/prompt/pm-prd.ts
  ↓
跑 Scenario Bank（≥3 场景，Layer 1）
  ↓
对比 metrics（pass rate、cost）
  ↓
通过 → merge；失败 → 修 prompt 或更新 scenario（有意变更）
```

**规则**：**没有 Eval 就不改 Prompt** → [98_ANTI_PATTERNS](./98_ANTI_PATTERNS.md)

---

## 8. 学习资源

| 资源 | 重点 |
|------|------|
| [Promptfoo 文档](https://www.promptfoo.dev/docs/intro) | YAML assert · custom provider |
| [TEST_SCENARIO_PAYMENT_APPROVAL.md](../TEST_SCENARIO_PAYMENT_APPROVAL.md) | 断言点标注 |
| OpenAI Cookbook · eval | 生产案例 |

---

## 9. 自检

- [ ] 为支付审批第 1 轮写 1 个 Promptfoo 用例（含 custom provider 说明）
- [ ] 定义 5 个 core metrics 目标值初稿
- [ ] 区分 3 个 scenario：哪些 Layer 1、哪些等 Layer 2

---

## 10. Week 2 计划（学习 + 交付物）

| 天 | 内容 |
|----|------|
| 1-2 | Promptfoo tutorial · custom provider 概念 |
| 3 | `promptfoo.yaml` + PAYMENT_APPROVAL 第 1 轮 |
| 4 | 第 2、3 个 scenario · 注册 `pnpm eval` |
| 5 | **验收**：`pnpm eval` 通过；档位 Eval L0→L2，附 config 路径 |
