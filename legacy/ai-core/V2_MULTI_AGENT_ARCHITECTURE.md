# V2 多 Agent 架构设计：从管道到智能探索

## 🎯 核心理念转移 (Paradigm Shift)

### 从 V1 到 V2 的本质变化

**V1（当前）**：文本处理管道
```
用户输入 → 扫描代码 → 拼接 Prompt → LLM 一次性输出 → 格式化结果
```
- Agent 是被动的"翻译机"
- 固定的分析流程
- 无法处理复杂场景
- 缺乏探索能力

**V2（目标）**：基于黑板模式的状态机
```
用户输入 → 主控 Agent → 分发任务 → 多个专家 Agent 自主探索 → 汇总结果
                ↓
         黑板状态（持续更新的 JSON）
                ↓
         工具库（强语义 API）
```
- Agent 是主动的"调查员"
- 自主决策探索路径
- 可以处理复杂逻辑
- 具备学习和记忆能力

### 关键概念

1. **黑板模式 (Blackboard Pattern)**
   - 中央共享状态：`PageDataLineage` JSON
   - 所有 Agent 读写同一份数据
   - 增量式构建最终结果

2. **虚拟研发团队 (Multi-Agent Swarm)**
   - 不是一个超级 Agent
   - 按职责拆分成多个专家
   - 协同工作，各司其职

3. **自主探索 (Autonomous Exploration)**
   - Agent 自己决定调用哪些工具
   - 遇到复杂场景可以挂起后台任务
   - 支持循环、分支、并行


## 🏗️ 架构设计：虚拟研发团队

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户界面 (Workbench)                     │
│  实时展示：Agent 思考过程、工具调用、状态更新、后台任务      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   🎯 主控 Agent (Orchestrator)                │
│  职责：全局调度、任务分发、状态汇总、进度管理                │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
        ┌───────────────────┐  ┌───────────────────┐
        │ 🔍 前端解析 Agent  │  │ 🕵️ 后端溯源 Agent  │
        │  - parse_vue_ast  │  │  - search_controller│
        │  - extract_apis   │  │  - read_method     │
        │  - find_fields    │  │  - trace_service   │
        └───────────────────┘  └───────────────────┘
                                        ↓
                              ┌─────────────────────┐
                              │ 🧠 深度逻辑专家     │
                              │  后台长时任务       │
                              │  - 复杂 Service    │
                              │  - 微服务调用      │
                              │  - 权限逻辑        │
                              └─────────────────────┘
                              
┌─────────────────────────────────────────────────────────────┐
│                    黑板状态 (Blackboard State)                │
│  PageDataLineage JSON - 所有 Agent 共享的中央数据结构        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    工具库 (Tools/Skills)                      │
│  强语义 API - 基于 AST 的精准代码分析工具                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  记忆与图谱 (Memory & Knowledge Graph)        │
│  向量数据库 + 图数据库 - 经验复用、越用越聪明                │
└─────────────────────────────────────────────────────────────┘
```


### Agent 角色定义

#### 1. 🎯 主控 Agent (The Orchestrator / PM Agent)

**职责**：
- 把控全局进度
- 维护黑板状态（PageDataLineage JSON）
- 任务分发与调度
- 结果汇总与输出

**工作流程**：
```python
def orchestrator_workflow(page_path: str):
    # 1. 初始化黑板状态
    blackboard = PageDataLineage(page_path=page_path)
    
    # 2. 唤醒前端解析 Agent
    frontend_result = await frontend_agent.analyze(page_path)
    blackboard.update(frontend_result)
    
    # 3. 针对每个 API，分发后端溯源任务
    for api in frontend_result.apis:
        task = create_task(backend_agent.trace, api)
        tasks.append(task)
    
    # 4. 并行执行所有后端任务
    backend_results = await asyncio.gather(*tasks)
    
    # 5. 汇总结果
    for result in backend_results:
        blackboard.update(result)
        
        # 如果发现复杂逻辑，创建后台任务
        if result.complexity > THRESHOLD:
            spawn_background_task(deep_logic_agent, result)
    
    # 6. 生成最终文档
    return generate_documentation(blackboard)
```

**关键能力**：
- 状态管理：维护完整的分析状态
- 任务调度：决定何时唤醒哪个 Agent
- 进度追踪：实时更新用户界面
- 异常处理：处理 Agent 失败、超时等情况


#### 2. 🔍 前端解析 Agent (Frontend Tracker)

**职责**：
- 只看前端代码
- 提取页面结构、字段、按钮、API 调用
- 生成"调查清单"

**自带工具**：
```python
@tool
def parse_vue_ast(file_path: str) -> VueAST:
    """解析 Vue 文件的 AST，提取模板、脚本、样式"""
    
@tool
def extract_api_calls(vue_source: str) -> list[APICall]:
    """提取所有 API 调用：xxxApi.getDetail()"""
    
@tool
def find_form_fields(template: str) -> list[FormField]:
    """提取表单字段：el-input, el-select 等"""
    
@tool
def find_table_columns(template: str) -> list[TableColumn]:
    """提取表格列定义"""
    
@tool
def find_button_handlers(template: str) -> list[ButtonHandler]:
    """提取按钮及其绑定的方法"""
```

**工作流程**：
```
1. 读取 Vue 文件
2. 解析 AST
3. 提取表单字段 → 更新黑板
4. 提取表格列 → 更新黑板
5. 提取按钮和方法 → 更新黑板
6. 提取 API 调用 → 生成后端追踪任务列表
7. 返回调查清单给主控 Agent
```

**输出示例**：
```json
{
  "page_info": {
    "name": "Detail",
    "path": "/src/views/Detail/index.vue"
  },
  "search_fields": [...],
  "display_fields": [...],
  "actions": [...],
  "api_calls": [
    {
      "name": "getDetail",
      "method": "GET",
      "url": "/api/detail/info",
      "handler": "loadData"
    },
    {
      "name": "updateDetail",
      "method": "POST",
      "url": "/api/detail/update",
      "handler": "handleSubmit"
    }
  ]
}
```


#### 3. 🕵️ 后端溯源 Agent (Backend Detective)

**职责**：
- 接手一个特定的 API URL
- 自主探索后端实现链路
- 遇到复杂逻辑时触发深度分析

**自带工具**：
```python
@tool
def search_controller_by_url(method: str, url: str) -> ControllerInfo:
    """根据 HTTP 方法和 URL 找到对应的 Controller"""
    
@tool
def read_method_source(class_name: str, method_name: str) -> MethodSource:
    """读取指定方法的源码（仅该方法，不包含整个类）"""
    
@tool
def find_service_calls(method_source: str) -> list[ServiceCall]:
    """从方法源码中提取 Service 调用"""
    
@tool
def get_dto_fields(class_name: str) -> list[DTOField]:
    """提取 DTO/Entity 的所有字段及注释"""
    
@tool
def check_method_complexity(method_source: str) -> ComplexityScore:
    """评估方法复杂度：行数、循环、条件、外部调用等"""
```

**Agentic 探索流程**：
```python
async def trace_api(method: str, url: str):
    # 步骤 1：找到 Controller
    controller = await search_controller_by_url(method, url)
    log(f"找到 Controller: {controller.class_name}.{controller.method_name}")
    
    # 步骤 2：读取 Controller 方法源码
    source = await read_method_source(controller.class_name, controller.method_name)
    
    # 步骤 3：评估复杂度
    complexity = await check_method_complexity(source)
    
    if complexity.score < 50:
        # 简单逻辑，直接分析
        return analyze_simple_method(source)
    else:
        # 复杂逻辑，创建后台任务
        log(f"⚠️ 发现复杂逻辑（复杂度：{complexity.score}），创建后台任务")
        task_id = spawn_background_task(deep_logic_agent, source)
        return {
            "status": "complex",
            "task_id": task_id,
            "summary": "已触发深度分析，主流程继续"
        }
    
    # 步骤 4：提取 Service 调用
    service_calls = await find_service_calls(source)
    
    # 步骤 5：递归追踪 Service（最多 2 层）
    for call in service_calls[:3]:  # 限制数量，避免爆炸
        service_source = await read_method_source(call.class_name, call.method_name)
        # ... 继续分析
