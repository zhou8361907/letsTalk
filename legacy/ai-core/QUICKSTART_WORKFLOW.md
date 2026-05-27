# LangGraph 工作流快速开始

这个指南将帮助你快速上手使用 LangGraph 工作流分析 Vue 页面。

---

## 🚀 5 分钟快速体验

### 1. 运行演示脚本

```bash
uv run python demo_workflow.py
```

选择要分析的页面：
```
请选择要分析的页面：
1. UserList.vue - 简单页面（1个API）
2. Detail.vue - 复杂页面（4个API）

请输入选项 (1-2): 1
```

### 2. 查看分析结果

```
============================================================
  📊 分析结果
============================================================

总计: 2 个 API
✅ 已完成: 2
⚠️  需要深度分析: 0
❌ 失败: 0

============================================================
  ✅ 已完成的 API
============================================================

1. GET /api/user/list
   触发: unknown (行 14)
   Controller: UserController.getUserList
   复杂度得分: 10
   代码行数: 4
   圈复杂度: 1
   建议: 简单方法，可以直接分析
```

### 3. 查看保存的 JSON 结果

```bash
cat .agent/workflow_result.json
```

---

## 📖 编程使用

### 基础用法

```python
from ai_requirement_os.agents.workflow import analyze_page_with_workflow

# 分析页面
result = analyze_page_with_workflow(
    page_path="examples/test_cases/frontend/UserList.vue",
    backend_path="examples/test_cases/backend"
)

# 查看结果
print(f"总计: {result['total_apis']} 个 API")
print(f"已完成: {len(result['completed_apis'])}")
print(f"需要深度分析: {len(result['pending_deep_analysis'])}")
print(f"失败: {len(result['failed_apis'])}")
```

### 高级用法：自定义工作流

```python
from ai_requirement_os.agents.workflow import create_analysis_workflow, AnalysisState

# 创建工作流
workflow = create_analysis_workflow()

# 初始化状态
initial_state: AnalysisState = {
    "page_path": "your/page.vue",
    "backend_path": "your/backend/path",
    "vue_ast": None,
    "api_calls": [],
    "current_api_index": 0,
    "total_apis": 0,
    "completed_apis": [],
    "pending_deep_analysis": [],
    "failed_apis": [],
    "should_continue": True,
    "error": None,
}

# 执行工作流
final_state = workflow.invoke(initial_state)

# 处理结果
for api in final_state["completed_apis"]:
    print(f"{api['method']} {api['url']}")
    print(f"  Controller: {api['controller_class']}.{api['controller_method']}")
    print(f"  复杂度: {api['complexity_score']}")
```

---

## 🔧 工作流架构

### 状态结构

```python
class AnalysisState(TypedDict):
    # 输入
    page_path: str                    # Vue 页面路径
    backend_path: str                 # 后端代码路径
    
    # 前端解析结果
    vue_ast: Optional[Dict]           # Vue AST 结构
    api_calls: List[Dict]             # API 调用列表
    
    # 分析进度
    current_api_index: int            # 当前 API 索引
    total_apis: int                   # 总 API 数量
    
    # 分析结果（自动累加）
    completed_apis: List[Dict]        # 已完成的 API
    pending_deep_analysis: List[Dict] # 需要深度分析的 API
    failed_apis: List[Dict]           # 失败的 API
    
    # 控制流
    should_continue: bool             # 是否继续
    error: Optional[str]              # 错误信息
```

### 工作流程

```
┌─────────────────┐
│ parse_frontend  │  解析 Vue 文件，提取 API 列表
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  analyze_api    │  循环分析每个 API
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │ 继续？  │
    └───┬────┘
        │
    ┌───┴───┐
    │       │
   是       否
    │       │
    │       ▼
    │  ┌─────────────────┐
    │  │ generate_report │  生成最终报告
    │  └─────────────────┘
    │
    └──────┘ (循环)
```

### 节点说明

#### 1. parse_frontend_node

**功能**:
- 解析 Vue 文件的 AST 结构
- 提取所有 API 调用
- 初始化分析状态

