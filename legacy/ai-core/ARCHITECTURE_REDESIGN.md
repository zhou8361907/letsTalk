# 架构重新设计 - Pi 风格的 Python 实现

**创建时间**: 2026-05-21  
**目标**: 学习 Pi 的极简设计，用 Python 实现

---

## 🎯 设计目标

1. **极简核心** - 像 Pi 一样简单的循环
2. **工具优先** - 我们的价值在工具，不在框架
3. **完全解耦** - 工具可以被任何 Agent 使用
4. **灵活集成** - 支持多种使用方式

---

## 🏗️ 新架构设计

### 层次结构

```
┌─────────────────────────────────────────┐
│         使用层（用户选择）                │
├─────────────────────────────────────────┤
│  Pi-like Agent │ LangChain │ 自定义     │
├─────────────────────────────────────────┤
│         适配器层（标准接口）              │
├─────────────────────────────────────────┤
│         工具层（核心价值）                │
├─────────────────────────────────────────┤
│  Java工具 │ Vue工具 │ 复杂度工具 │ ...  │
└─────────────────────────────────────────┘
```

---

## 📦 核心组件

### 1. 工具层（Tool Layer）

**职责**: 提供专业的代码分析能力

```python
# tools/base.py
from typing import Any, Dict, Callable
from pydantic import BaseModel

class ToolSchema(BaseModel):
    """工具 Schema - 兼容 OpenAI Function Calling"""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema 格式

class Tool:
    """标准工具接口"""
    
    def __init__(
        self,
        name: str,
        description: str,
        func: Callable,
        parameters: Dict[str, Any]
    ):
        self.name = name
        self.description = description
        self.func = func
        self.parameters = parameters
    
    @property
    def schema(self) -> ToolSchema:
        """返回工具 Schema"""
        return ToolSchema(
            name=self.name,
            description=self.description,
            parameters=self.parameters
        )
    
    def execute(self, **kwargs) -> Any:
        """执行工具"""
        return self.func(**kwargs)
    
    def to_openai_format(self) -> Dict:
        """转换为 OpenAI function calling 格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }
```

### 2. Pi-like Agent（核心循环）

**职责**: 提供极简的 Agent 循环

```python
# agents/simple_agent.py
from typing import List, Dict, Any, Optional
import json

class SimpleAgent:
    """Pi 风格的极简 Agent
    
    核心理念：
    1. 简单的循环
    2. 模型决定一切
    3. 工具只是辅助
    """
    
    def __init__(
        self,
        llm_client,  # OpenAI/DeepSeek client
        tools: List[Tool],
        system_prompt: Optional[str] = None,
        max_turns: int = 10,
        verbose: bool = True
    ):
        self.client = llm_client
        self.tools = {tool.name: tool for tool in tools}
        self.tool_schemas = [tool.to_openai_format() for tool in tools]
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.max_turns = max_turns
        self.verbose = verbose
    
    def _default_system_prompt(self) -> str:
        """默认系统提示"""
        return """你是一个专业的代码分析助手。

你可以使用以下工具来分析代码：
- parse_vue_ast: 解析 Vue 文件
- extract_api_calls: 提取 API 调用
- search_controller_by_url: 查找 Controller
- get_method_source: 获取方法源码
- calculate_method_complexity: 计算复杂度
- detect_external_calls: 检测外部调用

请一步步分析，使用工具获取信息，最后生成结构化的分析报告。"""
    
    def run(self, user_message: str) -> str:
        """运行 Agent - Pi 风格的简单循环"""
        
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        for turn in range(self.max_turns):
            if self.verbose:
                print(f"\n{'='*60}")
                print(f"Turn {turn + 1}/{self.max_turns}")
                print(f"{'='*60}")
            
            # 1. 调用 LLM
            response = self.client.chat.completions.create(
                model="deepseek-chat",  # 或 gpt-4
                messages=messages,
                tools=self.tool_schemas,
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            messages.append(message.model_dump())
            
            # 2. 检查是否需要工具
            if message.tool_calls:
                if self.verbose:
                    print(f"\n🔧 需要调用 {len(message.tool_calls)} 个工具:")
                
                # 执行所有工具调用
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    
                    if self.verbose:
                        print(f"  - {tool_name}({tool_args})")
                    
                    # 执行工具
                    try:
                        tool = self.tools[tool_name]
                        result = tool.execute(**tool_args)
                        
                        if self.verbose:
                            print(f"    ✅ 成功")
                        
                        # 添加工具结果到消息
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result, ensure_ascii=False)
                        })
                    
                    except Exception as e:
                        if self.verbose:
                            print(f"    ❌ 失败: {str(e)}")
                        
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": str(e)})
                        })
                
                # 继续下一轮
                continue
            
            # 3. 没有工具调用，返回结果
            if self.verbose:
                print(f"\n✅ 完成！用了 {turn + 1} 轮")
            
            return message.content
        
        # 达到最大轮次
        if self.verbose:
            print(f"\n⚠️  达到最大轮次 ({self.max_turns})")
        
        return "达到最大轮次，分析未完成"
    
    def run_streaming(self, user_message: str):
        """流式运行（实时输出）"""
        # TODO: 实现流式输出
        pass
```

