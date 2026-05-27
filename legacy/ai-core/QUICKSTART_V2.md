# V2 系统快速开始指南

## 🚀 5 分钟快速体验

### 1. 环境准备

```bash
cd ai-core

# 确保依赖已安装
uv sync

# 检查环境变量
cat .env
# 确保有 DEEPSEEK_API_KEY 或 OPENAI_API_KEY
```

### 2. 运行演示

```bash
# 运行交互式演示
uv run python demo_agent.py

# 或者直接运行测试
uv run pytest tests/test_agents/test_orchestrator.py -v -s
```

### 3. 使用 Python API

```python
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

# 创建配置
config = V2Config(
    backend_path="/path/to/backend",
    frontend_path="/path/to/frontend",
    max_iterations=15,
    complexity_threshold=60
)

# 创建 Agent
agent = OrchestratorAgent(config)

# 分析页面
result = agent.analyze(
    page_path="/path/to/frontend/Detail.vue",
    backend_path="/path/to/backend"
)

# 查看结果
if result["success"]:
    print("✅ 分析成功")
    print(result["output"])
else:
    print("❌ 分析失败")
    print(result["error"])
```

---

## 📋 完整示例

### 示例 1：分析简单页面

```python
from pathlib import Path
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

# 使用测试用例
test_dir = Path(__file__).parent / "examples" / "test_cases"

config = V2Config(
    backend_path=str(test_dir / "backend"),
    frontend_path=str(test_dir / "frontend")
)

agent = OrchestratorAgent(config)

# 分析 UserList.vue（简单页面）
result = agent.analyze(
    page_path=str(test_dir / "frontend" / "UserList.vue"),
    backend_path=str(test_dir / "backend")
)

print("=" * 80)
print("分析结果:")
print("=" * 80)

if result["success"]:
    import json
    print(json.dumps(result["output"], indent=2, ensure_ascii=False))
    
    print(f"\n工具调用次数: {len(result['steps'])}")
    
    # 打印工具调用详情
    for i, (action, observation) in enumerate(result["steps"], 1):
        print(f"\n{i}. {action.tool}")
        print(f"   输入: {action.tool_input}")
else:
    print(f"错误: {result['error']}")
```

### 示例 2：分析复杂页面

```python
# 分析 Detail.vue（复杂页面，包含 4 个 API）
result = agent.analyze(
    page_path=str(test_dir / "frontend" / "Detail.vue"),
    backend_path=str(test_dir / "backend")
)

if result["success"]:
    output = result["output"]
    
    # 统计
    if isinstance(output, dict) and "apis" in output:
        apis = output["apis"]
        completed = [a for a in apis if a.get("status") == "completed"]
        needs_deep = [a for a in apis if a.get("status") == "needs_deep_analysis"]
        
        print(f"\n📊 统计:")
        print(f"  总 API 数: {len(apis)}")
        print(f"  已完成: {len(completed)}")
        print(f"  需要深度分析: {len(needs_deep)}")
        
        if needs_deep:
            print(f"\n🔴 需要深度分析的 API:")
            for api in needs_deep:
                print(f"  - {api['method']} {api['url']}")
                print(f"    原因: {api.get('reason', 'N/A')}")
```

### 示例 3：批量分析

```python
import glob

# 找到所有 Vue 文件
vue_files = glob.glob(str(test_dir / "frontend" / "*.vue"))

results = []

for vue_file in vue_files:
    print(f"\n分析: {Path(vue_file).name}")
    
    result = agent.analyze(
        page_path=vue_file,
        backend_path=str(test_dir / "backend")
    )
    
    results.append({
        "file": Path(vue_file).name,
        "success": result["success"],
        "output": result["output"] if result["success"] else None,
        "error": result["error"] if not result["success"] else None
    })

# 汇总报告
print("\n" + "=" * 80)
print("批量分析报告")
print("=" * 80)

for r in results:
    status = "✅" if r["success"] else "❌"
    print(f"{status} {r['file']}")
    if not r["success"]:
        print(f"   错误: {r['error']}")
```

