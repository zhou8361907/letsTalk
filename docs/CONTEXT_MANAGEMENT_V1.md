# letsTalk Agent 上下文管理方案（V1 · 推荐版）

| 项目 | 内容 |
|------|------|
| 版本 | V1（团队评审稿） |
| 日期 | 2026-05-29 |
| 状态 | **Implemented (V1 core)** — 2026-05-29 |
| 关联 | [AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md) · [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md) §4 |

> **设计目标不是减少 Token**，而是保证：当前状态正确、锚点切换不串页、PRD 草稿读写一致、长对话不丢规则、模型犯错不污染状态。

> **产品边界（重要）：** letsTalk 里**由用户/UI 主动改变的运行时状态只有两项**——**页面/菜单锚点**（`AgentAnchor`，含 vue / file / menu / route 等）与 **`chatMode`**（探索 `explore` / 写需求 `prd`）。V1 的 Pointer、`<context_change>`、`revision++` 主要围绕这两项设计；草稿变更来自 Agent 写工具，单独处理乐观锁。

---

## 1. 设计目标

1. **当前状态始终正确**
2. **锚点切换后不会引用旧页面**
3. **PRD 草稿读写一致**
4. **长对话不会逐渐遗忘规则**
5. **模型即使犯错，也不会污染状态**

---

## 2. 核心原则

### 原则一：Rule Push → System（已落地 · V2）

**行为约束在会话创建时写入 Pi system prompt**，不通过 Tool 查询，也**不**在每轮 user 前缀重复注入。

**单一权威来源（2026-06）：**

| 内容 | 载体 |
|------|------|
| 编码/读码/回答 | 仓库根 `AGENTS.md` → Pi `project_context` |
| 记忆、目录、PRD 细则 | `buildLetsTalkAppendSystemPrompt` → `appendSystemPrompt` |
| M0 画像 | Tier1 USER/CORE（虚拟 `_tier1.md`） |

每轮 user 前缀仅：`<context>` 指针、模式切换、`<core_memory_refresh>`、`<memory_context>` Pull、清单摘要。详见 [PROMPT_OPTIMIZATION_V2.md](./PROMPT_OPTIMIZATION_V2.md)。

---

### 原则二：State Pointer Push

**每轮仅 Push 当前状态指针**（不含大块 Payload）。

示例：

```xml
<context
  revision="19"
  chat_mode="prd"
  anchor_ref="workFront/src/views/purchase_order.vue"
  draft_revision="5"
/>
```

| 字段 | 作用 |
|------|------|
| `revision` | 会话上下文版本（锚点/模式/草稿等变更时递增） |
| `chat_mode` | `explore` / `prd` |
| `anchor_ref` | 当前有效锚点 ref；无锚点时可省略或空 |
| `draft_revision` | 草稿版本（可与 `revision` 合并为单一计数器，见 §11 开放问题） |

**不包含：**

- anchor preview 全文
- draft 全文
- hints 全文

---

### 原则三：Payload Pull

**大块内容统一 Tool 化**，模型按需读取：

| 工具 | 用途 |
|------|------|
| `get_anchor_preview` | 锚点文件头 / 菜单 grep 线索 |
| `get_requirement_draft` | PRD 需求清单全文 |
| `get_business_hints` | `.agent/hints/` 业务线索目录与摘要 |

---

### 原则四：读写同源

任何可变状态：

```text
Write → Store
Read  → Store
```

**禁止：**

```text
Write → Store
Read  → Snapshot（JIT 里拼出来的文本）
```

否则会出现 **双事实源**（store 已更新，snapshot 仍旧）。

> 与现状关系：`requirement-draft-store` 已是 Write 的 Store，但 Read 仍通过每轮 `requirement_draft_snapshot` Push。V1 的核心迁移点之一。

---

## 3. 状态模型

### 3.0 什么会变、什么不会变

letsTalk 当前产品里，**会话运行时**需要 Agent 对齐的状态来源如下：

