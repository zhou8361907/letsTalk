# letsTalk

面向产品经理与研发的代码库对话 Agent（基于 [Pi SDK](https://github.com/earendil-works/pi)）。

## 文档

- **代码结构导读（中文）**：[docs/CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md) — 目录、关键文件、请求链路
- **Cursor 调试指南**：[docs/DEBUG_GUIDE.md](docs/DEBUG_GUIDE.md) — 断点跟读：普通对话、需求清单、关键路径
- **TypeScript 语法导读（初学者）**：[docs/TYPESCRIPT_FOR_BEGINNERS.md](docs/TYPESCRIPT_FOR_BEGINNERS.md) — 本项目常用 TS 写法详解
- **TypeScript 进阶（事件与深层写法）**：[docs/TYPESCRIPT_DEEP_DIVE.md](docs/TYPESCRIPT_DEEP_DIVE.md) — Pi/SSE/Transcript 三层事件、Extract、类型谓词
- **按功能学 TypeScript**：[docs/TYPESCRIPT_BY_FEATURE.md](docs/TYPESCRIPT_BY_FEATURE.md) — 顺着探索/锚点/PRD 等功能查该学哪些语法
- **发消息 + SSE 详解**：[docs/FEATURE_00_SEND_AND_SSE.md](docs/FEATURE_00_SEND_AND_SSE.md) — 功能 0 专题（初学者向）
- 总设计：[docs/AGENT_OS_DESIGN.md](docs/AGENT_OS_DESIGN.md)
- 分阶段进度：[docs/IMPLEMENTATION_PHASES.md](docs/IMPLEMENTATION_PHASES.md)
- PM 需求助手方案：[docs/PM_REQUIREMENT_ASSISTANT.md](docs/PM_REQUIREMENT_ASSISTANT.md)

## 核心代码（带注释，尽量短）

| 文件 | 作用 |
|------|------|
| `packages/agent-runtime/src/create-session.ts` | 调 `createAgentSession`，等同 01-minimal |
| `packages/agent-runtime/src/run-chat.ts` | `session.prompt` + 转 SSE |
| `apps/web/app/api/agent/chat/stream/route.ts` | HTTP 接口 |
| `apps/web/app/page.tsx` | 网页 |

## 启动

```bash
pnpm install

cp .env.example .env
# 编辑 .env：LLM_API_KEY、WORKSPACE_ROOT（letsTalk 仓库根）
# 把待分析的前后端放进 workFront/、workBack/（或做符号链接，见目录内 README）

pnpm minimal   # 先在终端测 Pi 是否正常
pnpm dev       # http://127.0.0.1:3000
```

`.env` 放**仓库根目录**即可（Next 会自动加载）；**勿提交** `.env`（已在 `.gitignore`）。
