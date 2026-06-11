# 04 — Runtime Engineering

| 档位 | 优先级 | Mastra 矩阵 |
|------|--------|---------------|
| L2 | 🔴 P0 | Agent ⚠️ · Lifecycle ⚠️ · HITL ⚠️ · Checkpoint ⚠️ · Replay ❌ P2 |

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> **Mastra 视角**：Lifecycle 把 Agent 从「一次 LLM 调用」变成可恢复、可暂停、可流式的**运行时**。  
> letsTalk 的 Pi + SSE + jsonl 已具备雏形；缺的是显式协议（Checkpoint、Replay、Cancellation）。  
> **Week 6 目标**：整理本章，形成长期稳定 Runtime 架构文档。

---

## 1. 域定义

Runtime Engineering 管理 **一次对话从进入到持久化的完整生命周期**：

| 子域 | 说明 |
|------|------|
| **Session** | Pi handle、jsonl、进程内 Map |
| **State** | chatMode、锚点、draft revision、指针 |
| **Artifact** | requirementDraft、appendix、debug |
| **Checkpoint** | 恢复点粒度 |
| **Background Job** | memory review、title、export |
| **HITL** | 人工确认、blockingQuestion |
| **Resume** | 刷新/HMR/崩溃后继续 |
| **Event** | SSE 事件契约 |
| **Stream** | 流式推送、背压 |
| **Cancellation** | 用户中止 |
| **Task Queue** | 异步 job 编排（轻量） |