| 类别 | 字段 | 谁改 | V1 怎么处理 |
|------|------|------|-------------|
| **UI 可变（仅两项）** | `anchor`（页面 / 菜单锚点） | 用户点选侧栏 | **软指针**：每轮 Pointer 带当前 `anchor_ref`，告诉模型「现在在看哪」；见 §3.1 **不**按硬边界处理 |
| **UI 可变（仅两项）** | `chatMode`：`explore` \| `prd` | 用户切换模式 | **硬边界**：`revision++` + `<context_change type="chat_mode_changed">` |
| **派生** | `mode`：`focused` \| `explore` | 有无锚点 | 不单独 Push；有 `anchor_ref` 即 focused |
| **Agent 可变** | `requirementDraft` | `update_requirement_draft` | Store 同源；**换锚点不清草稿**；仅 `draftRevision++` 用于写锁 |
| **基本不变** | `arch_rules` / 工具规范 | `AGENTS.md` | Rule Push |
| **按需读取** | preview、hints、草稿全文 | — | Payload Pull |

### 3.0.1 部署配置（`.env`）— 进程启动后不变

**团队共识：** 前后端代码路径、工作区根、LLM 密钥等 **只以 `.env` 为准**；`pnpm dev` / `pnpm start` 加载后，**运行期间不再变化**（改 `.env` 需重启进程才生效）。

| 来源 | 变量（见 `.env.example`） | 作用 | 是否进 Session State / revision |
|------|---------------------------|------|----------------------------------|
| 部署配置 | `WORKSPACE_ROOT` | letsTalk 运行根、Pi `cwd`、`.agent/` 落盘 | ❌ 不进 pointer，不 bump revision |
| 部署配置 | `FRONTEND_ROOT` / `BACKEND_ROOT` | `workFront` / `workBack` 分析目录 | ❌ 同上 |
| 部署配置 | `LLM_API_KEY` 等 | 模型调用 | ❌ 与 Agent 上下文无关 |
| 可选 | `MENU_DB_*` | 同步菜单 map，运维脚本用 | ❌ |

**代码落点：**

- 服务端统一 `resolveWorkspaceLayout()`（`packages/context/src/workspace-paths.ts`）读 `process.env`
- 前端启动时 `GET /api/workspace` 展示布局，**不在 UI 里改路径**
- `arch_rules` 里的目录说明来自上述 layout，属于 **Rule Push**（部署期固定），**不是**用户会话里会变的状态

因此：**可变状态仍然只有 anchor + chatMode + 草稿**；不要把「换 workFront 目录」当成 Agent 运行时事件——那是运维改 `.env` 并重启的事。

### 3.1 锚点强度：菜单是「位置提示」，不是「会话分界」

**产品意图（团队共识）：**

用户点菜单 / 选页面，主要是为了 **让 LLM 知道当前在系统的什么位置**，方便 grep、读代码、写需求时默认 scope 更准——**不是**「换了一个独立会话、旧上下文作废」。

因此锚点（尤其 **菜单类** `menu` / `route`）在 V1 里应定为 **Soft Focus Pointer**：

| 维度 | 菜单 / 锚点（软） | chatMode（硬） |
|------|-------------------|----------------|
| 语义 | 「你现在在这个菜单/页面附近」 | 「探索代码」↔「写需求清单」，工具集与 Rule 不同 |
| 每轮 Pointer | ✅ 始终带最新 `anchor_ref` | ✅ 始终带 `chat_mode` |
| `revision++` | ❌ **不因换菜单/换页而递增** | ✅ 切换时递增 |
| `<context_change>` | ❌ 默认不发；或仅可选轻量 `<focus ref="…"/>` | ✅ 发 `chat_mode_changed` |
| 草稿 | ✅ **继续保留** items，只更新「当前焦点」元数据 | 探索模式不用草稿；PRD 模式草稿仍有效 |
| 乐观锁 | ❌ 换锚点 **不** 使 `update_requirement_draft` 失败 | 模式切换后的工具可用性由注册表保证 |

**为何每轮 Pointer 足够表达「位置」：**

模型读 **当前 turn** 的 `anchor_ref` 即可知道「用户现在点在哪」；不必用 `revision++` + 大段 `anchor_changed` 强调「请忘记上一页」。历史 jsonl 里旧 pointer 自然过期，**以最新一轮为准**。

