# letsTalk Agent OS — 设计说明（v2）

| 项目 | 内容 |
|------|------|
| 版本 | v2.3 |
| 日期 | 2026-05-21 |
| 状态 | **当前有效** |
| Agent 内核 | `@earendil-works/pi-coding-agent`（`createAgentSession`）· 循环由 **pi-agent-core** 提供 |

---

## 1. 核心理念

### 1.1 我们放弃了什么

| 旧版思路 | 问题 |
|----------|------|
| **页面 Skill 懒编译** | 预生成大 JSON、stale/hash 状态机、编译失败即全链路不可用 |
| **跨语言微服务**（Python compiler） | 双栈、双部署、契约漂移、调试成本高 |
| **固定分析流水线** | 产品像「菜单 + 批处理」，不像智能体 |
| **巨型静态上下文** | 一次塞进 50 个文件 → 模型**变瞎**、抓不住当前问题 |

### 1.2 我们坚持什么

| 新版原则 | 含义 |
|----------|------|
| **JIT（Just-In-Time）按需上下文注入** | 每一轮只注入**当前问题所需**的锚点、记忆片段、架构规则；其余靠工具现场读取 |
| **Agent-Driven 动态探索** | 没有「先编译再对话」；Agent 用 `read` / `grep` / `find` 自己找证据，再回答 |
| **单进程 Node.js + TypeScript** | Next.js 一个进程：UI + API + Pi Session；**消灭**跨服务状态机 |
| **Pi 为绝对中心** | 不自研 while-loop；业务只写 Context 组装、Memory、SSE |

```text
         旧：Compile → Cache → Chat（模型吃缓存摘要，容易与代码脱节）
         新：Chat → JIT 破冰（锚点头 + AGENTS.md）→ Agent 自主 grep/find/read 迭代 → 可选 save_memory
```

**JIT 与 Agent 搜索的分工：**

| 机制 | 谁做 | 做什么 |
|------|------|--------|
| **JIT** | server（每轮 prompt 前） | 锚点、`anchor_preview`、AGENTS.md、可选一句「记忆目录在哪」 |
| **自主搜索** | **模型 + Pi 工具循环** | 自选关键词 `grep`、换词重试、`find`  glob、再 `read` — **与 Claude Code 同范式** |
| **Memory 召回** | **Agent**（M2 起） | `grep` 搜 `.agent/memory/` 或 `read_memory`；不靠 server 预灌 `memory_hints` |

### 1.3 为什么「单进程」很重要

- **状态机爆炸**：旧方案至少有 `idle → compiling → stale → hit/miss` × `session` × `page`；JIT 方案只有 `turn` + `tool_running`（由 Pi 管理）。
- **避免变瞎**：上下文预算留给 **锚点 + 3～5 条记忆提示 + 用户问题**；文件正文通过工具**按需**进入对话，而不是预灌一整份 Skill。
- **部门内本地 Node**：一个 `pnpm start`，无 sidecar；见 §12。

### 1.4 已确认的产品决策（2026-05-21）

| # | 决策 | 说明 |
|---|------|------|
| 1 | **M1 做 Anchor UI** | 用户可在页面上选择/切换锚点，不只靠 API 传参 |
| 2 | **记忆跟着项目走** | 路径固定为 `{WORKSPACE_ROOT}/.agent/memory/`；**按用户存储**为远期（M4+），当前不设计 |
| 3 | **搜索：Agent 自主 grep/find** | 与 Claude Code / Pi 默认一致；**不在 server 替模型做 memory rg**（§5.2、§6.3） |
| 4 | **Anchor 送文件头** | 现网：JIT 注入 `anchor_preview_content`（前 150 行）。**演进：** 见 [CONTEXT_MANAGEMENT_V1.md](./CONTEXT_MANAGEMENT_V1.md)（State Pointer + `get_anchor_preview` Pull，待评审） |
| 5 | **Java 用 AST 工具** | `list_methods` / `read_method` 为 **M1.5** 必做，非 M3 选修（§6.1） |
| 6 | **HMR 会话兜底** | 开发态序列化到 `.agent/.cache/sessions.json`（§12.1） |
| 7 | **先文档后代码** | 未通知前不开工 scaffold |
| 8 | **Pi 默认优先** | 前期最大限度用 Pi 开箱配置；仅在实际踩坑后再改（§1.5） |

### 1.5 Pi 默认优先，遇痛再调（工程策略）

**原则：** 前期不预优化。letsTalk 壳层只做「接上线」；Pi 已经验证过的行为，不要 duplicate。

