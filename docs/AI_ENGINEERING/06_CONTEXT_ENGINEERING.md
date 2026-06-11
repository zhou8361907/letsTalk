# 06 — Context Engineering

| 档位 | 优先级 | Gap 摘要 |
|------|--------|----------|
| L3 | 🟢 巩固 | 项目最强项；Prompt 版本/eval 联动待补 |

← [Handbook](./README.md) · [Gap Assessment](./00_GAP_ASSESSMENT.md)

---

## 1. 目标

避免上下文爆炸；让模型**每次只看到该看的**。

---

## 2. 分层模型

```text
L0  AGENTS.md / CLAUDE.md     稳定规则 · 人维护
L1  system append             产品级 · packages/context/src/prompt/
L2  JIT prefix                每轮状态 · turn-prefix.ts
L3  Pull 工具                 大块按需 · context-pull-tools.ts
L4  requirementDraft          领域 artifact（不进 messages 全文）
L3  workFront/workBack        活代码 · 工具读
M0  USER.md / CORE.md         Tier1 常驻记忆
M1  topics/*.md               Tier2/3 按需
E0  episodic_recall           FTS · session_search
```

详见 [PROMPT_OPTIMIZATION_V2.md](../PROMPT_OPTIMIZATION_V2.md) · [CONTEXT_MANAGEMENT_V1.md](../CONTEXT_MANAGEMENT_V1.md)

---

## 3. letsTalk 现状

| 能力 | 实现 |
|------|------|
| Working Memory | `turn-prefix.ts` + `format-context-v1.ts` |
| Long Memory 注入 | `pi-resource-loader.ts` Tier1 |
| Episodic | `episodic-prefetch.ts` · `session_search` |
| Hints | `.agent/hints/` · Pull |
| 压缩 | `session-compaction.ts`（≥90%） |
| 工具输出截断 | `tool-output-truncate.ts` |
| 预算 hint | `context-budget-config.ts`（50%/90%） |

---

## 4. Prompt 集中管理

| 层级 | 路径 |
|------|------|
| 代码模块 | `packages/context/src/prompt/` |
| 可编辑 | `.agent/prompt/` |
| 项目规则 | `AGENTS.md` |

**缺口**：

- Prompt **版本化**
- 改 prompt → 自动跑 [02 Eval](./02_EVALUATION.md) scenario

---

## 5. 缺口（刻意不做，除非 Eval 证明）

| 项 | 原因 |
|----|------|
| 向量 RAG | FTS + INDEX + hints 够用 |
| mem0 | 见 [07_MEMORY](./07_MEMORY.md) 冻结策略 |
| per-tool token 计量 | P1，Observability 联动 |

---

## 6. Context 预算思维

```text
固定顶：system + M0（~有界）
可变：  prefix + 历史 + tool outputs
```

- 用 **percent** 触发 compact 而非绝对 token — 因 context window 随 model 变
- Token 黑洞 Top 3：system append、tool grep 大结果、重复规则（已在 V2 优化）

---

## 7. 改造锚点

```text
packages/agent-runtime/src/turn-prefix.ts
packages/context/src/build-context.ts
packages/agent-runtime/src/pi-resource-loader.ts
packages/agent-runtime/src/session-compaction.ts
packages/agent-runtime/src/context-pull-tools.ts
```

---

## 8. 学习资源

| 资源 | 重点 |
|------|------|
| [PROMPT_OPTIMIZATION_V2.md](../PROMPT_OPTIMIZATION_V2.md) | 全文 |
| [MEMORY_V1.md](../MEMORY_V1.md) | M0/M1 与 Context 边界 |
| Context Engineering 专题 | 理论巩固 |

---

## 9. 自检

- [ ] 画出 prompt 注入顺序（无重复）
- [ ] 说出改 PRD vs 改记忆规则各改哪个文件
- [ ] 解释 compact 触发条件