**文件类锚点（`vue` / `file` / `java`）** 与菜单类 **同一套软策略**：仍是 focus hint。若将来验收发现「换 .vue 文件仍常串页」，再单独加 **可选** 的 `focus_changed` 轻事件，仍 **不清草稿、不 bump draftRevision**。

**清锚点**：`anchor_ref` 为空即 explore scope，同样只更新 Pointer，不当作异常事件。

### 3.2 草稿策略：换锚点 **继续保留**

**推荐默认（与现网 `ensureDraft` 行为一致）：**

- 用户从菜单 A 点到菜单 B，或从页面 A 切到页面 B：**右侧需求清单 items 全部保留**
- 仅更新草稿元数据里的 `anchorRef`（表示「当前焦点页面/菜单」），可选在 `openQuestions` 里由 Agent 提示「是否要拆条/改 page 字段」
- **禁止**因换锚点自动 `emptyDraft()` 或 `replaceItems: true`

**理由：**

1. PM 常在一个 session 里 **跨多个菜单梳理同一条业务需求**，清单是主 artifact，锚点是浏览位置。
2. 菜单锚点本身 **不一定 1:1 对应单个 .vue**，用锚点切换去清空草稿反而误伤。
3. 条目里的 `page` 字段才是业务上的「在哪个页面」；与 `anchorRef` 解耦更合理。

**Agent 侧 Rule（PRD）可写一句：**

> 换菜单/换页后清单 **默认继续有效**；若新焦点与某条条目的 `page` 明显不符，**合并修改** 该条或追加 `openQuestions`，勿未经确认清空清单。

**锚点说明（与代码一致）：**

- **文件类**：`kind=vue|file|java`，`ref` 为仓库内路径
- **菜单类**：`kind=menu|route`，`ref` 多为 `routePath`（grep 用），另有 `menuUrl`、`breadcrumb` 等元数据
- **清锚点**：Pointer 中 `anchor_ref` 为空即可，不触发 revision / context_change

**`chatMode` 说明：**

- `explore`：研发问代码，不注册 / 不使用需求草稿写工具
- `prd`：写需求模式，启用 `update_requirement_draft` 与右侧清单；额外 Rule（`pm_rules`）仍属 Rule Push

因此 V1 的 **硬状态机** 主要只收敛为 **`chatMode` 切换**；**锚点** 由 **每轮 Pointer** 表达即可。检测逻辑：对比 `chatMode` 决定是否 `revision++`；`anchor` 只更新 Store 与 Pointer 字段。

### SessionState（服务端，按 `sessionId`）

```typescript
interface SessionState {
  revision: number;
  chatMode: "explore" | "prd";
  /** 锚点主键：文件路径或 menu/route 的 ref；无锚点为 null */
  anchorRef?: string | null;
  /** 可选：仅 draft 写路径递增，与 UI 变更的 revision 分离 */
  draftRevision?: number;
  /** 菜单锚点时可存 kind，供 get_anchor_preview 分支 */
  anchorKind?: AgentAnchor["kind"];
}
```

实体位置建议：`packages/agent-runtime` 内与 `requirement-draft-store`、`liveAnchorRefs` 收敛为统一的 Session Context 模块（实施时再定文件名）。

### Revision 规则

**硬边界 — 触发 `revision++`：**

1. **`chatMode` 变化** — `explore` ↔ `prd`（工具集、pm_rules、草稿板是否启用均变）

**软更新 — 不触发 `revision++`：**

2. **锚点变化**（菜单、页面、清锚点）— 仅更新 Pointer 中的 `anchor_ref` / `anchorKind`；草稿 **保留**

**Agent 写路径 — 触发 `draftRevision++`（与 UI revision 分离）：**

3. **草稿更新** — `update_requirement_draft` 成功提交后递增；乐观锁 **只** 针对 draft，**不** 因换锚点失效

**不触发任何版本递增的：**

- 同 `chatMode` 下连续多轮提问（锚点可变可不变）
- 模型只读工具（grep / read / get_anchor_preview）
- `AGENTS.md` 磁盘变更

