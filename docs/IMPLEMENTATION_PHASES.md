# letsTalk 分阶段实施与进度

| 项目 | 内容 |
|------|------|
| 版本 | v1.0 |
| 开始日期 | 2026-05-21 |
| 总设计（权威） | [AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md) |
| Pi 接入参考 | [PI_SDK_NODE_INTEGRATION.md](./PI_SDK_NODE_INTEGRATION.md) |

---

## 1. 文档分工

| 文档 | 用途 |
|------|------|
| **AGENT_OS_DESIGN.md** | 架构、契约、原则 — **不轻易改方向，只增补 ADR** |
| **本文档** | 分阶段做什么、验收标准、**进度勾选**、你提的需求 backlog |
| **[AI_ENGINEERING/README.md](./AI_ENGINEERING/README.md)** | Agent **工程成熟度**（日志、tool、eval…）— 与本文功能阶段正交 |
| **PI_SDK_NODE_INTEGRATION.md** | 实现时抄 Pi API 用 |

> 你后续提的需求，记在本文 **§6 需求 Backlog**；若影响架构，再回写总设计 §1.4 / 修订记录。

---

## 2. 阶段总览

```text
阶段 0  骨架连通          → 能聊（无工具）
阶段 1  问答 + 工具 + 查文件  → 能问仓库、能看见 grep/read（Pi 默认）
阶段 2  锚点与破冰        → 选页面、Turn1 秒答简单问题
阶段 3  Java 手术刀       → 巨石类方法级读取
阶段 4  记忆 / 用户提示    → 暂缓（规则：记忆仅供参考）
阶段 5  对话记录          → 刷新/HMR 后仍能看到历史、多轮上下文  ★ 下一项
阶段 6+ 增强（按需）      → 部署、Anchor 树、改码计划…
```

| 阶段 | 用户可感知能力 | 对应设计里程碑 | 预估 |
|------|----------------|----------------|------|
| **0** | 打开网页，流式对话，无工具块 | M0 | 2～3 天 |
| **1** | 问项目/代码，Agent 自主 grep/read/find，工具可见 | M0 收尾 + M1 工具部分 | 3～5 天 |
| **2** | 左侧选 vue 锚点，简单问题首轮不 read | M1 完整 | 约 1 周 |
| **3** | 问 Java 接口逻辑，list_methods → read_method | M1.5 | 约 1 周 |
| **4** | （暂缓）`.agent/memory` 仅参考；自动记忆关闭 | — | — |
| **5** | 对话列表 + Transcript 持久化；Pi 上下文可恢复 | M0 补全 | 约 3～5 天 |
| **6+** | 按需：部署文档、vue-router Anchor、改码… | M3+ | 排期 |

**原则：** 每阶段结束必须 **可演示、可勾选验收**；Pi **默认优先**（见总设计 §1.5）。

---

## 3. 阶段 0 — 骨架连通

**目标：** 证明 Next.js + Pi + SSE 一条链打通；**还不**做文件查询。

### 3.1 任务清单

- [x] pnpm workspace + Next.js（`runtime = "nodejs"`）
- [x] 依赖：`@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`（npm 公开包 `0.75.5`）
- [x] `packages/agent-runtime`：`createAgentSession` 封装
- [x] `packages/shared-types`：SSE 事件类型
- [x] `POST /api/agent/chat/stream` + `pi-event-bridge`
- [x] `SessionManager.create(cwd)`；开发态 `session-cache` 兜底
- [x] 页面：Transcript + 输入框 + 连接状态
- [x] `.env.example`：`LLM_API_KEY`、`WORKSPACE_ROOT`
- [x] `scripts/smoke-session.ts`（终端冒烟）
- [x] `GET /api/health`

**Pi 配置：** `tools: []` 或 `noTools: "all"`；`DefaultResourceLoader` + 可选 `AGENTS.md`。

### 3.2 验收

- [x] 浏览器输入「你好」→ 流式回复
- [x] **无** tool 块（`useTools: false` 可测；默认已开工具进入阶段 1）
- [ ] 保存代码触发 HMR 后，同 `sessionId` 多轮上下文仍在
- [x] `curl` / smoke 脚本通过