---

## 🔧 配置说明

### V2Config 参数

```python
class V2Config(BaseModel):
    # LLM 配置
    llm_model: str = "deepseek-chat"  # 模型名称
    llm_temperature: float = 0.0      # 温度（0=确定性，1=随机性）
    llm_max_tokens: int = 4000        # 最大 token 数
    
    # Agent 配置
    max_iterations: int = 15          # 最大迭代次数
    max_tool_calls: int = 20          # 最大工具调用次数
    complexity_threshold: int = 60    # 复杂度阈值
    max_trace_depth: int = 2          # 最大追踪深度
    
    # 并发配置
    max_concurrent_tasks: int = 5     # 最大并发任务数
    task_timeout: int = 30            # 任务超时时间（秒）
    
    # 缓存配置
    enable_cache: bool = True         # 是否启用缓存
    cache_ttl: int = 3600             # 缓存过期时间（秒）
    
    # 记忆配置
    enable_memory: bool = True        # 是否启用记忆系统
    vector_db_path: str = "./.memory/chroma"  # 向量数据库路径
    
    # 路径配置
    backend_path: str = ""            # 后端代码路径
    frontend_path: str = ""           # 前端代码路径
```

### 环境变量

```bash
# .env 文件

# DeepSeek API（推荐）
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 或者 OpenAI API
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4

# 可选配置
AIRO_API_HOST=127.0.0.1
AIRO_API_PORT=8001
```

---

## 🛠️ 工具说明

### 已实现的工具

1. **parse_vue_ast** - 解析 Vue 文件
   ```python
   result = parse_vue_ast.invoke({"file_path": "xxx.vue"})
   # 返回: {"template": "...", "script": "...", "style": "..."}
   ```

2. **extract_api_calls** - 提取 API 调用
   ```python
   calls = extract_api_calls.invoke({"file_path": "xxx.vue"})
   # 返回: [ApiCall(method="GET", url="/api/user", ...)]
   ```

3. **search_controller_by_url** - 查找 Controller
   ```python
   controller = search_controller_by_url.invoke({
       "method": "GET",
       "url": "/api/user/list",
       "backend_path": "/path/to/backend"
   })
   # 返回: ControllerInfo(class_name="UserController", ...)
   ```

4. **get_method_source** - 获取方法源码
   ```python
   source = get_method_source.invoke({
       "class_name": "UserController",
       "method_name": "getUserList",
       "backend_path": "/path/to/backend"
   })
   # 返回: "public Result<List<User>> getUserList() { ... }"
   ```

5. **calculate_method_complexity** - 计算复杂度
   ```python
   report = calculate_method_complexity.invoke({"source_code": source})
   # 返回: ComplexityReport(score=25, recommendation="简单方法", ...)
   ```

6. **detect_external_calls** - 检测外部调用
   ```python
   calls = detect_external_calls.invoke({"source_code": source})
   # 返回: {"database": [...], "http": [...], "mq": [...]}
   ```

---

## 📊 输出格式

### 成功的输出

```json
{
  "success": true,
  "output": {
    "page_path": "UserList.vue",
    "page_summary": "用户列表页面",
    "apis": [
      {
        "method": "GET",
        "url": "/api/user/list",
        "trigger": "mounted",
        "controller": {
          "class": "UserController",
          "method": "getUserList",
          "file_path": "xxx/UserController.java",
          "complexity": 25
        },
        "service_calls": [
          {
            "class": "UserService",
            "method": "list",
            "complexity": 20
          }
        ],
        "external_calls": {
          "database": ["userMapper.selectAll()"],
          "http": [],
          "mq": [],
          "cache": []
        },
        "status": "completed",
        "trace_depth": 2
      }
    ],
    "summary": {
      "total_apis": 1,
      "completed": 1,
      "needs_deep_analysis": 0,
      "avg_complexity": 25
    }
  },
  "steps": [
    // 工具调用详情
  ],
  "error": null
}
```