### 3. 工具注册器

**职责**: 方便地注册和管理工具

```python
# tools/registry.py
from typing import List, Callable, Dict, Any
from .base import Tool

class ToolRegistry:
    """工具注册器"""
    
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
    
    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any]
    ):
        """装饰器：注册工具"""
        def decorator(func: Callable):
            tool = Tool(
                name=name,
                description=description,
                func=func,
                parameters=parameters
            )
            self.tools[name] = tool
            return func
        return decorator
    
    def get_all(self) -> List[Tool]:
        """获取所有工具"""
        return list(self.tools.values())
    
    def get(self, name: str) -> Tool:
        """获取单个工具"""
        return self.tools[name]

# 全局注册器
registry = ToolRegistry()
```

### 4. 工具定义（使用装饰器）

```python
# tools/vue_tools.py
from .registry import registry

@registry.register(
    name="parse_vue_ast",
    description="解析 Vue 文件的 AST 结构，提取组件信息",
    parameters={
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Vue 文件的绝对路径"
            }
        },
        "required": ["file_path"]
    }
)
def parse_vue_ast(file_path: str) -> Dict[str, Any]:
    """解析 Vue AST"""
    # 实际的解析逻辑
    from ..parser.vue_parser import parse_vue_file
    return parse_vue_file(file_path)


@registry.register(
    name="extract_api_calls",
    description="从 Vue 文件中提取所有 API 调用",
    parameters={
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Vue 文件的绝对路径"
            }
        },
        "required": ["file_path"]
    }
)
def extract_api_calls(file_path: str) -> List[Dict[str, Any]]:
    """提取 API 调用"""
    from ..parser.api_extractor import extract_apis
    return extract_apis(file_path)
```

---

## 🚀 使用示例

### 示例 1: 最简单的使用

```python
from openai import OpenAI
from ai_requirement_os.agents import SimpleAgent
from ai_requirement_os.tools import registry

# 1. 创建 LLM 客户端
client = OpenAI(
    api_key="your-key",
    base_url="https://api.deepseek.com"
)

# 2. 获取所有工具
tools = registry.get_all()

# 3. 创建 Agent
agent = SimpleAgent(client, tools)

# 4. 运行
result = agent.run("分析 Detail.vue 页面的数据流向")
print(result)
```

### 示例 2: 自定义系统提示

```python
agent = SimpleAgent(
    client,
    tools,
    system_prompt="""你是一个专业的 Vue + Spring Boot 分析专家。
    
请按照以下步骤分析：
1. 解析 Vue 文件
2. 提取 API 调用
3. 查找对应的 Controller
4. 分析方法复杂度
5. 生成 JSON 格式的报告
""",
    max_turns=15,
    verbose=True
)
```

### 示例 3: 只使用部分工具