### 3.3 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `已完成` |
| 开始 | 2026-05-21 |
| 完成 | 2026-05-27 |

---

## 4. 阶段 1 — 知识问答 + 工具调用 + 文件查询 ★

**目标：** 部门内可用的 **最小可用 Agent**：能基于绑定仓库回答问题，能 **自己 grep/read/find**，UI **看得见工具**。

> 本阶段 = 你要的「先能问答、能调工具、能查文件」；**不做** Anchor 侧栏、不做 memory、不做 Java AST。

### 4.1 任务清单

**工程**

- [x] `createAgentSession({ tools: ["read","grep","find","ls"] })` — 与 Pi `05-tools.ts` 一致
- [x] `cwd = WORKSPACE_ROOT`；`DefaultResourceLoader` 自动加载仓库内 `AGENTS.md`
- [x] `GET /api/workspace`：返回当前 `workspaceRoot`（只读展示）
- [x] UI：工具块可折叠（`tool_start` / `tool_output`）
- [x] UI：展示工作区路径；发送中禁用输入
- [x] README：本地启动步骤

**行为（Pi 默认，不额外封装 grep）**

- [ ] 问「项目是做什么的」→ 可能 `read` README / `grep` 关键词
- [ ] 问「哪里出现 accountId」→ `grep` 迭代（模型自选关键词）
- [ ] 问「列出 src/views 下有哪些 vue」→ `find` 或 `ls`

### 4.2 验收（硬核）

- [x] 绑定真实 demo 仓库（`WORKSPACE_ROOT` 指向含 `src/` 的项目）
- [x] 至少完成 **1 次** 可见的 `grep` 或 `read` tool 调用并正确回答
- [x] Transcript 中流式正文 + tool 块均正常
- [ ] 连续追问 2 轮，上下文连贯（建议你本地再点两轮确认）

### 4.3 本阶段明确不做

- Anchor UI、`anchor_preview` JIT
- `list_methods` / `read_method`
- `save_memory` / `read_memory`
- server 侧 memory 预搜、向量索引

### 4.4 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `基本完成` |
| 开始 | 2026-05-21 |
| 完成 | 2026-05-27 |

---

## 5. 阶段 2 — 锚点与破冰（JIT）

**目标：** 选当前关注的 `.vue`；简单问题 **第一轮直接答**（文件头已注入）。

### 5.1 任务清单

- [x] `packages/context`：`buildAgentContext`、`anchor_preview`（前 150 行）
- [x] `GET /api/workspace/anchors`（如 `src/views/**/*.vue`）
- [x] Anchor UI：全库模式 + 列表 + 手动路径 + `sessionStorage`
- [x] 请求体带 `anchor`；SSE 可选 `context` 调试事件
- [x] 业务 `AGENTS.md` 模板（运行根 `AGENTS.md`）

### 5.2 验收

- [x] 选 `Login.vue`，问表单字段 → **Turn 1 无 read tool**，回答正确
- [x] 全库模式 + 复杂问题 → 仍可用 grep/read，有 tool 块
- [x] 切换 anchor 不丢 `sessionId` 对话

### 5.3 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `已完成` |
| 开始 | 2026-05-27 |
| 完成 | 2026-05-27 |

---

## 6. 阶段 3 — Java 手术刀（AST）

**目标：** 2000 行级 Controller 能 **list_methods → read_method** 回答。

### 6.1 任务清单

- [x] `packages/ast-tools`：Java 方法解析（签名 + 单方法抽取）
- [x] Pi `customTools`：`list_methods`、`read_method`
- [x] 注册进 `createAgentSession` 的 tools 列表
- [x] `AGENTS.md` 补充：大 Java 文件优先 AST 工具

### 6.2 验收

- [x] `DetailController.java` 问接口列表 → 轨迹含 list_methods，回答正确（用户确认）

### 6.3 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `已完成` |
| 开始 | 2026-05-27 |
| 完成 | 2026-05-27 |

---

## 7. 阶段 4 — 记忆 / 用户提示（暂缓）

**原目标：** Agent 写入 `.agent/memory/`；后续 grep 召回。