### 失败的输出

```json
{
  "success": false,
  "output": null,
  "steps": [],
  "error": "Error code: 503 - Service is too busy"
}
```

---

## 🐛 故障排查

### 问题 1: API 503 错误

**症状**: `Error code: 503 - Service is too busy`

**解决方案**:
1. 等待几分钟后重试
2. 或切换到其他 LLM（如 GPT-4）
3. 系统已内置重试机制，会自动重试 3 次

### 问题 2: API 401 错误

**症状**: `Error code: 401 - Incorrect API key`

**解决方案**:
1. 检查 `.env` 文件中的 API Key
2. 确保 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY` 正确
3. 确保 `DEEPSEEK_BASE_URL` 正确（如果使用 DeepSeek）

### 问题 3: 找不到 Controller

**症状**: Agent 返回 "找不到对应的 Controller"

**解决方案**:
1. 检查 `backend_path` 是否正确
2. 确保 Controller 文件在 `backend_path` 下
3. 检查 URL 是否匹配（支持路径变量）

### 问题 4: 解析 Vue 文件失败

**症状**: `parse_vue_ast` 返回空内容

**解决方案**:
1. 检查 Vue 文件格式是否正确
2. 确保有 `<template>` 和 `<script>` 标签
3. 检查文件编码（应该是 UTF-8）

---

## 📈 性能优化

### 1. 使用缓存

```python
config = V2Config(
    enable_cache=True,
    cache_ttl=3600  # 1 小时
)
```

### 2. 调整迭代次数

```python
config = V2Config(
    max_iterations=10  # 减少迭代次数，提高速度
)
```

### 3. 调整复杂度阈值

```python
config = V2Config(
    complexity_threshold=50  # 降低阈值，更多方法会被标记为复杂
)
```

---

## 🎯 下一步

### Week 3: LangGraph 集成

完成 Week 1 后，我们将进入 Week 3（跳过 Week 2，因为已经验证了单 Agent）：

1. **并行分析多个 API**
   - 性能提升 3-5 倍
   - 使用 ThreadPoolExecutor

2. **复杂度控制**
   - 自动识别复杂方法
   - 创建后台任务

3. **状态机工作流**
   - 可控的流程
   - 可观测的执行

### Week 5-6: 记忆系统

1. **向量存储**
   - ChromaDB 集成
   - 语义搜索

2. **经验复用**
   - 缓存分析结果
   - 相似任务推荐

3. **自我学习**
   - 从错误中学习
   - 优化策略

---

## 💡 最佳实践

### 1. 先测试简单页面

```python
# 从简单页面开始
result = agent.analyze("UserList.vue", backend_path)
```

### 2. 逐步增加复杂度

```python
# 然后测试复杂页面
result = agent.analyze("Detail.vue", backend_path)
```

### 3. 批量分析时注意速率限制

```python
import time

for vue_file in vue_files:
    result = agent.analyze(vue_file, backend_path)
    time.sleep(1)  # 避免 API 速率限制
```

### 4. 保存分析结果

```python
import json
from datetime import datetime

result = agent.analyze(page_path, backend_path)

# 保存到文件
output_file = f"analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)
```

---

## 📚 参考资料

- [V2 实施手册](V2_IMPLEMENTATION_GUIDE.md)
- [为什么用 LangGraph](WHY_LANGGRAPH.md)
- [未来能力规划](FUTURE_CAPABILITIES.md)
- [实施进度](V2_IMPLEMENTATION_PROGRESS.md)

---

## 🤝 获取帮助

如果遇到问题：

1. 查看 [故障排查文档](TROUBLESHOOTING.md)
2. 查看 [实施进度](V2_IMPLEMENTATION_PROGRESS.md) 中的"遇到的问题"
3. 运行测试查看详细错误信息：
   ```bash
   uv run pytest tests/ -v -s
   ```

---

**祝你使用愉快！** 🎉
