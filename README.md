# letsTalk

基于 [Pi SDK](https://github.com/earendil-works/pi) 的代码库对话（最简版）。

## 文档

- 总设计：[docs/AGENT_OS_DESIGN.md](docs/AGENT_OS_DESIGN.md)
- 分阶段进度：[docs/IMPLEMENTATION_PHASES.md](docs/IMPLEMENTATION_PHASES.md)

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

`.env` 放**仓库根目录**即可（Next 会自动加载）。