**现状（2026-05-27）：** 产品方向未定型（代码常变、与 Skill 边界不清）→ **默认关闭** `save_memory` / `read_memory`；`packages/memory` 代码保留供以后启用。  
**倾向的新方向（R002，未做）：** 用户业务提示 — 人写「业务类型 → 页面/路径」。

**通用规则（已定）：** `.agent/memory` 与任何笔记 **仅供参考**；**以 workFront/workBack 实际代码为准**（见根目录 `AGENTS.md` §通用原则）。

### 7.1 任务清单（实验代码保留，默认关闭）

- [x] 实验实现：`packages/memory`、`save_memory` / `read_memory`（`ENABLE_MEMORY_TOOLS=false`）
- [ ] **用户提示**：UI 或 `.agent/hints/` 维护路由规则（未做）
- [ ] 选中提示 / 匹配业务关键词时 JIT 注入（未做）

### 7.2 验收

- [ ] （暂停）原 memory 验收项不再作为发布门槛

### 7.3 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `暂缓归档` |
| 开始 | 2026-05-27 |
| 完成 | 2026-05-27（规则已定，不继续扩展） |

---

## 8. 阶段 5 — 对话记录 ★（R003，下一项）

**目标：** 用户能**看见**历史对话、**切换/新建**会话；刷新页面或 dev HMR 后，多轮追问仍连贯。**不用向量库**。

### 8.1 现状缺口

| 层 | 现在 | 问题 |
|----|------|------|
| **Pi 多轮上下文** | `run-chat.ts` 内存 `Map<sessionId, PiSession>` | `pnpm dev` HMR / 重启后 Map 清空，模型「失忆」 |
| **浏览器 Transcript** | `page.tsx` 的 `items[]` 仅 React 状态 | **刷新页面** UI 空白（`sessionId` 还在 sessionStorage，但气泡没了） |
| **会话列表** | 无 | 不能看历史会话、不能「新建对话」 |

> **区分：** 对话记录 ≠ `.agent/memory`（业务笔记，已暂缓）。对话记录 = **这次聊天说了什么** + **模型上下文从哪续上**。

### 8.2 两层设计（都要，可分步做）

```text
┌─────────────────────────────────────────────────────────┐
│  A. UI Transcript（给人看）                              │
│     用户/助手/工具块 → JSON 落盘 → 刷新后原样渲染         │
├─────────────────────────────────────────────────────────┤
│  B. Agent 上下文（给模型续聊）                            │
│     letsTalk sessionId ↔ Pi Session 文件 → HMR 后恢复     │
└─────────────────────────────────────────────────────────┘
```

| 层 | 存什么 | 路径（建议） |
|----|--------|--------------|
| **A Transcript** | `TranscriptItem[]`、标题、时间、anchor 快照 | `{WORKSPACE_ROOT}/.agent/conversations/{sessionId}.json` |
| **B Agent 绑定** | `sessionId`、Pi `sessionFile` 路径、`cwd`、model | `{WORKSPACE_ROOT}/.agent/conversations/{sessionId}.meta.json` 或合并进 A |

**原则：**

- 跟 **WORKSPACE_ROOT** 走（与 workFront/workBack 同仓库），**不做**按用户分库（部门内单机足够）。
- **不做**向量检索、不做全文灌 prompt；Transcript 只用于 UI 展示，模型仍靠 Pi 自己的 messages。
- 工具块 `preview` 继续截断（如 2000 字），完整 tool 结果可不存或另存 `.agent/conversations/{id}/tools/`（v1 可只存 preview）。

### 8.3 推荐实施顺序

#### 第一步：Transcript 持久化（v1，优先）

**用户可感知：** 刷新页面后，聊天气泡还在。

| 任务 | 说明 |
|------|------|
| `packages/conversation`（或 `shared-types` 扩展） | 类型 `ConversationMeta`、`TranscriptItem` 序列化 |
| `GET/PUT /api/conversations/:sessionId` | 读/写 transcript + meta |
| `GET /api/conversations` | 列表：id、标题（首条用户话前 30 字）、updatedAt |
| `page.tsx` | 挂载时拉 transcript；每轮 `turn_end` 后 PUT；侧栏「历史会话」+「新建对话」 |
| `POST /api/conversations` | 新建 sessionId（或前端生成 UUID 再注册） |