| 先用 Pi 默认 | 何时再改 |
|--------------|----------|
| `tools: ["read","grep","find","ls"]` | 需要禁某工具、或加 M1.5/M2 Extension 时 |
| `DefaultResourceLoader` + 自动加载 `AGENTS.md` | 需要更强业务 prompt 时再 `systemPromptOverride` |
| `SessionManager.create(cwd)` 落盘 | HMR 仍丢会话时再加强 §12.1 缓存 |
| `read` 默认截断（2000 行/50KB） | Vue 破冰仍慢时，再收窄 limit 或靠 `anchor_preview` |
| Agent 自主 grep 循环（无 server 预搜） | 验收证明多轮仍慢/仍失忆时，再考虑 memory 向量索引等 |
| `thinkingLevel` / compaction / retry 用 settings 默认 | 有明确成本或质量问题时再调 |

**自定义清单（预期会动的，但不提前做）：**

1. **M1 必做且 Pi 无：** `anchor_preview` JIT、Anchor UI、SSE 桥  
2. **M1.5 必做且 Pi 无：** Java `list_methods` / `read_method`  
3. **M2 必做且 Pi 无：** `save_memory` / `read_memory` Extension  

其余（抽词 rg、自写 harness、改 system prompt 结构、换 `pi-agent-core` 手写 loop）——**等遇到问题再开 ADR**。

---

## 2. 系统总览（同心圆）

**中心是 Pi Agent Loop**（`pi-coding-agent` 暴露 `createAgentSession`，底层循环在 `pi-agent-core`）。

```text
                    ┌─────────────────────────────────────┐
                    │  Workspace · 真实前后端代码库          │
                    │  + Memory · .agent/memory/*.md       │
                    └──────────────────┬──────────────────┘
                                       │ read / grep / find / ls
                    ┌──────────────────▼──────────────────┐
                    │  Tools（Harness）                     │
                    │  · 路径沙箱 · rg · 行数上限            │
                    │  · M2+: read_memory / save_memory     │
                    └──────────────────┬──────────────────┘
                                       │ tool results
                    ┌──────────────────▼──────────────────┐
                    │  Agent Loop（pi-agent-core）          │
                    │  LLM ↔ tool_calls ↔ 追加 messages    │
                    └──────────────────┬──────────────────┘
                                       │ subscribe
                    ┌──────────────────▼──────────────────┐
                    │  letsTalk 壳层（Next.js 单进程）       │
                    │  JIT 组装 AgentContext → prompt 前缀   │
                    │  SSE → Transcript UI                  │
                    └─────────────────────────────────────┘
```

**没有** compiler-py、没有 `.agent/skills/` 批处理产物（M0–M2）。

| 圈 | 职责 | 实现落点 |
|----|------|----------|
| **Loop** | 多轮推理与工具调度 | `session.prompt()` + Pi 内置循环 |
| **Tools** | 触达代码与记忆 | Pi 内置只读工具 + Extension 记忆工具 |
| **Workspace + Memory** | 真相来源与跨轮沉淀 | 用户 git 仓库 + `.agent/memory/` |

---

## 3. 端到端数据流（一轮对话）

```text
用户消息 + UI 可选 anchor
        │
        ▼
┌───────────────────┐
│ buildAgentContext │  ← JIT：读 AGENTS.md 摘要、检索 memory、拼 arch_rules
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ formatPromptPrefix│  ← 注入到本轮 user 消息前（或 system 增补）
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ session.prompt()  │  ← Pi Loop 开始
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
 LLM 回复    tool_calls → Harness → Workspace / Memory
    │           │
    └─────┬─────┘
          ▼
    turn_end → SSE → UI
          │
          ▼（可选，M2+）
    Agent 调用 save_memory → 写入 .agent/memory/{slug}.md
```

---

## 4. AgentContext（核心契约）

**AgentContext** 是「发给模型的破冰上下文」的结构化快照，**不是**全库索引，也**不是**预编译 Skill。  
由 server 在**每一轮 `prompt` 之前** JIT 组装。

### 4.1 TypeScript 定义

