# V2 多 Agent 系统实施手册

## 📋 目录

1. [环境准备](#环境准备)
2. [第一周：核心工具开发](#第一周核心工具开发)
3. [第二周：单 Agent 验证](#第二周单-agent-验证)
4. [第三周：LangGraph 集成](#第三周langgraph-集成)
5. [第四周：多 Agent 协同](#第四周多-agent-协同)
6. [第五周：流式可视化](#第五周流式可视化)
7. [第六周：深度分析和记忆](#第六周深度分析和记忆)
8. [测试和优化](#测试和优化)

---

## 环境准备

### 1. 安装依赖

```bash
# 基础依赖（已有）
uv add langchain langchain-openai pydantic

# 新增依赖
uv add langgraph  # 状态机框架
uv add javalang  # Java AST 解析
uv add tree-sitter tree-sitter-languages  # 通用 AST 解析
uv add chromadb  # 向量数据库
uv add neo4j  # 图数据库（可选）
uv add tenacity  # 重试机制
```

### 2. 目录结构

```
ai-core/
├── src/ai_requirement_os/
│   ├── agents/
│   │   ├── orchestrator.py          # 主控 Agent
│   │   ├── frontend_tracker.py      # 前端解析 Agent
│   │   ├── backend_detective.py     # 后端溯源 Agent
│   │   ├── deep_logic_expert.py     # 深度逻辑专家
│   │   └── workflow.py              # LangGraph 工作流
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── java_tools.py            # Java 代码分析工具
│   │   ├── vue_tools.py             # Vue 代码分析工具
│   │   └── complexity_tools.py      # 复杂度分析工具
│   ├── memory/
│   │   ├── __init__.py
│   │   ├── vector_store.py          # 向量存储
│   │   └── knowledge_graph.py       # 知识图谱
│   └── prompts/
│       ├── __init__.py
│       ├── orchestrator.py          # 主控 Prompt
│       ├── frontend_tracker.py      # 前端 Prompt
│       └── backend_detective.py     # 后端 Prompt
├── tests/
│   ├── test_tools/
│   ├── test_agents/
│   └── test_workflow/
└── examples/
    └── test_cases/                  # 测试用例
```

### 3. 配置文件

```python
# src/ai_requirement_os/config/v2_config.py

from pydantic import BaseModel

class V2Config(BaseModel):
    # LLM 配置
    llm_model: str = "deepseek-chat"
    llm_temperature: float = 0
    llm_max_tokens: int = 4000
    
    # Agent 配置
    max_iterations: int = 15
    max_tool_calls: int = 20
    complexity_threshold: int = 60
    max_trace_depth: int = 2
    
    # 并发配置
    max_concurrent_tasks: int = 5
    task_timeout: int = 30
    
    # 缓存配置
    enable_cache: bool = True
    cache_ttl: int = 3600
    
    # 记忆配置
    enable_memory: bool = True
    vector_db_path: str = "./.memory/chroma"
    
    # 路径配置
    backend_path: str = ""
    frontend_path: str = ""
```

---

## 第一周：核心工具开发

### Day 1-2: Java 工具开发

**任务清单**：
- [ ] 实现 `search_controller_by_url`
- [ ] 实现 `get_method_source`
- [ ] 编写单元测试

**实现文件**: `src/ai_requirement_os/tools/java_tools.py`

```python
"""Java 代码分析工具集"""

import javalang
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from langchain.tools import tool

class ControllerInfo(BaseModel):
    """Controller 信息"""
    class_name: str
    method_name: str
    file_path: str
    method_signature: str
    line_number: int
    http_method: str
    url_pattern: str

@tool
def search_controller_by_url(method: str, url: str) -> Optional[ControllerInfo]:
    """
    根据 HTTP 方法和 URL 查找对应的 Controller 方法
    
    Args:
        method: HTTP 方法，如 "GET", "POST"
        url: API 路径，如 "/api/detail/info"
    
    Returns:
        ControllerInfo 或 None
    """
    # TODO: 实现逻辑
    pass

@tool
def get_method_source(class_name: str, method_name: str) -> Optional[str]:
    """
    获取指定方法的源码
    
    Args:
        class_name: 类名
        method_name: 方法名
    
    Returns:
        方法源码或 None
    """
    # TODO: 实现逻辑
    pass
```

**测试文件**: `tests/test_tools/test_java_tools.py`

```python
import pytest
from ai_requirement_os.tools.java_tools import (
    search_controller_by_url,
    get_method_source
)

def test_search_controller_simple_route():
    """测试简单路由"""
    result = search_controller_by_url.invoke({
        "method": "GET",
        "url": "/api/user/list"
    })
    
    assert result is not None
    assert result.class_name == "UserController"
    assert result.method_name == "getUserList"

def test_search_controller_path_variable():
    """测试路径变量"""
    result = search_controller_by_url.invoke({
        "method": "GET",
        "url": "/api/user/123"
    })
    
    assert result is not None
    assert result.method_name == "getUserById"

def test_get_method_source():
    """测试获取方法源码"""
    source = get_method_source.invoke({
        "class_name": "UserController",
        "method_name": "getUserList"
    })
    
    assert source is not None
    assert "getUserList" in source
    assert len(source.split('\n')) < 100  # 确保只返回方法，不是整个类
```



### Day 3-4: Vue 工具开发

**任务清单**：
- [ ] 实现 `parse_vue_ast`
- [ ] 实现 `extract_api_calls`
- [ ] 实现 `get_form_fields`
- [ ] 编写单元测试

**实现文件**: `src/ai_requirement_os/tools/vue_tools.py`

```python
"""Vue 代码分析工具集"""

import re
from pathlib import Path
from typing import List, Dict, Any
from pydantic import BaseModel
from langchain.tools import tool

class ApiCall(BaseModel):
    """API 调用信息"""
    method: str  # GET, POST, etc.
    url: str
    trigger: str  # 触发位置，如 "onMounted", "handleSubmit"
    line_number: int

class FormField(BaseModel):
    """表单字段信息"""
    name: str
    label: str
    type: str  # input, select, date-picker, etc.
    required: bool
    default_value: Any = None

@tool
def parse_vue_ast(file_path: str) -> Dict[str, Any]:
    """
    解析 Vue 文件的 AST 结构
    
    Args:
        file_path: Vue 文件路径
    
    Returns:
        包含 template, script, style 的字典
    """
    content = Path(file_path).read_text(encoding='utf-8')
    
    # 简单的正则提取（生产环境建议用 tree-sitter）
    template_match = re.search(r'<template>(.*?)</template>', content, re.DOTALL)
    script_match = re.search(r'<script.*?>(.*?)</script>', content, re.DOTALL)
    
    return {
        "template": template_match.group(1) if template_match else "",
        "script": script_match.group(1) if script_match else "",
        "file_path": file_path
    }

@tool
def extract_api_calls(file_path: str) -> List[ApiCall]:
    """
    提取 Vue 文件中的所有 API 调用
    
    Args:
        file_path: Vue 文件路径
    
    Returns:
        API 调用列表
    """
    ast = parse_vue_ast.invoke({"file_path": file_path})
    script = ast["script"]
    
    api_calls = []
    
    # 匹配 axios/fetch 调用
    patterns = [
        r'(get|post|put|delete)\s*\(\s*[\'"]([^\'"]+)[\'"]',  # axios.get('/api/user')
        r'fetch\s*\(\s*[\'"]([^\'"]+)[\'"].*?method:\s*[\'"](\w+)[\'"]',  # fetch('/api', {method: 'POST'})
    ]
    
    for line_num, line in enumerate(script.split('\n'), 1):
        for pattern in patterns:
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                if len(match.groups()) == 2:
                    method, url = match.groups()
                else:
                    url, method = match.groups()
                
                api_calls.append(ApiCall(
                    method=method.upper(),
                    url=url,
                    trigger="unknown",  # 需要更复杂的分析
                    line_number=line_num
                ))
    
    return api_calls

@tool
def get_form_fields(file_path: str) -> List[FormField]:
    """
    提取 Vue 文件中的表单字段
    
    Args:
        file_path: Vue 文件路径
    
    Returns:
        表单字段列表
    """
    ast = parse_vue_ast.invoke({"file_path": file_path})
    template = ast["template"]
    
    fields = []
    
    # 匹配 el-form-item 或类似组件
    pattern = r'<el-form-item[^>]*label="([^"]*)"[^>]*>.*?v-model="([^"]*)"'
    matches = re.finditer(pattern, template, re.DOTALL)
    
    for match in matches:
        label, model = match.groups()
        fields.append(FormField(
            name=model,
            label=label,
            type="input",  # 需要更详细的分析
            required=False  # 需要检查 rules
        ))
    
    return fields
```

**测试文件**: `tests/test_tools/test_vue_tools.py`

```python
import pytest
from ai_requirement_os.tools.vue_tools import (
    parse_vue_ast,
    extract_api_calls,
    get_form_fields
)

def test_parse_vue_ast():
    """测试 Vue AST 解析"""
    result = parse_vue_ast.invoke({
        "file_path": "examples/test_cases/Detail.vue"
    })
    
    assert "template" in result
    assert "script" in result
    assert len(result["template"]) > 0

def test_extract_api_calls():
    """测试 API 调用提取"""
    calls = extract_api_calls.invoke({
        "file_path": "examples/test_cases/Detail.vue"
    })
    
    assert len(calls) > 0
    assert calls[0].method in ["GET", "POST", "PUT", "DELETE"]
    assert calls[0].url.startswith("/")

def test_get_form_fields():
    """测试表单字段提取"""
    fields = get_form_fields.invoke({
        "file_path": "examples/test_cases/Detail.vue"
    })
    
    assert len(fields) > 0
    assert fields[0].name is not None
    assert fields[0].label is not None
```


### Day 5-7: 复杂度分析工具

**任务清单**：
- [ ] 实现 `calculate_method_complexity`
- [ ] 实现 `analyze_dependencies`
- [ ] 实现 `detect_external_calls`
- [ ] 编写单元测试

**实现文件**: `src/ai_requirement_os/tools/complexity_tools.py`

```python
"""代码复杂度分析工具"""

import re
from typing import Dict, List
from pydantic import BaseModel
from langchain.tools import tool

class ComplexityReport(BaseModel):
    """复杂度报告"""
    score: int  # 0-100
    lines_of_code: int
    cyclomatic_complexity: int
    nesting_depth: int
    external_calls: List[str]
    has_database_ops: bool
    has_rpc_calls: bool
    has_complex_logic: bool
    recommendation: str

@tool
def calculate_method_complexity(source_code: str) -> ComplexityReport:
    """
    计算方法的复杂度
    
    Args:
        source_code: 方法源码
    
    Returns:
        复杂度报告
    """
    lines = [line for line in source_code.split('\n') if line.strip()]
    loc = len(lines)
    
    # 计算圈复杂度（简化版）
    decision_points = len(re.findall(r'\b(if|for|while|case|catch)\b', source_code))
    cyclomatic = decision_points + 1
    
    # 计算嵌套深度
    max_depth = 0
    current_depth = 0
    for line in lines:
        if '{' in line:
            current_depth += 1
            max_depth = max(max_depth, current_depth)
        if '}' in line:
            current_depth -= 1
    
    # 检测外部调用
    external_calls = []
    if re.search(r'@Autowired|@Resource', source_code):
        external_calls.append("Spring依赖注入")
    if re.search(r'\.query\(|\.update\(|\.execute\(', source_code):
        external_calls.append("数据库操作")
    if re.search(r'RestTemplate|FeignClient|HttpClient', source_code):
        external_calls.append("HTTP调用")
    if re.search(r'RabbitTemplate|KafkaTemplate', source_code):
        external_calls.append("消息队列")
    
    # 计算综合得分
    score = min(100, loc // 2 + cyclomatic * 5 + max_depth * 10 + len(external_calls) * 15)
    
    # 生成建议
    if score < 30:
        recommendation = "简单方法，可以直接分析"
    elif score < 60:
        recommendation = "中等复杂度，建议详细追踪"
    else:
        recommendation = "高复杂度，建议创建后台任务深度分析"
    
    return ComplexityReport(
        score=score,
        lines_of_code=loc,
        cyclomatic_complexity=cyclomatic,
        nesting_depth=max_depth,
        external_calls=external_calls,
        has_database_ops="数据库操作" in external_calls,
        has_rpc_calls="HTTP调用" in external_calls,
        has_complex_logic=cyclomatic > 10,
        recommendation=recommendation
    )

@tool
def analyze_dependencies(class_name: str) -> List[str]:
    """
    分析类的依赖关系
    
    Args:
        class_name: 类名
    
    Returns:
        依赖的类列表
    """
    # TODO: 实现依赖分析
    return []

@tool
def detect_external_calls(source_code: str) -> Dict[str, List[str]]:
    """
    检测代码中的外部调用
    
    Args:
        source_code: 源码
    
    Returns:
        外部调用分类字典
    """
    result = {
        "database": [],
        "http": [],
        "mq": [],
        "cache": []
    }
    
    # 数据库调用
    db_patterns = [
        r'(\w+Mapper)\.(\w+)\(',
        r'jdbcTemplate\.(\w+)\(',
    ]
    for pattern in db_patterns:
        matches = re.finditer(pattern, source_code)
        for match in matches:
            result["database"].append(match.group(0))
    
    # HTTP 调用
    http_patterns = [
        r'restTemplate\.(\w+)\(',
        r'@FeignClient.*?(\w+)\(',
    ]
    for pattern in http_patterns:
        matches = re.finditer(pattern, source_code)
        for match in matches:
            result["http"].append(match.group(0))
    
    return result
```

**测试文件**: `tests/test_tools/test_complexity_tools.py`

```python
import pytest
from ai_requirement_os.tools.complexity_tools import (
    calculate_method_complexity,
    detect_external_calls
)

def test_simple_method_complexity():
    """测试简单方法"""
    code = """
    public String getUser(Long id) {
        return userMapper.selectById(id);
    }
    """
    
    report = calculate_method_complexity.invoke({"source_code": code})
    
    assert report.score < 30
    assert report.recommendation == "简单方法，可以直接分析"

def test_complex_method_complexity():
    """测试复杂方法"""
    code = """
    public void syncData() {
        for (User user : users) {
            if (user.isActive()) {
                try {
                    String result = restTemplate.getForObject(url, String.class);
                    if (result != null) {
                        userMapper.update(user);
                        rabbitTemplate.send(queue, message);
                    }
                } catch (Exception e) {
                    log.error("Error", e);
                }
            }
        }
    }
    """
    
    report = calculate_method_complexity.invoke({"source_code": code})
    
    assert report.score >= 60
    assert report.has_database_ops
    assert report.has_rpc_calls
    assert "后台任务" in report.recommendation

def test_detect_external_calls():
    """测试外部调用检测"""
    code = """
    userMapper.selectById(1);
    restTemplate.getForObject(url, String.class);
    """
    
    calls = detect_external_calls.invoke({"source_code": code})
    
    assert len(calls["database"]) > 0
    assert len(calls["http"]) > 0
```

---

## 第二周：单 Agent 验证

### Day 1-3: 实现主控 Agent

**任务清单**：
- [ ] 编写主控 Agent Prompt
- [ ] 实现 Agent 类
- [ ] 集成工具
- [ ] 测试单 Agent 流程

**实现文件**: `src/ai_requirement_os/prompts/orchestrator.py`

```python
"""主控 Agent Prompt"""

ORCHESTRATOR_SYSTEM_PROMPT = """你是一个代码分析专家，负责协调整个分析流程。

你的任务是：
1. 接收一个 Vue 页面路径
2. 使用工具分析页面中的 API 调用
3. 对每个 API，追踪到后端 Controller 和 Service
4. 评估每个方法的复杂度
5. 对于复杂度 > 60 的方法，标记为"需要深度分析"
6. 生成最终的数据流向文档

可用工具：
- parse_vue_ast: 解析 Vue 文件
- extract_api_calls: 提取 API 调用
- search_controller_by_url: 查找 Controller
- get_method_source: 获取方法源码
- calculate_method_complexity: 计算复杂度

工作流程：
1. 先调用 parse_vue_ast 和 extract_api_calls 获取 API 列表
2. 对每个 API，调用 search_controller_by_url 找到 Controller
3. 调用 get_method_source 获取方法源码
4. 调用 calculate_method_complexity 评估复杂度
5. 如果复杂度 < 60，继续追踪 Service 层
6. 如果复杂度 >= 60，标记为"需要后台深度分析"，不再继续追踪

重要规则：
- 最多追踪 2 层（Controller → Service，不再往下）
- 遇到复杂方法立即停止，不要死磕
- 每个 API 的分析要并行进行
- 输出要结构化，便于后续处理

输出格式：
{
  "page_path": "xxx.vue",
  "apis": [
    {
      "method": "GET",
      "url": "/api/user/list",
      "controller": "UserController.getUserList",
      "complexity": 25,
      "service_calls": ["userService.list()"],
      "status": "completed"
    },
    {
      "method": "POST",
      "url": "/api/sync",
      "controller": "SyncController.syncData",
      "complexity": 85,
      "status": "needs_deep_analysis",
      "reason": "高复杂度，包含数据库、HTTP、MQ 多种外部调用"
    }
  ]
}
"""

ORCHESTRATOR_USER_PROMPT = """请分析以下 Vue 页面的数据流向：

页面路径：{page_path}
后端代码路径：{backend_path}

请使用工具自主探索，生成完整的分析报告。
"""
```


**实现文件**: `src/ai_requirement_os/agents/orchestrator.py`

```python
"""主控 Agent 实现"""

from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..tools.java_tools import search_controller_by_url, get_method_source
from ..tools.vue_tools import parse_vue_ast, extract_api_calls
from ..tools.complexity_tools import calculate_method_complexity
from ..prompts.orchestrator import ORCHESTRATOR_SYSTEM_PROMPT, ORCHESTRATOR_USER_PROMPT
from ..config.v2_config import V2Config

class OrchestratorAgent:
    """主控 Agent"""
    
    def __init__(self, config: V2Config):
        self.config = config
        
        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=config.llm_model,
            temperature=config.llm_temperature,
            max_tokens=config.llm_max_tokens
        )
        
        # 准备工具
        self.tools = [
            parse_vue_ast,
            extract_api_calls,
            search_controller_by_url,
            get_method_source,
            calculate_method_complexity
        ]
        
        # 创建 Prompt
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", ORCHESTRATOR_SYSTEM_PROMPT),
            ("human", ORCHESTRATOR_USER_PROMPT),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        # 创建 Agent
        agent = create_openai_tools_agent(self.llm, self.tools, self.prompt)
        
        # 创建 Executor
        self.executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            max_iterations=config.max_iterations,
            verbose=True,
            return_intermediate_steps=True
        )
    
    def analyze(self, page_path: str, backend_path: str) -> Dict[str, Any]:
        """
        分析页面数据流向
        
        Args:
            page_path: Vue 页面路径
            backend_path: 后端代码路径
        
        Returns:
            分析结果
        """
        result = self.executor.invoke({
            "page_path": page_path,
            "backend_path": backend_path
        })
        
        return {
            "output": result["output"],
            "steps": result["intermediate_steps"]
        }
```

**测试文件**: `tests/test_agents/test_orchestrator.py`

```python
import pytest
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

def test_orchestrator_simple_page():
    """测试简单页面分析"""
    config = V2Config(
        backend_path="examples/test_cases/backend",
        frontend_path="examples/test_cases/frontend"
    )
    
    agent = OrchestratorAgent(config)
    
    result = agent.analyze(
        page_path="examples/test_cases/frontend/UserList.vue",
        backend_path="examples/test_cases/backend"
    )
    
    assert "output" in result
    assert "steps" in result
    assert len(result["steps"]) > 0

def test_orchestrator_complex_page():
    """测试复杂页面分析"""
    config = V2Config()
    agent = OrchestratorAgent(config)
    
    result = agent.analyze(
        page_path="examples/test_cases/frontend/Detail.vue",
        backend_path="examples/test_cases/backend"
    )
    
    # 应该有标记为 needs_deep_analysis 的 API
    assert "needs_deep_analysis" in result["output"]
```

### Day 4-5: 创建测试用例

**任务清单**：
- [ ] 准备测试用的 Vue 文件
- [ ] 准备测试用的 Java 文件
- [ ] 编写端到端测试

**测试用例**: `examples/test_cases/frontend/UserList.vue`

```vue
<template>
  <div>
    <el-button @click="loadUsers">加载用户</el-button>
    <el-table :data="users">
      <el-table-column prop="name" label="姓名" />
    </el-table>
  </div>
</template>

<script>
export default {
  data() {
    return {
      users: []
    }
  },
  methods: {
    async loadUsers() {
      const res = await this.$http.get('/api/user/list')
      this.users = res.data
    }
  }
}
</script>
```

**测试用例**: `examples/test_cases/backend/UserController.java`

```java
@RestController
@RequestMapping("/api/user")
public class UserController {
    
    @Autowired
    private UserService userService;
    
    @GetMapping("/list")
    public Result<List<User>> getUserList() {
        List<User> users = userService.list();
        return Result.success(users);
    }
}
```

### Day 6-7: 优化和调试

**任务清单**：
- [ ] 测试各种边界情况
- [ ] 优化工具性能
- [ ] 添加错误处理
- [ ] 编写使用文档

---

## 第三周：LangGraph 集成

### Day 1-3: 设计状态机

**任务清单**：
- [ ] 定义状态结构
- [ ] 设计节点和边
- [ ] 实现基础工作流

**实现文件**: `src/ai_requirement_os/agents/workflow.py`

```python
"""LangGraph 工作流实现"""

from typing import TypedDict, List, Annotated
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
import operator

class AnalysisState(TypedDict):
    """分析状态"""
    # 输入
    page_path: str
    backend_path: str
    
    # 中间状态
    api_calls: List[dict]
    current_api_index: int
    
    # 分析结果
    completed_apis: Annotated[List[dict], operator.add]
    pending_deep_analysis: Annotated[List[dict], operator.add]
    
    # 控制流
    should_continue: bool
    error: str | None

def parse_frontend_node(state: AnalysisState) -> AnalysisState:
    """解析前端节点"""
    from ..tools.vue_tools import parse_vue_ast, extract_api_calls
    
    # 解析 Vue 文件
    ast = parse_vue_ast.invoke({"file_path": state["page_path"]})
    
    # 提取 API 调用
    api_calls = extract_api_calls.invoke({"file_path": state["page_path"]})
    
    return {
        **state,
        "api_calls": [call.dict() for call in api_calls],
        "current_api_index": 0,
        "should_continue": len(api_calls) > 0
    }

def analyze_api_node(state: AnalysisState) -> AnalysisState:
    """分析单个 API 节点"""
    from ..tools.java_tools import search_controller_by_url, get_method_source
    from ..tools.complexity_tools import calculate_method_complexity
    
    if state["current_api_index"] >= len(state["api_calls"]):
        return {**state, "should_continue": False}
    
    api = state["api_calls"][state["current_api_index"]]
    
    # 查找 Controller
    controller = search_controller_by_url.invoke({
        "method": api["method"],
        "url": api["url"]
    })
    
    if not controller:
        return {
            **state,
            "current_api_index": state["current_api_index"] + 1
        }
    
    # 获取方法源码
    source = get_method_source.invoke({
        "class_name": controller.class_name,
        "method_name": controller.method_name
    })
    
    # 计算复杂度
    complexity = calculate_method_complexity.invoke({"source_code": source})
    
    # 判断是否需要深度分析
    if complexity.score >= 60:
        return {
            **state,
            "pending_deep_analysis": [{
                **api,
                "controller": f"{controller.class_name}.{controller.method_name}",
                "complexity": complexity.score,
                "reason": complexity.recommendation
            }],
            "current_api_index": state["current_api_index"] + 1
        }
    else:
        return {
            **state,
            "completed_apis": [{
                **api,
                "controller": f"{controller.class_name}.{controller.method_name}",
                "complexity": complexity.score,
                "status": "completed"
            }],
            "current_api_index": state["current_api_index"] + 1
        }

def should_continue_analysis(state: AnalysisState) -> str:
    """判断是否继续分析"""
    if state["current_api_index"] >= len(state["api_calls"]):
        return "end"
    return "continue"

def create_analysis_workflow() -> StateGraph:
    """创建分析工作流"""
    workflow = StateGraph(AnalysisState)
    
    # 添加节点
    workflow.add_node("parse_frontend", parse_frontend_node)
    workflow.add_node("analyze_api", analyze_api_node)
    
    # 添加边
    workflow.set_entry_point("parse_frontend")
    workflow.add_edge("parse_frontend", "analyze_api")
    workflow.add_conditional_edges(
        "analyze_api",
        should_continue_analysis,
        {
            "continue": "analyze_api",
            "end": END
        }
    )
    
    return workflow.compile()
```


**测试文件**: `tests/test_workflow/test_langgraph.py`

```python
import pytest
from ai_requirement_os.agents.workflow import create_analysis_workflow, AnalysisState

def test_workflow_simple_case():
    """测试简单工作流"""
    workflow = create_analysis_workflow()
    
    initial_state: AnalysisState = {
        "page_path": "examples/test_cases/frontend/UserList.vue",
        "backend_path": "examples/test_cases/backend",
        "api_calls": [],
        "current_api_index": 0,
        "completed_apis": [],
        "pending_deep_analysis": [],
        "should_continue": True,
        "error": None
    }
    
    result = workflow.invoke(initial_state)
    
    assert len(result["completed_apis"]) > 0 or len(result["pending_deep_analysis"]) > 0
    assert result["error"] is None

def test_workflow_complex_case():
    """测试复杂工作流"""
    workflow = create_analysis_workflow()
    
    initial_state: AnalysisState = {
        "page_path": "examples/test_cases/frontend/Detail.vue",
        "backend_path": "examples/test_cases/backend",
        "api_calls": [],
        "current_api_index": 0,
        "completed_apis": [],
        "pending_deep_analysis": [],
        "should_continue": True,
        "error": None
    }
    
    result = workflow.invoke(initial_state)
    
    # 应该有需要深度分析的 API
    assert len(result["pending_deep_analysis"]) > 0
```

### Day 4-5: 添加并行执行

**任务清单**：
- [ ] 实现并行 API 分析
- [ ] 添加超时控制
- [ ] 测试并发性能

**实现文件**: `src/ai_requirement_os/agents/parallel_workflow.py`

```python
"""并行工作流实现"""

import asyncio
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

async def analyze_api_parallel(api_calls: List[dict], backend_path: str, max_workers: int = 5) -> Dict:
    """
    并行分析多个 API
    
    Args:
        api_calls: API 调用列表
        backend_path: 后端代码路径
        max_workers: 最大并发数
    
    Returns:
        分析结果
    """
    from ..tools.java_tools import search_controller_by_url, get_method_source
    from ..tools.complexity_tools import calculate_method_complexity
    
    completed = []
    pending = []
    
    def analyze_single_api(api: dict) -> dict:
        """分析单个 API"""
        try:
            # 查找 Controller
            controller = search_controller_by_url.invoke({
                "method": api["method"],
                "url": api["url"]
            })
            
            if not controller:
                return {"api": api, "status": "not_found"}
            
            # 获取源码
            source = get_method_source.invoke({
                "class_name": controller.class_name,
                "method_name": controller.method_name
            })
            
            # 计算复杂度
            complexity = calculate_method_complexity.invoke({"source_code": source})
            
            return {
                "api": api,
                "controller": f"{controller.class_name}.{controller.method_name}",
                "complexity": complexity.score,
                "status": "needs_deep_analysis" if complexity.score >= 60 else "completed",
                "reason": complexity.recommendation
            }
        except Exception as e:
            return {"api": api, "status": "error", "error": str(e)}
    
    # 使用线程池并行执行
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(analyze_single_api, api): api for api in api_calls}
        
        for future in as_completed(futures):
            result = future.result()
            if result["status"] == "needs_deep_analysis":
                pending.append(result)
            else:
                completed.append(result)
    
    return {
        "completed_apis": completed,
        "pending_deep_analysis": pending
    }
```

### Day 6-7: 集成测试

**任务清单**：
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 压力测试

---

## 第四周：多 Agent 协同

### Day 1-2: 实现前端追踪 Agent

**实现文件**: `src/ai_requirement_os/prompts/frontend_tracker.py`

```python
"""前端追踪 Agent Prompt"""

FRONTEND_TRACKER_SYSTEM_PROMPT = """你是一个前端代码分析专家，专注于 Vue 页面分析。

你的任务是：
1. 解析 Vue 文件的结构（template, script, style）
2. 提取所有的 API 调用（包括 axios, fetch, $http 等）
3. 识别表单字段和数据绑定
4. 分析用户交互流程（按钮点击、表单提交等）

可用工具：
- parse_vue_ast: 解析 Vue 文件 AST
- extract_api_calls: 提取 API 调用
- get_form_fields: 获取表单字段

输出格式：
{
  "page_info": {
    "path": "xxx.vue",
    "component_name": "Detail",
    "description": "详情页面"
  },
  "api_calls": [
    {
      "method": "GET",
      "url": "/api/detail/info",
      "trigger": "onMounted",
      "purpose": "加载详情数据"
    }
  ],
  "form_fields": [
    {
      "name": "userName",
      "label": "用户名",
      "type": "input",
      "required": true
    }
  ],
  "user_actions": [
    {
      "action": "点击保存按钮",
      "triggers": ["POST /api/detail/save"]
    }
  ]
}

重要规则：
- 只关注前端，不要尝试分析后端代码
- 输出要详细，包含所有发现的 API 和字段
- 如果发现复杂的前端逻辑（如 Vuex、复杂计算属性），也要标注
"""
```

**实现文件**: `src/ai_requirement_os/agents/frontend_tracker.py`

```python
"""前端追踪 Agent 实现"""

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..tools.vue_tools import parse_vue_ast, extract_api_calls, get_form_fields
from ..prompts.frontend_tracker import FRONTEND_TRACKER_SYSTEM_PROMPT
from ..config.v2_config import V2Config

class FrontendTrackerAgent:
    """前端追踪 Agent"""
    
    def __init__(self, config: V2Config):
        self.config = config
        self.llm = ChatOpenAI(
            model=config.llm_model,
            temperature=config.llm_temperature
        )
        
        self.tools = [
            parse_vue_ast,
            extract_api_calls,
            get_form_fields
        ]
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", FRONTEND_TRACKER_SYSTEM_PROMPT),
            ("human", "请分析以下 Vue 页面：{page_path}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_tools_agent(self.llm, self.tools, self.prompt)
        self.executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            max_iterations=10,
            verbose=True
        )
    
    def analyze(self, page_path: str) -> dict:
        """分析前端页面"""
        result = self.executor.invoke({"page_path": page_path})
        return result
```

### Day 3-4: 实现后端侦探 Agent

**实现文件**: `src/ai_requirement_os/prompts/backend_detective.py`

```python
"""后端侦探 Agent Prompt"""

BACKEND_DETECTIVE_SYSTEM_PROMPT = """你是一个后端代码侦探，专注于追踪 API 的实现细节。

你的任务是：
1. 根据 HTTP 方法和 URL，找到对应的 Controller 方法
2. 分析 Controller 方法的实现
3. 追踪 Service 层调用（最多 2 层）
4. 评估每个方法的复杂度
5. 对于高复杂度方法（>60），立即停止并标记

可用工具：
- search_controller_by_url: 查找 Controller
- get_method_source: 获取方法源码
- calculate_method_complexity: 计算复杂度
- analyze_dependencies: 分析依赖
- detect_external_calls: 检测外部调用

工作流程：
1. 使用 search_controller_by_url 找到 Controller
2. 使用 get_method_source 获取源码
3. 使用 calculate_method_complexity 评估复杂度
4. 如果复杂度 < 60，继续追踪 Service
5. 如果复杂度 >= 60，停止并返回"需要深度分析"

输出格式：
{
  "api": {
    "method": "GET",
    "url": "/api/detail/info"
  },
  "controller": {
    "class": "DetailController",
    "method": "getDetailInfo",
    "complexity": 25
  },
  "service_chain": [
    {
      "class": "DetailService",
      "method": "getInfo",
      "complexity": 30
    }
  ],
  "external_calls": {
    "database": ["detailMapper.selectById"],
    "http": [],
    "mq": []
  },
  "status": "completed",
  "trace_depth": 2
}

重要规则：
- 最多追踪 2 层（Controller → Service，不再往下）
- 遇到复杂度 >= 60 立即停止
- 不要尝试分析前端代码
- 输出要结构化，便于后续处理
"""
```

**实现文件**: `src/ai_requirement_os/agents/backend_detective.py`

```python
"""后端侦探 Agent 实现"""

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..tools.java_tools import search_controller_by_url, get_method_source
from ..tools.complexity_tools import (
    calculate_method_complexity,
    analyze_dependencies,
    detect_external_calls
)
from ..prompts.backend_detective import BACKEND_DETECTIVE_SYSTEM_PROMPT
from ..config.v2_config import V2Config

class BackendDetectiveAgent:
    """后端侦探 Agent"""
    
    def __init__(self, config: V2Config):
        self.config = config
        self.llm = ChatOpenAI(
            model=config.llm_model,
            temperature=config.llm_temperature
        )
        
        self.tools = [
            search_controller_by_url,
            get_method_source,
            calculate_method_complexity,
            analyze_dependencies,
            detect_external_calls
        ]
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", BACKEND_DETECTIVE_SYSTEM_PROMPT),
            ("human", "请追踪以下 API：{method} {url}\n后端代码路径：{backend_path}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_tools_agent(self.llm, self.tools, self.prompt)
        self.executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            max_iterations=self.config.max_iterations,
            verbose=True
        )
    
    def analyze(self, method: str, url: str, backend_path: str) -> dict:
        """追踪 API 实现"""
        result = self.executor.invoke({
            "method": method,
            "url": url,
            "backend_path": backend_path
        })
        return result
```


### Day 5-6: 实现深度逻辑专家 Agent

**实现文件**: `src/ai_requirement_os/agents/deep_logic_expert.py`

```python
"""深度逻辑专家 Agent"""

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..tools.java_tools import get_method_source, analyze_dependencies
from ..tools.complexity_tools import detect_external_calls
from ..config.v2_config import V2Config

DEEP_LOGIC_EXPERT_PROMPT = """你是一个深度代码分析专家，专门处理复杂的业务逻辑。

你的任务是：
1. 深入分析复杂方法的实现细节
2. 识别所有的外部依赖（数据库、HTTP、MQ、缓存等）
3. 理解业务流程和数据流转
4. 生成详细的分析报告

可用工具：
- get_method_source: 获取方法源码
- analyze_dependencies: 分析依赖关系
- detect_external_calls: 检测外部调用

输出格式：
{
  "method_info": {
    "class": "SyncService",
    "method": "syncWithBank",
    "complexity": 85
  },
  "business_logic": "该方法负责与银行系统同步数据，包括...",
  "data_flow": [
    "1. 从数据库查询待同步记录",
    "2. 调用银行 API 获取最新数据",
    "3. 比对差异并更新本地数据",
    "4. 发送 MQ 消息通知其他系统"
  ],
  "external_dependencies": {
    "database": ["accountMapper.selectPending", "accountMapper.update"],
    "http": ["bankApiClient.queryAccount"],
    "mq": ["rabbitTemplate.send"],
    "cache": ["redisTemplate.get"]
  },
  "risk_points": [
    "银行 API 可能超时",
    "数据库事务较长",
    "MQ 消息可能丢失"
  ],
  "optimization_suggestions": [
    "考虑异步处理",
    "添加重试机制",
    "优化数据库查询"
  ]
}

重要规则：
- 这是后台任务，可以花更多时间深入分析
- 要理解业务逻辑，不只是列出代码
- 识别潜在的风险点和优化建议
- 输出要对开发者有实际帮助
"""

class DeepLogicExpertAgent:
    """深度逻辑专家 Agent"""
    
    def __init__(self, config: V2Config):
        self.config = config
        self.llm = ChatOpenAI(
            model=config.llm_model,
            temperature=0.1,  # 稍高一点，允许更多推理
            max_tokens=8000  # 更长的输出
        )
        
        self.tools = [
            get_method_source,
            analyze_dependencies,
            detect_external_calls
        ]
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", DEEP_LOGIC_EXPERT_PROMPT),
            ("human", "请深度分析以下方法：\n类名：{class_name}\n方法名：{method_name}\n后端路径：{backend_path}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_tools_agent(self.llm, self.tools, self.prompt)
        self.executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            max_iterations=20,  # 允许更多迭代
            verbose=True
        )
    
    def analyze(self, class_name: str, method_name: str, backend_path: str) -> dict:
        """深度分析方法"""
        result = self.executor.invoke({
            "class_name": class_name,
            "method_name": method_name,
            "backend_path": backend_path
        })
        return result
```

### Day 7: 多 Agent 协同测试

**实现文件**: `tests/test_agents/test_multi_agent.py`

```python
import pytest
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.agents.frontend_tracker import FrontendTrackerAgent
from ai_requirement_os.agents.backend_detective import BackendDetectiveAgent
from ai_requirement_os.agents.deep_logic_expert import DeepLogicExpertAgent
from ai_requirement_os.config.v2_config import V2Config

def test_multi_agent_collaboration():
    """测试多 Agent 协同"""
    config = V2Config(
        backend_path="examples/test_cases/backend",
        frontend_path="examples/test_cases/frontend"
    )
    
    # 1. 前端 Agent 分析页面
    frontend_agent = FrontendTrackerAgent(config)
    frontend_result = frontend_agent.analyze("examples/test_cases/frontend/Detail.vue")
    
    assert "api_calls" in frontend_result["output"]
    
    # 2. 后端 Agent 追踪每个 API
    backend_agent = BackendDetectiveAgent(config)
    api_results = []
    
    for api in frontend_result["output"]["api_calls"]:
        result = backend_agent.analyze(
            method=api["method"],
            url=api["url"],
            backend_path=config.backend_path
        )
        api_results.append(result)
    
    # 3. 对于复杂方法，启动深度分析
    deep_agent = DeepLogicExpertAgent(config)
    deep_results = []
    
    for result in api_results:
        if result["output"].get("status") == "needs_deep_analysis":
            controller = result["output"]["controller"]
            deep_result = deep_agent.analyze(
                class_name=controller["class"],
                method_name=controller["method"],
                backend_path=config.backend_path
            )
            deep_results.append(deep_result)
    
    assert len(api_results) > 0
    # 复杂页面应该有需要深度分析的方法
    assert len(deep_results) > 0
```

---

## 第五周：流式可视化

### Day 1-3: 实现流式输出

**任务清单**：
- [ ] 实现 SSE (Server-Sent Events) 接口
- [ ] 添加实时事件推送
- [ ] 前端实时展示

**实现文件**: `src/ai_requirement_os/api/streaming.py`

```python
"""流式输出 API"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
import json
import asyncio

router = APIRouter()

async def analysis_event_generator(page_path: str, backend_path: str) -> AsyncGenerator[str, None]:
    """
    生成分析事件流
    
    Yields:
        SSE 格式的事件
    """
    from ..agents.orchestrator import OrchestratorAgent
    from ..config.v2_config import V2Config
    
    config = V2Config(backend_path=backend_path)
    agent = OrchestratorAgent(config)
    
    # 发送开始事件
    yield f"data: {json.dumps({'type': 'start', 'message': '开始分析页面'})}\n\n"
    await asyncio.sleep(0.1)
    
    # 发送前端分析事件
    yield f"data: {json.dumps({'type': 'frontend_analysis', 'message': '正在解析 Vue 文件...'})}\n\n"
    await asyncio.sleep(0.5)
    
    # 发送 API 发现事件
    yield f"data: {json.dumps({'type': 'api_discovered', 'count': 3, 'message': '发现 3 个 API 调用'})}\n\n"
    await asyncio.sleep(0.5)
    
    # 发送后端追踪事件
    for i in range(3):
        yield f"data: {json.dumps({'type': 'backend_trace', 'api_index': i, 'message': f'正在追踪 API {i+1}/3'})}\n\n"
        await asyncio.sleep(1)
    
    # 发送深度分析事件
    yield f"data: {json.dumps({'type': 'deep_analysis', 'message': '发现复杂方法，启动后台深度分析'})}\n\n"
    await asyncio.sleep(0.5)
    
    # 发送完成事件
    result = agent.analyze(page_path, backend_path)
    yield f"data: {json.dumps({'type': 'complete', 'result': result['output']})}\n\n"

@router.get("/api/v2/analyze/stream")
async def stream_analysis(page_path: str, backend_path: str):
    """
    流式分析接口
    
    Args:
        page_path: Vue 页面路径
        backend_path: 后端代码路径
    
    Returns:
        SSE 流
    """
    return StreamingResponse(
        analysis_event_generator(page_path, backend_path),
        media_type="text/event-stream"
    )
```

**前端实现**: `src/ai_requirement_os/web/assets/v2-stream-viewer.js`

```javascript
/**
 * V2 流式分析查看器
 */
class V2StreamViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.eventSource = null;
        this.events = [];
    }
    
    startAnalysis(pagePath, backendPath) {
        const url = `/api/v2/analyze/stream?page_path=${encodeURIComponent(pagePath)}&backend_path=${encodeURIComponent(backendPath)}`;
        
        this.eventSource = new EventSource(url);
        
        this.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleEvent(data);
        };
        
        this.eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            this.eventSource.close();
        };
    }
    
    handleEvent(event) {
        this.events.push(event);
        
        switch (event.type) {
            case 'start':
                this.showStartEvent(event);
                break;
            case 'frontend_analysis':
                this.showFrontendEvent(event);
                break;
            case 'api_discovered':
                this.showApiDiscoveredEvent(event);
                break;
            case 'backend_trace':
                this.showBackendTraceEvent(event);
                break;
            case 'deep_analysis':
                this.showDeepAnalysisEvent(event);
                break;
            case 'complete':
                this.showCompleteEvent(event);
                this.eventSource.close();
                break;
        }
    }
    
    showStartEvent(event) {
        this.addLogEntry('🟢 开始', event.message);
    }
    
    showFrontendEvent(event) {
        this.addLogEntry('🔵 前端分析', event.message);
    }
    
    showApiDiscoveredEvent(event) {
        this.addLogEntry('🟡 API 发现', `${event.message} (${event.count} 个)`);
    }
    
    showBackendTraceEvent(event) {
        this.addLogEntry('🟠 后端追踪', event.message);
    }
    
    showDeepAnalysisEvent(event) {
        this.addLogEntry('🔴 深度分析', event.message);
    }
    
    showCompleteEvent(event) {
        this.addLogEntry('✅ 完成', '分析完成');
        this.showResult(event.result);
    }
    
    addLogEntry(label, message) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-time">${new Date().toLocaleTimeString()}</span>
            <span class="log-label">${label}</span>
            <span class="log-message">${message}</span>
        `;
        this.container.appendChild(logEntry);
        this.container.scrollTop = this.container.scrollHeight;
    }
    
    showResult(result) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'analysis-result';
        resultDiv.innerHTML = `
            <h3>分析结果</h3>
            <pre>${JSON.stringify(result, null, 2)}</pre>
        `;
        this.container.appendChild(resultDiv);
    }
}
```

### Day 4-5: 优化用户体验

**任务清单**：
- [ ] 添加进度条
- [ ] 添加动画效果
- [ ] 优化布局

**CSS 文件**: `src/ai_requirement_os/web/assets/v2-stream-viewer.css`

```css
.v2-stream-viewer {
    font-family: 'Monaco', 'Menlo', monospace;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 20px;
    border-radius: 8px;
    max-height: 600px;
    overflow-y: auto;
}

.log-entry {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #333;
    animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.log-time {
    color: #858585;
    margin-right: 12px;
    font-size: 12px;
}

.log-label {
    font-weight: bold;
    margin-right: 12px;
    min-width: 100px;
}

.log-message {
    flex: 1;
}

.analysis-result {
    margin-top: 20px;
    padding: 20px;
    background: #252526;
    border-radius: 4px;
    border-left: 4px solid #4ec9b0;
}

.analysis-result h3 {
    margin-top: 0;
    color: #4ec9b0;
}

.analysis-result pre {
    background: #1e1e1e;
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
}
```

### Day 6-7: 集成到 Workbench

**任务清单**：
- [ ] 添加 V2 分析标签页
- [ ] 集成流式查看器
- [ ] 测试完整流程

---

## 第六周：深度分析和记忆

### Day 1-3: 实现向量存储

**任务清单**：
- [ ] 集成 ChromaDB
- [ ] 实现分析结果存储
- [ ] 实现相似度搜索

**实现文件**: `src/ai_requirement_os/memory/vector_store.py`

```python
"""向量存储实现"""

import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any
from pathlib import Path

class VectorStore:
    """向量存储"""
    
    def __init__(self, persist_directory: str = "./.memory/chroma"):
        """初始化向量存储"""
        Path(persist_directory).mkdir(parents=True, exist_ok=True)
        
        self.client = chromadb.Client(Settings(
            persist_directory=persist_directory,
            anonymized_telemetry=False
        ))
        
        self.collection = self.client.get_or_create_collection(
            name="code_analysis",
            metadata={"description": "代码分析结果"}
        )
    
    def store_analysis(self, analysis_id: str, content: Dict[str, Any], metadata: Dict[str, Any]):
        """
        存储分析结果
        
        Args:
            analysis_id: 分析 ID
            content: 分析内容
            metadata: 元数据
        """
        import json
        
        self.collection.add(
            ids=[analysis_id],
            documents=[json.dumps(content, ensure_ascii=False)],
            metadatas=[metadata]
        )
    
    def search_similar(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """
        搜索相似分析
        
        Args:
            query: 查询文本
            n_results: 返回结果数
        
        Returns:
            相似分析列表
        """
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )
        
        return [
            {
                "id": results["ids"][0][i],
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i]
            }
            for i in range(len(results["ids"][0]))
        ]
    
    def check_memory(self, class_name: str, method_name: str) -> Dict[str, Any] | None:
        """
        检查是否已分析过某个方法
        
        Args:
            class_name: 类名
            method_name: 方法名
        
        Returns:
            分析结果或 None
        """
        results = self.collection.query(
            query_texts=[f"{class_name}.{method_name}"],
            n_results=1,
            where={
                "class_name": class_name,
                "method_name": method_name
            }
        )
        
        if len(results["ids"][0]) > 0:
            import json
            return json.loads(results["documents"][0][0])
        
        return None
```


### Day 4-5: 集成记忆系统

**任务清单**：
- [ ] 在 Agent 中集成记忆
- [ ] 实现经验复用
- [ ] 测试记忆效果

**实现文件**: `src/ai_requirement_os/agents/memory_enhanced_agent.py`

```python
"""带记忆的 Agent"""

from ..memory.vector_store import VectorStore
from ..agents.backend_detective import BackendDetectiveAgent
from ..config.v2_config import V2Config

class MemoryEnhancedBackendAgent(BackendDetectiveAgent):
    """带记忆的后端侦探 Agent"""
    
    def __init__(self, config: V2Config):
        super().__init__(config)
        self.memory = VectorStore(config.vector_db_path)
    
    def analyze(self, method: str, url: str, backend_path: str) -> dict:
        """
        追踪 API 实现（带记忆）
        
        Args:
            method: HTTP 方法
            url: API 路径
            backend_path: 后端代码路径
        
        Returns:
            分析结果
        """
        # 1. 先查找 Controller
        from ..tools.java_tools import search_controller_by_url
        
        controller = search_controller_by_url.invoke({
            "method": method,
            "url": url
        })
        
        if not controller:
            return {"status": "not_found"}
        
        # 2. 检查记忆中是否已分析过
        cached = self.memory.check_memory(
            class_name=controller.class_name,
            method_name=controller.method_name
        )
        
        if cached:
            print(f"✅ 从记忆中找到 {controller.class_name}.{controller.method_name} 的分析结果")
            return {
                "status": "from_cache",
                "result": cached,
                "message": "使用缓存的分析结果"
            }
        
        # 3. 没有缓存，执行正常分析
        print(f"🔍 首次分析 {controller.class_name}.{controller.method_name}")
        result = super().analyze(method, url, backend_path)
        
        # 4. 存储到记忆中
        self.memory.store_analysis(
            analysis_id=f"{controller.class_name}_{controller.method_name}",
            content=result["output"],
            metadata={
                "class_name": controller.class_name,
                "method_name": controller.method_name,
                "api_method": method,
                "api_url": url
            }
        )
        
        return result
```

**测试文件**: `tests/test_memory/test_vector_store.py`

```python
import pytest
from ai_requirement_os.memory.vector_store import VectorStore

def test_store_and_retrieve():
    """测试存储和检索"""
    store = VectorStore(persist_directory="./.memory/test")
    
    # 存储分析结果
    store.store_analysis(
        analysis_id="UserController_getUserList",
        content={
            "controller": "UserController.getUserList",
            "complexity": 25,
            "status": "completed"
        },
        metadata={
            "class_name": "UserController",
            "method_name": "getUserList"
        }
    )
    
    # 检查记忆
    result = store.check_memory("UserController", "getUserList")
    
    assert result is not None
    assert result["controller"] == "UserController.getUserList"
    assert result["complexity"] == 25

def test_search_similar():
    """测试相似度搜索"""
    store = VectorStore(persist_directory="./.memory/test")
    
    # 搜索相似分析
    results = store.search_similar("用户列表查询", n_results=3)
    
    assert len(results) > 0
    assert "id" in results[0]
    assert "content" in results[0]
```

### Day 6-7: 知识图谱（可选）

**任务清单**：
- [ ] 设计图谱结构
- [ ] 实现基础图谱
- [ ] 可视化展示

**实现文件**: `src/ai_requirement_os/memory/knowledge_graph.py`

```python
"""知识图谱实现（可选）"""

from typing import List, Dict, Any
import json
from pathlib import Path

class SimpleKnowledgeGraph:
    """简单的知识图谱（基于文件）"""
    
    def __init__(self, graph_file: str = "./.memory/knowledge_graph.json"):
        self.graph_file = Path(graph_file)
        self.graph = self._load_graph()
    
    def _load_graph(self) -> Dict[str, Any]:
        """加载图谱"""
        if self.graph_file.exists():
            return json.loads(self.graph_file.read_text())
        return {"nodes": {}, "edges": []}
    
    def _save_graph(self):
        """保存图谱"""
        self.graph_file.parent.mkdir(parents=True, exist_ok=True)
        self.graph_file.write_text(json.dumps(self.graph, indent=2, ensure_ascii=False))
    
    def add_node(self, node_id: str, node_type: str, properties: Dict[str, Any]):
        """
        添加节点
        
        Args:
            node_id: 节点 ID
            node_type: 节点类型（Controller, Service, Mapper, API 等）
            properties: 节点属性
        """
        self.graph["nodes"][node_id] = {
            "type": node_type,
            "properties": properties
        }
        self._save_graph()
    
    def add_edge(self, from_id: str, to_id: str, relation: str):
        """
        添加边
        
        Args:
            from_id: 起始节点
            to_id: 目标节点
            relation: 关系类型（calls, uses, depends_on 等）
        """
        self.graph["edges"].append({
            "from": from_id,
            "to": to_id,
            "relation": relation
        })
        self._save_graph()
    
    def get_dependencies(self, node_id: str) -> List[str]:
        """
        获取节点的依赖
        
        Args:
            node_id: 节点 ID
        
        Returns:
            依赖节点列表
        """
        return [
            edge["to"]
            for edge in self.graph["edges"]
            if edge["from"] == node_id
        ]
    
    def get_callers(self, node_id: str) -> List[str]:
        """
        获取调用该节点的节点
        
        Args:
            node_id: 节点 ID
        
        Returns:
            调用者节点列表
        """
        return [
            edge["from"]
            for edge in self.graph["edges"]
            if edge["to"] == node_id
        ]
```

---

## 测试和优化

### 性能测试

**测试文件**: `tests/test_performance/test_v2_performance.py`

```python
import pytest
import time
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

def test_analysis_speed():
    """测试分析速度"""
    config = V2Config(
        backend_path="examples/test_cases/backend",
        frontend_path="examples/test_cases/frontend"
    )
    
    agent = OrchestratorAgent(config)
    
    start_time = time.time()
    result = agent.analyze(
        page_path="examples/test_cases/frontend/Detail.vue",
        backend_path=config.backend_path
    )
    end_time = time.time()
    
    duration = end_time - start_time
    
    print(f"分析耗时: {duration:.2f} 秒")
    
    # 期望在 30 秒内完成
    assert duration < 30

def test_parallel_performance():
    """测试并行性能"""
    from ai_requirement_os.agents.parallel_workflow import analyze_api_parallel
    
    api_calls = [
        {"method": "GET", "url": "/api/user/list"},
        {"method": "GET", "url": "/api/detail/info"},
        {"method": "POST", "url": "/api/sync/data"}
    ]
    
    start_time = time.time()
    result = analyze_api_parallel(api_calls, "examples/test_cases/backend")
    end_time = time.time()
    
    duration = end_time - start_time
    
    print(f"并行分析耗时: {duration:.2f} 秒")
    
    # 并行应该比串行快
    assert duration < 15

def test_memory_hit_rate():
    """测试记忆命中率"""
    from ai_requirement_os.agents.memory_enhanced_agent import MemoryEnhancedBackendAgent
    
    config = V2Config()
    agent = MemoryEnhancedBackendAgent(config)
    
    # 第一次分析
    start_time = time.time()
    result1 = agent.analyze("GET", "/api/user/list", config.backend_path)
    first_duration = time.time() - start_time
    
    # 第二次分析（应该命中缓存）
    start_time = time.time()
    result2 = agent.analyze("GET", "/api/user/list", config.backend_path)
    second_duration = time.time() - start_time
    
    print(f"首次分析: {first_duration:.2f} 秒")
    print(f"缓存命中: {second_duration:.2f} 秒")
    
    # 缓存应该显著更快
    assert second_duration < first_duration * 0.1
    assert result2["status"] == "from_cache"
```

### 质量测试

**测试文件**: `tests/test_quality/test_v2_quality.py`

```python
import pytest
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

def test_analysis_completeness():
    """测试分析完整性"""
    config = V2Config()
    agent = OrchestratorAgent(config)
    
    result = agent.analyze(
        page_path="examples/test_cases/frontend/Detail.vue",
        backend_path=config.backend_path
    )
    
    output = result["output"]
    
    # 检查必要字段
    assert "page_path" in output
    assert "apis" in output
    assert len(output["apis"]) > 0
    
    # 检查每个 API 的信息
    for api in output["apis"]:
        assert "method" in api
        assert "url" in api
        assert "controller" in api
        assert "complexity" in api
        assert "status" in api

def test_complexity_threshold():
    """测试复杂度阈值"""
    config = V2Config(complexity_threshold=60)
    agent = OrchestratorAgent(config)
    
    result = agent.analyze(
        page_path="examples/test_cases/frontend/ComplexPage.vue",
        backend_path=config.backend_path
    )
    
    output = result["output"]
    
    # 应该有标记为需要深度分析的 API
    needs_deep = [api for api in output["apis"] if api["status"] == "needs_deep_analysis"]
    assert len(needs_deep) > 0
    
    # 复杂度应该都 >= 60
    for api in needs_deep:
        assert api["complexity"] >= 60

def test_trace_depth_limit():
    """测试追踪深度限制"""
    config = V2Config(max_trace_depth=2)
    agent = OrchestratorAgent(config)
    
    result = agent.analyze(
        page_path="examples/test_cases/frontend/DeepNested.vue",
        backend_path=config.backend_path
    )
    
    output = result["output"]
    
    # 检查追踪深度
    for api in output["apis"]:
        if "service_chain" in api:
            assert len(api["service_chain"]) <= 2
```

---

## 故障排查

### 常见问题

#### 1. 工具调用失败

**问题**: Agent 调用工具时报错

**解决方案**:
```python
# 检查工具是否正确注册
from langchain.tools import tool

@tool
def my_tool(param: str) -> str:
    """工具描述"""
    return "result"

# 确保工具有正确的类型注解和文档字符串
```

#### 2. LangGraph 状态更新问题

**问题**: 状态没有正确更新

**解决方案**:
```python
# 使用 Annotated 和 operator.add 来累积列表
from typing import Annotated
import operator

class State(TypedDict):
    items: Annotated[List[str], operator.add]

# 返回时使用字典更新
return {**state, "items": ["new_item"]}
```

#### 3. 并发问题

**问题**: 并行执行时出现竞态条件

**解决方案**:
```python
# 使用线程安全的数据结构
from threading import Lock

lock = Lock()

def thread_safe_operation():
    with lock:
        # 临界区代码
        pass
```

#### 4. 记忆系统性能问题

**问题**: 向量搜索太慢

**解决方案**:
```python
# 1. 限制搜索结果数量
results = store.search_similar(query, n_results=5)

# 2. 使用更小的嵌入模型
# 3. 添加缓存层
from functools import lru_cache

@lru_cache(maxsize=100)
def cached_search(query: str):
    return store.search_similar(query)
```

---

## 从 V1 迁移到 V2

### 迁移步骤

1. **保留 V1 代码**
   ```bash
   # 不要删除 V1 代码，保持向后兼容
   # V1 和 V2 可以共存
   ```

2. **逐步迁移 API**
   ```python
   # 在 app.py 中添加 V2 路由
   from .api.streaming import router as v2_router
   
   app.include_router(v2_router, prefix="/v2")
   ```

3. **数据格式兼容**
   ```python
   # 确保 V2 输出可以转换为 V1 格式
   def convert_v2_to_v1(v2_result: dict) -> dict:
       """将 V2 结果转换为 V1 格式"""
       return {
           "page_path": v2_result["page_path"],
           "apis": v2_result["apis"],
           # ... 其他字段映射
       }
   ```

4. **前端切换**
   ```javascript
   // 在 workbench 中添加版本切换
   const version = localStorage.getItem('analysis_version') || 'v1';
   
   if (version === 'v2') {
       // 使用 V2 API
   } else {
       // 使用 V1 API
   }
   ```

### 对比测试

**测试文件**: `tests/test_migration/test_v1_v2_comparison.py`

```python
import pytest
from ai_requirement_os.llm.page_lineage_generator import generate_page_lineage_with_trace
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

def test_v1_v2_output_compatibility():
    """测试 V1 和 V2 输出兼容性"""
    page_path = "examples/test_cases/frontend/Detail.vue"
    backend_path = "examples/test_cases/backend"
    
    # V1 分析
    v1_result = generate_page_lineage_with_trace(page_path, backend_path)
    
    # V2 分析
    config = V2Config(backend_path=backend_path)
    agent = OrchestratorAgent(config)
    v2_result = agent.analyze(page_path, backend_path)
    
    # 检查关键字段是否存在
    assert "page_path" in v1_result
    assert "page_path" in v2_result["output"]
    
    # V2 应该提供更多信息
    assert len(v2_result["steps"]) > 0
```

---

## 快速开始教程

### 5 分钟快速体验

```bash
# 1. 安装依赖
cd ai-core
uv sync
uv add langgraph javalang tree-sitter chromadb

# 2. 配置环境
cp .env.example .env
# 编辑 .env，设置 DEEPSEEK_API_KEY

# 3. 运行测试用例
uv run pytest tests/test_agents/test_orchestrator.py -v

# 4. 启动 Web 服务
uv run python -m ai_requirement_os.api.app

# 5. 访问 Workbench
open http://localhost:8000/workbench
```

### 第一个 V2 分析

```python
from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config

# 创建配置
config = V2Config(
    backend_path="/path/to/your/backend",
    frontend_path="/path/to/your/frontend"
)

# 创建 Agent
agent = OrchestratorAgent(config)

# 执行分析
result = agent.analyze(
    page_path="/path/to/your/frontend/Detail.vue",
    backend_path=config.backend_path
)

# 查看结果
print(result["output"])
```

---

## 总结

### V2 核心优势

1. **真正的 Agentic 行为**: Agent 自主决策，不是被动执行
2. **LSP 级别的工具**: 精确的代码分析，不是文本处理
3. **状态机编排**: LangGraph 提供灵活的控制流
4. **流式可视化**: 实时看到 Agent 的思考过程
5. **记忆系统**: 越用越聪明，避免重复分析
6. **并行执行**: 多个 API 同时分析，提升效率
7. **复杂度感知**: 自动识别复杂逻辑，启动深度分析

### 开发优先级

**第一周** (最重要):
- ✅ Java 工具: `search_controller_by_url`, `get_method_source`
- ✅ Vue 工具: `extract_api_calls`
- ✅ 复杂度工具: `calculate_method_complexity`

**第二周**:
- ✅ 单 Agent 验证
- ✅ 端到端测试

**第三周**:
- ✅ LangGraph 集成
- ✅ 并行执行

**第四周**:
- ✅ 多 Agent 协同
- ✅ 深度分析 Agent

**第五周**:
- ✅ 流式输出
- ✅ 前端可视化

**第六周**:
- ✅ 记忆系统
- ✅ 性能优化

### 成功指标

- [ ] 单页面分析时间 < 30 秒
- [ ] 复杂度评估准确率 > 90%
- [ ] 记忆命中率 > 50%（第二次分析）
- [ ] 并行效率提升 > 3x
- [ ] 用户满意度 > 4.5/5

---

## 附录

### 参考资料

- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [LangChain 工具开发指南](https://python.langchain.com/docs/modules/agents/tools/)
- [ChromaDB 文档](https://docs.trychroma.com/)
- [Tree-sitter 文档](https://tree-sitter.github.io/tree-sitter/)

### 示例代码仓库

- `examples/test_cases/`: 完整的测试用例
- `tests/`: 单元测试和集成测试
- `docs/`: 详细文档

### 联系方式

如有问题，请查看:
- `TROUBLESHOOTING.md`: 故障排查指南
- `V2_MULTI_AGENT_ARCHITECTURE.md`: 架构设计文档
