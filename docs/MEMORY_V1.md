# letsTalk 记忆体系 V1 — 可成长助手（对齐 Hermes · 设计稿）

| 项目 | 内容 |
|------|------|
| 版本 | V1.0（Phase A 起） |
| 日期 | 2026-05-31 |
| 状态 | **Phase A+B 部分已落地** |
| 前置 | [MEMORY_V0.md](./MEMORY_V0.md) · [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md) · [HERMES_MEMORY_REFERENCE.md](./HERMES_MEMORY_REFERENCE.md) |
| 关联 | [AGENTS.md](../AGENTS.md) · [.agent/memory/README.md](../.agent/memory/README.md) |

> **定位转变：** V0 把「黑话 INDEX」当作记忆的几乎全部；V1 把 letsTalk 做成 **可成长的结对助手**——USER/CORE 常驻、topics 分类型、jargon INDEX 仅作 ERP 消歧加速器。

---

## 1. 为什么要从 V0 演进

V0 解决了 ERP **黑话消歧**与 **反代码复印件**，但暴露三类问题：

1. **类别错配**：昵称、偏好等被塞进 `glossary` + INDEX，却不会在每轮浮现（「阿斯拉」案例）。
2. **读写单通道**：几乎只有「用户消息命中 INDEX → Pull」；无 Hermes 式 Tier 1 常驻记忆。
3. **膨胀风险**：若把所有共识都当黑话进 INDEX，条数与误命中会失控。

V1 目标：**贴近 Hermes 的可成长助手**，同时保留 letsTalk 约束（代码为准、L4 清单独立、不写 API 快照）。

---

## 2. 总体架构：M0 / M1 / M2 + L0 / L3 / L4

```text
┌──────────────────────────────────────────────────────────────────┐
│ L0   AGENTS.md + system append          工作方式（人维护）          │
├──────────────────────────────────────────────────────────────────┤
│ M0   核心记忆（Tier 1 · 每会话 system · 有界）                     │
│      USER.md     称呼、偏好、沟通风格（~1.5KB）                     │
│      CORE.md     助手笔记：环境、惯例、踩坑（~2.5KB，Hermes MEMORY）│
├──────────────────────────────────────────────────────────────────┤
│ M1   主题记忆 topics/*.md（Tier 2/3 · 按需）                      │
│      glossary    项目 jargon（原「黑话」）· 消歧 + 怎么查           │
│      history     变更脉络                                         │
│      fact        稳定业务事实（非代码快照）                        │
│      procedure   轻量多步惯例                                     │
├──────────────────────────────────────────────────────────────────┤
│ M2   jargon 索引 INDEX.md（仅 glossary 词条 → 文件）              │
├──────────────────────────────────────────────────────────────────┤
│ E0   Episodic（Phase C）session_search · 查 transcript 原话       │
├──────────────────────────────────────────────────────────────────┤
│ L3   workFront / workBack / grep           活数据 · 不写 memory   │
│ L4   requirementDraft                      当前单交付               │
└──────────────────────────────────────────────────────────────────┘
```

**依赖方向：** L0 约束写入 → M0 常驻 → M2 仅加速 jargon → M1 topics 指向 L3 搜法 → L4 独立。

---

## 3. 三层注入（对齐 Hermes）

| Tier | 时机 | 内容 | V1 阶段 |
|------|------|------|---------|
| **Tier 1** | 会话创建 · system prompt | USER.md + CORE.md 全文（硬顶截断） | **Phase A** |
| **Tier 2** | 每轮 user prefix | INDEX 命中 → `<memory_context>`（glossary/history 片段） | V0 已有 |
| **Tier 3** | Agent 按需工具 | read/save topic · update_user/core · session_search | A 部分 / C 全文 |

**Tier 1 快照策略（Phase A 选定）：**

- **USER / CORE 在 `createPiSession` 时冻结进 project_context**（`_tier1.md` 虚拟文件，排在 AGENTS.md 前）。
- 本会话内磁盘更新后：**下一轮 user 前缀带 `<core_memory_refresh>`**（mtime > 句柄创建时间）；工具返回含 live 占用条。
- **background_review**：dev 默认每 10 user turn（`LETS_TALK_MEMORY_NUDGE_INTERVAL`，production 默认 0）。

---

## 4. M0：USER.md 与 CORE.md

### 4.1 路径与上限

| 文件 | 路径 | 硬顶 | 谁写 |
|------|------|------|------|
| USER | `.agent/memory/USER.md` | 1500 字符 | 人 + Agent（`update_user_profile`） |
| CORE | `.agent/memory/CORE.md` | 2500 字符 | 人 + Agent（`update_core_memory`） |

### 4.2 写什么

**USER.md**

- 用户给助手的称呼（如「阿斯拉」）
- 沟通偏好（短句/表格/少废话）
- PM 协作习惯（若稳定）

**CORE.md**

- 本仓库工作惯例（非 AGENTS.md 级规则）
- 反复出现的踩坑与纠正
- 环境/工具链备忘

**禁止：** REST 清单、菜单树、当前 PR/分支、requirementDraft 正文。

### 4.3 条目分隔（Hermes 式）

正文允许多段，段间用单独一行的 `§` 分隔，便于 `replace` 定位。Phase A 的 `append` 会在末尾追加 `\n\n§\n\n{content}`。

---

## 5. M1：topics 分类型

### 5.1 kind 一览

