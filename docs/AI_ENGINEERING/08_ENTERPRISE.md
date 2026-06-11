# 08 — Enterprise & 延后域

| 档位 | 优先级 | Gap 摘要 |
|------|--------|----------|
| L1 | ⚪ 延后 | 内网工具阶段；知道概念即可 |

← [Handbook](./README.md) · [Gap Assessment](./00_GAP_ASSESSMENT.md)

---

## 1. Enterprise（未来）

| 能力 | letsTalk | 典型需求 |
|------|----------|----------|
| 多租户 | ❌ | SaaS |
| RBAC / SSO | ❌ | 部门统一登录 |
| 审计日志 | ❌ | 合规 |
| 配额 / 计费 | ❌ | 按人按量 |
| Prompt 版本 AB | ❌ | 灰度 |
| Feature Flag | ⚠️ 环境变量 | 已有 `LETS_TALK_*` |
| 写沙箱 | ✅ | `agent-write-policy.ts` |
| Skills 治理 | ✅ | bundled vs user |

**当前阶段**：内网 5～20 人 → Enterprise 非 P0。等 [01](./01_LOGGING.md) · [05](./05_OBSERVABILITY.md) · [02](./02_EVALUATION.md) 完成后再评估。

---

## 2. Workflow — N/A（架构决策）

| 项目选择 | 不追求 | Mastra 矩阵 |
|----------|--------|---------------|
| Pi 单循环 | LangGraph | Workflow **—** |
| PRD state + tool loop | Workflow DSL / DAG | |
| background-review | 完整 DAG 平台 | 轻量等价物 |

**缺少 Workflow 平台不是缺陷。** Mastra 有 Workflow 模块；letsTalk **刻意不对齐**。详见 [00 §Workflow](./00_GAP_ASSESSMENT.md#workflow-na)。

## 2.1 不迁移 Mastra

| 做 | 不做 |
|----|------|
| 学模块划分、生产契约 | 替换 Pi Runtime |
| 维护 Mastra 对照矩阵 | 复刻 Mastra 代码 |

---

## 3. Multi-Agent — 延后

| 已有 | 说明 |
|------|------|
| 主 Agent | Pi 主 session |
| Reviewer | `background-memory-review` |
| One-shot | title-summary、export-appendix |

**不需要**：Router / Planner / Executor / Writer 多 Agent 平台。

何时才考虑：

- 角色间有硬冲突且单 loop 无法表达
- 需并行探索多个独立 codebase 分支
- Observability 已能撑住多 agent 排障

---

## 4. 学习资源（浏览级）

| 资源 | 用途 |
|------|------|
| Anthropic Building Effective Agents | Multi-agent「何时不要」 |
| 团队安全规范 | 密钥、`.env` |

---

## 5. 与 IMPLEMENTATION_PHASES 的衔接

Enterprise 需求进入 [IMPLEMENTATION_PHASES.md](../IMPLEMENTATION_PHASES.md) §6 Backlog 时，先检查 P0 Handbook 是否完成。