生命周期总图 → [00 §运行时生命周期](./00_GAP_ASSESSMENT.md#运行时生命周期)

---

## 2. Session

### 已有

| 能力 | 位置 |
|------|------|
| 进程内 handle | `run-chat.ts` · `Map<sessionId, PiSessionHandle>` |
| Pi jsonl | `.agent/conversations/pi/{sessionId}.jsonl` |
| 元数据 JSON | `.agent/conversations/{id}.json` |
| SQLite 双写 | `session-db.ts`（`LETS_TALK_SESSION_DB`） |
| sessionKind | `create-session.ts`：main / export-appendix / title-summary / self-improvement-review |

### 缺口

- HMR/崩溃后进程内 Map（draft revision 等）可能丢失 — **Week 4 首要交付**
- 无多 session 并发配额文档

---

## 2.1 State Source of Truth {#state-source-of-truth}

> **权威存储（SoT）** vs 派生/缓存。Week 4 目标：**消灭进程内孤儿状态** — 进程内 Map 仅作 cache，重启可重建。

| 状态字段 | Source of Truth | 派生/缓存 | 丢失风险 |
|----------|-----------------|-----------|----------|
| messages | Pi jsonl | 进程内 Pi handle | 低 |
| chatMode | conversation JSON | — | 低 |
| requirementDraft | `requirement-draft-store` | — | 低 |
| draft revision | **应落** conversation JSON 或 SQLite | 进程内 Map ⚠️ | **高（已知）** |
| 锚点 / liveAnchorRefs | conversation JSON | 进程内 | 中 |
| 指针 revision | **应落** conversation JSON | session-context 内存 ⚠️ | **高** |
| currentTask | **应落** conversation JSON | 隐式 ❌ | **高** |
| Pi session handle | 进程内 Map | jsonl 可重建 | 中（可接受） |

**SQLite 双写**：`session-db.ts` 为检索/FTS 索引；**业务 SoT 以文件 store 为准**（jsonl + conversation JSON + draft store）。SQLite 与文件不一致时，以文件为准并告警。

---

## 3. State

| 字段 | 存储 | 持久化 |
|------|------|--------|
| messages | Pi jsonl | ✅ |
| chatMode | conversation JSON | ✅ |
| 锚点 / liveAnchorRefs | conversation JSON + 内存 cache | ⚠️ → Week 4 加固 |
| requirementDraft | 独立 store | ✅ |
| 指针 revision | session-context | ⚠️ → Week 4 落盘 |
| currentTask | 隐式 | ❌ → Week 4 显式化 |

**PRD 阶段状态机（建议显式化）**：

```text
探询 → 草案 → 待确认（blockingQuestion）→ 可定稿（readyToFinalize）→ 已定稿
```

---

## 4. Artifact

| Artifact | 与 messages 分离 | 位置 |
|----------|------------------|------|
| requirementDraft | ✅ | `requirement-draft-store.ts` |
| dev-appendix | ✅ | `dev-appendix-job.ts` |
| debug 落盘 | ✅ | `.agent/debug/` |
| memory topics | ✅ | `.agent/memory/topics/` |

**模式**：messages 放指针；LLM 用 Pull 工具读全文 → [06_CONTEXT](./06_CONTEXT_ENGINEERING.md)

---

## 5. Checkpoint & Replay

| 粒度 | letsTalk | Mastra 对标 | 状态 |
|------|----------|-------------|------|
| 会话级 | Pi jsonl | Checkpoint | ✅ 隐式 |
| Turn 级 | debug manifest | — | ✅ dev |
| 阶段级 | PRD 定稿节点 | HITL 节点 | ⚠️ |
| **Replay** | 无 | Replay / Fork | ❌ |

**恢复语义**：

- **Replay**：重放到某 message — jsonl 有数据、**无产品化 API**（Mastra 矩阵 ❌）
- **Fork**：从 checkpoint 新 session（未做）
- **Resume**：中断 tool 继续（P2）

---

## 6. Background Job

| Job | 阻塞主回复 | 实现 |
|-----|------------|------|
| memory review | 否 | `background-memory-review.ts` |
| title summary | 否 | one-shot Pi session |
| dev appendix | 否 | `dev-appendix-job.ts` |

**Task Queue**：当前为 fire-and-forget；无需上重型队列，但应记录 job 状态供 Observability。

---

## 7. HITL（Human In The Loop）

### 已有（PRD 域）

| 机制 | 说明 |
|------|------|
| `blockingQuestion` | Agent 暂停式追问 |
| `readyToFinalize` | 定稿门槛 |
| `RequirementCanvas` | 人工编辑、导出 |
| SSE `agent_actions` | UI 感知 |

### 缺口

| 缺口 | 说明 |
|------|------|
| Tool 执行前审批 | 「即将写 memory，是否允许？」 |
| 通用 pause/resume | 非 PRD 模式 |
| 统一 `awaiting_input` 事件 | 可标准化 SSE |

**HITL 模式分类**：

1. Interrupt before tool
2. Interrupt before finalize（letsTalk PRD ✅）
3. Human edit artifact → continue
4. Human override plan

---

## 8. Event & Stream

### SSE 事件（shared-types）

核心类型见 [00 §命名规范](./00_GAP_ASSESSMENT.md#命名规范) — 不改名，与 log/trace 并行存在。

**Stream 注意点**：

- 长 turn 期间连接断开 → 客户端重连策略（待产品化）
- Cancellation → 中止 Pi prompt / tool（待系统化）

---

## 9. 错误恢复（Runtime 视角）

```text
retry same step
  → fallback tool
    → downgrade model
      → partial result + 告知用户
```

当前：`run-chat.ts` catch → debug log → throw；`route.ts` 推 `error` SSE。

---

## 10. 改造锚点

```text
packages/agent-runtime/src/run-chat.ts
packages/conversation/src/store.ts
packages/agent-runtime/src/requirement-draft-store.ts
packages/shared-types/src/requirement-draft.ts
apps/web/components/RequirementCanvas.tsx
packages/agent-runtime/src/background-memory-review.ts
```

---

## 11. 学习资源

| 资源 | 重点 |
|------|------|
| [REQUIREMENT_DRAFT_ENHANCEMENT.md](../REQUIREMENT_DRAFT_ENHANCEMENT.md) | PRD HITL |
| [TEST_SCENARIO_PAYMENT_APPROVAL.md](../TEST_SCENARIO_PAYMENT_APPROVAL.md) | HITL 轮次标注 |
| Mastra suspend/resume | 概念参考 |
| [FEATURE_00_SEND_AND_SSE.md](../FEATURE_00_SEND_AND_SSE.md) | SSE 契约 |

---

## 12. 自检

- [ ] 列出所有 state 存储位置及丢失风险
- [ ] 画 PRD 阶段状态机
- [ ] 标出 3 个「应有 HITL 但没有」的 gap

---

## 13. Week 4 计划（学习 + 交付物）

| 天 | 内容 |
|----|------|
| 1 | 读 §2.1 SoT 表 · 标出孤儿状态清单 |
| 2-3 | draft revision · currentTask · 指针 revision 落盘 |
| 4 | PRD 状态机显式化 · 验证重启不丢 |
| 5 | **验收**：重启进程后 draft revision 不丢；档位 Runtime L2→L3 |
