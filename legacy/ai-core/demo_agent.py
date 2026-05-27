#!/usr/bin/env python3
"""
V2 Agent 演示脚本

展示 Agent 如何自主分析页面数据流向
"""

import sys
from pathlib import Path

# 添加 src 到路径
sys.path.insert(0, str(Path(__file__).parent / "src"))

from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config


def main():
    """主函数"""
    print("=" * 80)
    print("V2 多 Agent 系统 - 演示")
    print("=" * 80)
    print()

    # 配置
    backend_path = str(Path(__file__).parent / "examples" / "test_cases" / "backend")
    frontend_path = str(Path(__file__).parent / "examples" / "test_cases" / "frontend")

    config = V2Config(
        backend_path=backend_path,
        frontend_path=frontend_path,
        max_iterations=15,
        complexity_threshold=60,
    )

    print(f"📁 后端路径: {backend_path}")
    print(f"📁 前端路径: {frontend_path}")
    print(f"⚙️  最大迭代: {config.max_iterations}")
    print(f"⚙️  复杂度阈值: {config.complexity_threshold}")
    print()

    # 创建 Agent
    print("🤖 正在初始化 Agent...")
    agent = OrchestratorAgent(config)
    print("✅ Agent 初始化成功")
    print()

    # 选择要分析的页面
    print("请选择要分析的页面:")
    print("1. UserList.vue (简单页面，2 个 API)")
    print("2. Detail.vue (复杂页面，4 个 API)")
    print()

    choice = input("请输入选择 (1 或 2，默认 1): ").strip() or "1"

    if choice == "2":
        page_file = "Detail.vue"
        print("\n📄 分析页面: Detail.vue")
        print("   - 包含 4 个 API")
        print("   - 包含复杂的同步操作")
    else:
        page_file = "UserList.vue"
        print("\n📄 分析页面: UserList.vue")
        print("   - 包含 2 个 API")
        print("   - 简单的 CRUD 操作")

    page_path = f"{frontend_path}/{page_file}"
    print()

    # 开始分析
    print("🚀 开始分析...")
    print("=" * 80)
    print()

    try:
        result = agent.analyze(page_path, backend_path)

        print()
        print("=" * 80)
        print("📊 分析结果")
        print("=" * 80)
        print()

        if result["success"]:
            print("✅ 分析成功！")
            print()

            # 打印输出
            import json

            output = result["output"]
            if isinstance(output, dict) and not output.get("parse_error"):
                print("📋 结构化输出:")
                print(json.dumps(output, indent=2, ensure_ascii=False))
            else:
                print("📋 原始输出:")
                print(output)

            print()
            print(f"🔧 工具调用次数: {len(result['steps'])}")

            # 打印工具调用详情
            if result["steps"]:
                print()
                print("🔍 工具调用详情:")
                for i, (action, observation) in enumerate(result["steps"], 1):
                    tool_name = action.tool
                    tool_input = action.tool_input
                    print(f"\n  {i}. {tool_name}")
                    print(f"     输入: {tool_input}")
                    # 只打印观察结果的前 100 个字符
                    obs_str = str(observation)[:100]
                    if len(str(observation)) > 100:
                        obs_str += "..."
                    print(f"     输出: {obs_str}")

        else:
            print("❌ 分析失败")
            print(f"错误: {result['error']}")
            print()
            print("💡 提示:")
            print("   - 如果是 503 错误，说明 API 服务繁忙，请稍后重试")
            print("   - 如果是 401 错误，请检查 .env 文件中的 API Key")
            print("   - 如果是其他错误，请查看详细错误信息")

    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
    except Exception as e:
        print(f"\n\n❌ 发生错误: {e}")
        import traceback

        traceback.print_exc()

    print()
    print("=" * 80)
    print("演示结束")
    print("=" * 80)


if __name__ == "__main__":
    main()
