"""PageAwareAgent 演示脚本

演示如何使用 PageAwareAgent 实现：
1. 进入页面（自动分析）
2. 流式输出（实时显示工具调用）
3. 智能问答（基于页面 Skills）
4. 像 Claude Code 一样的交互体验
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root / "src"))

from ai_requirement_os.agents.page_aware_agent import PageAwareAgent, StreamEventType
from ai_requirement_os.tools.skill_tools import get_all_skill_tools


def print_event(event):
    """打印事件（美化输出）"""
    event_type = event.type
    data = event.data
    
    if event_type == StreamEventType.INFO:
        print(f"\n{data}")
    
    elif event_type == StreamEventType.TOOL_CALL:
        tool = data.get("tool")
        args = data.get("args")
        print(f"\n🔧 调用工具: {tool}")
        print(f"   参数: {args}")
    
    elif event_type == StreamEventType.TOOL_RESULT:
        if isinstance(data, dict):
            tool = data.get("tool")
            success = data.get("success")
            if success:
                print(f"   ✅ {tool} 执行成功")
            else:
                print(f"   ❌ {tool} 执行失败")
        else:
            print(f"   {data}")
    
    elif event_type == StreamEventType.SKILLS_LOADED:
        print(f"\n📦 当前页面功能:")
        skills = data.get("skills", [])
        for skill in skills:
            print(f"  • {skill['name']} ({skill['type']})")
            print(f"    {skill['description']}")
    
    elif event_type == StreamEventType.MESSAGE:
        print(f"\n🤖 Agent:")
        print(data)
    
    elif event_type == StreamEventType.ERROR:
        print(f"\n❌ 错误: {data}")
    
    elif event_type == StreamEventType.COMPLETE:
        if isinstance(data, dict):
            turns = data.get("turns")
            print(f"\n✅ 完成！用了 {turns} 轮")
        else:
            print(f"\n✅ {data}")


def demo_without_llm():
    """演示（不使用真实 LLM）"""
    print("="*60)
    print("PageAwareAgent 演示（不使用真实 LLM）")
    print("="*60)
    
    # 创建 Agent（使用 Mock LLM）
    class MockLLM:
        """Mock LLM 客户端"""
        pass
    
    tools = get_all_skill_tools()
    agent = PageAwareAgent(MockLLM(), tools)
    
    # 1. 进入页面
    print("\n" + "="*60)
    print("1. 进入页面")
    print("="*60)
    
    # 模拟页面信息（实际会调用 analyze_page 工具）
    page_info = {
        "page_info": {
            "page_name": "Detail",
            "page_path": "views/Detail.vue",
            "module": "财务管理",
            "description": "明细数据管理页面"
        },
        "skills": [
            {
                "skill_id": "detail_load_data",
                "skill_name": "加载明细数据",
                "skill_type": "query",
                "business_description": "页面打开时自动加载明细列表",
                "trigger": {
                    "type": "lifecycle",
                    "event": "mounted"
                },
                "implementation": {
                    "frontend": {
                        "method": "loadData",
                        "file": "Detail.vue",
                        "line": 45
                    }
                },
                "data_flow": [
                    "用户打开页面",
                    "触发 mounted 生命周期",
                    "调用 loadData() 方法"
                ],
                "dependencies": [],
                "side_effects": ["更新 tableData"],
                "validations": {},
                "error_handling": {}
            },
            {
                "skill_id": "detail_save",
                "skill_name": "保存明细数据",
                "skill_type": "mutation",
                "business_description": "新增或修改明细数据",
                "trigger": {
                    "type": "user_action",
                    "event": "click",
                    "element": "保存按钮"
                },
                "implementation": {
                    "frontend": {
                        "method": "handleSave",
                        "file": "Detail.vue",
                        "line": 78
                    }
                },
                "data_flow": [
                    "用户填写表单",
                    "点击保存按钮",
                    "调用 handleSave() 方法"
                ],
                "dependencies": ["detail_load_data"],
                "side_effects": ["刷新明细列表"],
                "validations": {
                    "frontend": ["金额不能为空", "金额必须大于0"]
                },
                "error_handling": {
                    "validation_failed": "显示具体错误信息"
                }
            }
        ]
    }
    
    for event in agent.enter_page("views/Detail.vue", page_info):
        print_event(event)
    
    # 2. 查看上下文
    print("\n" + "="*60)
    print("2. 当前上下文")
    print("="*60)
    print(agent.context.get_context())
    
    # 3. 测试工具
    print("\n" + "="*60)
    print("3. 测试工具")
    print("="*60)
    
    # 查找 Skill
    print("\n【查找 Skill】")
    from ai_requirement_os.tools.skill_tools import find_skill
    result = find_skill("保存", context=agent.context)
    print(f"结果: {result}")
    
    # 获取实现细节
    print("\n【获取实现细节】")
    from ai_requirement_os.tools.skill_tools import get_skill_implementation
    result = get_skill_implementation("detail_save", context=agent.context)
    print(f"结果: {result}")
    
    # 获取代码位置
    print("\n【获取代码位置】")
    from ai_requirement_os.tools.skill_tools import get_code_location
    result = get_code_location("detail_save", "frontend", context=agent.context)
    print(f"结果: {result}")


def demo_with_real_llm():
    """演示（使用真实 LLM）"""
    print("="*60)
    print("PageAwareAgent 演示（使用真实 LLM）")
    print("="*60)
    
    # 检查环境变量
    import os
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        print("\n❌ 请设置 DEEPSEEK_API_KEY 环境变量")
        print("   export DEEPSEEK_API_KEY=your-key")
        return
    
    # 创建 LLM 客户端
    from openai import OpenAI
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com"
    )
    
    # 创建 Agent
    tools = get_all_skill_tools()
    agent = PageAwareAgent(client, tools, model="deepseek-chat")
    
    # 1. 进入页面
    print("\n" + "="*60)
    print("1. 进入页面")
    print("="*60)
    
    # 使用示例页面信息
    page_info = {
        "page_info": {
            "page_name": "Detail",
            "page_path": "views/Detail.vue",
            "module": "财务管理",
            "description": "明细数据管理页面"
        },
        "skills": [
            {
                "skill_id": "detail_load_data",
                "skill_name": "加载明细数据",
                "skill_type": "query",
                "business_description": "页面打开时自动加载明细列表",
                "trigger": {"type": "lifecycle", "event": "mounted"},
                "implementation": {
                    "frontend": {
                        "method": "loadData",
                        "file": "Detail.vue",
                        "line": 45,
                        "code_snippet": "async loadData() {\n  const res = await this.$http.get('/api/detail');\n  this.tableData = res.data;\n}"
                    },
                    "api": {
                        "method": "GET",
                        "url": "/api/detail",
                        "params": {"accountId": "账户ID"}
                    },
                    "backend": {
                        "controller": {
                            "class": "DetailController",
                            "method": "list",
                            "file": "DetailController.java",
                            "line": 38,
                            "signature": "public R list(@RequestParam Map<String, Object> params)"
                        },
                        "service": {
                            "class": "DetailService",
                            "method": "findAll",
                            "file": "DetailService.java",
                            "line": 67,
                            "logic": "分页查询 + 条件过滤"
                        },
                        "database": {
                            "table": "t_detail",
                            "operation": "SELECT"
                        }
                    }
                },
                "data_flow": [
                    "用户打开页面",
                    "触发 mounted 生命周期",
                    "调用 loadData() 方法",
                    "发送 GET /api/detail 请求",
                    "后端 DetailController.list() 接收",
                    "调用 DetailService.findAll() 查询",
                    "从 t_detail 表查询数据",
                    "返回分页结果",
                    "前端更新 tableData"
                ],
                "dependencies": [],
                "side_effects": ["更新 tableData"],
                "validations": {},
                "error_handling": {"frontend": "显示错误提示"}
            },
            {
                "skill_id": "detail_save",
                "skill_name": "保存明细数据",
                "skill_type": "mutation",
                "business_description": "新增或修改明细数据",
                "trigger": {"type": "user_action", "event": "click", "element": "保存按钮"},
                "implementation": {
                    "frontend": {
                        "method": "handleSave",
                        "file": "Detail.vue",
                        "line": 78,
                        "code_snippet": "async handleSave() {\n  if (!this.validateForm()) return;\n  await this.$http.post('/api/detail', this.form);\n  this.loadData();\n}"
                    },
                    "api": {
                        "method": "POST",
                        "url": "/api/detail",
                        "payload": {"id": "明细ID", "amount": "金额", "date": "日期"}
                    },
                    "backend": {
                        "controller": {
                            "class": "DetailController",
                            "method": "save",
                            "file": "DetailController.java",
                            "line": 52
                        },
                        "service": {
                            "class": "DetailService",
                            "method": "saveDetail",
                            "file": "DetailService.java",
                            "line": 89,
                            "logic": "判断新增/修改 → 校验数据 → 保存 → 更新余额"
                        },
                        "database": {
                            "table": "t_detail",
                            "operation": "INSERT or UPDATE",
                            "affected_tables": ["t_detail", "t_account"]
                        }
                    }
                },
                "data_flow": [
                    "用户填写表单",
                    "点击保存按钮",
                    "前端校验数据",
                    "调用 handleSave() 方法",
                    "发送 POST /api/detail 请求",
                    "后端 DetailController.save() 接收",
                    "调用 DetailService.saveDetail() 处理",
                    "保存到 t_detail 表",
                    "更新 t_account 表余额",
                    "返回成功结果",
                    "前端刷新列表"
                ],
                "dependencies": ["detail_load_data"],
                "side_effects": ["刷新明细列表", "更新账户余额"],
                "validations": {
                    "frontend": ["金额不能为空", "金额必须大于0", "日期不能为空"],
                    "backend": ["账户必须存在", "金额不能超过限额"]
                },
                "error_handling": {
                    "validation_failed": "显示具体错误信息",
                    "save_failed": "显示保存失败提示"
                }
            }
        ]
    }
    
    for event in agent.enter_page("views/Detail.vue", page_info):
        print_event(event)
    
    # 2. 对话
    print("\n" + "="*60)
    print("2. 对话")
    print("="*60)
    
    questions = [
        "保存功能是怎么实现的？",
        "保存数据时有哪些校验？",
        "保存功能的后端代码在哪里？"
    ]
    
    for question in questions:
        print(f"\n{'='*60}")
        print(f"👤 用户: {question}")
        print(f"{'='*60}")
        
        for event in agent.chat(question):
            print_event(event)
        
        print()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--real":
        demo_with_real_llm()
    else:
        demo_without_llm()
        
        print("\n" + "="*60)
        print("提示")
        print("="*60)
        print("要使用真实 LLM 测试，请运行:")
        print("  export DEEPSEEK_API_KEY=your-key")
        print("  python demo_page_aware_agent.py --real")
