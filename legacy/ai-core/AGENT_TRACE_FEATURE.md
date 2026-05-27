# Agent 分析过程追踪功能

## 🎯 功能概述

V1 增强版本新增了 **Agent 分析过程追踪**功能，让页面分析的整个过程完全透明可见。

### 核心特性

✅ **完整追踪记录** - 记录 Agent 的每一个思考步骤  
✅ **工具调用可视化** - 展示 Agent 使用了哪些工具、读取了哪些代码  
✅ **实时流式展示** - 通过 SSE 实时推送分析进度  
✅ **历史记录管理** - 保存所有分析追踪，支持回溯查看  
✅ **性能统计** - 展示每个步骤的耗时和资源消耗  

## 📁 新增文件

### 后端

```
src/ai_requirement_os/
├── schema/
│   └── agent_trace.py              # 追踪数据模型
├── agents/
│   └── trace_store.py              # 追踪持久化存储
└── llm/
    └── page_lineage_generator.py  # 增强：添加追踪功能
```

### 前端

```
src/ai_requirement_os/web/assets/
├── agent-trace-viewer.js           # 追踪查看器组件
└── agent-trace-viewer.css          # 追踪查看器样式
```

### API 端点

```
POST /api/page-lineage/traced       # 生成页面分析（带追踪）
GET  /api/agent-traces/{trace_id}   # 获取指定追踪
GET  /api/agent-traces              # 列出页面的历史追踪
POST /api/page-lineage/stream       # 流式返回分析过程（SSE）
```

## 🚀 使用方式

### 1. 在工作台使用

1. 打开工作台：`http://127.0.0.1:8000/workbench`
2. 加载页面工作区
3. 点击 **"生成 JSON / 报告"** 按钮
4. 在 **"Agent 分析过程"** 标签页查看实时分析过程
5. 分析完成后，可以看到完整的步骤时间线、文件列表、API 追踪等

### 2. 通过 API 使用

#### 生成带追踪的页面分析

```bash
curl -X POST "http://127.0.0.1:8000/api/page-lineage/traced?page_path=/path/to/page.vue" \
  -H "Content-Type: application/json" \
  -d '{
    "project_name": "my-project",
    "frontend_path": "/path/to/frontend",
    "backend_path": "/path/to/backend",
    "entry_pages": []
  }'
```

响应：

```json
{
  "result": {
    "mode": "agent",
    "model": "deepseek-chat",
    "lineage": { ... },
    "markdown": "...",
    "trace_id": "abc123..."
  },
  "trace": {
    "trace_id": "abc123...",
    "project_name": "my-project",
    "page_path": "/path/to/page.vue",
    "status": "completed",
    "steps": [
      {
        "step_number": 1,
        "step_type": "planning",
        "content": "开始构建页面证据包",
        "timestamp": "2026-05-21T10:00:00Z"
      },
      {
        "step_number": 2,
        "step_type": "evidence",
        "content": "证据包构建完成：发现 3 个初始请求、5 个操作",
        "timestamp": "2026-05-21T10:00:01Z",
        "details": {
          "initial_fetches": 3,
          "actions": 5
        }
      }
    ],
    "files_read": [
      "/path/to/page.vue",
      "/path/to/api.js"
    ],
    "apis_traced": [
      "/api/list",
      "/api/detail"
    ],
    "total_duration_ms": 2500
  }
}
```

#### 获取历史追踪

```bash
curl "http://127.0.0.1:8000/api/agent-traces/{trace_id}"
```

#### 列出页面的所有追踪

```bash
curl "http://127.0.0.1:8000/api/agent-traces?project_name=my-project&page_path=/path/to/page.vue&limit=10"
```

#### 流式获取分析过程（SSE）

```bash
curl -N "http://127.0.0.1:8000/api/page-lineage/stream?page_path=/path/to/page.vue"
```

输出：

```
data: {"event":"start","timestamp":"...","content":"开始分析页面: /path/to/page.vue"}

data: {"event":"step","timestamp":"...","content":"加载页面工作区..."}

data: {"event":"step","timestamp":"...","content":"构建证据包（Evidence Bundle）..."}

data: {"event":"step","timestamp":"...","content":"证据包构建完成：3 个初始请求、5 个操作"}

data: {"event":"step","timestamp":"...","content":"正在调用 LLM 分析代码..."}

data: {"event":"complete","timestamp":"...","content":"分析完成","data":{"trace_id":"abc123...","result":{...}}}
```

### 3. 在代码中使用

```python
from ai_requirement_os.llm.page_lineage_generator import generate_page_lineage_with_trace
from ai_requirement_os.agents.trace_store import save_agent_trace, load_agent_trace

# 生成页面分析并记录追踪
result, trace = generate_page_lineage_with_trace(workspace)

# 保存追踪
save_agent_trace(trace)

# 读取追踪
loaded_trace = load_agent_trace(trace.trace_id)

# 查看步骤
for step in loaded_trace.steps:
    print(f"步骤 {step.step_number}: {step.content}")
```

## 📊 追踪数据结构

### AgentAnalysisTrace