**检测时机：** 每轮 `runChat` 对比 Store 的 `chatMode` → 若变则 `revision++` + `context_change`；`anchor` 始终写最新值到 Pointer，无需 change 事件。

### 权威版本原则

**永远以当前 Store 中的最大 revision 对应的状态为准；历史消息中的 `<context>` / 旧 `<agent_context>` 一律视为过期。**

模型侧通过：

1. 每轮最新的 State Pointer Push
2. 可选的 `<context_change>` 事件
3. Tool 乐观锁失败时的 `RevisionMismatch` 提示

来重新对齐，而不是依赖模型「记住」旧轮内容。

---

## 4. 动态切换：Context Change Event

**V1 默认仅 `chatMode` 切换** 发结构化变更事件。锚点换位置 **不发** `anchor_changed`（见 §3.1）；靠每轮 Pointer 里的 `anchor_ref` 表达当前位置即可。

### 模式切换（探索 ↔ 写需求）— 硬边界

```xml
<context revision="21" chat_mode="prd">
  <context_change type="chat_mode_changed" old="explore" new="prd" />
</context>
```

### 锚点 / 菜单切换 — 软更新（默认无 context_change）

用户点另一个菜单或页面时，仅 Push 更新后的 Pointer，例如：

```xml
<context revision="21" chat_mode="prd" anchor_ref="/finance/detail" draft_revision="5" />
```

模型由此得知 **当前焦点**；历史 turn 里旧的 `anchor_ref` 不作废 session，也 **不** 清空草稿。

**可选（非 V1 必做）：** 若 debug 需要可观测性，可在 Pointer 内加轻量 `<focus ref="…" kind="menu"/>`，仍 **不** `revision++`。

**无变更的普通轮**（同 `chatMode`）仅 Push 指针；`anchor_ref` 每轮仍反映 UI 最新点击。

**同轮既换锚点又切 chatMode（少见）：** 只发 `chat_mode_changed` 并 `revision++`；锚点用新 Pointer 字段一并带上即可。

---

## 5. 为什么不用 SYSTEM ALERT

不推荐在每轮 user 消息里写：

```text
[SYSTEM ALERT] 请立即忘记页面 A，必须调用工具……
```

| 问题 | 说明 |
|------|------|
| 上下文污染 | 频繁切换时连续 ALERT 堆叠，噪声大 |
| 语义不当 | 换页是正常业务流程，不是异常 |

**推荐：** 用结构化的 `<context_change>` 作为标准状态变更事件；配合 Tool 乐观锁兜底，而非靠全大写告警「吓」模型。

---

## 6. Tool 层设计（草案）

### `get_anchor_preview`

```typescript
get_anchor_preview({ anchorRef?: string })
```

- 默认 `anchorRef` = 当前 Session 有效锚点
- 若传入 ref 与当前不一致：返回 `AnchorMismatch` 或仍返回但附 `warning`（评审时二选一）

返回示例：

```json
{
  "anchorRef": "workFront/.../purchase_order.vue",
  "kind": "vue",
  "preview": "…前 N 行…",
  "methods": [],
  "relatedFiles": []
}
```

> `methods` / `relatedFiles` 为 V1 可选增强（可复用 Java AST / grep 线索）；MVP 可仅 `preview` 对齐现有 `readAnchorPreview`。

### `get_requirement_draft`

```typescript
get_requirement_draft({ revision?: number })
```

返回：

```json
{
  "revision": 5,
  "draft": { "version": 1, "items": [], "…": "…" }
}
```

### `update_requirement_draft`

```typescript
update_requirement_draft({
  revision: number,
  // 与现网兼容：items / openQuestions / replaceItems …
})
```

### `get_business_hints`

```typescript
get_business_hints()
```

返回 hints 目录列表 + 可选摘要（对齐现 `listBusinessHintFiles`）。

---

## 7. 乐观锁机制（关键）

**所有写工具必须携带 `draftRevision`（或约定的 draft 写版本号）。**

示例：模型带 `draftRevision=8` 调用 `update_requirement_draft`，Store 当前 `draftRevision=9`：

```text
RevisionMismatch
Current draftRevision = 9
Please call get_requirement_draft() before updating.
```

