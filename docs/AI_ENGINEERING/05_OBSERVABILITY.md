# 05 — Observability

| 档位 | 优先级 | Mastra 矩阵 |
|------|--------|---------------|
| L1 | 🔴 P0 | Trace ⚠️ · Metrics ❌ |

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> **Mastra 视角**：Trace + Metrics 与 Logging 并列，不是 debug logger 的附属。  
> **三支柱必须同时存在** — 只有 debug JSONL 不算 Observability。

---

## 1. 三支柱模型

| 支柱 | 回答问题 | letsTalk 现状 |
|------|----------|---------------|
| **Logs** | 发生了什么？ | debug JSONL only → [01_LOGGING](./01_LOGGING.md) |
| **Traces** | 哪里慢？错在哪条链路？ | ❌ |
| **Metrics** | 系统是否健康？ | ❌ **基本缺失** |

三者互补，不可互相替代：

```text
Logs     → 离散事件、排障细节
Traces   → 请求链路、latency 分解
Metrics  → 聚合趋势、告警、SLO
```

---

## 2. Traces

### 2.1 理想 Span 树（letsTalk）

> Span 命名 → [00 §命名规范](./00_GAP_ASSESSMENT.md#命名规范)

```text
span: chat.request                    [trace_id]
  ├─ span: route.auth_parse
  ├─ span: session.get_or_create
  ├─ span: context.build_prefix
  ├─ span: llm.call                    [×N]
  │    └─ attributes: model, tokens_in, tokens_out, latency_ms
  ├─ span: tool.execute                [×M]
  │    └─ attributes: tool_name, success, duration_ms, errorCode
  ├─ span: artifact.persist_draft
  ├─ span: background.memory_review    [async, linked]
  └─ span: sse.flush
```

### 2.2 与 debug manifest 对应

| debug 落盘 | Trace span |
|------------|------------|
| manifest.jsonl 每行 | chat.request 子事件 |
| turn request/response 文件 | llm.call 详情 |
| DebugToolRecord | tool.execute |

### 2.3 工具选型

| 工具 | 适合 | 建议阶段 |
|------|------|----------|
| **[Langfuse](https://langfuse.com/)** | LLM/tool trace、成本、prompt 版本；**开源可自托管** | **Week 5 首选 PoC** |
| **OpenTelemetry** | 与 Grafana/Jaeger 集成；Langfuse 也支持 OTel 摄入 | 有运维 infra 后 |
| LangSmith | LangChain 生态深度集成 | 备选，非 letsTalk 默认路径 |

### 2.4 Tracer 薄抽象层（埋点面向接口）

> **不直接在 `run-chat.ts` 硬编码 Langfuse SDK**。业务代码依赖 `Tracer` 接口，Langfuse 为第一个 adapter。

```typescript
// packages/agent-runtime/src/tracer.ts（实施时创建）
interface Tracer {
  startSpan(name: string, attrs?: Record<string, unknown>): SpanHandle;
  recordGeneration(input: unknown, output: unknown, meta: GenerationMeta): void;
  flush(): Promise<void>;
}
// LangfuseTracer implements Tracer
// NoopTracer — 未配置 key 时零开销
```

好处：L3 自托管 vs Cloud 切换、未来 OTel exporter 替换，业务代码零改动。

### 2.5 ⭐ 数据出域决策（L3 前置，Week 5 前必须定）

对话内容（含企业需求、业务细节）会进入 trace 系统。**在接 Langfuse 之前**先回答：

| 问题 | 若「否」 | 若「是」 |
|------|----------|----------|
| 对话数据是否允许出内网？ | **仅自托管** Langfuse（Docker + 内网 Postgres） | 可考虑 Langfuse Cloud |
| 是否含敏感业务字段？ | trace 中脱敏（对齐 [01 §3.4](./01_LOGGING.md#34-敏感信息脱敏)） | 同上 |

**默认假设（待你确认）**：内网部署 → 自托管 Langfuse，`LANGFUSE_BASE_URL` 指向内网地址。

### 2.6 Langfuse 集成路线

| 阶段 | 目标 | 做法 |
|------|------|------|
| **L0** | 决策 + 本地验证 | 完成 §2.5；`docker compose up` 起 Langfuse |
| **L1** | Tracer 接口 + adapter | `LangfuseTracer` 实现；`llm.call` / `tool.execute` 两处 span |
| **L2** | Eval 联动 | Promptfoo 失败 → Langfuse 查同 sessionId trace |
| **L3** | 生产常驻 | 自托管 Postgres + Langfuse（或经审批的 Cloud） |

环境变量初稿：

```text
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=http://localhost:3001   # 自托管；避开 Next.js :3000
```

letsTalk 学习顺序：**Eval（Week 2）先于 Traces（Week 5）**。

---

## 3. Metrics {#核心-metrics}

### 3.1 建议核心指标

| 指标 | 类型 | 采集来源 | 说明 |
|------|------|----------|------|
| `chat_request_total` | counter | 线上 log | 按 status 分 label |
| `chat_success_rate` | gauge | 线上 log / Langfuse | 成功 turn / 总 turn |
| `tool_success_rate` | gauge | 线上 log / Langfuse | 按 tool_name |
| `tool_duration_ms` | histogram | Langfuse span | P50/P99 |
| `llm_tokens_total` | counter | Langfuse / log | input/output 分 label |
| `llm_cost_usd` | counter | Langfuse / log | 按 model |
| `chat_latency_ms` | histogram | Langfuse trace | 端到端 |
| `premature_finalize_rate` | gauge | **Eval 离线** | PRD：第 1～2 轮 readyToFinalize |
| `memory_hit_rate` | gauge | **Eval 离线** + log | episodic/INDEX 触发占比 |
| `context_compact_total` | counter | 线上 log | compact 次数 |
| `sse_disconnect_total` | counter | 线上 log | 流中断；Langfuse 不覆盖 |

### 3.2 指标 → 行动

| 指标异常 | 可能原因 | 查什么 |
|----------|----------|--------|
| tool_success_rate ↓ | timeout、路径错误 | Traces · [03_TOOL](./03_TOOL_ENGINEERING.md) |
| llm_cost ↑ | prefix 膨胀、grep 过大 | [06_CONTEXT](./06_CONTEXT_ENGINEERING.md) |
| premature_finalize_rate ↑ | prompt 回归 | [02_EVAL](./02_EVALUATION.md) |
| chat_latency P99 ↑ | tool 多、model 慢 | Traces |
| memory_hit_rate ≈ 0 | episodic 触发词失效 | unit test |

### 3.3 实施阶段

| 阶段 | 做法 |
|------|------|
| **M0** | 结构化 log 中带 metric 字段（无 Prometheus 也行） |
| **M1** | 简单 counter 写 log · 脚本聚合 |
| **M2** | ~~Prometheus / OTel exporter~~ → **延后**；token/cost/latency 由 **Langfuse 承接** |

> **M2 策略**：内网 5～20 人规模，维护两套观测基建（Langfuse + Prometheus）性价比低。仅 Langfuse 覆盖不了的系统级指标（`sse_disconnect`、进程健康）未来再考虑独立管道。

---

## 4. 开发期 vs 生产期

| | 开发期 | 生产期 |
|--|--------|--------|
| 深度调试 | `.agent/debug/` · DEBUG_GUIDE | — |
| 断点 | VS Code F5 | — |
| 运维 | — | Logs + Traces + Metrics |
| turn_debug SSE | ✅ 可保留 | 需 feature flag |

---

## 5. 改造锚点

```text
packages/agent-runtime/src/tracer.ts              Tracer 接口
packages/agent-runtime/src/langfuse-tracer.ts     Langfuse adapter
apps/web/app/api/agent/chat/stream/route.ts
packages/agent-runtime/src/run-chat.ts            Pi subscribe → span
packages/agent-runtime/src/debug-logger.ts        字段对齐 trace
```

---

## 6. 学习资源

| 资源 | 重点 |
|------|------|
| [Langfuse JS/TS SDK](https://langfuse.com/docs/sdk/typescript) | trace · generation · score |
| [Langfuse Self-Hosting](https://langfuse.com/docs/deployment/self-host) | Docker 部署 |
| [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/) | 概念 · OTel 摄入 |
| [DEBUG_GUIDE.md](../DEBUG_GUIDE.md) | 现有 debug |

---

## 7. 自检

- [ ] 完成 §2.5 数据出域决策（自托管 vs Cloud）
- [ ] 画 ideal trace 树（≤10 span，用命名规范）
- [ ] 为 5 个核心 metrics 标采集来源（线上 / Eval 离线）
- [ ] 解释为何 M2 Prometheus 延后

---

## 8. Week 5 计划（学习 + 交付物）

| 天 | 内容 |
|----|------|
| 1 | §2.5 数据出域决策 · Langfuse Docker（:3001） |
| 2 | `Tracer` 接口 + `LangfuseTracer` adapter |
| 3 | `llm.call` + `tool.execute` span 验证 |
| 4 | Langfuse UI 对照 §2.1 ideal tree |
| 5 | **验收**：完整 trace 树可见；档位 Trace L1→L3 |