**标题规则：** 取第一条 user 消息截断；无则「新对话」。

#### 第二步：Pi 上下文恢复（v2，解决 HMR）

**用户可感知：** 改代码保存（HMR）后，不刷新浏览器，第 N 轮仍能引用第 1 轮内容。

| 任务 | 说明 |
|------|------|
| 创建 session 时 | 为每个 `sessionId` 固定 Pi `SessionManager` 的 session 文件（或记录 `getSessionFile()`） |
| `turn_end` | 把 `sessionFile` 写入 meta |
| `run-chat` Map miss | 读 meta → `SessionManager` 恢复同一文件 → `createAgentSession` 带 resume |
| 验收 | 连问 3 轮 → 改 `page.tsx` 触发 HMR → 第 4 轮仍记得第 1 轮（见总设计 §12.1） |

> Pi 已用 `SessionManager.create(cwd)` 落盘到 `~/.pi/...`；letsTalk 需维护 **浏览器 sessionId → Pi session 文件** 映射，不能每次 `createAgentSession` 都 new 空白 session。

#### 第三步（可选 v3）

- 删除会话、导出 Markdown
- Transcript 搜索（**关键词 grep 文件**，非向量）
- 生产环境是否持久化（默认 dev 开，prod 可配置）

### 8.4 API 草案

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/conversations` | 会话列表 |
| POST | `/api/conversations` | 新建 `{ sessionId?, title? }` |
| GET | `/api/conversations/:id` | meta + transcript |
| PUT | `/api/conversations/:id` | 保存 transcript（整份或增量） |
| DELETE | `/api/conversations/:id` | 删记录 + 可选删 Pi session 文件 |

聊天仍走现有 `POST /api/agent/chat/stream`；`turn_end` 后前端触发保存。

### 8.5 数据示例（transcript JSON）

```json
{
  "sessionId": "uuid",
  "title": "DetailController 有哪些接口",
  "updatedAt": "2026-05-27T12:00:00.000Z",
  "anchor": { "kind": "vue", "ref": "workFront/src/views/Detail.vue" },
  "items": [
    { "kind": "user", "text": "..." },
    { "kind": "context", "mode": "focused", "anchorRef": "...", "previewLines": 150 },
    { "kind": "tool", "tool": "list_methods", "preview": "...", "ok": true },
    { "kind": "assistant", "text": "..." }
  ]
}
```

### 8.6 明确不做

- 向量库 / embedding 检索
- 把 Transcript 全文每轮注入 prompt
- 按登录用户分租户（远期）
- 与 `.agent/memory` 合并（业务笔记仍暂缓）

### 8.7 验收

- [x] 聊 3 轮 → **刷新浏览器** → Transcript 与列表仍在（v1；模型多轮连贯性见 v2）
- [x] 侧栏可「新建对话」并切换历史会话
- [x] **HMR**：改代码保存 3 次不刷新页 → 第 4 轮仍能引用第 1 轮（v2）
- [x] `.agent/conversations/` 下可看到 json 文件

### 8.8 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `完成`（v1+v2） |
| 开始 | 2026-05-27 |
| 完成 | 2026-05-27 |

### 8.9 预估改动面（实施时写 §13）

| 包/目录 | 职责 |
|---------|------|
| `packages/conversation/` | 读写 `.agent/conversations/`、类型 |
| `packages/agent-runtime/run-chat.ts` | session 恢复、meta 更新 |
| `apps/web/app/api/conversations/` | REST |
| `apps/web/app/page.tsx` | 历史列表、加载/保存 transcript |

---

## 9. 阶段 6 — PM 需求助手（R002 + R004）

**目标（v0.4，见 `docs/PM_REQUIREMENT_ASSISTANT.md`）：** 帮 PM 读代码、收成业务清单；文档可选。非 PRD 八股、非写码。

**已实现（M1 草案）：** 双轨 + `update_requirement_draft`（与 v0.4 尚有差距）。

**待对齐 v0.4：** business/techTraces 分层、单条 upsert、菜单锚点、清单导出。

### 9.1 任务清单

- [x] `ChatMode`：`explore` | `prd`；请求体 / 会话 JSON 持久化
- [x] JIT：`pm_rules` + `prd_template` + `.agent/hints/` 文件列表（不全文灌入）
- [x] `.agent/templates/prd-template.md`、示例 hint
- [x] UI：探索 / 写需求切换、导出 Markdown
- [ ] 内测：PM 用真实页面走通 1 份可评审 PRD

### 9.2 验收

- [ ] 写需求模式 + 锚点 → Agent 输出含「现状 / 目标 / 验收」结构
- [ ] 至少 1 次工具调用核对代码路径
- [ ] 导出 `.md` 可供研发直接评论

### 9.3 阶段状态

| 字段 | 值 |
|------|-----|
| 状态 | `已完成（待内测）` |
| 开始 | 2026-05-27 |

---

## 10. 阶段 7+ — 其他增强（按需排期）

| 项 | 说明 | 状态 |
|----|------|------|
| **对话记录（R003）** | §8：Transcript + Pi 上下文恢复 | **完成** |
| **PM 写需求（R004）** | §9：模式 + 模板 + hints + 导出 | **完成（待内测）** |
| Vue 沙箱 / 点选元素 | 页面预览、DOM 锚点 | 暂缓 |
| vue-router 树形 Anchor | M3+ | 未排 |
| **用户业务提示（R002）** | `.agent/hints/` 人维护；JIT 列目录 | **随 §9 落地** |
| 仅 memory 向量索引 | 多轮 grep 仍不够时 | 未排 |
| Agent 自动 save_memory | 已实现可 `ENABLE_MEMORY_TOOLS=true`  reopen | 暂缓 |
| 按用户存储记忆 | 远期 | 未排 |
| 只读改码 / diff 计划 | 远期 | 未排 |
| 生产 Docker / 内网部署文档 | 远期 | 未排 |

---

## 9. 工作进度日志

> **用法：** 每完成一批任务或每次结对后，追加一行；checkbox 同步勾 §3～§7。

| 日期 | 阶段 | 进展摘要 | 操作人/备注 |
|------|------|----------|-------------|
| 2026-05-21 | — | 创建分阶段实施文档 v1.0；总设计 v2.3.1 | 文档 |
| 2026-05-21 | 0 | scaffold：monorepo、agent-runtime、web UI、SSE API | 代码 |
| 2026-05-27 | 0～1 | 流式对话 + Pi 只读工具；`serverExternalPackages` 修 node:fs | 代码 |
| 2026-05-27 | 2 | `packages/context`、Anchor 侧栏、`GET /api/workspace/anchors` | 代码 |
| 2026-05-27 | 2 | 验收通过；workFront/workBack 布局 | 用户确认 |
| 2026-05-27 | 3 | `ast-tools` + `list_methods`/`read_method` Pi 工具 | 代码 |
| 2026-05-27 | 3 | DetailController 验收通过 | 用户确认 |
| 2026-05-27 | 4 | `packages/memory` + save/read_memory + 示例 md | 代码 |
| 2026-05-27 | 6 | PM 写需求：探索/写需求模式、PRD 模板、hints、导出 md | 代码 |
| 2026-05-27 | 5 | 对话记录 v2：Pi session 绑定 `.agent/conversations/pi/`，HMR 恢复 | 代码 |
| 2026-05-27 | 5 | 对话记录 v1：Transcript 持久化 + 侧栏会话列表 | 代码 |
| 2026-05-27 | 4 | 记忆暂缓；AGENTS.md 写明「仅供参考、以代码为准」 | 用户决策 |

### 9.1 当前焦点

```text
交付基线：阶段 0～3、5、6（PM 写需求 v1）已完成
阶段 4：暂缓归档
下一阶段：PM 内测反馈；可选 vue-router 锚点 / 页面沙箱
```

---

## 10. 需求 Backlog（你的持续输入）

> 你提的需求记在这里；我评估后归入某阶段或 §8。

| ID | 日期 | 需求 | 归入阶段 | 状态 |
|----|------|------|----------|------|
| R001 | 2026-05-21 | 总设计 + 分阶段文档；先问答/工具/查文件 | 阶段 0～1 | 已记录 |
| R002 | 2026-05-27 | 用户业务提示：`.agent/hints/` | **阶段 6 §9** | 已落地（可续写 hint） |
| R003 | 2026-05-27 | **对话记录**：刷新/HMR 后 Transcript + 多轮上下文；不要向量库 | **阶段 5 §8** | 完成 |
| R004 | 2026-05-27 | **PM 写需求**：模式 + PRD 模板 + 导出 | **阶段 6 §9** | 完成（待内测） |
| | | | | |

---

## 11. 仓库结构（随阶段生长）

```text
阶段 0 完成后应有：