```

**关键特性**：
- **自主决策**：Agent 自己判断是否需要深入
- **复杂度评估**：避免陷入无限递归
- **后台任务**：不阻塞主流程
- **增量更新**：每一步都更新黑板状态


#### 4. 🧠 深度逻辑专家 Agent (Deep-Logic Sub-Agent)

**触发条件**：
- 方法行数 > 100
- 包含复杂的权限逻辑
- 涉及微服务调用
- 包含外部报文交互
- 复杂的数据库操作

**职责**：
- 深度分析复杂逻辑
- 查找相关数据库表
- 查找相关枚举类
- 生成详细说明文档

**工作模式**：
```python
class DeepLogicAgent:
    """后台长时任务，不阻塞主流程"""
    
    async def analyze_complex_logic(self, method_source: str, context: dict):
        # 1. 提取所有依赖
        dependencies = await self.extract_dependencies(method_source)
        
        # 2. 查找数据库表
        tables = await self.find_related_tables(dependencies)
        
        # 3. 查找枚举类
        enums = await self.find_related_enums(dependencies)
        
        # 4. 分析业务流程
        flow = await self.analyze_business_flow(method_source, dependencies)
        
        # 5. 生成详细文档
        doc = self.generate_detailed_doc(flow, tables, enums)
        
        # 6. 异步合并到黑板
        await blackboard.merge_deep_analysis(doc)
        
        # 7. 通知用户
        await notify_user(f"后台任务完成：{context['method_name']}")
```

**输出示例**：
```json
{
  "method": "DetailService.syncWithBank",
  "complexity": 85,
  "analysis": {
    "summary": "该方法负责与银行系统同步账户信息",
    "flow": [
      "1. 验证用户权限",
      "2. 调用银行 API 获取账户信息",
      "3. 解析报文并转换为内部格式",
      "4. 更新本地数据库",
      "5. 发送 MQ 消息通知下游系统"
    ],
    "tables": ["t_account", "t_bank_sync_log"],
    "enums": ["BankType", "SyncStatus"],
    "external_calls": [
      {
        "service": "BankGateway",
        "method": "queryAccount",
        "timeout": "5s"
      }
    ],
    "risks": [
      "银行 API 可能超时",
      "报文格式可能变化"
    ]
  }
}
```


## 🛠️ 四条硬核落地建议

### 建议 1：重仓"工具库 (Tools/Skills)"，把工具做成 LSP 级别

**核心观点**：
> Agent 的智商上限，取决于团队给它提供的工具好不好用。

**反面教材**：
```python
# ❌ 弱工具：让 Agent 自己看几千行代码
@tool
def read_file(path: str) -> str:
    """读取文件内容"""
    return open(path).read()  # 返回 5000 行代码，Agent 会懵
```

**正确做法**：
```python
# ✅ 强工具：基于 AST 的精准提取
@tool
def get_controller_method(url: str, method: str) -> ControllerMethod:
    """
    根据 URL 和 HTTP 方法，精准定位到 Controller 方法
    
    返回：
    - class_name: 类名
    - method_name: 方法名
    - method_source: 仅该方法的源码（不包含其他方法）
    - annotations: 注解信息
    - parameters: 参数列表
    - return_type: 返回类型
    """
    # 使用 JavaParser 或正则精准提取
    ...
```

**必须开发的工具清单**：

#### 前端工具（Vue/React）
```python
✅ tool_parse_vue_component(path: str) -> VueComponent
   # 返回：template, script, style, imports, exports

✅ tool_extract_api_calls(script: str) -> list[APICall]
   # 提取：xxxApi.getDetail(), this.$http.post()

✅ tool_find_form_fields(template: str) -> list[FormField]
   # 提取：el-input, el-select, 包含 v-model 绑定

✅ tool_find_table_config(script: str) -> TableConfig
   # 提取：columns 定义、分页配置、操作按钮

✅ tool_trace_method_calls(method_name: str, script: str) -> CallChain
   # 追踪方法调用链：handleSubmit → validateForm → submitApi
```

#### 后端工具（Spring Boot）
```python
✅ tool_search_controller_by_url(method: str, url: str) -> ControllerInfo
   # 通过 @RequestMapping 注解精准定位

✅ tool_get_method_source(class_name: str, method_name: str) -> str
   # 仅返回该方法的源码，过滤掉类的其他部分

✅ tool_extract_service_calls(method_source: str) -> list[ServiceCall]
   # 提取：xxxService.getDetail(), this.userService.check()

✅ tool_get_dto_fields(class_name: str) -> list[DTOField]
   # 提取字段名、类型、注释、校验注解

✅ tool_find_mapper_sql(mapper_class: str, method: str) -> SQLInfo
   # 提取 MyBatis XML 中的 SQL 语句

✅ tool_analyze_method_complexity(source: str) -> ComplexityMetrics
   # 返回：行数、圈复杂度、依赖数、是否有外部调用
```


#### 通用工具
```python
✅ tool_search_code(pattern: str, file_types: list[str]) -> list[Match]
   # 全局代码搜索，支持正则

✅ tool_get_class_hierarchy(class_name: str) -> ClassHierarchy
   # 获取类的继承关系和实现的接口

✅ tool_find_usages(symbol: str) -> list[Usage]
   # 查找符号的所有引用位置

✅ tool_check_memory(key: str) -> MemoryEntry | None
   # 查询记忆库，避免重复分析
```

**工具开发优先级**：

| 优先级 | 工具 | 原因 |
|--------|------|------|
| P0 | `search_controller_by_url` | 后端追踪的起点 |
| P0 | `get_method_source` | 精准提取，避免噪音 |
| P0 | `extract_api_calls` | 前端分析的核心 |
| P1 | `get_dto_fields` | 字段信息很重要 |
| P1 | `analyze_method_complexity` | 决定是否触发深度分析 |
| P2 | `find_mapper_sql` | 数据库操作分析 |
| P2 | `check_memory` | 经验复用 |

**工具质量标准**：
1. **精准性**：只返回需要的信息，不返回无关内容
2. **结构化**：返回 Pydantic 模型，不返回纯文本
3. **快速**：单次调用 < 500ms
4. **可靠**：处理边界情况，不会崩溃
5. **可测试**：有完整的单元测试


### 建议 2：引入"图结构状态机 (Graph-based State Machine)"

**为什么需要状态机？**

传统的 Prompt 链（LangChain 的 SequentialChain）无法实现：
- ❌ 按需探索（根据结果决定下一步）
- ❌ 死循环跳出（避免无限递归）
- ❌ 拉起后台任务（异步长时任务）
- ❌ 并行执行（同时追踪多个 API）

**技术选型：LangGraph**

```python
from langgraph.graph import StateGraph, END

# 定义状态
class AnalysisState(TypedDict):
    page_path: str
    blackboard: PageDataLineage
    frontend_result: FrontendResult | None
    backend_tasks: list[BackendTask]
    background_tasks: list[BackgroundTask]
    status: str

# 构建图
workflow = StateGraph(AnalysisState)

# 添加节点（每个节点是一个 Agent 或操作）
workflow.add_node("frontend_analysis", frontend_agent)
workflow.add_node("backend_dispatch", dispatch_backend_tasks)
workflow.add_node("backend_trace", backend_agent)
workflow.add_node("complexity_check", check_complexity)
workflow.add_node("spawn_background", spawn_background_task)
workflow.add_node("merge_results", merge_all_results)

# 添加边（定义流程）
workflow.set_entry_point("frontend_analysis")
workflow.add_edge("frontend_analysis", "backend_dispatch")
workflow.add_edge("backend_dispatch", "backend_trace")

# 条件边（根据状态决定下一步）
workflow.add_conditional_edges(
    "backend_trace",
    lambda state: "complex" if state["complexity"] > 50 else "simple",
    {
        "complex": "spawn_background",
        "simple": "merge_results"
    }
)

workflow.add_edge("spawn_background", "merge_results")
workflow.add_edge("merge_results", END)

# 编译并运行
app = workflow.compile()
result = await app.ainvoke({"page_path": "/src/views/Detail/index.vue"})
```

**状态机的优势**：

1. **可视化流程**
```
frontend_analysis
       ↓
backend_dispatch
       ↓
backend_trace ──→ complexity_check
       ↓                    ↓
       ↓              [复杂度 > 50?]
       ↓                    ↓
       ↓              spawn_background
       ↓                    ↓
       └──────→ merge_results
                     ↓
                    END
```

2. **支持并行**
```python
# 并行追踪多个 API
workflow.add_node("parallel_trace", lambda state: {
    "results": await asyncio.gather(*[
        backend_agent.trace(api) for api in state["apis"]
    ])
})
```

3. **支持循环**
```python
# 递归追踪 Service（最多 3 层）
workflow.add_conditional_edges(
    "trace_service",
    lambda state: "continue" if state["depth"] < 3 else "stop",
    {
        "continue": "trace_service",  # 循环
        "stop": "merge_results"
    }
)
```

4. **支持人工介入**
```python
# 遇到不确定的情况，暂停等待用户确认
workflow.add_node("human_review", interrupt_for_human)
```


### 建议 3：设计"流式交互与探索过程的可视化" (UX for Agentic Product)

**核心观点**：
> 既然这是一个真正的 Agent 产品，它探索的过程（可能长达 1-3 分钟）不能是一个无聊的 Loading 菊花图。

**向 Cursor / Devin 学习**

用户应该能实时看到 Agent 的思考过程和动作：

```
🟢 [前端 Agent] 正在解析 Detail.vue...
   ✓ 找到 3 个搜索字段
   ✓ 找到 8 个表格列
   ✓ 找到 5 个操作按钮
   ✓ 提取到 3 个 API 调用

