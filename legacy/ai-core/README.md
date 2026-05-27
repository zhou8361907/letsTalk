# ai-core

Python control plane for the **AI Requirement OS** — analyze Vue + Spring Boot CRUD pages, assemble page-level requirement workspaces, and optionally enhance documentation with LLM.

## Quickstart

```bash
cd ai-core
uv sync
cp .env.example .env   # 填写 DEEPSEEK_API_KEY（可选，仅 AI 补全需要）
./scripts/run_workbench.sh
```

Open **http://127.0.0.1:8000/workbench** in your browser by default.

Common local port settings live in `.env`:

```bash
AIRO_API_HOST=127.0.0.1
AIRO_API_PORT=8000
AIRO_FRONTEND_PORT=8081
AIRO_SANDBOX_BASE_URL=http://127.0.0.1:8081
```

## Documentation

详细安装、配置、工作台操作与 API 说明见：

**[docs/使用指南.md](docs/使用指南.md)**

当前开发节奏、阶段计划与变更记录见：

**[docs/开发日志.md](docs/开发日志.md)**

## What is here

- FastAPI entrypoint + workbench UI
- Project discovery and page workspace assembly
- MVP IR (`PageIR`) and runtime schema projection
- LLM gateway (DeepSeek / OpenAI-compatible)
- Agent runtime scaffold (sessions, tasks, manifest)

## Milestone focus

1. V1: 页面级扫描与说明书，先稳定输出单页前后端分析结果。
2. V2: 页面问答 Agent，支持记忆、工具调用、后台代码扫描。
3. V3: 代码计划 / diff / 应用 / 回滚 / 沙箱预览闭环。

## Current Focus

当前我们主动做减法，先把 V1 做扎实：

- 以页面为单位扫描前后端
- 输出结构化 JSON
- 由 JSON 派生 Markdown 报告
- 工作台保留沙箱入口，但默认折叠，不作为当前主线
