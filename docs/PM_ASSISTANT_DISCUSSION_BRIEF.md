# letsTalk PM 需求助手 — 讨论纪要（供评审 / 归档）

| 项目 | 内容 |
|------|------|
| 权威产品说明 | **`docs/PM_REQUIREMENT_ASSISTANT.md`（v0.4）** |
| 本文档 | 讨论背景、演进过程、外部评审摘要 |
| 整理日期 | 2026-05-28 |

---

## 1. 背景（简述）

- letsTalk：Vue + Java monorepo，Agent 只读读码，锚点聚焦
- **现阶段只服务 PM**：帮其观察代码、收成需求；**文档可选**
- 痛点：PM 不懂现状、不知研发要什么；研发从口语里考古

---

## 2. 共识演进（时间线）

### 2.1 实现与踩坑

- M1：双轨 + `update_requirement_draft` + 字段化清单
- 问题：清单第二轮不更新（SSE 回调）、太研发向、增量 merge 失忆、前后端拆两条

### 2.2 产品纠偏

| 曾偏离 | 纠正 |
|--------|------|
| 八章定稿、最小公约、双向叠层 | 文档可选；**只服务 PM**；开发阶段 **少就是好** |
| 「同文双读」混排 | 改为 **业务主干 + tech_traces 旁路**；导出处折叠研发参考 |
| 单独「评价」流程/总评区 | **不要**；现状进「现在怎样」或对话一句带过 |
| 增量 JSON patch | 改为 **单条 upsert 全量** + 快照注入 |

### 2.3 外部评审三点（2026-05-28，已吸收要点）

1. **业务为体、技术为用** — 采纳；PM 界面干净，技术进 `techTraces`
2. **菜单 map 锚点** — 采纳方向；P1 分阶段，先核实菜单数据源
3. **Upsert 非 patch** — 采纳；一条需求一次全量提交

### 2.4 当前产品共识（= v0.4）

见 `PM_REQUIREMENT_ASSISTANT.md` §0～§3。核心：

- 右栏少格：现在 / 要改 / 验收 等 **业务格**；**每条下方**列研发参考（`techTraces`）
- Agent 读代码 → 填「现在怎样」+ 写入该条 `techTraces`
- 工具：`upsert_requirement(id, business, techTraces)`，每轮快照
- 导出（可选）：与清单同构，每条业务 + 下方研发参考
- **不**做：评价模块、八章定稿、PM/研发双工作台

---

## 3. 与代码现状差距（评审时注意）

| v0.4 目标 | 当前代码（约） |
|-----------|----------------|
| business + techTraces | `fields[]` 扁平 + `codePaths` |
| upsert 单条 | `update_requirement_draft` 增量 merge |
| 导出清单 | `export-prd.ts` 聊天实录 |
| 菜单锚点 | 文件列表 + 手填路径 |

---

## 4. 典型场景（用户管理 · 改性别）

- **一条需求**，业务格填满，技术进折叠
- Agent 对话指出：树非表、已有删除按钮
- **不要**第二条「后端支持」、不要 `rbac_user` 进 PM 主视图

---

## 5. 开放问题（实现时定）

见 `PM_REQUIREMENT_ASSISTANT.md` §8。

---

## 6. 相关路径

- 产品说明：`docs/PM_REQUIREMENT_ASSISTANT.md`
- 实现阶段：`docs/IMPLEMENTATION_PHASES.md`
- 类型（待重构）：`packages/shared-types/src/requirement-draft.ts`
- PM 规则：`packages/context/src/pm-resources.ts`
- UI：`apps/web/components/RequirementCanvas.tsx`
