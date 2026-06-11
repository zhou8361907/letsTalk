# letsTalk

面向**产品经理**与**研发**的代码库对话 Agent：在浏览器里提问，Agent 基于 [Pi SDK](https://github.com/earendil-works/pi) 自主检索 `workFront` / `workBack` 中的真实代码并流式回答；支持菜单/文件锚点、写需求清单、跨会话记忆与 Skills 流程。

技术栈：**pnpm monorepo** · **Next.js 15** · **Pi Coding Agent** · **DeepSeek**（可换模型，见 Pi 配置）· **SSE** 流式推送。

---

## 能做什么

| 能力 | 说明 |
|------|------|
| **探索对话** | 问「这个接口在哪」「字典怎么存的」——Agent 用 `grep` / `read` / `list_methods` 等工具查代码，结论须有据可查 |
| **锚点聚焦** | 选定 Vue 页面路径或系统菜单，对话默认围绕该页面相关前后端代码 |
| **写需求（PRD）** | `prd` 模式下边聊边维护右侧需求清单，可导出 Markdown |
| **Java 方法级阅读** | 巨石 Controller 先 `list_methods` 再 `read_method`，避免整文件灌入上下文 |
| **记忆 & Skills** | `.agent/memory/` 记事实；`.agent/skills/` 记可复用流程（见 [docs/SKILLS_V1.md](docs/SKILLS_V1.md)） |
| **菜单映射** | 可选从 MySQL 同步菜单树 → `.agent/menu-map/`，支撑「按菜单名追代码」 |

面向业务场景的对外介绍（领导/推广向）：[docs/LETS_TALK_INTRO_FOR_LEADERS.md](docs/LETS_TALK_INTRO_FOR_LEADERS.md)。

---

## 仓库结构（一眼看懂）

```text
letsTalk/                    ← WORKSPACE_ROOT（Pi 的 cwd，工具路径基准）
├── apps/web/                ← Next.js 网页 + /api/agent/chat/stream
├── packages/
│   ├── agent-runtime/       ← Pi 会话、runChat、自定义工具
│   ├── context/             ← 每轮 JIT 上下文（锚点、AGENTS.md、PM 规则）
│   ├── conversation/        ← 会话 JSON 持久化
│   ├── ast-tools/           ← Java list_methods / read_method
│   ├── memory/、skills/     ← 记忆与 Skills 包
│   └── shared-types/
├── workFront/               ← 待分析前端（Vue，可放副本或符号链接）
├── workBack/                ← 待分析后端（Java/Spring，可放副本或符号链接）
├── .agent/                  ← 运行时：对话、Pi jsonl、菜单映射、memory、skills
├── AGENTS.md                ← 注入模型的架构规则（Agent 必读）
└── docs/                    ← 设计与导读文档
```

请求主线：`page.tsx` → `api/agent/chat/stream` → `run-chat.ts` → `create-session.ts` → Pi + 工具读 `workFront` / `workBack`。详见 [docs/CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md)。

---

## 快速启动

### 环境要求

- **Node.js** ≥ 20
- **pnpm**（仓库使用 workspace）
- **DeepSeek API Key**（或 Pi 已配置的其它 provider 密钥）

### 1. 安装依赖

```bash
cd /path/to/letsTalk
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑仓库根目录的 `.env`（**勿提交**，已在 `.gitignore`）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_API_KEY` | 是 | 大模型 API 密钥 |
| `WORKSPACE_ROOT` | 是 | letsTalk 仓库**绝对路径**（Pi 的工作目录） |
| `FRONTEND_ROOT` | 否 | 默认 `workFront` |
| `BACKEND_ROOT` | 否 | 默认 `workBack` |
| `PORT` | 否 | 默认 `3000` |

Next 与 `minimal` 脚本都会自动加载根目录 `.env`。

### 3. 放入待分析代码

在 `WORKSPACE_ROOT` 下准备两个目录（名称可与 `.env` 中 `FRONTEND_ROOT` / `BACKEND_ROOT` 一致）：

```bash
# 示例：用符号链接指向真实项目（推荐，不占双份磁盘）
ln -s /path/to/your-vue-app   workFront
ln -s /path/to/your-java-app  workBack
```

也可直接把前后端代码拷贝进 `workFront/`、`workBack/`。Agent 的所有 `read` / `grep` 路径均**相对运行根**解析。

### 4. 终端自检（推荐）

不启动网页，先确认 Pi 与密钥是否正常：

```bash
pnpm minimal
```

成功时会打印模型名，并流式输出一句关于当前项目的回答；失败优先检查 `LLM_API_KEY` 与 `WORKSPACE_ROOT`。

### 5. 启动 Web

```bash
pnpm dev
```

浏览器打开：**http://127.0.0.1:3000**（或 `.env` 里配置的 `PORT`）。

`pnpm dev` 会先构建各 workspace 包再启动 Next；首次较慢属正常。

### 6. 可选：系统菜单同步

若需「按系统菜单选锚点」，配置 `.env` 中的 `MENU_DB_*`，然后：

```bash
pnpm sync-menu
```

生成/更新 `.agent/menu-map/` 下的菜单 JSON。未配置数据库时仍可用**手动文件路径**作为锚点。

---

## 常用命令

| 命令 | 作用 |
|------|------|
| `pnpm install` | 安装 monorepo 依赖 |
| `pnpm minimal` | 终端直连 Pi，快速验密钥与 WORKSPACE_ROOT |
| `pnpm smoke` | agent-runtime 冒烟脚本 |
| `pnpm dev` | 开发模式启动 Web（默认 3000 端口） |
| `pnpm build` | 构建全部包与 Next 生产包 |
| `pnpm sync-menu` | 从 MySQL 同步菜单映射 |
| `pnpm lint` | 各包 TypeScript 检查 |

---

## 调试与排错

- **服务端断点**：用 VS Code/Cursor **F5** → `letsTalk: Next 服务端 (推荐)`，不要仅用终端 `pnpm dev` 指望断点生效。详见 [docs/DEBUG_GUIDE.md](docs/DEBUG_GUIDE.md)。
- **落盘每轮上下文**：`.env` 设 `LETS_TALK_DEBUG=1`，日志在 `.agent/debug/{sessionId}/`。
- **关闭 Skills**：`LETS_TALK_SKILLS=0`（默认开启）。
- **Agent 不编造**：规则在 [AGENTS.md](AGENTS.md)；与代码冲突时以 `workFront` / `workBack` 为准。

---

## 核心代码入口

| 文件 | 作用 |
|------|------|
| [packages/agent-runtime/src/create-session.ts](packages/agent-runtime/src/create-session.ts) | 创建 Pi 会话、注册工具 |
| [packages/agent-runtime/src/run-chat.ts](packages/agent-runtime/src/run-chat.ts) | 单轮对话编排 → SSE 事件 |
| [apps/web/app/api/agent/chat/stream/route.ts](apps/web/app/api/agent/chat/stream/route.ts) | HTTP 流式接口 |
| [apps/web/app/page.tsx](apps/web/app/page.tsx) | 主界面（会话、锚点、Transcript、需求画布） |
| [packages/context/src/build-context.ts](packages/context/src/build-context.ts) | 每轮 JIT 上下文组装 |

---

## 文档索引

### 读代码 / 跟链路

- [docs/CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md) — 目录、包职责、请求链路（**首选导读**）
- [docs/DEBUG_GUIDE.md](docs/DEBUG_GUIDE.md) — Cursor/VS Code 断点跟读
- [docs/FEATURE_00_SEND_AND_SSE.md](docs/FEATURE_00_SEND_AND_SSE.md) — 发消息与 SSE 专题

### TypeScript（本项目写法）

- [docs/TYPESCRIPT_FOR_BEGINNERS.md](docs/TYPESCRIPT_FOR_BEGINNERS.md)
- [docs/TYPESCRIPT_DEEP_DIVE.md](docs/TYPESCRIPT_DEEP_DIVE.md)
- [docs/TYPESCRIPT_BY_FEATURE.md](docs/TYPESCRIPT_BY_FEATURE.md)

### 产品与 Agent 能力

- [docs/AI_ENGINEERING/README.md](docs/AI_ENGINEERING/README.md) — **AI Engineering Handbook**（成熟度评估 + 工程知识库）
- [docs/AGENT_OS_DESIGN.md](docs/AGENT_OS_DESIGN.md) — 总设计
- [docs/IMPLEMENTATION_PHASES.md](docs/IMPLEMENTATION_PHASES.md) — 分阶段进度
- [docs/PM_REQUIREMENT_ASSISTANT.md](docs/PM_REQUIREMENT_ASSISTANT.md) — PM 需求助手
- [docs/SKILLS_V1.md](docs/SKILLS_V1.md) — Skills 体系
- [docs/MEMORY_V1.md](docs/MEMORY_V1.md) — 跨会话记忆
- [docs/MENU_DB_INTEGRATION.md](docs/MENU_DB_INTEGRATION.md) — 菜单库对接

### 对外介绍

- [docs/LETS_TALK_INTRO_FOR_LEADERS.md](docs/LETS_TALK_INTRO_FOR_LEADERS.md) — 部门推广 / 价值说明

---

## 许可证与贡献

本仓库为内部项目；部署与密钥管理请遵循团队安全规范，勿将 `.env` 或 API Key 提交到版本库。