letsTalk/
├── app/
│   ├── page.tsx
│   └── api/
│       ├── health/route.ts
│       └── agent/chat/stream/route.ts
├── packages/
│   ├── shared-types/
│   ├── context/          # 阶段 2+
│   └── agent-runtime/
├── scripts/smoke-session.ts
├── .pi-agent/models.json.example
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── docs/
```

阶段 2+ 再增：`packages/context`、`packages/ast-tools`、`packages/memory`、`packages/conversation` 等。

---

## 13. 变更记录（影响文件与逻辑）

> **约定：** 每批实现追加一条；写清「改了哪些文件」和「运行时逻辑变化」。验收项见各阶段 §3～§7。

### CL-2026-05-27-A — workFront / workBack 工作区布局

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/context/src/workspace-paths.ts` | **新增** `resolveWorkspaceLayout()`：`WORKSPACE_ROOT` = letsTalk 运行根；`FRONTEND_ROOT`/`BACKEND_ROOT` 默认 `workFront`/`workBack` |
| `packages/context/src/build-context.ts` | JIT `arch_rules` 注入目录说明；`toWorkspaceRef()` 把锚点路径规范为 `workFront/...` |
| `packages/context/src/list-anchors.ts` | 锚点列表改扫 `frontendRoot` 下 `src/views`，返回相对运行根的路径 |
| `packages/agent-runtime/src/run-chat.ts` | `getWorkspaceLayout()`；`buildAgentContext({ layout })` |
| `apps/web/app/api/workspace/route.ts` | 返回 `frontendRoot`、`backendRoot` 等 |
| `.env.example`、`workFront/README.md`、`workBack/README.md` | 配置与 symlink 说明 |