| kind | 用途 | 是否进 INDEX |
|------|------|--------------|
| `glossary` | 项目 jargon（**原黑话**） | **是** |
| `history` | 变更脉络 | 可选（业务锚词才登记） |
| `fact` | 稳定事实 | 否（Phase B 标签检索） |
| `procedure` | 轻量惯例 | 否 |

> 代码层 `glossary` 即文档所称 **jargon**；Phase A 不 rename 文件名前缀，避免破坏现有 topics。

### 5.2 INDEX 语义收窄

- 文件仍为三列表：`黑话 | 文件 | 类型`
- **类型列仅 glossary / history**（与 V0 一致）
- 文档改称 **「jargon 索引」**：只为 **搜代码前的消歧** 服务，不是全局记忆入口
- 软顶 **~120 行**；超出由 Phase C background review 合并

### 5.3 写入路由（Agent guideline）

| 用户说了什么 | 写哪里 |
|--------------|--------|
| 叫我 X / 偏好 Y | **USER.md** |
| 仓库惯例 / 踩坑 | **CORE.md** |
| X 在代码里不是 Y（消歧） | **glossary topic + INDEX** |
| 为什么上次改 Z | **history topic** |
| 稳定业务事实 | **fact topic** |
| 当前这单需求 | **L4 requirementDraft** |
| 接口/菜单 | **L3 grep** · 禁止 memory |

---

## 6. 工具面（V1）

### Phase A（本 PR）

| 工具 | 职责 |
|------|------|
| `save_memory` / `read_memory` / `list_memory_index` | 不变 · topics + INDEX 双写 |
| `resolve_memory_terms` | 不变 · Tier 2 Pull |
| **`memory`** | USER/CORE · add / replace / remove（主入口） |
| **`update_user_profile`** / **`update_core_memory`** | 同上（兼容别名） |
| **`read_user_profile`** | 读 USER（会话内补充） |
| **`read_core_memory`** | 读 CORE（会话内补充） |

### Phase B

- Tier 2 扩展：fact/procedure 标签命中
- `memory` 统一 facade（add/replace/remove + target 路由）
- 字符顶满时强制 replace 合并提示

### Phase C

- `background_review`（每 N user turn）
- `search_past_sessions`（FTS）
- INDEX 瘦身与 topic merge

---

## 7. 与 Hermes 对照

| Hermes | letsTalk V1 |
|--------|-------------|
| MEMORY.md | **CORE.md** |
| USER.md | **USER.md** |
| 冻结快照进 system | **Tier 1 · createPiSession 读取** |
| prefetch 围栏 | **Tier 2 · turn-prefix**（已有） |
| memory add/replace/remove | save_memory + update_user/core → Phase B 统一 |
| background_review | **已落地**（dev 默认每 10 轮） |
| session_search | Phase C |
| 无 ERP jargon 索引 | **保留 INDEX**（差异化） |

---

## 8. L0 规则变更摘要

**DO（新增/强调）**

- 称呼、偏好 → `update_user_profile`
- 仓库惯例、踩坑 → `update_core_memory`
- 项目 jargon 消歧 → `save_memory` kind=glossary + INDEX
- 不确定 → draft；M0/M1 满了 → replace 合并，勿无限 append

**DON'T（保留）**

- 禁止 API/菜单/PR 进度复印件
- 禁止把 nickname 写进 glossary/INDEX（→ USER）
- INDEX 禁止正文

---

## 9. 迁移

| 原 V0 | V1 动作 |
|-------|---------|
| `glossary-阿斯拉昵称.md` + INDEX | → **USER.md** 一条；删 topic + INDEX 行 |
| `history-detail-ledger.md` | 保留 · history + INDEX 锚词 |
| legacy flat `*.md` | 逐步迁入 topics 或删 |

---

## 10. 分阶段验收

### Phase A

1. 新会话 system prompt 含 USER/CORE（若有内容）
2. 「阿斯拉」在 USER.md，新会话助手自知称呼
3. glossary 仍走 INDEX Pull；nickname 不依赖 Pull
4. `update_user_profile` 可 append/replace
5. **Web UI**：header「记忆」按钮 → 弹窗编辑 `.agent/memory` 文件 →「保存并应用到下一条回复」会 `disposePiSession` 刷新 Tier 1

### Phase B

5. fact/procedure topic 可 save，不强制 INDEX
6. Tier 2 除 INDEX 外有标签命中

### Phase C

7. background_review 每 N 轮可写 0~1 条
8. session_search 返回 transcript 片段

---

## 11. 开放问题

1. 同会话 Tier 1 不刷新时，是否在 Tier 2 补发「本会话 USER 变更」？→ Phase B
2. PM 模式 review 是否只写 history？→ Phase C 定
3. `fact` / `procedure` 是否进 INDEX 可选行？→ 默认否

---

## 12. 文档索引

| 文档 | 用途 |
|------|------|
| **本文** | V1 架构、注入、工具、迁移 |
| [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md) | 构筑动机与路线图（随 V1 更新 §） |
| [MEMORY_V0.md](./MEMORY_V0.md) | V0 规格（只读归档） |
| [HERMES_MEMORY_REFERENCE.md](./HERMES_MEMORY_REFERENCE.md) | Hermes 调研 |

---

*Phase A 实现：`packages/memory/src/core-store.ts` · `pi-resource-loader.ts` · `memory-tools.ts` · `.agent/memory/USER.md`*
