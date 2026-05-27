# Agent OS 设计报告（TypeScript + Pi）

> **已废弃（2026-05-21）**  
> 本文档含 Python compiler、页面 Skill、双 app 拆分等已放弃的方案。  
> **请以 [AGENT_OS_DESIGN.md](./AGENT_OS_DESIGN.md) 为准。**

| 项目 | 内容 |
|------|------|
| 版本 | v0.1 |
| 日期 | 2026-05-26 |
| 状态 | ~~草案~~ **废弃** |
| 参考 | [Pi](https://github.com/earendil-works/pi/tree/main)、[Pi 文档](https://pi.dev) |

---

## 1. 背景与目标

### 1.1 问题陈述

面向 **Vue + Spring Boot** 的 B 端业务系统，非开发人员需要理解「页面做了什么、调了哪些接口、字段与流程含义」，并在对话中持续追问。上一版以 **Workbench 菜单 + 固定分析流水线** 为主，能产出类似 Skill 的页面地图与说明书，但：

- 产品入口是功能菜单，不是智能体；
- Python 栈与 Pi 生态脱节，难以直接复用成熟的 Agent 内核；
- LangGraph / 多 Agent 编排对「透明循环 + 领域工具」而言过重。

### 1.2 新目标（第一性原理）

| 层次 | 目标 |
|------|------|
| **运行态** | 可对话、可流式展示工具执行的 **Code Agent**（读代码为主，写代码后置） |
| **知识态** | **懒编译** 的页面 Skill（无则 `compile`，有则 `read`） |
| **交互态** | Web：**左侧路由树** + **TUI 风格 transcript**（工具块可折叠） |
| **技术态** | **TypeScript 全栈** + **Pi npm 包** 作 Agent 内核；旧 Python 编译能力短期保留为微服务 |

### 1.3 非目标（M1 不做）

- 不复刻 Hermes 全功能（网关、多 IM、40+ 默认工具）
- M1 不做在线改码 apply / 沙箱写文件（可预留接口）
- M1 不用 LangChain / LlamaIndex 作为 Agent 主循环
- M1 不把旧 Workbench 当默认入口

---

## 2. 架构决策（ADR 摘要）

| ID | 决策 | 理由 |
|----|------|------|
| ADR-01 | Agent 内核使用 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` | 与 Pi 同栈、循环透明、MIT |
| ADR-02 | 全栈 TypeScript monorepo | 与 Pi 依赖一致；Web/Server/Tools 类型共享 |
| ADR-03 | 页面 Skill 懒编译 | 首屏即聊；仅在被问到某页时付编译成本 |
| ADR-04 | Python `ai-core` 作 **Compiler 微服务**（过渡） | 避免重写 Java/Vue 解析；HTTP 隔离 |
| ADR-05 | Web TUI 为 **自绘事件流**，不嵌 Pi 终端 PTY | 产品需左路由 + 业务文案；Pi TUI 仅作本地调试参考 |
| ADR-06 | 旧代码整体迁入 `legacy/` | 新主线干净；编译器可随时查阅 |

---

## 3. 系统总览

```text
┌─────────────────────────────────────────────────────────────────┐
│  apps/agent-web          Vite + React/Vue · 左侧路由 + Transcript │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS · SSE
┌───────────────────────────────▼─────────────────────────────────┐
│  apps/agent-server       Node (Hono/Fastify)                       │
│  · Session / currentPage                                          │
│  · Pi Agent 循环（pi-agent-core）                                  │
│  · 注册领域 Tools                                                  │
└───────────────┬─────────────────────────────┬─────────────────────┘
                │                             │
┌───────────────▼──────────────┐   ┌──────────▼──────────────────────┐
│  packages/*                  │   │  services/compiler-py (legacy)   │
│  tools · skill-store ·       │   │  FastAPI · 复用 legacy/ai-core   │
│  harness · router-discovery  │   │  POST /compile/page              │
└───────────────┬──────────────┘   └──────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  Workspace（用户绑定的前后端仓库）                                   │
│  · frontend/  vue-router · views                                  │
│  · backend/   Spring Boot                                         │
│  · .agent/skills/{pageKey}/  编译产物                              │
│  · .agent/memory/*.md        跨页业务笔记                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Monorepo 目录结构（目标态）

```text
letsTalk/
├── apps/
│   ├── agent-web/                 # 产品 UI
│   └── agent-server/              # HTTP + SSE + Pi Agent
├── packages/
│   ├── agent-tools/               # 全部自定义 tool 实现
│   ├── skill-store/               # read/write/list page skills
│   ├── harness/                   # 路径安全、rg、read_file
│   ├── router-discovery/          # 解析 vue-router → 树
│   ├── shared-types/              # SSE 事件、API DTO
│   └── agent-prompts/             # system prompt 模板
├── services/
│   └── compiler-py/               # 薄 HTTP 封装 legacy ai-core
├── docs/
│   └── AGENT_OS_TS_PI_DESIGN.md   # 本文档
├── legacy/                        # 旧 Python 实现（只读参考）
├── package.json                   # npm workspaces
├── pnpm-workspace.yaml
└── README.md
```

---

## 5. Pi 依赖使用方式

### 5.1 官方包职责

| npm 包 | 用途 | 本项目 |
|--------|------|--------|
| `@earendil-works/pi-ai` | 多 Provider LLM 调用 | DeepSeek / OpenAI 兼容 |
| `@earendil-works/pi-agent-core` | Agent 循环、tool calling、状态 | **核心运行时** |
| `@earendil-works/pi-coding-agent` | CLI REPL | **本地调试**，非生产 Web |
| `@earendil-works/pi-tui` | 终端 TUI | 可选；参考事件粒度，Web 自绘 |

文档与源码：[github.com/earendil-works/pi](https://github.com/earendil-works/pi/tree/main)

### 5.2 集成原则

1. **不 fork Pi 整仓**；通过 npm 依赖 + 锁版本。
2. **领域逻辑只出现在自定义 tools**（`packages/agent-tools`）。
3. **Harness 由 server 启动时注入** `AgentContext`（见 §7）。
4. 升级 Pi 前跑：Agent 集成测试 + 工具契约测试。

### 5.3 建议 `package.json` 依赖（agent-server）

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.x.x",
    "@earendil-works/pi-ai": "0.x.x"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "0.x.x"
  }
}
```

> 具体版本在 scaffold 时以 npm registry 最新稳定版为准并 **pin exact**。

---

## 6. Agent 循环与 Harness

### 6.1 循环（与 Pi 一致）

```text
messages = [system, ...history, user]
loop:
  response = llm.chat(messages, tools=schemas)
  append assistant_message
  if no tool_calls:
    emit turn_end; return
  for each tool_call:
    emit tool_start
    result = tools.execute(name, args, ctx)
    emit tool_output
    append { role: "tool", tool_call_id, content: JSON(result) }
  continue loop
```

实现落在 `apps/agent-server`，底层调用 `pi-agent-core` 公开 API（以 Pi 文档为准封装一层 `AgentRunner` 适配器，便于单测 mock）。

### 6.2 AgentContext（外部环境 / Harness）

每次会话绑定：

```typescript
interface AgentContext {
  sessionId: string;
  workspaceRoot: string;       //  monorepo 或客户项目根
  frontendRoot: string;
  backendRoot: string;
  currentPage: PageRef | null; // 左侧选中；可为空
  skillRoot: string;           // 默认 {workspaceRoot}/.agent/skills
  memoryRoot: string;          // 默认 {workspaceRoot}/.agent/memory
  compilerBaseUrl: string;     // Python 编译服务
}
```

```typescript
interface PageRef {
  pageKey: string;             // 稳定 ID，如 Detail-eb11d4
  routePath: string;           // /finance/detail
  vuePath: string;             // src/views/Detail.vue
  label: string;
}
```

**规则：**

- `currentPage != null` 且问题与「本页」相关 → 先 `read_page_skill`。
- `currentPage == null` → 仅 `search_code_regex` / `read_code_file`；**禁止**自动 `compile_page_skill`，除非用户点名页面。

---

## 7. 页面 Skill 系统

### 7.1 目录布局

```text
.agent/
  config.json
  skills/
    {pageKey}/
      manifest.json
      map.json
      summary.md
  memory/
    {topic-slug}.md
```

### 7.2 manifest.json

```json
{
  "pageKey": "Detail-eb11d4",
  "vuePath": "src/views/Detail.vue",
  "routePath": "/account/detail",
  "sourceFingerprint": "sha256:...",
  "compiledAt": "2026-05-26T10:00:00Z",
  "compilerVersion": "legacy-ai-core@0.1.0",
  "status": "fresh | stale"
}
```

**stale 判定：** 对比 `vuePath` 及 map 中引用的后端文件 hash；M1 可简化为仅 vue + 主 Controller 文件。

### 7.3 map.json（机器读）

复用 legacy `page-lineage` / `page-analysis` 输出结构，最小字段：

```json
{
  "apis": [
    {
      "method": "GET",
      "path": "/api/account/{id}",
      "frontendTrigger": "created",
      "controller": "AccountController.getById",
      "complexity": 12
    }
  ],
  "formFields": [],
  "controllers": []
}
```

### 7.4 summary.md（人 + LLM 读）

200–800 字业务摘要：页面用途、主流程、关键校验、易混点。

### 7.5 懒编译流程

```text
read_page_skill(pageKey)
  → hit & fresh     → 返回 summary + map excerpt
  → miss            → compile_page_skill → 再 read
  → stale           → M1 自动 compile（force 可选）
```

---

## 8. 自定义 Tools 规范

所有 tool 在 `packages/agent-tools` 实现，向 Pi 注册 OpenAI function schema。

### 8.1 Skill / 编译

#### `read_page_skill`

| 项 | 内容 |
|----|------|
| 参数 | `pageKey?: string`（默认 `ctx.currentPage.pageKey`） |
| 返回 | `{ status: "hit"\|"miss"\|"stale", summaryMd?, mapExcerpt?, manifest? }` |
| 错误 | 无 currentPage 且未传 pageKey → 明确错误信息 |

#### `compile_page_skill`

| 项 | 内容 |
|----|------|
| 参数 | `pageKey?: string`, `force?: boolean` |
| 行为 | HTTP 调 compiler-py；流式 `compile_progress` 事件 |
| 返回 | `{ ok: true, pageKey, manifest }` |

#### `list_page_skills`

| 项 | 内容 |
|----|------|
| 返回 | `{ skills: [{ pageKey, routePath, label, status, compiledAt }] }` |

### 8.2 Harness（读代码库）

#### `search_code_regex`

| 项 | 内容 |
|----|------|
| 参数 | `keyword: string`, `filePattern?: string`, `maxResults?: number`（默认 50） |
| 实现 | 子进程 `rg`；无 rg 时 TS fallback（慢） |
| 限制 | 仅 `workspaceRoot` 内；排除 `node_modules`, `dist`, `.git` |

#### `read_code_file`

| 项 | 内容 |
|----|------|
| 参数 | `filePath: string`, `startLine?: number`（默认 1）, `limit?: number`（默认 150，**硬上限 300**） |
| 安全 | 解析真实路径，拒绝跳出 `workspaceRoot` |

#### `list_routes`

| 项 | 内容 |
|----|------|
| 返回 | 与 Web 左侧同源的路由树 JSON |

### 8.3 记忆（跨页）

#### `read_business_memory`

| 项 | 内容 |
|----|------|
| 参数 | `topic: string` |
| 返回 | markdown 正文或 `{ status: "miss" }` |

#### `save_business_memory`

| 项 | 内容 |
|----|------|
| 参数 | `topic: string`, `content: string`, `confidence?: "draft"\|"verified"` |
| 行为 | 写入 `.agent/memory/{slug}.md`，YAML front matter |

### 8.4 预留（M2+）

| Tool | 说明 |
|------|------|
| `read_db_schema` | 读 `schema/*.json` 快照 |
| `plan_code_change` | 只读 diff 计划 |
| `apply_code_change` | 沙箱内写入 |

---

## 9. Python Compiler 微服务（过渡）

### 9.1 职责

封装 `legacy/ai-core` 已有能力，对 TS 侧暴露稳定 HTTP，**不**把 Python  import 进 Node。

### 9.2 建议接口

**`POST /v1/compile/page`**

Request:

```json
{
  "workspaceRoot": "/path/to/repo",
  "frontendRoot": "frontend",
  "backendRoot": "backend",
  "vuePath": "src/views/Detail.vue",
  "routePath": "/account/detail",
  "force": false
}
```

Response（同步 M1；后续可改 SSE）:

```json
{
  "pageKey": "Detail-eb11d4",
  "manifest": { },
  "map": { },
  "summaryMd": "..."
}
```

**`GET /health`**

### 9.3 部署

- 开发：`uv run` 启动于 `services/compiler-py`，默认 `127.0.0.1:8710`
- 环境变量：`COMPILER_PY_URL`

### 9.4 终态

解析器逐步用 TS 重写（`javalang` → TS Java parser、`@vue/compiler-sfc` 等），compiler-py 退役。

---

## 10. Web 应用设计（agent-web）

### 10.1 布局

```text
┌──────────────┬────────────────────────────────────────┐
│ 路由树        │  Transcript（TUI 风格）                 │
│ · 模块       │  You / Agent / tool 块                 │
│ · /detail ●  │                                        │
│ [全库模式]    │                                        │
├──────────────┴────────────────────────────────────────┤
│ 输入框 │ 当前页：Detail.vue（可选）│ 连接状态            │
└───────────────────────────────────────────────────────┘
```

- **●** = 已有 Skill；**○** = 未编译；**⚠** = stale
- 不选路由 = `currentPage: null`，顶部显示「全库模式」

### 10.2 与后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/routes` | 路由树 |
| GET | `/api/skills` | Skill 列表（状态角标） |
| POST | `/api/agent/chat/stream` | SSE 对话 |
| POST | `/api/workspace/bind` | 绑定 workspace 配置 |

### 10.3 编译中交互（M1）

- 单会话 **串行**：`compile_page_skill` 未完成前，拒绝新用户消息（返回 409 + 提示）
- M2：支持取消 / 队列

---

## 11. SSE 事件协议

`Content-Type: text/event-stream`  
每条：`data: ${JSON}\n\n`

| type | 说明 | payload 字段 |
|------|------|----------------|
| `session` | 会话元数据 | `sessionId`, `currentPage`, `model` |
| `assistant_delta` | 正文增量 | `text` |
| `tool_start` | 工具开始 | `callId`, `tool`, `argsSummary` |
| `tool_output` | 工具结束 | `callId`, `ok`, `preview`, `durationMs` |
| `compile_progress` | 编译子步骤 | `step`, `message`, `percent?` |
| `skill_status` | Skill 变化 | `pageKey`, `status` |
| `turn_end` | 本轮结束 | `turn`, `usage?` |
| `error` | 错误 | `code`, `message` |

**tool_output.preview** 上限 2048 字符；完整结果落 session 日志（可选 SQLite/JSONL）。

---

## 12. System Prompt 基座

```text
你是绑定在一个 Vue + Spring Boot 前后端仓库上的业务架构助手。

【上下文】
- 仓库根：{workspaceRoot}
- 当前页面：{currentPageLabel}（可能为「未选择，全库模式」）

【工作流】
1. 若当前页面不为空且问题与该页相关：先 read_page_skill；miss 则 compile_page_skill，再继续。
2. 若当前页面为空：用 search_code_regex / read_code_file 在整库定位；不要擅自 compile，除非用户指定页面。
3. 回答须标注依据：【Skill】、【代码 path:line】、【记忆 topic】。
4. Skill 与代码冲突时以代码为准，并建议重新编译。
5. 仅在有充分证据时 save_business_memory；跨页面规则用记忆，单页结构用 Skill。

你处于工具循环中，持续调用工具直到能给出准确、可引用的业务解答。
```

项目级补充写入 workspace 根 `AGENTS.md`（Pi 惯例）。

---

## 13. 配置

### 13.1 `.agent/config.json`（workspace 内）

```json
{
  "workspaceRoot": ".",
  "frontendRoot": "test-project/RunningAccount-master/vue",
  "backendRoot": "test-project/RunningAccount-master/java",
  "compilerUrl": "http://127.0.0.1:8710"
}
```

### 13.2 服务端环境变量

| 变量 | 说明 |
|------|------|
| `LLM_API_KEY` | DeepSeek / OpenAI |
| `LLM_BASE_URL` | 兼容端点 |
| `LLM_MODEL` | 如 `deepseek-chat` |
| `COMPILER_PY_URL` | Python 编译服务 |
| `AGENT_SERVER_PORT` | 默认 8787 |
| `AGENT_WEB_PORT` | 默认 5173 |

---

## 14. 安全与边界

| 项 | 策略 |
|----|------|
| 路径访问 | 所有读文件经 `harness.resolvePath`，禁止 `..` 逃逸 |
| 命令执行 | M1 不暴露任意 shell；仅 `rg` 白名单 |
| 写盘 | M1 仅 `.agent/skills`、`.agent/memory` |
| API Key | 仅 server 持有，不下发浏览器 |
| CORS | 开发期 localhost；生产同源或网关 |

---

## 15. 实施阶段

### Phase 0 — 仓库基座（当前）

- [x] 旧代码迁入 `legacy/`
- [x] 本文档
- [ ] npm workspaces scaffold
- [ ] `compiler-py` 薄服务 + health

### Phase 1 — 能对话（1–2 周）

- [ ] `agent-server` + Pi 循环 + harness 三工具
- [ ] `read/compile_page_skill` + compiler HTTP
- [ ] CLI 脚本本地对话（可选 pi-coding-agent 对照）
- [ ] 验收：Detail 页首问编译、次问读 Skill

### Phase 2 — Web（1–2 周）

- [ ] `agent-web` 路由树 + SSE transcript
- [ ] `list_routes` / skills 角标
- [ ] 全库模式 vs 选页模式

### Phase 3 — 强化

- [ ] stale 策略可配置；强制刷新按钮
- [ ] TS 解析器替代部分 Python
- [ ] 写代码 / 沙箱（可选）

---

## 16. M1 验收标准

1. **全库模式**：不选路由，问「哪里处理 accountId」→ 仅 search/read，无 compile。
2. **选页首问**：选 Detail，问提交校验 → 流中出现 `compile_page_skill` → 有业务回答。
3. **同页追问**：第二问主要 `read_page_skill`，工具轮次明显减少。
4. **可观测**：每条 tool 在 UI 可见、可折叠。
5. **可恢复**：刷新后 Skill 仍在 `.agent/skills`，无需重新编译（指纹未变）。

---

## 17. 与 legacy 的关系

| legacy 路径 | 新系统用途 |
|-------------|------------|
| `legacy/ai-core` | compiler-py 调用；参考 parser/lineage 逻辑 |
| `legacy/test-project` | 默认 demo 仓库 |
| `legacy/sandbox-projects` | 预览沙箱（后期） |
| `legacy/docs` | 旧架构导读、开发日志 |

**禁止**：新 `apps/*` 直接 import legacy Python 源码。

---

## 18. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Pi API 变更 | 适配器层 + pin 版本 |
| Pi 文档不足 | 以 Pi 源码 `packages/agent` 为参考；本地 CLI 对照 |
| 编译耗时长 | SSE `compile_progress`；Skill 缓存 |
| 记忆错误 | confidence + 冲突以代码为准 |
| 双栈维护 | 明确 compiler-py 退役路线图 |

---

## 19. 附录 A：类型共享（shared-types）

```typescript
type SseEvent =
  | { type: "session"; sessionId: string; currentPage: PageRef | null; model: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_start"; callId: string; tool: string; argsSummary: string }
  | { type: "tool_output"; callId: string; ok: boolean; preview: string; durationMs: number }
  | { type: "compile_progress"; step: string; message: string; percent?: number }
  | { type: "skill_status"; pageKey: string; status: string }
  | { type: "turn_end"; turn: number }
  | { type: "error"; code: string; message: string };
```

---

## 20. 附录 B：本地开发命令（目标态）

```bash
# 安装
pnpm install

# 启动 Python 编译服务
pnpm --filter compiler-py dev

# 启动 Agent API
pnpm --filter agent-server dev

# 启动 Web
pnpm --filter agent-web dev
```

---

## 21. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-05-26 | 初稿；归档 legacy；定 TS + Pi 路线 |