**原理：** 若模型基于 **过期的草稿快照** 写入，由 Tool 层拦截。**换菜单/换页（软锚点）不递增 draftRevision**，不应导致写失败。

**核心思想：**

> Prompt 可以提醒模型；**Tool 才能约束模型。**

读工具是否也要带 revision（读时校验）——可选；V1 至少 **写路径强制乐观锁**。

---

## 8. 模型工具调用策略

**不规定：**「一切锚点变化 ⇒ 必须立刻 `get_anchor_preview`」

反例：用户问「采购单和销售单有什么区别？」——可能不需要页面 preview。

**推荐规则：**

```text
chatMode 变化（context_change / revision++）
  或 当前问题依赖页面/草稿细节
  → 再调用 get_anchor_preview / get_requirement_draft

用户仅切换菜单/页面（软锚点）
  → 读最新 Pointer 中的 anchor_ref 即可
  → 若问控件/路由细节再 get_anchor_preview
```

Rule Push 中可写一句：**涉及当前页控件、验收、草稿条目 id 时，必须先 pull 再答/再写。**

---

## 9. 目标架构总览

```text
Session
├── Rules（Rule Push · session 级或每轮短块）
│
├── SessionState（Store）
│     ├── revision
│     ├── chatMode
│     ├── anchorRef
│     └── draftRevision（可选）
│
├── ContextChangeEvent（**仅 chatMode 切换**；锚点为软 Pointer）
│
├── Tools（Payload Pull + 乐观锁写）
│     ├── get_anchor_preview
│     ├── get_requirement_draft
│     ├── update_requirement_draft（revision 必填）
│     └── get_business_hints
│
└── 每轮 Prompt 组成
      Rule Push
            +
      State Pointer Push
            +
      Context Change Event（可选）
            +
      Payload Pull（模型按需）
            +
      Optimistic Lock（写路径强制）
```

---

## 10. 方案对比结论

| 方案 | 结论 |
|------|------|
| **A. 只在切换时注入全量 Context** | **不推荐** — recency 下降、规则遵守下降、长对话更易混乱 |
| **B. 纯 Pull（所有状态都 Tool 查）** | **不推荐** — 模型不一定主动查，当前状态感知不稳定 |
| **C. 本方案（Rule + Pointer + Change + Pull + Lock）** | **推荐** — 长对话、动态锚点、PRD 演进场景下，稳定性 / 可维护性 / 复杂度较平衡 |

---

## 11. 评审补充：与现网差距 & 开放问题

### 11.1 现网行为（2026-05 代码）

| 能力 | 现网 | V1 目标 |
|------|------|---------|
| 规则 | 每轮 `<arch_rules>` + 可能 Pi 加载 AGENTS.md | Rule Push，去重后 session/短块 |
| 锚点 | 每轮 `<anchor>` + `<anchor_preview>` 150 行 | Pointer + `get_anchor_preview` |
| 草稿读 | 每轮 `requirement_draft_snapshot` | `get_requirement_draft` |
| 草稿写 | `update_requirement_draft` → store | 同 store + **revision 乐观锁** |
| 版本号 | 无统一 revision | `SessionState.revision` |
| 切换语义 | 无 `<context_change>` | **仅 chatMode** 发 change；锚点软更新 |
| SSE | `requirement_state` 旁路推送 UI | 保持；Store 仍为 UI 与 Tool 共同来源 |

关键代码锚点：

- `packages/context/src/build-context.ts` — 现 JIT 组装
- `packages/context/src/format-block.ts` — 现 `<agent_context>` 格式
- `packages/agent-runtime/src/run-chat.ts` — 每轮 prompt 前缀
- `packages/agent-runtime/src/requirement-draft-store.ts` — 草稿 Store
- `packages/agent-runtime/src/requirement-draft-tools.ts` — 写工具（无 revision）

### 11.2 开放问题（评审时请拍板）