**行为：** Pi `cwd` = 运行根；工具路径形如 `workFront/src/views/Login.vue`、`workBack/src/main/java/...`。

---

### CL-2026-05-27-B — 阶段 2 锚点 + JIT

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/context/src/build-context.ts`、`format-block.ts`、`anchor-preview.ts` | `buildAgentContext` 读 AGENTS.md、锚点前 150 行；`formatAgentContextBlock` 生成 XML 前缀 |
| `packages/shared-types/src/index.ts` | `AgentAnchor`、`ChatStreamRequest.anchor`、SSE `context` 事件 |
| `packages/agent-runtime/src/run-chat.ts` | 每轮 `session.prompt(prefix + message)` |
| `apps/web/app/page.tsx` | 左侧锚点栏、`sessionStorage` 持久化 |
| `apps/web/app/api/workspace/anchors/route.ts` | 列出 vue 锚点 |

**行为：** 选中锚点 → focused 模式 + 文件头注入；全库探索 → 不传 anchor。

---

### CL-2026-05-27-C — 阶段 3 Java AST 工具

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/ast-tools/src/java/parse.ts` | `listMethods` / `readMethod`（签名级解析 + 花括号平衡抽方法体） |
| `packages/agent-runtime/src/java-ast-tools.ts` | Pi `customTools`：`list_methods`、`read_method` |
| `packages/agent-runtime/src/create-session.ts` | `tools` 白名单增加上述两项；`customTools` 合并 Java 工具 |
| `AGENTS.md` | 约定：`*Controller.java` 一律先 list_methods |

**行为：** 模型调 `list_methods(filePath)` 得接口表；`read_method(filePath, methodName)` 得单方法代码；避免 `read` 整文件。

---