```typescript
/** 发给 LLM 的 JIT 上下文（JSON 序列化后嵌入 prompt 前缀） */
interface AgentContext {
  /** 协议版本，便于以后演进 */
  version: "1";

  /** 工作区根（绝对路径，仅 server 使用；给模型用相对路径即可） */
  workspace_root: string;

  /**
   * 锚点：用户/UI 选中的关注对象，帮模型「破冰」
   * - 可以是某个 .vue、某个 Controller、或路由 path
   * - null = 全库模式，不暗示单页
   */
  anchor: AgentAnchor | null;

  /**
   * 架构/部门规则：来自 workspace 根 AGENTS.md（Pi DefaultResourceLoader 也会加载，此处可摘要重复）
   * 控制长度，建议 ≤ 1500 字
   */
  arch_rules: string;

  /** 本轮模式 */
  mode: "explore" | "focused";

  /**
   * JIT 阶段截取的 Anchor 文件头（通常前 150 行）。
   * 减少首轮 read 往返；完整细节仍由 Agent 自主 grep/read/read_method。
   */
  anchor_preview_content?: string;

  /**
   * 可选：记忆目录提示（一行），引导 Agent 用 grep 搜索，而非 server 预搜结果。
   * 例：「跨会话业务笔记见 .agent/memory/*.md，请用 grep 检索」
   */
  memory_directory_hint?: string;

  /**
   * @deprecated v2.3 起不再由 server 预填；保留字段仅供调试/未来可选「建议关键词」
   */
  memory_hints?: MemoryHint[];
}

interface AgentAnchor {
  kind: "vue" | "java" | "route" | "file";
  /** 相对 workspace_root 的路径，或路由 path */
  ref: string;
  /** UI 展示用，如「报销明细页」 */
  label?: string;
}

interface MemoryHint {
  topic: string;       // 对应 memory 文件 slug
  excerpt: string;     // 摘录正文
  confidence?: "draft" | "verified";
  updated_at?: string; // ISO8601
}
```

### 4.2 注入示例（模型所见）

每轮用户消息前附加一段**可折叠的 XML 风格块**（便于调试，也便于模型解析）：

```xml
<agent_context version="1" mode="focused">
  <anchor kind="vue" ref="src/views/Detail.vue" label="报销明细" />
  <anchor_preview lines="150">
    <!-- 文件前 150 行原文，XML 转义 -->
  </anchor_preview>
  <arch_rules>
    本仓库为 Vue2 + Element UI 前端，Spring Boot 后端。
    回答必须标注【代码 path】；无依据则说明「需进一步 grep」。
  </arch_rules>
  <memory_directory_hint>
    跨会话业务笔记位于 .agent/memory/；若与订单/流程相关，请用 grep 在该目录检索后再结合代码。
  </memory_directory_hint>
</agent_context>
```

### 4.3 组装规则（JIT，非批处理）

| 字段 | 来源 | 策略 |
|------|------|------|
| `anchor` | UI 选中文件/路由，或 API body | 用户显式选择优先；M1 可 null |
| `anchor_preview_content` | `anchor.ref` 指向的现有文件 | **M1 起**：读前 **150 行**（`.vue` / `.ts` / `.java` 等）；超大行宽则截断单列长度 |
| `arch_rules` | `{workspace}/AGENTS.md` | 存在则读；过长则取前 N 字 + 标题目录 |
| `memory_directory_hint` | 固定模板 + M2 起有 memory 文件时注入 | **不**替 Agent 做 rg；只告诉目录与策略 |
| `mode` | `anchor == null` → `explore`；否则 `focused` | focused 时优先看 `anchor_preview`，再自主 tool |

**边界：**

- **允许**注入 Anchor 的**文件头**（≤150 行）— 破冰成本低于浪费一轮 `read`。
- **禁止**注入整文件、禁止注入 2000 行 Java 全量 — 巨石文件走 **M1.5** `list_methods` / `read_method`。

### 4.4 与 Pi 的衔接

```typescript
const ctx = await buildAgentContext({ workspaceRoot, anchor, userMessage });
const prefix = formatAgentContextBlock(ctx);
const userText = `${prefix}\n\n${userMessage}`;

await session.prompt(userText);
```

Pi 的 `messages` 历史仍由 `SessionManager` 管理；**AgentContext 每轮刷新**，不写入长期 history 全文（避免重复膨胀）。

---

## 5. 记忆（Memory）生命周期

记忆取代旧版「页面 Skill + stale hash」。  
**记忆 = Agent 写入的 Markdown 笔记**，供后续轮次经 **Agent grep** 召回（非 server 预灌）。

### 5.1 存储布局

**归属：跟着项目（workspace）走**，与业务仓库同生命周期；提交代码时可将 `.agent/memory` 纳入 git（由团队决定 `.gitignore` 策略）。

```text
{workspaceRoot}/.agent/
  config.json          # 可选：frontendRoot, backendRoot
  memory/
    reimbursement-validation.md
    account-id-flow.md
```

