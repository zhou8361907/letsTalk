"""Simple Agent 演示

展示如何使用 Pi 风格的极简 Agent
"""

from openai import OpenAI
from src.ai_requirement_os.simple_agent import SimpleAgent, Tool, ToolRegistry


# ==================== 1. 定义工具 ====================

# 方式 1: 使用注册器（推荐）
registry = ToolRegistry()

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
def parse_vue_ast(file_path: str):
    """解析 Vue AST（模拟）"""
    return {
        "file_path": file_path,
        "component_name": "Detail",
        "data_fields": ["tableData", "searchForm", "loading"],
        "methods": ["loadData", "handleSearch", "handleReset"],
        "computed": ["filteredData"]
    }


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
def extract_api_calls(file_path: str):
    """提取 API 调用（模拟）"""
    return [
        {
            "method": "GET",
            "url": "/api/detail",
            "trigger": "loadData",
            "line": 45
        },
        {
            "method": "POST",
            "url": "/api/detail",
            "trigger": "handleSave",
            "line": 78
        }
    ]


@registry.register(
    name="search_controller_by_url",
    description="根据 API URL 查找对应的 Spring Boot Controller",
    parameters={
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "API URL，例如 /api/detail"
            },
            "backend_path": {
                "type": "string",
                "description": "后端代码根路径"
            }
        },
        "required": ["url", "backend_path"]
    }
)
def search_controller_by_url(url: str, backend_path: str):
    """查找 Controller（模拟）"""
    return {
        "controller_class": "DetailController",
        "controller_file": f"{backend_path}/controller/DetailController.java",
        "method_name": "list",
        "method_signature": "public R list(@RequestParam Map<String, Object> params)",
        "line_number": 38
    }


# ==================== 2. 创建 Agent ====================

def demo_simple_usage():
    """演示 1: 最简单的使用"""
    print("\n" + "="*60)
    print("演示 1: 最简单的使用")
    print("="*60)
    
    # 1. 创建 LLM 客户端
    client = OpenAI(
        api_key="your-deepseek-key",  # 替换为你的 key
        base_url="https://api.deepseek.com"
    )
    
    # 2. 获取工具
    tools = registry.get_all()
    print(f"\n📦 已注册 {len(tools)} 个工具:")
    for tool in tools:
        print(f"  - {tool.name}: {tool.description}")
    
    # 3. 创建 Agent
    agent = SimpleAgent(
        client,
        tools,
        model="deepseek-chat",
        max_turns=10,
        verbose=True
    )
    
    # 4. 运行
    print("\n🚀 开始分析...")
    result = agent.run("分析 Detail.vue 页面的数据流向，找出所有 API 调用和对应的 Controller")
    
    print("\n" + "="*60)
    print("📊 最终结果:")
    print("="*60)
    print(result)


def demo_custom_prompt():
    """演示 2: 自定义系统提示"""
    print("\n" + "="*60)
    print("演示 2: 自定义系统提示")
    print("="*60)
    
    client = OpenAI(
        api_key="your-deepseek-key",
        base_url="https://api.deepseek.com"
    )
    
    # 自定义系统提示
    custom_prompt = """你是一个专业的 Vue + Spring Boot 分析专家。

请按照以下步骤分析：
1. 使用 parse_vue_ast 解析 Vue 文件
2. 使用 extract_api_calls 提取 API 调用
3. 对每个 API，使用 search_controller_by_url 查找 Controller
4. 生成 JSON 格式的分析报告

报告格式：
{
  "page_name": "页面名称",
  "apis": [
    {
      "method": "GET",
      "url": "/api/detail",
      "controller": "DetailController.list",
      "trigger": "loadData"
    }
  ]
}
"""
    
    agent = SimpleAgent(
        client,
        registry.get_all(),
        system_prompt=custom_prompt,
        verbose=True
    )
    
    result = agent.run("分析 Detail.vue")
    print(f"\n结果:\n{result}")


def demo_partial_tools():
    """演示 3: 只使用部分工具"""
    print("\n" + "="*60)
    print("演示 3: 只使用部分工具")
    print("="*60)
    
    client = OpenAI(
        api_key="your-deepseek-key",
        base_url="https://api.deepseek.com"
    )
    
    # 只使用 Vue 相关工具
    vue_tools = [
        registry.get("parse_vue_ast"),
        registry.get("extract_api_calls")
    ]
    
    print(f"\n📦 只使用 {len(vue_tools)} 个工具:")
    for tool in vue_tools:
        print(f"  - {tool.name}")
    
    agent = SimpleAgent(client, vue_tools, verbose=True)
    result = agent.run("分析 Detail.vue 的组件结构和 API 调用")
    
    print(f"\n结果:\n{result}")


def demo_without_llm():
    """演示 4: 不使用真实 LLM（测试工具）"""
    print("\n" + "="*60)
    print("演示 4: 测试工具（不调用 LLM）")
    print("="*60)
    
    # 直接测试工具
    print("\n🔧 测试工具:")
    
    print("\n1. parse_vue_ast:")
    result1 = parse_vue_ast("examples/test_cases/frontend/Detail.vue")
    print(f"   {result1}")
    
    print("\n2. extract_api_calls:")
    result2 = extract_api_calls("examples/test_cases/frontend/Detail.vue")
    print(f"   {result2}")
    
    print("\n3. search_controller_by_url:")
    result3 = search_controller_by_url("/api/detail", "examples/test_cases/backend")
    print(f"   {result3}")


# ==================== 3. 运行演示 ====================

if __name__ == "__main__":
    print("\n")
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║         Simple Agent 演示 - Pi 风格                      ║")
    print("╚═══════════════════════════════════════════════════════════╝")
    
    # 选择演示
    print("\n请选择演示:")
    print("1. 最简单的使用（需要 LLM API key）")
    print("2. 自定义系统提示（需要 LLM API key）")
    print("3. 只使用部分工具（需要 LLM API key）")
    print("4. 测试工具（不需要 LLM）")
    
    choice = input("\n请输入选择 (1-4，默认 4): ").strip() or "4"
    
    if choice == "1":
        demo_simple_usage()
    elif choice == "2":
        demo_custom_prompt()
    elif choice == "3":
        demo_partial_tools()
    elif choice == "4":
        demo_without_llm()
    else:
        print("无效选择")
    
    print("\n\n演示完成！ 🎉")
