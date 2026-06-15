# 02 — Evaluation 实施文档 & 进度

| 项目 | 内容 |
|------|------|
| 父文档 | [02_EVALUATION.md](./02_EVALUATION.md) |
| 前置依赖 | [01_LOGGING_IMPLEMENTATION.md](./01_LOGGING_IMPLEMENTATION.md)（`turnCostUsd` · trace jsonl） |
| 档位目标 | Evaluation **L0 → L2**（Promptfoo + ≥3 单轮 scenario + `pnpm eval`） |
| 开始日期 | 待定（Week 2） |

---

## 给不熟悉这些技术的读者：一句话版

| 概念 | 类比 | letsTalk 里干什么 |
|------|------|-------------------|
| **Smoke** | 开机自检 | `pnpm smoke` — 能连上 LLM、能跑一轮 |
| **Eval** | 单元测试 + 回归 | `pnpm eval` — 改 prompt 后，行为还对不对 |
| **Promptfoo** | Jest 之于 LLM | YAML 写「输入 + 期望」，批量跑、出报告 |
| **Scenario Bank** | 测试用例库 | 把 `docs/TEST_SCENARIO_*.md` 变成可自动跑的用例 |
| **Custom Provider** | 测试里的 mock HTTP 客户端 | 不调 OpenAI 直连，而是调 **letsTalk 自己的 chat 链路** |