### CL-2026-05-27-D — 阶段 4 记忆闭环

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/memory/src/store.ts` | `saveMemory` 写 `.agent/memory/{slug}.md`（YAML frontmatter）；`readMemory` 读全文 + `findStaleSources` |
| `packages/memory/src/stale.ts` | 对比 `sources` 文件 mtime 与记忆文件 mtime，附 `⚠ 可能过期` |
| `packages/agent-runtime/src/memory-tools.ts` | Pi `save_memory`、`read_memory` |
| `packages/agent-runtime/src/create-session.ts` | `customTools` 合并 memory 工具 |
| `packages/context/src/build-context.ts` | JIT `memory_directory_hint` 写明 grep → read_memory 顺序 |
| `.agent/memory/order-state-machine.md` | 验收用示例记忆 |
| `apps/web/app/api/workspace/memory/route.ts` | `GET` 列出记忆文件 |
| `apps/web/app/page.tsx` | 侧栏「记忆」列表（只读展示） |
| `AGENTS.md` | 记忆读取/写入守则 |

**行为：** server **不**预搜 memory 正文；Agent 用 `grep .agent/memory` 或 `read_memory(topic)`；`save_memory` 落盘后可被后续 grep 命中。

---

### CL-2026-05-27-E — 阶段 4 记忆暂缓（默认关闭）

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/agent-runtime/src/create-session.ts` | `ENABLE_MEMORY_TOOLS = false`；不再注册 `save_memory` / `read_memory` |
| `packages/context/src/build-context.ts` | 移除 JIT `memory_directory_hint`（不再每轮提 memory 目录） |
| `AGENTS.md` | 改为「跨会话笔记暂缓」+ R002 用户提示方向说明 |
| `apps/web/app/page.tsx` | 侧栏去掉 memory 列表，改为筹备中文案 |
| `docs/IMPLEMENTATION_PHASES.md` §7、§10 R002 | 阶段 4 标「暂缓」；Backlog 记录用户业务提示 |

**行为：** 运行态与阶段 3 一致；`.agent/memory/*.md` 可手工保留或删除，Agent 不会自动读写。

---

### CL-2026-05-27-F — 记忆仅供参考 + 阶段 4 归档

| 影响文件 | 逻辑变化 |
|----------|----------|
| `AGENTS.md` | 新增 **§通用原则**：以实际代码为准；`.agent/memory` 仅供参考 |
| `.agent/memory/README.md` | 目录说明：笔记可能过时，冲突以代码为准 |
| `docs/IMPLEMENTATION_PHASES.md` | 阶段 4 标「暂缓归档」；§9.1 焦点移至阶段 5+ |

**行为：** 无运行时逻辑变更（memory 工具仍关闭）；Pi 通过 `DefaultResourceLoader` 仍会读 `AGENTS.md` 中的通用原则。

---

### CL-2026-05-27-G — 阶段 5 对话记录 v1（Transcript）

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/shared-types/src/conversation.ts` | **新增** `TranscriptItem`、`ConversationSummary`、`ConversationRecord` |
| `packages/conversation/src/store.ts` | 读写 `{WORKSPACE_ROOT}/.agent/conversations/{sessionId}.json`；`list/get/create/save` |
| `apps/web/app/api/conversations/route.ts` | `GET` 列表、`POST` 新建 |
| `apps/web/app/api/conversations/[id]/route.ts` | `GET` 单条、`PUT` 保存 transcript + anchor |
| `apps/web/lib/conversation-groups.ts` | 侧栏按今天 / 7 天 / 30 天 / 月分组 |
| `apps/web/app/page.tsx` | 最左会话栏（DeepSeek 风格）；挂载恢复；每轮结束 `PUT`；切换前保存 |
| `apps/web/package.json`、`next.config.ts` | 依赖 `@lets-talk/conversation`；dev/build 先编译 conversation |
| `.agent/conversations/.gitkeep` | 占位目录 |

**行为：** 浏览器 Transcript 落盘；刷新后气泡与侧栏仍在；`sessionId` 存 `sessionStorage`。Pi 内存 Map 仍随 HMR 丢失（v2 再绑 Pi session 文件）。

---

### CL-2026-05-27-H — 阶段 5 对话记录 v2（Pi 上下文 / HMR）

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/conversation/src/pi-session.ts` | **新增** 固定路径 `.agent/conversations/pi/{sessionId}.jsonl`；`resolvePiSessionFile` |
| `packages/conversation/src/store.ts` | `ConversationRecord.piSessionFile`；`bindPiSessionFile`；新建会话预写相对路径 |
| `packages/shared-types/src/conversation.ts` | 类型增加 `piSessionFile?` |
| `packages/agent-runtime/src/create-session.ts` | `SessionManager.open(piFile)` 替代每次 `create` 新文件 |
| `packages/agent-runtime/src/run-chat.ts` | Map miss → 读 conversation meta → open 同一 jsonl；`turn_end` 后 `bindPiSessionFile` |
| `packages/agent-runtime/package.json` | 依赖 `@lets-talk/conversation` |
| `.agent/conversations/pi/.gitkeep` | Pi session 目录占位 |