**输入**:
- `page_path`: Vue 页面路径

**输出**:
- `vue_ast`: Vue AST 结构
- `api_calls`: API 调用列表
- `total_apis`: API 总数

#### 2. analyze_api_node

**功能**:
- 查找对应的 Controller 方法
- 获取方法源码
- 计算复杂度
- 根据复杂度决定是否需要深度分析

**输入**:
- `api_calls[current_api_index]`: 当前 API
- `backend_path`: 后端代码路径

**输出**:
- `completed_apis`: 已完成的 API（复杂度 < 60）
- `pending_deep_analysis`: 需要深度分析的 API（复杂度 >= 60）
- `failed_apis`: 失败的 API
- `current_api_index`: 更新索引

#### 3. generate_report_node

**功能**:
- 汇总所有分析结果
- 生成统计信息
- 输出最终报告

**输入**:
- `completed_apis`: 所有已完成的 API
- `pending_deep_analysis`: 所有需要深度分析的 API
- `failed_apis`: 所有失败的 API

**输出**:
- 打印统计信息

---

## 🎯 使用场景

### 场景 1: 快速分析单个页面

```python
from ai_requirement_os.agents.workflow import analyze_page_with_workflow

result = analyze_page_with_workflow(
    page_path="src/views/UserManagement.vue",
    backend_path="backend/src/main/java"
)

# 快速查看结果
print(f"✅ 已完成: {len(result['completed_apis'])}")
print(f"⚠️  需要深度分析: {len(result['pending_deep_analysis'])}")
```

### 场景 2: 批量分析多个页面

```python
from pathlib import Path
from ai_requirement_os.agents.workflow import analyze_page_with_workflow

# 查找所有 Vue 文件
vue_files = Path("src/views").glob("**/*.vue")

results = []
for vue_file in vue_files:
    result = analyze_page_with_workflow(
        page_path=str(vue_file),
        backend_path="backend/src/main/java"
    )
    results.append(result)

# 汇总统计
total_apis = sum(r["total_apis"] for r in results)
total_completed = sum(len(r["completed_apis"]) for r in results)
total_pending = sum(len(r["pending_deep_analysis"]) for r in results)

print(f"总计分析了 {len(results)} 个页面")
print(f"总计 {total_apis} 个 API")
print(f"已完成: {total_completed}")
print(f"需要深度分析: {total_pending}")
```

### 场景 3: 自定义节点

```python
from ai_requirement_os.agents.workflow import create_analysis_workflow
from langgraph.graph import StateGraph

# 创建基础工作流
workflow = create_analysis_workflow()

# 添加自定义节点
def custom_validation_node(state):
    """自定义验证节点"""
    # 验证逻辑
    return state

workflow.add_node("custom_validation", custom_validation_node)
workflow.add_edge("parse_frontend", "custom_validation")
workflow.add_edge("custom_validation", "analyze_api")

# 重新编译
compiled_workflow = workflow.compile()
```

---

## 📊 输出格式

### 成功的 API

```json
{
  "method": "GET",
  "url": "/api/user/list",
  "trigger": "loadUsers",
  "line_number": 14,
  "controller_class": "UserController",
  "controller_method": "getUserList",
  "controller_file": "backend/controller/UserController.java",
  "complexity_score": 10,
  "lines_of_code": 4,
  "cyclomatic_complexity": 1,
  "external_calls": [],
  "recommendation": "简单方法，可以直接分析",
  "status": "completed"
}
```

### 需要深度分析的 API

```json
{
  "method": "POST",
  "url": "/api/sync",
  "trigger": "syncData",
  "line_number": 47,
  "controller_class": "SyncController",
  "controller_method": "syncData",
  "controller_file": "backend/controller/SyncController.java",
  "complexity_score": 85,
  "lines_of_code": 45,
  "cyclomatic_complexity": 12,
  "external_calls": ["数据库操作", "HTTP调用", "消息队列"],
  "recommendation": "高复杂度，建议创建后台任务深度分析",
  "status": "needs_deep_analysis"
}
```