**远期（不在 M0–M3 范围）：** 按 **登录用户** 在应用侧存记忆（如 `~/.letsTalk/users/{id}/` 或多租户 DB）。届时 JIT 需合并「项目记忆 + 用户私有记忆」；当前文档**不展开**，避免过度设计。

**单文件格式：**

```markdown
---
topic: reimbursement-validation
confidence: verified
tags: [Detail.vue, 报销, 校验]
updated_at: 2026-05-20T10:00:00Z
sources:
  - src/views/Detail.vue
  - src/main/java/.../DetailController.java
---

提交报销时前端校验金额大于 0；后端 save 接口检查状态必须为草稿。
```

### 5.2 读取（Read path）

| 阶段 | 谁 | 做什么 |
|------|-----|--------|
| **JIT** | server | 仅 `memory_directory_hint`（§5.2.1）；**不**预搜正文 |
| **Agent 探索** | Pi `grep` / `find` | 自选关键词、路径、glob；可多轮换词（Claude Code 范式） |
| **精读** | Pi `read` 或 `read_memory`（M2） | grep 命中后再读全文 |

**原则：** Memory 召回 = **Agent 自主搜索**；server 不替代模型做 `searchMemoryHints(rg)`。

#### 5.2.1 Memory 召回：Agent 自主搜索（对齐 Claude Code / Pi）

##### Ripgrep 陷阱与正确解法

`rg` 不懂语义。「医保结算」对不上「医疗保险费用计算」时，**单次 server 侧 rg 仍会失忆**。

**Claude Code / Pi 的解法（本项目采用）：**

```text
用户提问
    → 模型自选 grep 关键词（如 order、状态、医保、insurance）
    → grep(path=.agent/memory 或全库, glob=*.md)
    → 评估结果；不理想则换词、换 path、或 find 后再 grep
    → read / read_memory → 回答
```

模型在 **Pi Agent Loop** 里多轮尝试，比 server 单次 rg 更能覆盖同义词，且**无需额外 LLM Router**。

##### letsTalk 分工

| 层 | 行为 |
|----|------|
| **JIT** | `memory_directory_hint` 一行；**不**填充 `memory_hints` 正文 |
| **AGENTS.md** | 写明：跨会话结论在 `.agent/memory/`，请先 grep 再 read |
| **M2** | `read_memory` / `save_memory`；软过期见 §5.4 |

##### 何时才需要 server「LLM 抽词 → rg」

仅当产品强制 **Turn 1 零 tool** 且必须展示「已命中记忆」时；当前验收 **允许** Transcript 展示 grep tool（与 Claude Code 一致）。

##### v2.2 已废弃

`extractSearchTokens()`、`searchMemoryHints()` 不再作为 M2 必做项。

### 5.3 写入（Write path）

| 阶段 | 谁 | 做什么 |
|------|-----|--------|
| **Agent 决策** | LLM | 仅在有**充分代码证据**且用户问题涉及**跨文件/跨会话**规则时写入 |
| **执行** | Pi tool `save_memory`（M2） | 参数 `topic`, `content`, `confidence`, `tags?`, `sources?` |
| **落盘** | server | 校验路径在 `.agent/memory/`；合并或覆盖由 `topic` slug 决定 |
| **禁止** | — | M1 不自动写；M0 无 memory 工具，仅手工维护 md 测 JIT |

**与代码冲突时：** 以 **Workspace 代码为准**；记忆标 `confidence: draft` 或提示用户重新探索。

### 5.4 更新 / 失效（无 stale hash）

| 旧 Skill | 新 Memory |
|----------|-----------|
| 文件 hash 变 → `stale` → 强制重编译 | **不**自动失效；`sources` 仅供 Agent 判断 |
| 全量 map.json 重写 | Agent 可 `save_memory` **追加段落**或覆盖 topic |
| 用户「刷新地图」按钮 | 改为「请重新 grep 并更新记忆」的对话指令 |

**M2：** `sources` 对应文件 mtime/hash 变化时，`read_memory` 返回正文并附 `⚠ 可能过期`，**不阻断**对话。

### 5.5 System Prompt 中的记忆守则

```text
- 跨页面、跨会话的业务规则 → save_memory（verified 需有代码引用）
- 单次即可回答的问题 → 不写入记忆
- 读取顺序：grep .agent/memory → read_memory → grep/read 业务代码
- 禁止编造：memory 与代码冲突时，以代码为准并说明记忆可能过期
```

---

## 6. 技术栈与 Pi 接入