**行为：** 每轮对话写入 Pi jsonl；Next HMR 清空内存 Map 后，下一轮 `SessionManager.open` 恢复模型上下文。UI Transcript（v1）与 Agent 上下文（v2）分离。

---

### CL-2026-05-27-I — 阶段 6 PM 写需求

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/shared-types` | `ChatMode`、`ChatStreamRequest.chatMode`；`ConversationRecord.chatMode` |
| `packages/context/src/pm-resources.ts` | PM 守则、读 PRD 模板、列 hints 目录 |
| `packages/context/src/build-context.ts`、`format-block.ts` | `chat_mode=prd` 时 JIT 注入 pm_rules / prd_template / business_hints |
| `packages/agent-runtime/src/run-chat.ts` | 透传 `chatMode` |
| `.agent/templates/prd-template.md`、`.agent/hints/*` | PRD 结构与示例业务提示 |
| `apps/web/app/page.tsx` | 探索/写需求切换、导出 Markdown |
| `apps/web/lib/export-prd.ts` | 客户端导出（写需求模式优先最后一条 Agent 回复） |
| `AGENTS.md` | PM 写需求模式说明 |

**行为：** 写需求模式下每轮 prompt 前缀含 PRD 模板与 hints 列表；Agent 仍用只读工具核代码；会话 JSON 持久化 `chatMode`。

---

### CL-2026-05-27-J — PM 助手 M1（双轨 + 需求草稿板 v0.2）

| 影响文件 | 逻辑变化 |
|----------|----------|
| `packages/shared-types/src/requirement-draft.ts` | `RequirementDraftState`、字段/条目类型；SSE `requirement_state` / `agent_actions` |
| `packages/agent-runtime/src/requirement-draft-*.ts` | 内存 store、`update_requirement_draft` Pi 工具、SSE 推送 |
| `packages/agent-runtime/src/run-chat.ts` | 恢复/持久化草稿；注册 draft 工具 |
| `packages/conversation/src/store.ts` | `ConversationRecord.requirementDraft` |
| `packages/context/src/pm-resources.ts` | v0.2 轻量 PM 守则（不再灌整段 PRD 模板） |
| `apps/web/components/RequirementCanvas.tsx` | 右侧只读草稿板：拆条、字段状态、定稿按钮占位 |
| `apps/web/app/page.tsx` | 四栏布局；「需求整理」模式；SSE 同步草稿 |

**行为：** 需求整理模式下 Agent 每轮调用 `update_requirement_draft` 更新右侧 JSON；对话最多 1 个阻断问题；草稿随会话 JSON 持久化；定稿受击面扫描留 M3。

---

### 产品方向 v0.4（2026-05-28，文档先行，代码未对齐）

权威说明：`docs/PM_REQUIREMENT_ASSISTANT.md` v0.4。

| 主题 | 目标 |
|------|------|
| 用户 | 仅 PM；开发阶段少即是多 |
| 清单 | `business` 在上 + 每条下方 `techTraces`；业务格不写技术词 |
| 工具 | 单条 `upsert_requirement` 全量替换；每轮清单快照 |
| 锚点 | P1：menu-map.json + 点选菜单 |
| 导出 | P2：清单生成 Markdown（非 transcript）；结构与右侧一致 |
| 不做 | 评价模块、八章定稿、前后端拆两条 |

**下一刀实现：** 类型与 store/tool/UI 对齐 v0.4（见 PM 文档 §6）。

---

## 12. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-05-21 | 初版；阶段 0～4 + 进度日志 + Backlog |
| v1.3 | 2026-05-27 | §8 阶段 5 对话记录方案 R003 |
