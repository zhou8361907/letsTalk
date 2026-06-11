# 98 — Anti-patterns（常见误区）

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> 针对 letsTalk 的高频反模式。北极星是 **Mastra 工程成熟度**，不是功能数量。

---

## 1. 把所有状态塞进 messages

**表现**：PRD 全文、grep 结果、memory 大段复制进对话历史。

**后果**：context 爆炸、compact 频繁、成本飙升、模型抓错重点。

**正确做法**：

- Artifact 独立存储（`requirementDraft`）
- messages 留指针；Pull 工具读全文
- 见 [04_RUNTIME §Artifact](./04_RUNTIME_ENGINEERING.md#4-artifact) · [06_CONTEXT](./06_CONTEXT_ENGINEERING.md)

---

## 2. Tool throw 代替结构化 error

**表现**：grep 失败 `throw`；route 返回 500；turn 整体中断。

**后果**：LLM 无法自愈；用户只看到「出错了」；无 tool_success_rate。

**正确做法**：

- 返回 `ToolResult { success: false, error: "..." }`
- throw 仅用于编程 bug、不可恢复配置
- 见 [02_TOOL_ENGINEERING](./03_TOOL_ENGINEERING.md)

---

## 3. 提前 Multi-Agent

**表现**：加 Planner Agent、Writer Agent、Reviewer Agent 各一套 prompt + 路由。

**后果**：observability 复杂度 ×N；调试困难；letsTalk 已有 Pi loop + background review 够用。

**正确做法**：

- 主 Agent + 异步 review（已有）
- 见 [08_ENTERPRISE §Multi-Agent](./08_ENTERPRISE.md#3-multi-agent--延后)

---

## 4. 提前 Workflow / LangGraph

**表现**：为 PM 探询建 DAG；每步固定节点。

**后果**：与「自主 grep 探索代码库」目标冲突；维护 DSL 成本。

**正确做法**：

- Pi 单循环 + PRD state 机
- Workflow = **N/A**，见 [00 §Workflow](./00_GAP_ASSESSMENT.md#workflow-na)

---

## 5. 提前向量库 / mem0

**表现**：「记忆不够智能」→ 上 embedding + 向量检索。

**后果**：过度设计；引入新 failure mode；无 Eval 证明需求。

**正确做法**：

- FTS + M0/M1/M2 先用满
- **Eval 证明召回不足** 再解冻
- 见 [07_MEMORY §冻结](./07_MEMORY.md#5-冻结扩展策略)

---

## 6. Prompt 分散在 route / 组件 / 多处字符串

**表现**：改行为要 grep 全仓库；同一规则三处不一致。

**后果**：token 浪费、指令冲突、无法 regression。

**正确做法**：

- `packages/context/src/prompt/` + `.agent/prompt/`
- 见 [04_CONTEXT §Prompt](./06_CONTEXT_ENGINEERING.md#4-prompt-集中管理)

---

## 7. 没有 Eval 就改 Prompt

**表现**：改 `pm-prd.ts` 一行 → 直接上线 → PM 场景行为漂移。

**后果**：`premature_finalize_rate` 上升；支付场景回归无人知。

**正确做法**：

- 改 prompt 前跑 Scenario Bank
- 见 [02_EVALUATION §工作流](./02_EVALUATION.md#7-工作流推荐)

---

## 8. Debug Artifact 替代生产日志

**表现**：「有 `.agent/debug/` 了，不用 pino。」

**后果**：上线后无法检索；磁盘占满；无告警。

**正确做法**：

- debug = 开发深度调试
- prod = structured log + metrics
- 见 [01_LOGGING §日志 vs Debug](./01_LOGGING.md#33-日志-vs-debug-artifact)

---

## 9. 把智能化优先于可运维

**表现**：六周 roadmap 全勾「memory / multi-agent / context」；日志/eval 未动。

**后果**：用户问「昨天哪步失败了、花了多少钱」答不上来。

**正确做法**：

```text
先稳定可用（Logging · Tool · Eval · Metrics）
再提高智能化（Memory 冻结期内不扩展）
```

见 [00 核心结论](./00_GAP_ASSESSMENT.md#核心结论)

---

## 10. 用 Claude Code / Hermes / Demo 当工程对标

**表现**：「Hermes 有 X，我们也要加」「Claude Code 有 subagent，我们也要拆」。

**后果**：工程 Gap（Eval、Tool、Metrics）持续为空；对标对象没有解决**生产运维**问题。

**正确做法**：

- **工程成熟度** → [Mastra](https://mastra.ai/docs) + [00 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)
- **领域设计**（Memory 分层）→ Hermes 文档只读参考
- **功能**（探索代码）→ Pi loop 已选型

---

## 11. 功能驱动而非需求驱动

**表现**：「还能加什么功能？」「Roadmap 勾完就上线」。

**后果**：过度设计；Observability/Eval 永远排不上期。

**正确做法**：决策三问 — Mastra 为什么有？解决什么生产问题？letsTalk 会遇到吗？见 [README §决策原则](./README.md#决策原则最重要)。

---

## 12. 误以为 Workflow 成熟度低 = 项目差

**表现**：Gap 表写 Workflow 25% → 焦虑要补 LangGraph。

**后果**：偏离 Pi 架构决策；浪费数周。

**正确做法**：

- Workflow = **N/A（刻意不实现）**
- 25% 是错误 framing；应标 N/A

---

## 速查表

| 误区 | 一章 |
|------|------|
| 状态塞 messages | 04 · 06 |
| tool throw | 03 |
| 提前 multi-agent | 08 |
| 提前 workflow | 00 · 08 |
| 提前向量库 | 07 |
| prompt 分散 | 06 |
| 无 eval 改 prompt | 02 |
| debug 当 prod log | 01 |
| 智能化 > 可运维 | 00 |
| 错对标 Hermes/CC | 00 · README |
| 功能驱动 | README |
| workflow 焦虑 | 00 |