```python
{
  "trace_id": str,              # 追踪 ID
  "project_name": str,          # 项目名称
  "page_path": str,             # 页面路径
  "started_at": datetime,       # 开始时间
  "completed_at": datetime,     # 完成时间
  "status": str,                # 状态：running/completed/failed
  
  "steps": [                    # 执行步骤
    {
      "step_number": int,
      "step_type": str,         # planning/tool_call/reasoning/conclusion/evidence
      "content": str,
      "timestamp": datetime,
      "details": dict,          # 额外信息
      "tool_calls": [...]       # 工具调用记录
    }
  ],
  
  "total_tool_calls": int,      # 总工具调用次数
  "files_read": [str],          # 读取的文件列表
  "apis_traced": [str],         # 追踪的 API 列表
  "total_duration_ms": int,     # 总耗时（毫秒）
  
  "model_name": str,            # 使用的模型
  "mode": str,                  # 执行模式
  "final_result": dict,         # 最终结果
  "error": str                  # 错误信息（如果失败）
}
```

### 步骤类型

- **planning** - 规划阶段，决定下一步做什么
- **evidence** - 证据收集，构建 Evidence Bundle
- **tool_call** - 工具调用，读取文件、搜索代码等
- **reasoning** - 推理阶段，LLM 分析代码
- **conclusion** - 结论阶段，生成最终结果

## 🗂️ 数据存储

追踪数据存储在 `.agent/traces/` 目录下：

```
.agent/
└── traces/
    ├── index.json              # 索引文件
    ├── abc123.json             # 追踪文件
    └── def456.json
```

### 索引结构

```json
{
  "project_name::page_path": [
    "trace_id_1",
    "trace_id_2"
  ]
}
```

## 🎨 前端组件

### AgentTraceViewer

```javascript
// 初始化
const viewer = new AgentTraceViewer("container-id");

// 加载追踪
await viewer.loadTrace(traceId);

// 流式展示
await viewer.streamAnalysis(config, pagePath, refresh);
```

### 展示内容

1. **头部** - 追踪 ID、页面路径、时间范围、状态
2. **统计卡片** - 步骤数、工具调用数、文件数、API 数、耗时、模型
3. **时间线** - 每个步骤的详细信息，带图标和颜色区分
4. **文件列表** - 所有读取的文件
5. **API 列表** - 所有追踪的 API

## 🧪 测试

运行测试脚本：

```bash
cd ai-core
uv run python test_trace_api.py
```

测试内容：
- 追踪数据模型的序列化/反序列化
- 追踪数据的存储和读取
- 索引管理

## 📈 性能影响

追踪功能对性能的影响：

- **存储开销**：每次分析约 10-50KB JSON 文件
- **时间开销**：增加约 50-100ms（主要是文件 I/O）
- **内存开销**：运行时增加约 1-2MB

建议：
- 定期清理旧的追踪文件
- 生产环境可以通过配置关闭追踪功能

## 🔧 配置

暂时没有配置项，追踪功能默认启用。

未来可以添加：
- `AIRO_TRACE_ENABLED` - 是否启用追踪
- `AIRO_TRACE_RETENTION_DAYS` - 追踪保留天数
- `AIRO_TRACE_MAX_SIZE` - 单个追踪最大大小

## 🚦 下一步

V1 追踪功能已完成，为 V2 打下基础：

- ✅ 基础追踪记录
- ✅ 流式输出
- ✅ 前端可视化
- ⏳ 工具调用详情（V2）
- ⏳ 代码搜索追踪（V2）
- ⏳ 多轮对话追踪（V2）
- ⏳ 性能分析和优化建议（V2）

## 📝 示例输出

### 工作台展示

```
Agent 分析过程
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

追踪 ID: abc123def456
页面: /src/views/trade/list.vue
开始时间: 2026-05-21 10:00:00
完成时间: 2026-05-21 10:00:03

统计信息
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ 执行步骤 │ 工具调用 │ 文件读取 │ API追踪 │  耗时   │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│    6    │    0    │    5    │    3    │  2.5s   │
└─────────┴─────────┴─────────┴─────────┴─────────┘

执行步骤
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 #1 规划
   开始构建页面证据包（Evidence Bundle）
   10:00:00

📊 #2 证据收集
   证据包构建完成：发现 3 个初始请求、5 个操作
   10:00:01
   • initial_fetches: 3
   • actions: 5
   • search_fields: 4
   • display_fields: 8

📋 #3 规划
   准备调用 LLM 生成结构化分析
   10:00:01

🤔 #4 推理
   调用 deepseek-chat 分析证据包（提示词长度：12345 字符）
   10:00:01
   • model: deepseek-chat
   • prompt_length: 12345
   • evidence_bundle_size: 45678

🤔 #5 推理
   LLM 分析完成（耗时 1500ms）
   10:00:02
   • duration_ms: 1500
   • result_fields: 12
   • result_actions: 5

✅ #6 结论
   生成 Markdown 报告
   10:00:03

读取的文件 (5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 /src/views/trade/list.vue
📄 /src/api/trade.js
📄 /backend/controller/TradeController.java
📄 /backend/service/TradeService.java
📄 /backend/mapper/TradeMapper.java

追踪的 API (3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 /api/trade/list
🔗 /api/trade/detail
🔗 /api/trade/refund
```

## 🎉 总结

Agent 追踪功能让 V1 的页面分析过程完全透明，用户可以：

1. **实时看到** Agent 在做什么
2. **了解依据** Agent 读取了哪些代码
3. **评估质量** 分析是否全面、准确
4. **调试问题** 出错时快速定位原因
5. **优化流程** 通过追踪数据改进 Prompt 和工具

这为 V2 的多轮对话和工具增强打下了坚实基础！
