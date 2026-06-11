# 99 — Production Checklist

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵) · [Anti-patterns](./98_ANTI_PATTERNS.md)

> 上线前逐项勾选。与 Mastra 矩阵关键行（Eval · Metrics · Tool · Trace）对齐。

---

## P0 — 必须

### Logging & Cost · [01](./01_LOGGING.md)

- [ ] 生产路径有 structured log（含 `sessionId`）
- [ ] 单次请求有 `traceId`
- [ ] 每 turn 记录 model、token、估算 cost
- [ ] 能在 5 分钟内定位「哪一步 tool 失败」
- [ ] prod log 与 debug artifact 职责分离

### Tool Engineering · [03](./03_TOOL_ENGINEERING.md)

- [ ] 关键只读 tool 有 timeout
- [ ] 失败返回结构化 error，不 silent hang
- [ ] 写 tool 受 write policy 约束
- [ ] 非幂等写 tool 无 blind retry

### Evaluation · [02](./02_EVALUATION.md)

- [ ] ≥3 个 PM scenario 可自动化断言（Promptfoo 或 script）
- [ ] 改 `pm-prd.ts` 前跑 scenario bank
- [ ] `pnpm smoke` / `pnpm minimal` 发布前必跑

### Observability（M0 最低线）· [05](./05_OBSERVABILITY.md)

- [ ] 定义并记录核心 metrics（至少 log 级）：`success_rate`、`tool_success_rate`、`cost`
- [ ] PRD：`premature_finalize_rate` 可观测

---

## P1 — 应该有

### Observability · [05](./05_OBSERVABILITY.md)

- [ ] `Tracer` 接口 + Langfuse adapter；UI 可看单次对话 span 树（自托管或经审批的 Cloud）
- [ ] `chat_latency_ms` P99 可查
- [ ] cost 超阈值有 warn（log 或告警）

### Runtime · [04](./04_RUNTIME_ENGINEERING.md)

- [ ] 刷新 / 重启后 conversation + draft 不丢（验证并文档化）
- [ ] PRD 定稿路径有明确人工确认；`readyToFinalize` 误触可测
- [ ] Cancellation 行为有定义（即使初版仅「断开 SSE」）

### Logging · [01](./01_LOGGING.md)

- [ ] session 级 cost 可汇总

---

## P2 — 可以后做

- [ ] 向量 RAG（[07](./07_MEMORY.md) 冻结期内不做）
- [ ] Workflow 引擎（**N/A**）
- [ ] Multi-agent 平台（[08](./08_ENTERPRISE.md)）
- [ ] 企业 RBAC / 审计（[08](./08_ENTERPRISE.md)）
- [ ] Prompt AB 测试

---

## 上线前 30 分钟冒烟

```text
1. pnpm smoke 通过
2. 浏览器 explore 模式问一个代码问题 → 有 tool 块、有引用
3. prd 模式跑 TEST_SCENARIO 第 1 轮 → blockingQuestion 或追问出现
4. 设 LETS_TALK_DEBUG=1 → .agent/debug/ 有 manifest
5. 查一条 structured log（或确认暂用 debug + 计划 01 落地日期）
```

---

## 与 IMPLEMENTATION_PHASES

功能验收 → [IMPLEMENTATION_PHASES.md](../IMPLEMENTATION_PHASES.md)  
工程验收 → **本 Checklist**

---

## 修订

| 版本 | 日期 |
|------|------|
| V1.0 | 2026-06-10 |