### 失败的 API

```json
{
  "method": "GET",
  "url": "/api/unknown",
  "trigger": "test",
  "line_number": 1,
  "status": "error",
  "error_message": "未找到对应的 Controller"
}
```

---

## 🧪 测试

### 运行所有测试

```bash
uv run pytest tests/test_workflow/test_langgraph.py -v
```

### 运行特定测试

```bash
# 测试节点
uv run pytest tests/test_workflow/test_langgraph.py::TestWorkflowNodes -v

# 测试工作流
uv run pytest tests/test_workflow/test_langgraph.py::TestWorkflow -v

# 测试性能
uv run pytest tests/test_workflow/test_langgraph.py::TestWorkflowPerformance -v
```

---

## 🔍 调试

### 启用详细日志

工作流已经内置了详细的日志输出，运行时会自动显示：

```
============================================================
🔍 [节点 2] 分析 API 1/2
============================================================
方法: GET
路径: /api/user/list
触发: unknown

🔍 查找 Controller...
✅ 找到 Controller: UserController.getUserList
   文件: examples/test_cases/backend/controller/UserController.java
   行号: 24

🔍 获取方法源码...
✅ 获取源码成功 (4 行)

🔍 计算复杂度...
✅ 复杂度分析完成:
   综合得分: 10
   代码行数: 4
   圈复杂度: 1
   嵌套深度: 1
   外部调用: 无
   建议: 简单方法，可以直接分析

✅ 分析完成
```

### 查看中间状态

```python
from ai_requirement_os.agents.workflow import create_analysis_workflow

workflow = create_analysis_workflow()

# 执行工作流
final_state = workflow.invoke(initial_state)

# 查看中间状态
print("Vue AST:", final_state["vue_ast"])
print("API 调用:", final_state["api_calls"])
print("当前索引:", final_state["current_api_index"])
```

---

## 📚 相关文档

- [V2_MULTI_AGENT_ARCHITECTURE.md](V2_MULTI_AGENT_ARCHITECTURE.md) - 架构设计
- [V2_IMPLEMENTATION_GUIDE.md](V2_IMPLEMENTATION_GUIDE.md) - 实施手册
- [WHY_LANGGRAPH.md](WHY_LANGGRAPH.md) - 为什么用 LangGraph
- [V2_WEEK3_DAY1-2_SUMMARY.md](V2_WEEK3_DAY1-2_SUMMARY.md) - Day 1-2 总结
- [V2_WEEK3_COMPLETE.md](V2_WEEK3_COMPLETE.md) - Week 3 完成报告

---

## 🆘 故障排查

### 问题 1: 找不到 Controller

**症状**: `⚠️  未找到对应的 Controller`

**原因**: 
- `backend_path` 路径不正确
- Controller 文件不在标准位置
- URL 匹配规则不匹配

**解决**:
```python
# 检查 backend_path 是否正确
result = analyze_page_with_workflow(
    page_path="your/page.vue",
    backend_path="correct/backend/path"  # 确保路径正确
)
```

### 问题 2: 无法获取方法源码

**症状**: `⚠️  无法获取方法源码`

**原因**:
- Java 文件解析失败
- 方法名不匹配

**解决**:
- 检查 Java 文件是否有语法错误
- 确保方法名完全匹配

### 问题 3: 测试失败

**症状**: 测试运行失败

**原因**:
- 测试用例文件不存在
- 依赖未安装

**解决**:
```bash
# 确保测试用例存在
ls examples/test_cases/frontend/
ls examples/test_cases/backend/controller/

# 重新安装依赖
uv sync
```

---

## 🚀 下一步

- 查看 [V2_IMPLEMENTATION_GUIDE.md](V2_IMPLEMENTATION_GUIDE.md) 了解完整实施计划
- 查看 [WHY_LANGGRAPH.md](WHY_LANGGRAPH.md) 了解为什么使用 LangGraph
- 查看 [FUTURE_CAPABILITIES.md](FUTURE_CAPABILITIES.md) 了解未来规划

---

**祝你使用愉快！** 🎉