🔵 [主控 Agent] 正在分发追溯任务...
   → 任务 1: GET /api/detail/info
   → 任务 2: POST /api/detail/update
   → 任务 3: POST /api/detail/delete

🟡 [后端 Agent #1] 追踪 GET /api/detail/info
   🔧 调用工具：search_controller_by_url("GET", "/api/detail/info")
   ✓ 命中 DetailController.getDetailInfo()
   🔧 调用工具：read_method_source("DetailController", "getDetailInfo")
   ✓ 读取方法源码（45 行）
   🔧 调用工具：extract_service_calls(source)
   ✓ 发现调用 detailService.getInfo()
   🔧 调用工具：read_method_source("DetailService", "getInfo")
   ✓ 读取方法源码（120 行）
   
🔴 [后端 Agent #1] ⚠️ 警告：发现复杂逻辑
   复杂度评分：85/100
   原因：方法行数 > 100，包含外部 HTTP 调用
   决策：触发后台深度分析任务 #124
   主流程继续前进 ✓

🟣 [后台任务 #124] 深度分析 DetailService.getInfo()
   正在分析业务流程...
   正在查找相关数据库表...
   正在查找相关枚举类...
   预计耗时：30 秒

🟢 [后端 Agent #2] 追踪 POST /api/detail/update
   ...

🔵 [主控 Agent] 汇总结果中...
   ✓ 前端分析完成
   ✓ 后端追踪完成（3/3）
   ⏳ 后台任务进行中（1/1）

🟣 [后台任务 #124] 完成！
   生成详细文档：DetailService.getInfo() 深度分析报告
   已合并到最终结果

✅ [主控 Agent] 分析完成！
   总耗时：2 分 15 秒
   生成文档：Detail 页面数据解析报告
```


**前端实现方案**：

```javascript
// 1. SSE 流式接收 Agent 事件
const eventSource = new EventSource('/api/agent/analyze/stream');

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
        case 'agent_start':
            addAgentLog(data.agent, data.action, 'running');
            break;
            
        case 'tool_call':
            addToolCall(data.agent, data.tool, data.args);
            break;
            
        case 'tool_result':
            updateToolResult(data.tool_id, data.result);
            break;
            
        case 'agent_decision':
            addDecision(data.agent, data.decision, data.reason);
            break;
            
        case 'background_task_spawn':
            addBackgroundTask(data.task_id, data.description);
            break;
            
        case 'background_task_complete':
            updateBackgroundTask(data.task_id, 'completed');
            break;
            
        case 'blackboard_update':
            updateBlackboard(data.updates);
            break;
            
        case 'complete':
            showFinalResult(data.result);
            break;
    }
};

// 2. 可视化组件
class AgentWorkflowViewer {
    renderAgentTimeline() {
        // 时间线展示每个 Agent 的工作进度
    }
    
    renderToolCalls() {
        // 展示工具调用的参数和结果
    }
    
    renderBlackboard() {
        // 实时展示黑板状态的变化
    }
    
    renderBackgroundTasks() {
        // 展示后台任务的进度
    }
}
```

**UI 设计要点**：

1. **分层展示**
   - 顶层：主控 Agent 的全局进度
   - 中层：各个专家 Agent 的并行工作
   - 底层：工具调用的详细信息

2. **颜色编码**
   - 🟢 绿色：正常进行中
   - 🔵 蓝色：任务分发
   - 🟡 黄色：工具调用
   - 🔴 红色：警告/复杂逻辑
   - 🟣 紫色：后台任务

3. **可折叠**
   - 默认只显示关键步骤
   - 点击展开查看详细的工具调用

4. **实时更新**
   - 自动滚动到最新内容
   - 高亮最新更新的部分

5. **进度指示**
   - 显示总体进度百分比
   - 显示每个子任务的状态


### 建议 4：建立"记忆与图谱积累" (Memory & Knowledge Graph)

**核心观点**：
> 当 Agent 彻底分析完 DetailController 之后，这份成果不要随风飘散。

**为什么需要记忆？**

1. **避免重复分析**
   - 多个页面可能调用同一个 Service
   - 第二次遇到时直接引用，不需要重新分析

2. **经验积累**
   - Agent 分析的越多，知识库越丰富
   - 越用越聪明

3. **跨页面关联**
   - 发现不同页面之间的共同依赖
   - 构建完整的系统知识图谱

**技术方案**：

#### 方案 A：向量数据库（推荐用于文本搜索）

```python
from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings

# 存储分析结果
def store_analysis_result(result: AnalysisResult):
    embedding = OpenAIEmbeddings()
    vectorstore = Chroma(persist_directory="./.memory")
    
    # 存储方法分析
    vectorstore.add_texts(
        texts=[result.summary],
        metadatas=[{
            "type": "method_analysis",
            "class_name": result.class_name,
            "method_name": result.method_name,
            "complexity": result.complexity,
            "full_result": result.model_dump_json()
        }]
    )

# 查询记忆
@tool
def check_memory(method_signature: str) -> AnalysisResult | None:
    """查询是否已经分析过这个方法"""
    vectorstore = Chroma(persist_directory="./.memory")
    
    results = vectorstore.similarity_search(
        method_signature,
        k=1,
        filter={"type": "method_analysis"}
    )
    
    if results and results[0].metadata["similarity"] > 0.9:
        return AnalysisResult.model_validate_json(
            results[0].metadata["full_result"]
        )
    
    return None
```

#### 方案 B：图数据库（推荐用于关系分析）

```python
from neo4j import GraphDatabase

# 构建知识图谱
class KnowledgeGraph:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            "bolt://localhost:7687",
            auth=("neo4j", "password")
        )
    
    def add_page_analysis(self, page: str, apis: list[str]):
        """添加页面和 API 的关系"""
        with self.driver.session() as session:
            session.run("""
                MERGE (p:Page {path: $page})
                FOREACH (api IN $apis |
                    MERGE (a:API {url: api})
                    MERGE (p)-[:CALLS]->(a)
                )
            """, page=page, apis=apis)
    
    def add_api_implementation(self, api: str, controller: str, service: str):
        """添加 API 实现链路"""
        with self.driver.session() as session:
            session.run("""
                MERGE (a:API {url: $api})
                MERGE (c:Controller {name: $controller})
                MERGE (s:Service {name: $service})
                MERGE (a)-[:IMPLEMENTED_BY]->(c)
                MERGE (c)-[:CALLS]->(s)
            """, api=api, controller=controller, service=service)
    
    def find_pages_using_service(self, service: str) -> list[str]:
        """查找所有使用某个 Service 的页面"""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (p:Page)-[:CALLS]->(:API)-[:IMPLEMENTED_BY]->
                      (:Controller)-[:CALLS]->(s:Service {name: $service})
                RETURN DISTINCT p.path
            """, service=service)
            return [record["p.path"] for record in result]
```


**记忆工具集**：

```python
@tool
def check_method_memory(class_name: str, method_name: str) -> MethodAnalysis | None:
    """检查是否已经分析过这个方法"""
    
@tool
def store_method_analysis(analysis: MethodAnalysis):
    """存储方法分析结果到记忆库"""
    
@tool
def find_similar_methods(method_signature: str, limit: int = 5) -> list[MethodAnalysis]:
    """查找相似的方法分析"""
    
@tool
def get_service_usage_graph(service_name: str) -> ServiceUsageGraph:
    """获取 Service 的使用关系图"""
    
@tool
def find_common_dependencies(pages: list[str]) -> list[Dependency]:
    """查找多个页面的共同依赖"""
```

**Agent 使用记忆的流程**：

```python
async def trace_service_with_memory(service_name: str, method_name: str):
    # 1. 先查记忆
    cached = await check_method_memory(service_name, method_name)
    
    if cached:
        log(f"✓ 从记忆库加载：{service_name}.{method_name}")
        log(f"  上次分析时间：{cached.analyzed_at}")
        log(f"  复杂度：{cached.complexity}")
        return cached
    
    # 2. 记忆中没有，进行分析
    log(f"⚠️ 记忆库中未找到，开始新分析")
    analysis = await analyze_method(service_name, method_name)
    
    # 3. 存储到记忆库
    await store_method_analysis(analysis)
    log(f"✓ 已存储到记忆库，下次可复用")
    
    return analysis
```

**记忆的好处**：

1. **性能提升**
   - 第一次分析：2 分钟
   - 第二次分析：5 秒（从记忆加载）

2. **一致性**
   - 同一个方法的分析结果保持一致
   - 避免不同 Agent 得出不同结论

3. **知识积累**
   - 分析 10 个页面后，记忆库包含 50+ 方法
   - 分析第 11 个页面时，可能 80% 的方法都能从记忆加载

4. **系统洞察**
   - 通过图谱发现系统的核心依赖
   - 识别高频使用的 Service
   - 发现潜在的架构问题


## 🚀 MVP 实施计划

### 第一期 MVP：单 Agent + 强工具（2-3 周）

**目标**：验证"自主探索"的可行性

**实施内容**：

1. **开发 3 个核心工具**（1 周）
   - ✅ `search_controller_by_url` - 根据 URL 找 Controller
   - ✅ `get_method_source` - 精准提取方法源码
   - ✅ `extract_service_calls` - 提取 Service 调用

2. **实现单个探索 Agent**（1 周）
   ```python
   system_prompt = """
   你是一个代码考古学家。
   
   任务：分析 Detail.vue 页面绑定的所有 API 的底层来源。
   
   工具：
   - search_controller_by_url: 根据 URL 找到 Controller
   - get_method_source: 读取方法源码
   - extract_service_calls: 提取 Service 调用
   
   规则：
   1. 自主决定使用哪些工具
   2. 遇到复杂逻辑（> 100 行）直接打标记跳过
   3. 最多追踪 2 层（Controller → Service）
   4. 输出结构化 JSON
   
   开始分析！
   """
   ```

3. **观察和优化**（1 周）
   - 观察 Agent 的工具调用序列
   - 记录成功案例和失败案例
   - 优化 Prompt 和工具

**验收标准**：
- ✅ Agent 能自主调用工具
- ✅ 能正确追踪 80% 的简单 API
- ✅ 能识别复杂逻辑并跳过
- ✅ 输出结构化 JSON


### 第二期：多 Agent 协同（3-4 周）

**目标**：实现虚拟研发团队

**实施内容**：

1. **引入 LangGraph**（1 周）
   - 搭建状态机框架
   - 定义黑板状态
   - 实现基本的流程编排

2. **拆分 Agent 角色**（1 周）
   - 主控 Agent
   - 前端解析 Agent
   - 后端溯源 Agent

3. **实现并行和条件分支**（1 周）
   - 并行追踪多个 API
   - 根据复杂度决定是否深入
   - 实现循环和跳出

4. **流式可视化**（1 周）
   - SSE 实时推送
   - 前端时间线展示
   - 工具调用可视化

**验收标准**：
- ✅ 3 个 Agent 协同工作
- ✅ 支持并行追踪
- ✅ 用户能看到实时进度
- ✅ 能处理 90% 的常见页面

### 第三期：深度分析和记忆（3-4 周）

**目标**：处理复杂场景，积累知识

**实施内容**：

1. **深度逻辑专家 Agent**（2 周）
   - 后台任务机制
   - 复杂逻辑分析
   - 异步结果合并

2. **记忆系统**（2 周）
   - 向量数据库集成
   - 记忆查询工具
   - 经验复用

**验收标准**：
- ✅ 能处理复杂的 Service 方法
- ✅ 后台任务不阻塞主流程
- ✅ 第二次分析速度提升 80%
- ✅ 能处理 95% 的页面


## 📊 预期效果对比

### V1 vs V2

| 维度 | V1（当前） | V2（目标） |
|------|-----------|-----------|
| **分析方式** | 一次性 LLM 调用 | 多 Agent 自主探索 |
| **处理复杂度** | 简单页面 OK，复杂页面失败 | 能处理各种复杂度 |
| **分析深度** | 固定 2 层 | 自适应深度 |
| **并行能力** | 无 | 支持并行追踪 |
| **用户体验** | 黑盒等待 | 实时可见过程 |
| **经验积累** | 无 | 越用越聪明 |
| **准确率** | 70-80% | 90-95% |
| **分析时间** | 30 秒 - 2 分钟 | 1-3 分钟（首次），5-30 秒（复用） |

### 具体案例

**案例 1：简单页面（用户列表）**

V1：
```
✓ 扫描前端：10 秒
✓ LLM 分析：20 秒
✓ 总耗时：30 秒
✓ 准确率：85%
```

V2：
```
✓ 前端 Agent：5 秒
✓ 后端 Agent（并行 3 个 API）：15 秒
✓ 汇总结果：2 秒
✓ 总耗时：22 秒
✓ 准确率：95%
✓ 存储到记忆库
```

**案例 2：复杂页面（订单详情）**

V1：
```
✗ 扫描前端：10 秒
✗ LLM 分析：超时/失败
✗ 总耗时：N/A
✗ 准确率：N/A
```

V2：
```
✓ 前端 Agent：8 秒
✓ 后端 Agent（并行 5 个 API）：30 秒
✓ 发现复杂逻辑，触发后台任务：1 秒
✓ 主流程完成：39 秒
✓ 后台任务完成：+2 分钟
✓ 总耗时：2 分 39 秒
✓ 准确率：92%
✓ 存储到记忆库
```

**案例 3：第二次分析同类页面**

V2（有记忆）：
```
✓ 前端 Agent：5 秒
✓ 后端 Agent（80% 从记忆加载）：8 秒
✓ 汇总结果：2 秒
✓ 总耗时：15 秒
✓ 准确率：95%
```


## 🎯 关键成功因素

### 1. 工具质量是核心

**80% 的成功取决于工具的质量**

- ❌ 弱工具：`read_file(path)` → 返回 5000 行代码
- ✅ 强工具：`get_method_source(class, method)` → 返回 50 行精准代码

**投入建议**：
- 工具开发：50% 时间
- Agent 编排：30% 时间
- UI 可视化：20% 时间

### 2. 从简单到复杂

**不要一开始就做完美的系统**

阶段 1：单 Agent + 3 个工具
- 验证可行性
- 观察 Agent 行为
- 积累经验

阶段 2：多 Agent + 状态机
- 引入协同
- 实现并行
- 优化流程

阶段 3：深度分析 + 记忆
- 处理复杂场景
- 积累知识
- 持续优化

### 3. 可观测性至关重要

**用户必须能看到 Agent 在做什么**

- 实时展示思考过程
- 可视化工具调用
- 显示决策理由
- 展示后台任务进度

这不仅是 UX 问题，更是信任问题。

### 4. 持续优化 Prompt

**Agent 的行为由 Prompt 决定**

- 记录所有成功和失败案例
- 分析 Agent 的决策过程
- 不断优化 System Prompt
- A/B 测试不同的 Prompt

### 5. 建立评估体系

**如何知道 Agent 做得好不好？**

评估维度：
- 准确率：分析结果是否正确
- 完整性：是否遗漏重要信息
- 效率：耗时是否合理
- 稳定性：是否经常失败

建立测试集：
- 收集 50+ 真实页面
- 人工标注正确答案
- 定期回归测试
- 追踪准确率变化


## 💡 技术选型建议

### 核心框架

| 组件 | 推荐方案 | 备选方案 | 理由 |
|------|---------|---------|------|
| **状态机** | LangGraph | AutoGen, CrewAI | 灵活、可视化、社区活跃 |
| **LLM** | DeepSeek | GPT-4, Claude | 性价比高、中文友好 |
| **向量数据库** | Chroma | Pinecone, Weaviate | 轻量、易部署 |
| **图数据库** | Neo4j | ArangoDB | 成熟、查询语言强大 |
| **AST 解析** | tree-sitter | 自研正则 | 跨语言、准确 |

### 工具开发技术栈

**前端工具（Vue/React）**
```python
# 推荐：tree-sitter
from tree_sitter import Language, Parser

# 解析 Vue 文件
parser = Parser()
parser.set_language(Language('build/languages.so', 'vue'))
tree = parser.parse(source_code.encode())

# 遍历 AST
def extract_api_calls(node):
    if node.type == 'call_expression':
        # 提取 API 调用
        ...
```

**后端工具（Java/Spring Boot）**
```python
# 推荐：javalang
import javalang

# 解析 Java 文件
tree = javalang.parse.parse(java_source)

# 查找 Controller 注解
for path, node in tree.filter(javalang.tree.ClassDeclaration):
    for annotation in node.annotations:
        if annotation.name == 'RestController':
            # 找到 Controller
            ...
```

### 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户浏览器                            │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI 服务（Python）                     │
│  - API 端点                                                  │
│  - SSE 流式推送                                              │
│  - Agent 编排                                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      LangGraph 状态机                         │
│  - 主控 Agent                                                │
│  - 前端解析 Agent                                            │
│  - 后端溯源 Agent                                            │
│  - 深度逻辑 Agent                                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  DeepSeek    │   Chroma     │    Neo4j     │  文件系统    │
│  LLM API     │  向量数据库   │  图数据库     │  代码仓库    │
└──────────────┴──────────────┴──────────────┴──────────────┘
```


## 📝 详细实现指南

### 阶段 1：核心工具开发

#### 工具 1：search_controller_by_url

**功能**：根据 HTTP 方法和 URL 精准定位 Controller 方法

**实现思路**：
```python
import javalang
from pathlib import Path
from typing import Optional

class ControllerInfo(BaseModel):
    class_name: str
    method_name: str
    file_path: str
    method_signature: str
    line_number: int
    annotations: list[str]

@tool
def search_controller_by_url(method: str, url: str) -> Optional[ControllerInfo]:
    """
    根据 HTTP 方法和 URL 查找对应的 Controller 方法
    
    Args:
        method: HTTP 方法，如 "GET", "POST"
        url: API 路径，如 "/api/detail/info"
    
    Returns:
        ControllerInfo 或 None
    
    示例：
        search_controller_by_url("GET", "/api/detail/info")
        # 返回：DetailController.getDetailInfo()
    """
    backend_root = Path(settings.BACKEND_PATH)
    
    # 1. 遍历所有 Java 文件
    for java_file in backend_root.rglob("*.java"):
        try:
            source = java_file.read_text(encoding="utf-8")
            tree = javalang.parse.parse(source)
            
            # 2. 查找 @RestController 或 @Controller 类
            for path, node in tree.filter(javalang.tree.ClassDeclaration):
                if not has_controller_annotation(node):
                    continue
                
                # 3. 获取类级别的 @RequestMapping
                class_base_path = get_request_mapping(node.annotations)
                
                # 4. 遍历方法
                for method_node in node.methods:
                    # 5. 检查方法的 @RequestMapping/@GetMapping 等
                    method_path = get_method_mapping(method_node.annotations)
                    full_path = normalize_path(class_base_path + method_path)
                    
                    # 6. 匹配 URL 和 HTTP 方法
                    if matches_route(full_path, url) and matches_method(method_node, method):
                        return ControllerInfo(
                            class_name=node.name,
                            method_name=method_node.name,
                            file_path=str(java_file),
                            method_signature=get_signature(method_node),
                            line_number=method_node.position.line,
                            annotations=[a.name for a in method_node.annotations]
                        )
        except Exception as e:
            logger.warning(f"Failed to parse {java_file}: {e}")
            continue
    
    return None

def has_controller_annotation(class_node) -> bool:
    """检查类是否有 Controller 注解"""
    controller_annotations = {"RestController", "Controller"}
    return any(
        a.name in controller_annotations 
        for a in class_node.annotations
    )

def get_request_mapping(annotations) -> str:
    """提取 @RequestMapping 的路径"""
    for annotation in annotations:
        if annotation.name == "RequestMapping":
            # 解析注解参数
            if annotation.element:
                if isinstance(annotation.element, list):
                    return annotation.element[0].value.strip('"')
                return annotation.element.value.strip('"')
    return ""

def matches_route(pattern: str, url: str) -> bool:
    """匹配路由模式（支持路径变量）"""
    # /api/detail/{id} 匹配 /api/detail/123
    import re
    regex_pattern = re.sub(r'\{[^}]+\}', r'[^/]+', pattern)
    return re.fullmatch(regex_pattern, url) is not None
```

**测试用例**：
```python
def test_search_controller_by_url():
    # 测试简单路由
    result = search_controller_by_url("GET", "/api/detail/info")
    assert result.class_name == "DetailController"
    assert result.method_name == "getDetailInfo"
    
    # 测试路径变量
    result = search_controller_by_url("GET", "/api/detail/123")
    assert result.class_name == "DetailController"
    assert result.method_name == "getDetailById"
    
    # 测试不存在的路由
    result = search_controller_by_url("GET", "/api/nonexistent")
    assert result is None
```


#### 工具 2：get_method_source

**功能**：精准提取指定方法的源码（不包含类的其他部分）

**实现思路**：
```python
class MethodSource(BaseModel):
    class_name: str
    method_name: str
    source_code: str
    line_start: int
    line_end: int
    parameters: list[str]
    return_type: str
    annotations: list[str]

@tool
def get_method_source(class_name: str, method_name: str) -> Optional[MethodSource]:
    """
    精准提取方法源码
    
    Args:
        class_name: 类名，如 "DetailController"
        method_name: 方法名，如 "getDetailInfo"
    
    Returns:
        MethodSource 或 None
    
    示例：
        get_method_source("DetailController", "getDetailInfo")
        # 返回该方法的完整源码（45 行）
    """
    backend_root = Path(settings.BACKEND_PATH)
    
    # 1. 查找类文件
    class_file = find_class_file(backend_root, class_name)
    if not class_file:
        return None
    
    # 2. 读取源码
    source = class_file.read_text(encoding="utf-8")
    lines = source.split('\n')
    
    # 3. 解析 AST
    tree = javalang.parse.parse(source)
    
    # 4. 查找方法
    for path, node in tree.filter(javalang.tree.MethodDeclaration):
        if node.name == method_name:
            # 5. 提取方法源码（包含注解和方法体）
            start_line = node.position.line - 1
            
            # 查找方法开始位置（包含注解）
            for i in range(start_line - 1, -1, -1):
                if lines[i].strip().startswith('@'):
                    start_line = i
                else:
                    break
            
            # 查找方法结束位置（匹配大括号）
            end_line = find_method_end(lines, node.position.line - 1)
            
            # 6. 提取源码
            method_source = '\n'.join(lines[start_line:end_line + 1])
            
            return MethodSource(
                class_name=class_name,
                method_name=method_name,
                source_code=method_source,
                line_start=start_line + 1,
                line_end=end_line + 1,
                parameters=[p.name for p in node.parameters],
                return_type=node.return_type.name if node.return_type else "void",
                annotations=[a.name for a in node.annotations]
            )
    
    return None

def find_method_end(lines: list[str], start: int) -> int:
    """查找方法结束位置（匹配大括号）"""
    depth = 0
    in_method = False
    
    for i in range(start, len(lines)):
        line = lines[i]
        
        # 计算大括号深度
        for char in line:
            if char == '{':
                depth += 1
                in_method = True
            elif char == '}':
                depth -= 1
                if in_method and depth == 0:
                    return i
    
    return len(lines) - 1
```

**优化：缓存机制**
```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_method_source_cached(class_name: str, method_name: str) -> Optional[MethodSource]:
    """带缓存的方法源码提取"""
    return get_method_source(class_name, method_name)
```


#### 工具 3：extract_service_calls

**功能**：从方法源码中提取 Service 调用

**实现思路**：
```python
class ServiceCall(BaseModel):
    service_name: str
    method_name: str
    variable_name: str
    line_number: int

@tool
def extract_service_calls(method_source: str) -> list[ServiceCall]:
    """
    从方法源码中提取 Service 调用
    
    Args:
        method_source: 方法源码
    
    Returns:
        Service 调用列表
    
    示例：
        extract_service_calls(source)
        # 返回：[
        #   ServiceCall(service_name="DetailService", method_name="getInfo", ...),
        #   ServiceCall(service_name="UserService", method_name="checkAuth", ...)
        # ]
    """
    calls = []
    lines = method_source.split('\n')
    
    # 正则模式：匹配 xxxService.methodName()
    pattern = r'(\w+)(Service|Mapper)\.(\w+)\s*\('
    
    for i, line in enumerate(lines):
        matches = re.finditer(pattern, line)
        for match in matches:
            variable_name = match.group(1)
            service_type = match.group(2)
            method_name = match.group(3)
            
            # 推断 Service 类名
            service_name = f"{variable_name[0].upper()}{variable_name[1:]}{service_type}"
            
            calls.append(ServiceCall(
                service_name=service_name,
                method_name=method_name,
                variable_name=variable_name,
                line_number=i + 1
            ))
    
    return calls
```

#### 工具 4：analyze_method_complexity

**功能**：评估方法复杂度

**实现思路**：
```python
class ComplexityMetrics(BaseModel):
    score: int  # 0-100
    lines_of_code: int
    cyclomatic_complexity: int
    num_conditions: int
    num_loops: int
    num_external_calls: int
    has_exception_handling: bool
    has_async_calls: bool
    complexity_level: str  # "simple", "medium", "complex"

@tool
def analyze_method_complexity(method_source: str) -> ComplexityMetrics:
    """
    评估方法复杂度
    
    Args:
        method_source: 方法源码
    
    Returns:
        复杂度指标
    """
    lines = [l for l in method_source.split('\n') if l.strip()]
    loc = len(lines)
    
    # 统计各种复杂度指标
    num_conditions = count_patterns(method_source, [r'\bif\b', r'\bswitch\b', r'\?'])
    num_loops = count_patterns(method_source, [r'\bfor\b', r'\bwhile\b'])
    num_external_calls = count_patterns(method_source, [
        r'http\.',
        r'RestTemplate',
        r'@FeignClient',
        r'\.call\(',
        r'\.execute\('
    ])
    has_exception = 'try' in method_source or 'catch' in method_source
    has_async = '@Async' in method_source or 'CompletableFuture' in method_source
    
    # 计算圈复杂度（简化版）
    cyclomatic = 1 + num_conditions + num_loops
    
    # 计算综合得分
    score = min(100, (
        loc * 0.3 +
        cyclomatic * 5 +
        num_external_calls * 10 +
        (20 if has_async else 0)
    ))
    
    # 判断复杂度等级
    if score < 30:
        level = "simple"
    elif score < 60:
        level = "medium"
    else:
        level = "complex"
    
    return ComplexityMetrics(
        score=int(score),
        lines_of_code=loc,
        cyclomatic_complexity=cyclomatic,
        num_conditions=num_conditions,
        num_loops=num_loops,
        num_external_calls=num_external_calls,
        has_exception_handling=has_exception,
        has_async_calls=has_async,
        complexity_level=level
    )

def count_patterns(text: str, patterns: list[str]) -> int:
    """统计模式出现次数"""
    count = 0
    for pattern in patterns:
        count += len(re.findall(pattern, text, re.IGNORECASE))
    return count
```


### 阶段 2：单 Agent 探索实现

#### Agent Prompt 设计

```python
BACKEND_DETECTIVE_SYSTEM_PROMPT = """
你是一个专业的后端代码侦探（Backend Detective）。

## 你的任务
分析给定的 API 端点，追踪其完整的实现链路。

## 可用工具
1. search_controller_by_url(method: str, url: str)
   - 根据 HTTP 方法和 URL 找到对应的 Controller 方法
   
2. get_method_source(class_name: str, method_name: str)
   - 获取指定方法的完整源码
   
3. extract_service_calls(method_source: str)
   - 从方法源码中提取 Service 调用
   
4. analyze_method_complexity(method_source: str)
   - 评估方法的复杂度

## 工作流程
1. 使用 search_controller_by_url 找到 Controller 方法
2. 使用 get_method_source 读取 Controller 方法源码
3. 使用 extract_service_calls 提取 Service 调用
4. 对每个 Service 调用：
   a. 使用 get_method_source 读取 Service 方法源码
   b. 使用 analyze_method_complexity 评估复杂度
   c. 如果复杂度 > 60，标记为"需要深度分析"，不要继续深入
   d. 如果复杂度 <= 60，可以继续提取下一层调用（最多 2 层）

## 输出格式
以 JSON 格式输出分析结果：
{
  "api": "GET /api/detail/info",
  "controller": {
    "class": "DetailController",
    "method": "getDetailInfo",
    "file": "/path/to/DetailController.java",
    "lines": "45-67"
  },
  "service_chain": [
    {
      "class": "DetailService",
      "method": "getInfo",
      "complexity": 35,
      "summary": "简单查询，直接调用 Mapper"
    },
    {
      "class": "DetailService",
      "method": "syncWithBank",
      "complexity": 85,
      "summary": "复杂逻辑，包含外部 HTTP 调用",
      "needs_deep_analysis": true
    }
  ],
  "summary": "该 API 主要负责获取详情信息，其中 syncWithBank 方法较复杂，建议深度分析"
}

## 重要规则
1. 自主决定调用哪些工具，按需探索
2. 遇到复杂逻辑（complexity > 60）立即停止，不要陷入无限递归
3. 最多追踪 2 层（Controller → Service → Mapper）
4. 如果某个方法超过 100 行，直接标记为复杂，不要尝试理解全部逻辑
5. 专注于主流程，忽略异常处理和日志代码

现在开始分析！
"""
```

#### Agent 实现

```python
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain_openai import ChatOpenAI

class BackendDetectiveAgent:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="deepseek-chat",
            temperature=0,
            base_url=settings.DEEPSEEK_BASE_URL,
            api_key=settings.DEEPSEEK_API_KEY
        )
        
        self.tools = [
            search_controller_by_url,
            get_method_source,
            extract_service_calls,
            analyze_method_complexity
        ]
        
        self.agent = create_openai_functions_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=BACKEND_DETECTIVE_SYSTEM_PROMPT
        )
        
        self.executor = AgentExecutor(
            agent=self.agent,
            tools=self.tools,
            verbose=True,
            max_iterations=15,  # 限制最大迭代次数
            return_intermediate_steps=True
        )
    
    async def trace_api(self, method: str, url: str) -> dict:
        """追踪 API 实现"""
        result = await self.executor.ainvoke({
            "input": f"请分析 API: {method} {url}"
        })
        
        return {
            "output": result["output"],
            "steps": result["intermediate_steps"],
            "tool_calls": len(result["intermediate_steps"])
        }
```


### 阶段 3：LangGraph 状态机实现

#### 状态定义

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
import operator

class AnalysisState(TypedDict):
    # 输入
    page_path: str
    project_config: dict
    
    # 黑板状态
    blackboard: dict
    
    # 前端分析结果
    frontend_result: dict | None
    
    # 后端任务
    backend_tasks: Annotated[list[dict], operator.add]
    backend_results: Annotated[list[dict], operator.add]
    
    # 后台任务
    background_tasks: Annotated[list[dict], operator.add]
    
    # 状态标记
    status: str
    error: str | None
    
    # 追踪信息
    trace_steps: Annotated[list[dict], operator.add]
```

#### 节点实现

```python
async def frontend_analysis_node(state: AnalysisState) -> AnalysisState:
    """前端分析节点"""
    log_step(state, "frontend_analysis", "开始前端分析")
    
    # 调用前端解析 Agent
    frontend_agent = FrontendTrackerAgent()
    result = await frontend_agent.analyze(state["page_path"])
    
    # 更新状态
    state["frontend_result"] = result
    state["blackboard"]["search_fields"] = result["search_fields"]
    state["blackboard"]["display_fields"] = result["display_fields"]
    state["blackboard"]["actions"] = result["actions"]
    
    # 生成后端任务
    for api in result["api_calls"]:
        state["backend_tasks"].append({
            "api": api,
            "status": "pending"
        })
    
    log_step(state, "frontend_analysis", f"完成，发现 {len(result['api_calls'])} 个 API")
    
    return state

async def backend_dispatch_node(state: AnalysisState) -> AnalysisState:
    """后端任务分发节点"""
    log_step(state, "backend_dispatch", f"分发 {len(state['backend_tasks'])} 个后端追踪任务")
    
    # 标记任务为进行中
    for task in state["backend_tasks"]:
        task["status"] = "running"
    
    return state

async def backend_trace_node(state: AnalysisState) -> AnalysisState:
    """后端追踪节点（并行执行）"""
    backend_agent = BackendDetectiveAgent()
    
    # 并行追踪所有 API
    tasks = [
        backend_agent.trace_api(task["api"]["method"], task["api"]["url"])
        for task in state["backend_tasks"]
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 处理结果
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            log_step(state, "backend_trace", f"任务 {i} 失败: {result}")
            state["backend_results"].append({
                "task": state["backend_tasks"][i],
                "status": "failed",
                "error": str(result)
            })
        else:
            log_step(state, "backend_trace", f"任务 {i} 完成")
            state["backend_results"].append({
                "task": state["backend_tasks"][i],
                "status": "completed",
                "result": result
            })
    
    return state

async def complexity_check_node(state: AnalysisState) -> AnalysisState:
    """复杂度检查节点"""
    complex_methods = []
    
    for result in state["backend_results"]:
        if result["status"] != "completed":
            continue
        
        # 检查是否有需要深度分析的方法
        for service in result["result"].get("service_chain", []):
            if service.get("needs_deep_analysis"):
                complex_methods.append({
                    "api": result["task"]["api"],
                    "service": service
                })
    
    if complex_methods:
        log_step(state, "complexity_check", f"发现 {len(complex_methods)} 个复杂方法")
        state["status"] = "has_complex_logic"
    else:
        log_step(state, "complexity_check", "所有方法都较简单")
        state["status"] = "simple"
    
    return state

async def spawn_background_node(state: AnalysisState) -> AnalysisState:
    """创建后台任务节点"""
    for result in state["backend_results"]:
        if result["status"] != "completed":
            continue
        
        for service in result["result"].get("service_chain", []):
            if service.get("needs_deep_analysis"):
                task_id = str(uuid4())
                
                # 创建后台任务
                state["background_tasks"].append({
                    "task_id": task_id,
                    "service": service,
                    "status": "spawned"
                })
                
                log_step(state, "spawn_background", f"创建后台任务 {task_id}")
                
                # 异步启动深度分析（不等待）
                asyncio.create_task(
                    deep_logic_analysis(task_id, service, state)
                )
    
    return state

async def merge_results_node(state: AnalysisState) -> AnalysisState:
    """合并结果节点"""
    log_step(state, "merge_results", "汇总所有分析结果")
    
    # 合并前端和后端结果到黑板
    for result in state["backend_results"]:
        if result["status"] == "completed":
            # 更新黑板状态
            api = result["task"]["api"]
            state["blackboard"]["apis"] = state["blackboard"].get("apis", [])
            state["blackboard"]["apis"].append({
                "url": api["url"],
                "method": api["method"],
                "controller": result["result"]["controller"],
                "service_chain": result["result"]["service_chain"]
            })
    
    state["status"] = "completed"
    log_step(state, "merge_results", "分析完成")
    
    return state

def log_step(state: AnalysisState, node: str, message: str):
    """记录步骤"""
    state["trace_steps"].append({
        "node": node,
        "message": message,
        "timestamp": datetime.now(UTC).isoformat()
    })
```


#### 构建工作流图

```python
def build_analysis_workflow() -> StateGraph:
    """构建分析工作流"""
    workflow = StateGraph(AnalysisState)
    
    # 添加节点
    workflow.add_node("frontend_analysis", frontend_analysis_node)
    workflow.add_node("backend_dispatch", backend_dispatch_node)
    workflow.add_node("backend_trace", backend_trace_node)
    workflow.add_node("complexity_check", complexity_check_node)
    workflow.add_node("spawn_background", spawn_background_node)
    workflow.add_node("merge_results", merge_results_node)
    
    # 设置入口
    workflow.set_entry_point("frontend_analysis")
    
    # 添加边
    workflow.add_edge("frontend_analysis", "backend_dispatch")
    workflow.add_edge("backend_dispatch", "backend_trace")
    workflow.add_edge("backend_trace", "complexity_check")
    
    # 条件边：根据复杂度决定是否创建后台任务
    workflow.add_conditional_edges(
        "complexity_check",
        lambda state: state["status"],
        {
            "has_complex_logic": "spawn_background",
            "simple": "merge_results"
        }
    )
    
    workflow.add_edge("spawn_background", "merge_results")
    workflow.add_edge("merge_results", END)
    
    return workflow.compile()

# 使用示例
async def analyze_page(page_path: str, project_config: dict):
    """分析页面"""
    workflow = build_analysis_workflow()
    
    initial_state = {
        "page_path": page_path,
        "project_config": project_config,
        "blackboard": {},
        "frontend_result": None,
        "backend_tasks": [],
        "backend_results": [],
        "background_tasks": [],
        "status": "running",
        "error": None,
        "trace_steps": []
    }
    
    # 执行工作流
    final_state = await workflow.ainvoke(initial_state)
    
    return {
        "blackboard": final_state["blackboard"],
        "trace": final_state["trace_steps"],
        "background_tasks": final_state["background_tasks"]
    }
```

#### 流式输出实现

```python
async def analyze_page_stream(page_path: str, project_config: dict):
    """流式分析页面"""
    workflow = build_analysis_workflow()
    
    initial_state = {
        "page_path": page_path,
        "project_config": project_config,
        "blackboard": {},
        "frontend_result": None,
        "backend_tasks": [],
        "backend_results": [],
        "background_tasks": [],
        "status": "running",
        "error": None,
        "trace_steps": []
    }
    
    # 流式执行
    async for event in workflow.astream(initial_state):
        # 发送事件到前端
        yield {
            "type": "node_update",
            "node": event.get("node"),
            "state": event.get("state"),
            "timestamp": datetime.now(UTC).isoformat()
        }
    
    # 发送完成事件
    yield {
        "type": "complete",
        "result": final_state["blackboard"],
        "timestamp": datetime.now(UTC).isoformat()
    }
```


## 🎓 最佳实践和经验总结

### 1. Prompt 工程技巧

#### 技巧 1：明确角色和职责
```python
# ❌ 模糊的角色定义
"你是一个 AI 助手，帮我分析代码"

# ✅ 清晰的角色定义
"你是一个专业的后端代码侦探（Backend Detective）。
你的专长是追踪 API 实现链路，从 Controller 到 Service 到 Mapper。
你擅长使用工具精准定位代码，而不是猜测。"
```

#### 技巧 2：提供具体的工作流程
```python
# ❌ 没有流程指导
"分析这个 API"

# ✅ 明确的步骤
"工作流程：
1. 使用 search_controller_by_url 找到 Controller
2. 使用 get_method_source 读取源码
3. 使用 extract_service_calls 提取调用
4. 评估复杂度，决定是否继续"
```

#### 技巧 3：设置明确的边界
```python
# ❌ 没有限制
"尽可能深入分析"

# ✅ 明确的限制
"重要规则：
- 最多追踪 2 层
- 复杂度 > 60 立即停止
- 超过 100 行的方法直接标记
- 不要陷入无限递归"
```

#### 技巧 4：要求结构化输出
```python
# ❌ 自由格式
"告诉我分析结果"

# ✅ JSON Schema
"以 JSON 格式输出：
{
  'api': string,
  'controller': {...},
  'service_chain': [...],
  'summary': string
}"
```

### 2. 工具设计原则

#### 原则 1：单一职责
```python
# ❌ 万能工具
@tool
def analyze_code(path: str, type: str, options: dict):
    """分析代码（做所有事情）"""
    ...

# ✅ 专注工具
@tool
def search_controller_by_url(method: str, url: str):
    """只做一件事：根据 URL 找 Controller"""
    ...
```

#### 原则 2：返回结构化数据
```python
# ❌ 返回纯文本
@tool
def get_method_info(class_name: str, method_name: str) -> str:
    return "DetailController.getInfo() at line 45, returns DetailDTO"

# ✅ 返回 Pydantic 模型
@tool
def get_method_info(class_name: str, method_name: str) -> MethodInfo:
    return MethodInfo(
        class_name="DetailController",
        method_name="getInfo",
        line_number=45,
        return_type="DetailDTO"
    )
```

#### 原则 3：提供清晰的文档
```python
@tool
def search_controller_by_url(method: str, url: str) -> Optional[ControllerInfo]:
    """
    根据 HTTP 方法和 URL 查找对应的 Controller 方法
    
    Args:
        method: HTTP 方法，如 "GET", "POST"
        url: API 路径，如 "/api/detail/info"
    
    Returns:
        ControllerInfo 或 None（未找到时）
    
    示例：
        search_controller_by_url("GET", "/api/detail/info")
        # 返回：DetailController.getDetailInfo()
    
    注意：
        - 支持路径变量，如 /api/detail/{id}
        - 大小写敏感
        - 会搜索所有 @RestController 和 @Controller 类
    """
    ...
```

### 3. 状态管理技巧

#### 技巧 1：使用 TypedDict 定义状态
```python
# ✅ 类型安全的状态定义
class AnalysisState(TypedDict):
    page_path: str
    blackboard: dict
    status: str
    # ... 其他字段
```

#### 技巧 2：使用 Annotated 处理列表累加
```python
from typing import Annotated
import operator

class State(TypedDict):
    # ✅ 自动累加，不会覆盖
    trace_steps: Annotated[list[dict], operator.add]
    
    # ❌ 会被覆盖
    # trace_steps: list[dict]
```

#### 技巧 3：保持状态不可变
```python
# ❌ 直接修改状态
def node(state):
    state["blackboard"]["field"] = "value"
    return state

# ✅ 返回新状态
def node(state):
    new_state = state.copy()
    new_state["blackboard"] = {
        **state["blackboard"],
        "field": "value"
    }
    return new_state
```


### 4. 性能优化策略

#### 策略 1：并行执行
```python
# ❌ 串行执行（慢）
for api in apis:
    result = await trace_api(api)
    results.append(result)

# ✅ 并行执行（快）
tasks = [trace_api(api) for api in apis]
results = await asyncio.gather(*tasks)
```

#### 策略 2：缓存机制
```python
from functools import lru_cache

# ✅ 缓存方法源码
@lru_cache(maxsize=1000)
def get_method_source_cached(class_name: str, method_name: str):
    return get_method_source(class_name, method_name)

# ✅ 缓存 Controller 映射
@lru_cache(maxsize=500)
def search_controller_cached(method: str, url: str):
    return search_controller_by_url(method, url)
```

#### 策略 3：懒加载
```python
# ✅ 只在需要时才深入分析
async def trace_service(service_name: str, method_name: str):
    # 先检查复杂度
    complexity = await check_complexity(service_name, method_name)
    
    if complexity > 60:
        # 复杂逻辑，创建后台任务
        return {"status": "deferred", "task_id": spawn_task()}
    else:
        # 简单逻辑，立即分析
        return await analyze_simple_method(service_name, method_name)
```

#### 策略 4：限流和超时
```python
from asyncio import Semaphore, wait_for

# ✅ 限制并发数
semaphore = Semaphore(5)  # 最多 5 个并发

async def trace_api_with_limit(api):
    async with semaphore:
        try:
            return await wait_for(trace_api(api), timeout=30)
        except asyncio.TimeoutError:
            return {"status": "timeout", "api": api}
```

### 5. 错误处理和容错

#### 策略 1：优雅降级
```python
async def trace_api(method: str, url: str):
    try:
        # 尝试完整分析
        return await full_analysis(method, url)
    except ControllerNotFound:
        # 降级：返回基本信息
        return {
            "status": "partial",
            "api": f"{method} {url}",
            "error": "Controller not found",
            "suggestion": "可能是动态路由或微服务"
        }
    except Exception as e:
        # 最低降级：返回错误
        return {
            "status": "failed",
            "api": f"{method} {url}",
            "error": str(e)
        }
```

#### 策略 2：重试机制
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def trace_api_with_retry(method: str, url: str):
    return await trace_api(method, url)
```

#### 策略 3：部分失败处理
```python
# ✅ 不因为一个失败而全部失败
results = await asyncio.gather(*tasks, return_exceptions=True)

for i, result in enumerate(results):
    if isinstance(result, Exception):
        logger.error(f"Task {i} failed: {result}")
        # 记录失败，但继续处理其他结果
    else:
        process_result(result)
```


## 📈 成功指标和评估

### 关键指标 (KPIs)

#### 1. 准确率指标
```python
# 定义评估标准
class AccuracyMetrics(BaseModel):
    # Controller 定位准确率
    controller_accuracy: float  # 目标：> 95%
    
    # Service 追踪准确率
    service_accuracy: float  # 目标：> 90%
    
    # 字段提取准确率
    field_accuracy: float  # 目标：> 85%
    
    # 整体准确率
    overall_accuracy: float  # 目标：> 90%

# 评估方法
def evaluate_accuracy(predictions: list, ground_truth: list) -> AccuracyMetrics:
    """评估分析准确率"""
    ...
```

#### 2. 性能指标
```python
class PerformanceMetrics(BaseModel):
    # 平均分析时间
    avg_analysis_time: float  # 目标：< 60 秒
    
    # P95 分析时间
    p95_analysis_time: float  # 目标：< 120 秒
    
    # 工具调用次数
    avg_tool_calls: int  # 目标：< 20
    
    # 缓存命中率
    cache_hit_rate: float  # 目标：> 60%
```

#### 3. 用户体验指标
```python
class UXMetrics(BaseModel):
    # 首次响应时间
    time_to_first_response: float  # 目标：< 5 秒
    
    # 流式更新频率
    update_frequency: float  # 目标：每 2 秒一次
    
    # 用户满意度
    user_satisfaction: float  # 目标：> 4.0/5.0
```

### 测试集构建

#### 1. 收集真实页面
```python
# 测试集结构
test_cases = [
    {
        "id": "case_001",
        "name": "简单列表页",
        "page_path": "/src/views/user/list.vue",
        "complexity": "simple",
        "expected": {
            "apis": [
                {"method": "GET", "url": "/api/user/list"},
                {"method": "POST", "url": "/api/user/create"}
            ],
            "controllers": ["UserController"],
            "services": ["UserService"]
        }
    },
    {
        "id": "case_002",
        "name": "复杂详情页",
        "page_path": "/src/views/order/detail.vue",
        "complexity": "complex",
        "expected": {
            "apis": [
                {"method": "GET", "url": "/api/order/{id}"},
                {"method": "POST", "url": "/api/order/update"},
                {"method": "POST", "url": "/api/order/cancel"}
            ],
            "controllers": ["OrderController"],
            "services": ["OrderService", "PaymentService", "LogisticsService"],
            "complex_methods": ["OrderService.syncWithBank"]
        }
    }
]
```

#### 2. 自动化测试
```python
async def run_test_suite(test_cases: list):
    """运行测试套件"""
    results = []
    
    for case in test_cases:
        print(f"Testing {case['name']}...")
        
        # 运行分析
        result = await analyze_page(case["page_path"], {})
        
        # 评估结果
        accuracy = evaluate_case(result, case["expected"])
        
        results.append({
            "case_id": case["id"],
            "name": case["name"],
            "accuracy": accuracy,
            "passed": accuracy > 0.8
        })
    
    # 生成报告
    generate_test_report(results)
```

### 持续优化流程

```
1. 收集失败案例
   ↓
2. 分析失败原因
   - Prompt 不够清晰？
   - 工具不够强大？
   - 边界条件未处理？
   ↓
3. 制定优化方案
   - 优化 Prompt
   - 增强工具
   - 添加边界处理
   ↓
4. 实施优化
   ↓
5. 回归测试
   ↓
6. 部署上线
   ↓
7. 监控效果
   ↓
回到步骤 1
```


## 🎬 总结：从文本管道到智能探索

### V2 的本质变化

| 维度 | V1（管道模式） | V2（智能探索） |
|------|---------------|---------------|
| **思维模式** | 被动翻译 | 主动调查 |
| **工作方式** | 一次性处理 | 迭代式探索 |
| **决策能力** | 无 | 自主决策 |
| **适应性** | 固定流程 | 动态调整 |
| **可扩展性** | 难以扩展 | 易于扩展 |
| **用户体验** | 黑盒等待 | 透明可见 |

### 核心价值

1. **真正的 Agentic**
   - Agent 不再是脚本，而是有自主性的智能体
   - 能够根据情况自主决策
   - 能够处理复杂和不确定的场景

2. **可扩展的架构**
   - 新增 Agent 角色很容易
   - 新增工具很容易
   - 新增流程节点很容易

3. **越用越聪明**
   - 记忆系统积累经验
   - 知识图谱构建系统认知
   - 性能持续提升

4. **产品级体验**
   - 实时可见的分析过程
   - 清晰的进度反馈
   - 专业的可视化

### 给团队的建议

#### 第一阶段（2-3 周）：验证可行性
- ✅ 开发 3 个核心工具
- ✅ 实现单个探索 Agent
- ✅ 观察 Agent 行为
- ✅ 积累经验和案例

**成功标准**：
- Agent 能自主调用工具
- 能正确分析 80% 的简单页面
- 团队对 Agent 行为有信心

#### 第二阶段（3-4 周）：多 Agent 协同
- ✅ 引入 LangGraph
- ✅ 拆分 Agent 角色
- ✅ 实现并行和条件分支
- ✅ 流式可视化

**成功标准**：
- 3 个 Agent 协同工作
- 能处理 90% 的常见页面
- 用户能看到实时进度

#### 第三阶段（3-4 周）：深度和记忆
- ✅ 深度逻辑专家 Agent
- ✅ 记忆系统
- ✅ 经验复用

**成功标准**：
- 能处理复杂场景
- 第二次分析速度提升 80%
- 准确率 > 95%

### 最后的话

这不是一个简单的技术升级，而是一次**范式转移**。

从"写一个好用的脚本"到"打造一个智能的代码考古学家"。

关键是：
1. **工具质量**：80% 的成功取决于此
2. **从简单到复杂**：不要一开始就做完美系统
3. **可观测性**：用户必须能看到 Agent 在做什么
4. **持续优化**：建立评估体系，不断改进

如果你们能把这套体系做出来，你们开发的就不再是一个"好用的开发辅助脚本"，而是一个**具备自我探索能力的代码考古学家**。

**准备好开始了吗？** 🚀

---

## 📚 参考资源

### 推荐阅读
- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)
- [LangChain Agent 指南](https://python.langchain.com/docs/modules/agents/)
- [Blackboard Pattern](https://en.wikipedia.org/wiki/Blackboard_(design_pattern))
- [Multi-Agent Systems](https://en.wikipedia.org/wiki/Multi-agent_system)

### 开源项目参考
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)
- [BabyAGI](https://github.com/yoheinakajima/babyagi)
- [CrewAI](https://github.com/joaomdmoura/crewAI)

### 工具和库
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/) - 通用 AST 解析
- [javalang](https://github.com/c2nes/javalang) - Java AST 解析
- [Chroma](https://www.trychroma.com/) - 向量数据库
- [Neo4j](https://neo4j.com/) - 图数据库

---

**文档版本**: V2.0  
**最后更新**: 2026-05-21  
**作者**: AI Requirement OS Team  
**状态**: 设计阶段 → 待实施