**Smoke 问「通不通」；Eval 问「对不对」。**  
没有 Eval 就改 prompt，等于改业务规则却不写测试 — 文档里的铁律来源：[02 §1.1](./02_EVALUATION.md#11-工程铁律与-prompt-冻结)。

---

## 架构：双层 Eval（本期只做 Layer 1）

```text
┌─ Layer 1（Week 2 交付）─────────────────────────────────────┐
│ Promptfoo + 自定义 provider                                   │
│ 单轮：固定用户消息 → 断言 draft / 工具 / 文本 / cost          │
│ 场景来源：TEST_SCENARIO_*.md 的「第 1 轮」                    │
└──────────────────────────────────────────────────────────────┘
          ↓ Q3
┌─ Layer 2（暂不实施）──────────────────────────────────────────┐
│ 自建 scenario runner（TS 脚本）                               │
│ 多轮：HITL 暂停、draft revision 递增、blockingQuestion 演进   │
└──────────────────────────────────────────────────────────────┘
```

### Eval 三层（技术分层，与 02 一致）

| 层 | 本期范围 | 例子 |
|----|----------|------|
| **Unit** | 已有零散脚本，不纳入 `pnpm eval` | memory 解析、skills 索引 |
| **Scenario** | **Week 2 主战场** | 支付审批第 1 轮：`readyToFinalize !== true` |
| **Regression** | Week 2 末附 `--output` 对比 | 改 `pm-prd.ts` 前后 pass rate / cost |

---

## 决策记录（待确认）

| 项 | 建议 | 理由 | 状态 |
|----|------|------|------|
| Eval 调用方式 | **进程内 `runChat`**，不走 HTTP | 无需起 dev server；与 prod 同代码路径 | ⬜ 待确认 |
| Eval 包位置 | 根目录 `eval/` | 与 `packages/` 平级，Promptfoo 惯例 | ⬜ 待确认 |
| 会话隔离 | 每个 scenario 用 **新 `sessionId`** | 避免 Pi jsonl / draft 串扰 | ⬜ 待确认 |
| Actor | 固定 `eval-bot` actor | 与真人会话隔离；registry 可写死一条 | ⬜ 待确认 |
| LLM 花费 | 本地跑，**不入 CI**（首期） | 真调 API，成本高、需密钥 | ⬜ 待确认 |
| cost 断言来源 | `TraceRecorder` _finalize 后的 `turnCostUsd` | W1 已落盘，不依赖 Langfuse | ✅ 可用 |
| 结构断言来源 | SSE 聚合后的 `requirement_state` | 含 `readyToFinalize` / `blockingQuestion` / `items` | ✅ 可用 |
| Prompt 冻结 | Eval 建成前默认冻结 `pm-prd.ts` | 见 02 §1.1；紧急改动手工记 PM_TEST_RECORD | ✅ 政策已定 |

---

## 进度总览

| Phase | 内容 | 状态 | 证据 |
|-------|------|------|------|
| **0** | 读 Promptfoo 教程 · 定目录结构 | ⬜ | — |
| **1** | `eval/providers/lets-talk.ts` 聚合 SSE → JSON | ⬜ | — |
| **2** | `promptfoo.yaml` + 支付审批第 1 轮 | ⬜ | — |
| **3** | +银行切换、真实需求第 1 轮；注册 `pnpm eval` | ⬜ | — |
| **4** | metrics 汇总脚本 + 改 prompt 工作流文档化 | ⬜ | — |
| **验收** | `pnpm eval` 3 scenario 全绿；矩阵 Eval L0→L2 | ⬜ | — |

---

## 代码地图（计划新增）

```text
eval/
  promptfoo.yaml              # 主配置：providers · scenarios · defaultTest
  providers/
    lets-talk.ts              # Promptfoo custom provider
  lib/
    run-turn.ts               # 调 runChat，收 SSE，返回 EvalTurnResult
    parse-sse.ts              # SSE 行 → 事件数组
  scenarios/
    payment-approval-r1.yaml  # 支付批量审批 · 第 1 轮
    bank-switch-r1.yaml       # 银行切换 · 第 1 轮
    real-requirement-r1.yaml  # 零金额剔除背景 · 第 1 轮
  metrics/
    summarize.mjs             # 读 Promptfoo output → success_rate 等
```

| 依赖（已有，不改契约） | 用途 |
|------------------------|------|
| `packages/agent-runtime/src/run-chat.ts` | 与线上一致的执行路径 |
| `packages/shared-types` · `RequirementDraftState` | 结构断言字段 |
| `packages/agent-runtime/src/trace-recorder.ts` | cost / tools / duration |
| `docs/TEST_SCENARIO_*.md` | 人工场景 → YAML 的语义来源 |
| `docs/PM_TEST_RECORD.md` | Eval 建成前的手工对照记录 |

---

## 核心：`EvalTurnResult`（provider 返回给 Promptfoo 的 JSON）

> **为何必须自定义 provider？**  
> Promptfoo 默认 provider 只拿到「模型文本」。letsTalk 还要断言 `readyToFinalize`、调了哪些 tool、`turnCostUsd` —— 这些在 SSE / trace 里，不在纯文本里。  
> 所以 provider 要跑完整 chat 链路，再拼成结构化对象供 `javascript` / `cost` assert 使用。

```typescript
/** eval/lib/types.ts — 概念形状 */
interface EvalTurnResult {
  /** 助手最终回复（SSE assistant_delta 拼接） */
  assistantText: string;
  /** 最后一帧 requirement_state（prd 模式） */
  draft: RequirementDraftState | null;
  /** 本轮调用的工具名（去重保序） */
  tools: string[];
  /** TraceRecorder _finalize 后 */
  turnCostUsd: number | null;
  durationMs: number;
  traceId: string;
  success: boolean;
  error?: string;
}
```

Promptfoo 侧把 `JSON.stringify(EvalTurnResult)` 当作 `output`，或只暴露 `output` 字段为上述对象（实现时按 Promptfoo custom provider API 二选一）。

---

## Scenario Bank → 首期 3 个用例（Layer 1 · 仅第 1 轮）

### 1. 支付计划批量审批（`payment-approval-r1`）

| 项 | 内容 |
|----|------|
| 来源 | [TEST_SCENARIO_PAYMENT_APPROVAL.md](../TEST_SCENARIO_PAYMENT_APPROVAL.md) §第 1 轮 |
| `chatMode` | `prd` |
| 用户消息 | 「我们四川医保局那边觉得现在一个个点支付计划太慢了…」 |
| 断言（机器可验） | `draft.readyToFinalize === false` |
| 断言（LLM rubric） | 以追问或概要开头，不直接写死 toBe 定论 |
| 断言（工具，软） | `tools` 含 `get_business_hints` 或读了 hints 相关路径（首期可 warning） |
| cost | `< 0.50` USD |

### 2. 银行切换（`bank-switch-r1`）

| 项 | 内容 |
|----|------|
| 来源 | [TEST_SCENARIO_BANK_SWITCH.md](../TEST_SCENARIO_BANK_SWITCH.md) §第 1 轮 |
| `chatMode` | `prd` |
| 用户消息 | 「省局要求把四川的医保支付银行从工行换成农行…」 |
| 断言 | 四川切换 vs 宁夏对账 **不应混为一条** draft item（`items.length` 或 title 分离） |
| 断言 | `readyToFinalize === false` |
| 工具 | 期望 `get_business_hints` |

### 3. 真实需求 · 背景轮（`real-requirement-r1`）

| 项 | 内容 |
|----|------|
| 来源 | [TEST_SCENARIO_REAL_REQUIREMENT.md](../TEST_SCENARIO_REAL_REQUIREMENT.md) §第 1 轮 |
| `chatMode` | `prd` |
| 用户消息 | 「最近省医保局那边提了个问题，子表里会推金额为 0 的数据…」 |
| 断言 | 不猜解决方案写进 toBe（javascript：无 item 或 toBe 无「剔除」「过滤」等定论句） |
| 断言 | `readyToFinalize === false` |

### Layer 2 暂缓（多轮，Q3）

| 场景 | 为何不能 Layer 1 |
|------|------------------|
| 支付审批第 2～4 轮 | 依赖上一轮 session 状态 |
| blockingQuestion 出现时机 | 需多轮输入 |
| draft revision 递增 | 需同 session 连续 prompt |

---

## `promptfoo.yaml` 结构（草案）

```yaml
description: letsTalk PRD scenario bank — Layer 1

providers:
  - id: lets-talk
    label: letsTalk runChat (prd)
    config:
      chatMode: prd
      workspaceRoot: ${WORKSPACE_ROOT}
      # provider 实现读 .env 的 LLM_API_KEY

prompts:
  - "{{message}}"   # 用户消息由 vars 注入

defaultTest:
  options:
    provider: lets-talk

tests:
  - description: payment-approval-round-1
    vars:
      message: |
        我们四川医保局那边觉得现在一个个点支付计划太慢了，想做个批量审批功能...
    assert:
      - type: javascript
        value: output.draft?.readyToFinalize !== true
      - type: llm-rubric
        value: 以追问或业务概要开头，不直接把未核实的规则写成 toBe 定论
      - type: cost
        threshold: 0.50

  # bank-switch-r1、real-requirement-r1 同理，见 eval/scenarios/*.yaml
```

---

## 核心 Metrics 初稿（与 05 联动）

| 指标 | Layer 1 怎么算 | 首期目标（可调） |
|------|----------------|------------------|
| `success_rate` | Promptfoo pass / total | ≥ 80%（3 场景中 ≥2.4→取整 **3/3 或 2/3 协商**） |
| `premature_finalize_rate` | 第 1 轮 scenario 中 `readyToFinalize===true` 的比例 | **0%** |
| `tool_success_rate` | trace `tools[].ok` | 记录不设 gate（首期） |
| `cost` | `turnCostUsd` 均值 / max | 单场景 < $0.50；3 场景合计 < $1.50 |
| `latency` | `durationMs` | 记录 P95，首期不设硬门槛 |

汇总命令（计划）：

```bash
pnpm eval                    # promptfoo eval -c eval/promptfoo.yaml
pnpm eval:summary            # node eval/metrics/summarize.mjs .promptfoo/output.json
```

---

## Smoke vs Eval（落地后）

| | `pnpm smoke` / `minimal` | `pnpm eval` |
|--|--------------------------|-------------|
| 跑什么 | Pi session 一句话 | 3 个 PRD 场景完整链路 |
| 调工具 | minimal 常关闭 | **开启**（`useTools: true`） |
| 失败含义 | 环境/依赖坏了 | **行为回归**或 prompt 改坏了 |
| 何时跑 | 每次 build / 改 runtime | **改 `pm-prd.ts` 或 tool 前** |

---

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `LLM_API_KEY` | 是 | 与 dev 相同 |
| `WORKSPACE_ROOT` | 是 | 仓库根或 SMIFC 运行根 |
| `LETS_TALK_EVAL=1` | 建议 | provider 内：跳过 background-memory-review 等副作用（实施时评估） |
| `LOG_VERBOSE=0` | 建议 | eval 时减少终端噪音 |

---

## 推荐工作流（Eval 建成后）

```text
要改 packages/context/src/prompt/pm-prd.ts
  ↓
pnpm eval（本地，约 3 次 LLM 调用）
  ↓
看 pass rate + cost 对比上次 output
  ↓
通过 → merge
失败 → 修 prompt，或更新 scenario（有意行为变更须改 YAML 并注明）
```

**冷启动期（现在）**：Eval 未建成 → 改 prompt 须在 [PM_TEST_RECORD.md](../PM_TEST_RECORD.md) 手工记前后对照。

---

## Week 2 日程（与 02 §10 对齐）

| 天 | 交付 |
|----|------|
| 1–2 | 读 [Promptfoo 文档](https://www.promptfoo.dev/docs/providers/custom-api)；定 `eval/` 目录；跑通 **1 个** hello scenario（explore 模式即可） |
| 3 | `payment-approval-r1` 全断言；`readyToFinalize` 结构断言 verified |
| 4 | `bank-switch-r1` + `real-requirement-r1`；根 `package.json` 加 `"eval": "promptfoo eval -c eval/promptfoo.yaml"` |
| 5 | **验收**：`pnpm eval` 绿；更新 [00 矩阵](./00_GAP_ASSESSMENT.md) Eval 行 L0→L2 |

---

## 风险与边界

| 风险 | 缓解 |
|------|------|
| LLM 非确定性，同用例偶发失败 | 首期单次跑；后续可加 `repeat: 2` 或温度 0 |
| 真 API 费用 | 仅 3 单轮；CI 不跑；或加 `EVAL_SKIP=1` dry-run mock |
| `runChat` 写盘污染 | 每用例新 `sessionId`；eval 专用子目录 `.agent/conversations/eval/` |
| rubric 断言主观 | 结构断言（`readyToFinalize`）为主；rubric 为辅 |

---

## 自检清单（来自 02 §9）

- [ ] 支付审批第 1 轮 Promptfoo 用例（含 custom provider 说明）→ 本文 + `eval/scenarios/`
- [ ] 5 个 core metrics 目标值初稿 → 本文 §核心 Metrics
- [ ] 3 scenario 的 Layer 归属 → 本文 §Scenario Bank（均为 Layer 1；多轮等 Layer 2）

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-06-12 | 创建实施文档；对齐 W1 trace/cost 产出；Scenario Bank 映射 3 用例 |