| 层次 | 选择 |
|------|------|
| 全栈 | Next.js App Router，`runtime = "nodejs"` |
| Agent | `createAgentSession` from `@earendil-works/pi-coding-agent` |
| 模型 | `@earendil-works/pi-ai` + `AuthStorage` / `ModelRegistry` |
| 部署 | 本地单进程 `pnpm dev` / `pnpm start` |

### 6.1 工具分层（M0 → M2）

| 阶段 | 工具 | 说明 |
|------|------|------|
| **M0** | **无**（`tools: []` 或 `noTools: "all"`） | 仅对话 + SSE + Session |
| **M1** | Pi 只读四件套 | `read`, `grep`, `find`, `ls` — 见 §6.3 |
| **M1.5** | `list_methods`, `read_method` | Tree-sitter Java；巨石类必备 |
| **M2** | `read_memory`, `save_memory` | Agent 用 grep 探索 memory；非 server 预搜 |

**M1.5 工具契约（概要）：**

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_methods` | `filePath` | 类名 + 方法签名列表（无方法体） |
| `read_method` | `filePath`, `methodName` | 单个方法完整代码块（含 `{}` 平衡） |

实现：`@tree-sitter/java`（及 `tree-sitter` node binding）；封装于 `packages/ast-tools`，经 Pi Extension 注册。

**不开放：** `bash`, `edit`（M0–M2）。

> **第一性原理：** 对 1000～3000 行 Java，原生 `read` 必截断 → 大括号失衡 → 模型「精神分裂」。AST 方法级读取是 B 端仓库的**雷达**，不是选修课。

### 6.2 Session

- `createAgentSession` + `Map<sessionId, AgentSession>`
- **优先** `SessionManager.create(cwd)`（Pi 自带落盘，`~/.pi/agent/sessions/...`），减轻 HMR 丢上下文；§12.1 作补充
- 换 `workspaceRoot` → 新 `sessionId` 或 `dispose` 后重建
- 多 cwd 频繁切换 → `CreateAgentSessionRuntimeFactory`（`13-session-runtime.ts`）

### 6.3 Pi 默认能力（实现时少造轮子）

阅读 `learn/pi/packages/coding-agent` 后的**推荐集成方式**：

```typescript
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.env.WORKSPACE_ROOT!;