```python
# 只使用 Vue 相关工具
vue_tools = [
    registry.get("parse_vue_ast"),
    registry.get("extract_api_calls")
]

agent = SimpleAgent(client, vue_tools)
```

### 示例 4: 集成到现有项目

```python
# 在 FastAPI 中使用
from fastapi import FastAPI

app = FastAPI()

@app.post("/analyze")
async def analyze_page(page_path: str):
    agent = SimpleAgent(client, tools, verbose=False)
    result = agent.run(f"分析页面: {page_path}")
    return {"result": result}
```

---

## 🔌 适配器支持

### LangChain 适配器

```python
# adapters/langchain_adapter.py
from langchain.tools import StructuredTool
from ai_requirement_os.tools import registry

def to_langchain_tools():
    """转换为 LangChain 工具"""
    tools = []
    for tool in registry.get_all():
        lc_tool = StructuredTool.from_function(
            func=tool.execute,
            name=tool.name,
            description=tool.description,
            # args_schema=...
        )
        tools.append(lc_tool)
    return tools

# 使用
from langchain.agents import create_tool_calling_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4")
tools = to_langchain_tools()
agent = create_tool_calling_agent(llm, tools, prompt)
```

### MCP 适配器

```python
# adapters/mcp_adapter.py
from ai_requirement_os.tools import registry

def to_mcp_server():
    """转换为 MCP Server"""
    return {
        "name": "ai-requirement-os",
        "version": "1.0.0",
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.parameters
            }
            for tool in registry.get_all()
        ]
    }
```

---

## 📊 对比

| 维度 | 旧架构 (LangChain) | 新架构 (Pi-like) |
|------|-------------------|------------------|
| 核心代码 | 4000+ 行 | ~300 行 |
| 依赖 | langchain, langgraph | openai/deepseek SDK |
| 学习成本 | 高 | 低 |
| 灵活性 | 低 | 高 |
| 调试难度 | 难 | 易 |
| 性能 | 中 | 高 |
| 可扩展性 | 中 | 高 |

---

## 🎯 实施计划

### Phase 1: 核心实现（3 天）

**Day 1**: 工具层
- [ ] 实现 `Tool` 基类
- [ ] 实现 `ToolRegistry`
- [ ] 重构现有 8 个工具

**Day 2**: Agent 核心
- [ ] 实现 `SimpleAgent`
- [ ] 实现工具调用循环
- [ ] 添加日志和调试

**Day 3**: 测试和文档
- [ ] 编写单元测试
- [ ] 编写使用文档
- [ ] 创建示例

### Phase 2: 适配器（2 天）

**Day 4**: 基础适配器
- [ ] LangChain 适配器
- [ ] MCP 适配器

**Day 5**: 文档和示例
- [ ] 适配器文档
- [ ] 集成示例

### Phase 3: 迁移（2 天）

**Day 6**: V1 迁移
- [ ] 迁移 V1 页面分析
- [ ] 测试验证

**Day 7**: 清理和发布
- [ ] 删除旧代码
- [ ] 更新文档
- [ ] 发布新版本

---

## 💡 核心优势

1. **极简设计** ⭐⭐⭐
   - 核心只有 ~300 行
   - 逻辑清晰透明
   - 易于理解和修改

2. **工具优先** ⭐⭐⭐
   - 工具是核心价值
   - 完全独立可复用
   - 任何 Agent 都能用

3. **灵活集成** ⭐⭐⭐
   - 可以单独使用
   - 可以集成到任何框架
   - 支持多种适配器

4. **性能优秀** ⭐⭐⭐
   - 没有框架开销
   - 直接调用 LLM
   - 快速响应

5. **易于维护** ⭐⭐⭐
   - 代码简单
   - 依赖少
   - 升级容易

---

## 🤔 讨论问题

1. **这个设计你觉得怎么样？**
2. **有什么需要调整的吗？**
3. **要不要立即开始实施？**
4. **需要我先实现一个原型吗？**

---

**总结**: 学习 Pi 的极简设计，用 Python 实现一个类似的核心，保留我们的专业工具，提供灵活的集成方式。这样既简单又强大！ 🚀
