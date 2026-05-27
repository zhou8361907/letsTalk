# Legacy 归档说明

本目录存放 **Agent OS 重构前** 的 Python 实现与相关资源，仅供参考、编译器微服务调用与对照测试。**新主线请在仓库根目录 `apps/`、`packages/` 下以 TypeScript + Pi 开发。**

## 目录

| 路径 | 说明 |
|------|------|
| `ai-core/` | 原 Python 控制面：FastAPI、Workbench、parser、LangGraph 工作流、Agent harness |
| `docs/` | 旧版《架构导读》《开发日志》 |
| `test-project/` | 示例前后端项目（RunningAccount 等） |
| `sandbox-projects/` | 前端沙箱工程 |
| `log/` | 历史运行日志 |

## 如何单独运行旧 Workbench（如需）

```bash
cd legacy/ai-core
uv sync
cp .env.example .env   # 配置 LLM
./scripts/run_workbench.sh
# http://127.0.0.1:8000/workbench
```

## 与新系统的关系

- 新 **compiler-py** 服务应通过 HTTP 调用 `ai-core` 的分析能力，而不是复制代码到新仓库。
- 新 Agent **不要** import 本目录下的 Python 模块。
- 设计文档见：`../docs/AGENT_OS_TS_PI_DESIGN.md`

## 归档日期

2026-05-26