const { session } = await createAgentSession({
  cwd,
  tools: ["read", "grep", "find", "ls"],  // 与 examples/sdk/05-tools.ts 一致
  sessionManager: SessionManager.create(cwd), // 非 inMemory，便于持久化
  settingsManager: SettingsManager.inMemory(),
  resourceLoader: new DefaultResourceLoader({
    cwd,
    systemPromptOverride: (base) => `${base}\n\n你是 Vue + Spring Boot 业务助手…`,
    // AGENTS.md 会自动进 project_context
  }),
});
```

**Pi 已内置、应直接用的行为：**

| 能力 | 源码落点 | 说明 |
|------|----------|------|
| **自主 grep 循环** | `pi-agent-core` `Agent` + `session.prompt()` | 模型自选 `pattern`、`path`、`glob`、`ignoreCase`；失败可换词重试 |
| **grep** | `core/tools/grep.ts` | 底层 ripgrep；`limit` 默认 100；支持 `glob: "*.java"` |
| **find（= Glob）** | `core/tools/find.ts` | `pattern: "**/*.vue"` 等 |
| **read 截断** | `core/tools/truncate.ts` | 默认 max **2000 行 / 50KB**；B 端可在包装层改为 150 行 |
| **AGENTS.md** | `DefaultResourceLoader` | 自动注入 `<project_context>` |
| **探索准则** | `core/system-prompt.ts` | 有 grep/find 时：**Prefer grep/find/ls over bash** |
| **只读工具集** | `createReadOnlyTools()` | 与 `tools: ["read","grep","find","ls"]` 等价 |

**letsTalk 只需额外做：**

1. Next SSE 桥接 `session.subscribe`  
2. JIT：`anchor_preview` + `memory_directory_hint`（不替代 grep）  
3. M1.5 AST 扩展工具（Pi 未提供 Java 方法级读取）  
4. M2 `save_memory` / `read_memory` Extension  
5. 业务 `AGENTS.md` 写明 memory 目录与 Vue/Spring 约定  

**不要重复实现：** server 侧 `searchMemoryHints`、自写 grep 子进程（除非要统一审计日志）。

---

## 7. 仓库结构

```text
letsTalk/
├── app/
│   ├── page.tsx
│   └── api/agent/chat/stream/route.ts
├── packages/
│   ├── shared-types/       # AgentContext, SseEvent
│   ├── agent-runtime/      # Session 池、Pi 桥、buildAgentContext
│   ├── context/            # formatAgentContextBlock, AGENTS.md 读取
│   ├── memory/             # save_memory、read_memory、front matter
│   ├── ast-tools/          # M1.5：tree-sitter list_methods / read_method
│   ├── session-cache/      # HMR 兜底序列化
│   └── workspace/          # WORKSPACE_ROOT 校验
├── .pi-agent/models.json.example
└── docs/AGENT_OS_DESIGN.md
```

用户仓库内：

```text
{WORKSPACE_ROOT}/
  AGENTS.md
  .agent/memory/*.md
  src/...
```

---

## 8. HTTP / SSE（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workspace/anchors` | 供 Anchor UI：列出可选锚点（如 `src/views/**/*.vue`） |
| GET | `/api/workspace` | 当前绑定的 `workspaceRoot` |
| POST | `/api/agent/chat/stream` | SSE 对话 |

`POST /api/agent/chat/stream`

```json
{
  "sessionId": "uuid",
  "message": "用户输入",
  "workspaceRoot": "/optional",
  "anchor": { "kind": "vue", "ref": "src/views/Detail.vue", "label": "报销明细" }
}
```

| SSE type | 说明 |
|----------|------|
| `session` | sessionId, cwd, model |
| `context` | JIT 摘要：`anchor_preview` 行数、是否注入 `memory_directory_hint`（调试） |
| `assistant_delta` | 正文流 |
| `tool_start` / `tool_output` | 工具可见 |
| `turn_end` | 本轮结束 |
| `error` | 错误 |

---

## 9. Web UI

### 9.1 布局（M1 目标）

```text
┌──────────────┬──────────────────────────────────────────────┐
│  Anchor 栏    │  Transcript                                   │
│              │  · You / Assistant                            │
│  ○ 全库模式   │  · [tool] read / grep …（可折叠）              │
│              │  · （调试）本轮 JIT / context 摘要  │
│  锚点列表     ├──────────────────────────────────────────────┤
│  · Detail.vue│  [ 输入框 ]                          [发送]     │
│  · List.vue  ├──────────────────────────────────────────────┤
│  [刷新列表]   │  工作区: /path/to/repo                        │
└──────────────┴──────────────────────────────────────────────┘
```

### 9.2 Anchor UI（M1 必做）

| 能力 | 说明 |
|------|------|
| **全库模式** | 显式选项；`anchor = null`，`mode = explore` |
| **锚点列表** | `GET /api/workspace/files` 或 `/api/anchors`：列出 workspace 内常见前端页（如 `**/*.vue`  under `src/views`，可配置 glob） |
| **选中态** | 点击一项 → 高亮；请求体带 `anchor: { kind, ref, label }` |
| **手动输入** | 兜底：输入相对路径 → 校验存在后设为 anchor |
| **持久化** | `sessionStorage` 记住当前 anchor + workspace，刷新页面可恢复 |

**M1 不做：** 完整 vue-router 语义树（M3+）。Java 类浏览由 **M1.5** `list_methods` 在对话中完成，不做重型侧边栏。

### 9.3 与 JIT 的联动

- 发送消息前：UI 展示「当前锚点：Detail.vue」或「全库模式」；
- SSE `context`（可选）：展示是否带 `anchor_preview`；
- Memory 是否命中：**看 Transcript 里 Agent 的 grep tool**（与 Claude Code 一致）；
- M2：增加「记忆」侧栏只读列表（`.agent/memory` 文件名），不编辑。

---

## 10. 里程碑（工程第一性原理版）

> 每阶段 **绝对可测、有硬核交付物**；不一口气吃成胖子。

### 🔴 M0 — 骨架与引擎（The Walking Skeleton）· 约 3 天

**目标：** 不带业务智能，只证明架构连通。

| 任务 | 说明 |
|------|------|
| Next.js App Router | `runtime = "nodejs"` |
| `createAgentSession` | 建立 Session；**§12.1 磁盘缓存** 防 HMR 丢会话 |
| SSE | `POST /api/agent/chat/stream` |
| UI | TUI 风格 Transcript + 输入框 |

**配置：** **禁用全部 Tool**（或空工具列表）；仅注入 `arch_rules`。

**硬核验收：**

1. Agent 能回答「你好」，SSE 流式无卡顿  
2. 改一行前端代码触发 HMR 后，**同一 `sessionId` 多轮上下文仍在**  
3. 不出现 tool 块（因未启用工具）

---

### 🟡 M1 — 感知与破冰（JIT & Anchor）· 约 1 周

**目标：** 系统「看见」当前选中文件；简单问题 **Turn 1 秒答**。

| 任务 | 说明 |
|------|------|
| Anchor UI | §9.2；`GET /api/workspace/anchors` |
| JIT | `arch_rules` + `anchor` + **`anchor_preview_content`（前 150 行）** |
| Tools | `ls`, `grep`, `read`（**强制** startLine/limit） |
| Memory | **不启用** `searchMemoryHints`（`memory_hints: []`） |

**硬核验收：**

1. 选中 `Login.vue`，问「表单有哪些字段？」→ **Turn 1 直接回答**，且 **无** `read` tool 调用（因 150 行已注入）  
2. 全库模式：无 anchor preview；复杂问题允许 grep/read，UI 可见 tool 块  
3. HMR 后会话仍恢复  

---

### 🟢 M1.5 — AST 与精准切除（Surgical Tools）· 约 1 周

**目标：** 巨石 Java **读得懂、读得全**。

| 任务 | 说明 |
|------|------|
| Tree-sitter | `@tree-sitter/java`（+ node binding） |
| `list_methods` | 类名 + 方法签名列表 |
| `read_method` | 单方法完整代码块 |

**硬核验收：**

面对 ~2000 行 `OrderController.java`，问「全量查询接口在哪？逻辑是什么？」  

**行为轨迹必须是：**

`list_methods` → 发现 `queryAll` → `read_method(..., "queryAll")` → 准确回答  

（禁止仅靠 `read` 整文件）

---

### 🔵 M2 — 记忆闭环与抗腐败（Memory Lifecycle）· 约 1～1.5 周

**目标：** 越用越聪明；记忆通过 **Agent 自主 grep** 召回。

| 任务 | 说明 |
|------|------|
| `save_memory` / `read_memory` | Extension 写入/读取 `.agent/memory/` |
| JIT | `memory_directory_hint` |
| 软过期 | `sources` mtime 变化 → `read_memory` 返回警告 |
| Prompt | AGENTS.md 约定 grep memory 流程 |

**硬核验收：**

已有 `order-state-machine.md`。用户问「订单流程怎么流转？」→ Transcript 出现 **grep `.agent/memory`**（可换词）→ 再 read → 结合代码准确作答。

---

### ⚪ M3+ — 按需

- vue-router 树、Anchor 增强  
- 按用户存储记忆（远期）  
- 只读 diff 计划  
- 可选：向量索引（见 §17，非 M2 必做）

---

## 10.1 实现前检查清单（文档门禁）

- [ ] 本文档 **v2.3** 已读且无未决异议  
- [ ] 本机：`rg`、`node >= 20`  
- [ ] M1.5 前确认 Tree-sitter Java 语法包可用  
- [ ] 你方通知「可以开工 M0」

---

## 11. 安全边界

| 项 | 策略 |
|----|------|
| 读代码 | 仅 `workspaceRoot` 内；Harness 防 `..` |
| 写盘 | M2 起仅 `.agent/memory/**` |
| API Key | 仅 server |
| 网络 | 127.0.0.1 / 内网 |

---

## 12. 本地 Node 部署

单进程 Next = **Loop + Tools + JIT Context + Memory IO** 同址，无 RPC 延迟，无编译微服务。  
生产 `pnpm start`：会话可仅内存；**Memory** 始终在 workspace 磁盘上保留。

### 12.1 开发体验保障（HMR 与 Session）

**问题：** `pnpm dev` 下 Next.js HMR 会重载 server 模块，内存中的 `Map<sessionId, AgentSession>` **每次保存代码即丢失**，多轮调试被逼疯。

**方案（M0 起必做）：**

| 项 | 说明 |
|----|------|
| **路径** | `{workspaceRoot}/.agent/.cache/sessions.json`（或 letsTalk 应用目录下的 `.cache/sessions.json` — 实现时二选一，**推荐跟 workspace** 便于多仓库） |
| **内容** | 可序列化快照：`sessionId`、`cwd`、Pi `messages` 或等价导出、最近 `anchor` |
| **时机** | 每轮 `turn_end` 写入；`prompt` 前若内存无则尝试恢复 |
| **范围** | **仅 development**；`NODE_ENV=production` 可仅内存 |
| **实现量** | 约 **100～150 行**（JSON + 文件锁/simple write） |

**验收：** 连续改 3 次 UI 代码保存，不刷新浏览器，第 4 轮仍能引用第 1 轮用户话。

---

## 13. 与旧版概念对照

| 旧 | 新 |
|----|-----|
| 页面 Skill 懒编译 | JIT AgentContext + Agent 现场 grep/read |
| `map.json` + `summary.md` 批处理 | 可选 Memory topic（Agent 写 md） |
| stale / fingerprint | memory `sources` + 软提示过期 |
| compiler-py | **删除** |
| Workbench 流水线 | Transcript + 工具块 |

---

## 14. 本地开发

```bash
pnpm install
cp .pi-agent/models.json.example .pi-agent/models.json
cp .env.example .env.local

pnpm smoke    # M0
pnpm dev      # http://127.0.0.1:3000
```

---

## 15. 文档关系

| 文档 | 用途 |
|------|------|
| **本文档** | 架构与原则（权威） |
| **[IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md)** | **分阶段任务、验收、进度勾选、需求 Backlog** |
| `PI_SDK_NODE_INTEGRATION.md` | Pi API 片段 |
| `AGENT_OS_TS_PI_DESIGN.md` | 已废弃 |

---

## 17. 附录：业界 Code Agent 如何解决「搜索 / 召回」？

letsTalk 采用 **分层组合**，不迷信单一方案。

| 策略 | 代表产品 / 项目 | 做法 | 优点 | 缺点 |
|------|-----------------|------|------|------|
| **纯 grep/rg** | Pi CLI、早期 Aider、部分 Claude Code 路径 | Agent 循环里多次 `grep` | 零索引、可复现、快 | **语义鸿沟**（医保 vs 医疗保险）；靠多轮 tool 弥补 |
| **LLM 查询扩展 → grep** | 可选；**本项目 M2 不采用** | server 侧抽词再 rg | 适合「零 tool 展示」 | 与 Pi 循环重复 |
| **Agent 多轮 grep（Pi 默认）** | **本项目 M1+**；Claude Code 同类 | 模型自选关键词、换词、path+glob | **零基建**、能处理同义词（多轮） | 多 1～3 轮 tool 延迟；UI 需展示 tool |
| **向量 / Embedding 索引** | Cursor @Codebase、Continue、Cody（部分模式） | 切块 embed，相似度搜索 | 语义召回强 | 要索引管道、增量更新、GPU/费用；小团队重 |
| **混合检索 Hybrid** | Sourcegraph Cody、企业 RAG | BM25 + 向量 + 重排 | 工业级准确 | 复杂度高，M3+ 才考虑 |
| **Repo Map / 符号图** | Aider `--map`、IDE LSP | 预生成文件/符号摘要，不搜全文 | 帮模型定位文件 | 仍要配合 read；不是记忆系统 |
| **AST / 结构导航** | 本项目的 **M1.5**；部分 IDE Agent | `list_methods` / LSP `goToDefinition` | 解决**巨石文件**，不是搜 synonym | 需语法树；语言要逐个接 |
| **Agent 多轮自救** | 几乎所有 Agent | 第一次 grep 失败，换词再 grep | 无额外系统 | 慢、费 Token、用户看到「发呆」 |
| **预编译 Skill / 文档** | 旧版 letsTalk、Devin 类 | 离线生成大摘要 | 首轮快 | 状态机 + stale；易与代码脱节（已废弃） |

**对我们的启示：**

1. **Memory 召回**：与 Claude Code 一致 — **交给 Agent grep**；server 只给目录 hint。  
2. **代码探索**：B 端 Java **必须** M1.5 AST；Pi 的 `read` 截断无法替代方法级读取。  
3. **破冰**：`anchor_preview_content` 仍保留（JIT）；与 Cursor「当前文件上下文」同类。  
4. **M3+ 若 memory 很多且多轮 grep 仍慢**：再考虑 **仅对 `.agent/memory` 建向量索引**（可选），不替代 Agent grep。

---

## 18. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-05-21 | Next + Pi；对话 + 工具 |
| v2.0 | 2026-05-21 | JIT Context、同心圆架构、Memory 生命周期 |
| v2.1 | 2026-05-21 | Anchor UI；记忆跟项目；rg 检索 |
| v2.2 | 2026-05-21 | 架构评审：anchor_preview、LLM→rg、M1.5 AST、HMR session、里程碑重写 |
| v2.3 | 2026-05-21 | 对齐 Pi/Claude Code：Memory 由 Agent 自主 grep；§6.3 Pi 能力清单；废弃 server searchMemoryHints |
| v2.3.1 | 2026-05-21 | §1.5 Pi 默认优先、遇痛再调 |