| # | 问题 | 状态 / 选项 |
|---|------|------|
| 1 | **单一 revision 还是 `revision` + `draftRevision`？** | **倾向分离**：`revision` 仅 chatMode；`draftRevision` 仅草稿写锁 |
| 2 | **Rule Push 放哪？** | 仅 Pi ResourceLoader / 仅 user 前缀 / 两者分工 |
| 3 | **换锚点是否清空草稿？** | **已共识：保留 items**；只更新 `draft.anchorRef` 元数据（§3.2） |
| 4 | **换锚点是否 `revision++`？** | **已共识：否**；菜单/页面为软 Pointer（§3.1） |
| 5 | **`get_anchor_preview(anchorRef)` 与 Session 不一致时** | 拒绝 / 警告仍返回 / 静默纠正为当前 ref |
| 6 | **同 turn 内 draftRevision 变化** | prompt 前 pointer 与工具写后返回值应对齐 |
| 7 | **jsonl 历史旧 context** | 以 **最新 Pointer 的 anchor_ref** 为准；不强制「忘记旧页」 |
| 8 | **`pm_rules` 是否仍每轮 Push？** | 属 Rule，建议 Push |
| 9 | **PRD ↔ explore 切换时草稿** | 待拍板：切 explore 是否仅隐藏 UI 但 Store 保留 |
| 10 | **MVP 范围** | 先 draft 读写同源 + draftRevision 锁，再迁 anchor preview |

### 11.3 评审意见摘要（架构师视角）

**高度认同的部分：**

1. **五层组合**（Rule / Pointer / Change / Pull / Lock）比「全量 JIT」或「纯 Pull」更可实施、可测试。
2. **乐观锁**是 V1 的点睛之笔：把「模型可能不遵守 prompt」从概率问题变成 **可拦截的硬约束**，特别适合 PRD 草稿。
3. **不强制每次切换都 get preview**符合 Agent-Driven 原则，与 [AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md) §1.2 一致。
4. **拒绝 SYSTEM ALERT**合理；结构化 `<context_change>` 更可 parse、可日志、可单测。

**建议在评审会上明确的两点：**

1. **Revision 粒度**：写工具失败后的标准恢复流程（`get_*` → 重试）是否写入 `promptGuidelines` 与 AGENTS.md。
2. **与 AGENT_OS_DESIGN v2.3 决策 #4 的关系**：原决策「Anchor 送文件头 JIT」将被本方案 **部分取代**；需在 AGENT_OS_DESIGN 增 ADR 或修订表，避免文档打架。

**风险（可控）：**

- 模型 **不 pull 仍瞎答** — Pointer + Change + Rule 无法 100% 杜绝；靠验收用例 + 后续可选「弱强制」（如 PRD 写 draft 前 middleware 检查）缓解。
- **首轮少 preview** 可能多一次 tool 往返 — 产品可接受则不是问题（用户已表示不 prioritize token/latency 优化）。

---

## 12. 建议验收用例（实施后）

1. **连问 5 轮同锚点**：仍遵守 `list_methods` 等 Rule；未误用 jsonl 中更早的 anchor_ref。
2. **Turn3 换锚点 A→B**：`<context_change>` 出现；回答引用 B 相关代码；若仍引用 A 则 fail。
3. **PRD 草稿并发写**：模拟 stale revision 更新 → 必须 `RevisionMismatch`，不得覆盖新 draft。
4. **换锚后不 get preview 的泛问**：如「这两个模块业务差异」— 允许不调用 preview 也能答。
5. **换锚后问控件位置**：应触发 `get_anchor_preview`（或 `grep` 带正确 ref）；验收可统计 tool 调用。
6. **长对话 15+ 轮**：Rule 仍生效（grep 再答、无编造）。

---

## 13. 相关文档

| 文档 | 关系 |
|------|------|
| [AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md) | 上层 Agent OS 原则；V1 实施后需同步修订 JIT 相关段落 |
| [PM_REQUIREMENT_ASSISTANT.md](./PM_REQUIREMENT_ASSISTANT.md) | PRD 产品与字段约定 |
| [AGENTS.md](../AGENTS.md) | Rule Push 源文件 |
| [DEBUG_LOGGING.md](./DEBUG_LOGGING.md) | 实施后用 `turn-*/request.md` 对比 pointer / tool 调用 |

---

*本文档为 Proposed V1，不代表已实现。实现以 `grep` / `read` 源码为准。*
