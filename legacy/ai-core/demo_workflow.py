#!/usr/bin/env python3
"""LangGraph 工作流演示脚本

这个脚本演示如何使用 LangGraph 状态机分析 Vue 页面。

使用方法：
    uv run python demo_workflow.py
"""

import json
from pathlib import Path

from src.ai_requirement_os.agents.workflow import analyze_page_with_workflow


def print_separator(title: str = ""):
    """打印分隔线"""
    if title:
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
    else:
        print(f"{'='*60}")


def print_api_result(api: dict, index: int):
    """打印单个 API 的分析结果"""
    print(f"\n{index}. {api['method']} {api['url']}")
    print(f"   触发: {api['trigger']} (行 {api['line_number']})")

    if api.get("controller_class"):
        print(f"   Controller: {api['controller_class']}.{api['controller_method']}")

    if api.get("complexity_score") is not None:
        print(f"   复杂度得分: {api['complexity_score']}")
        print(f"   代码行数: {api['lines_of_code']}")
        print(f"   圈复杂度: {api['cyclomatic_complexity']}")

        if api.get("external_calls"):
            print(f"   外部调用: {', '.join(api['external_calls'])}")

        print(f"   建议: {api['recommendation']}")

    if api.get("status") == "error":
        print(f"   ❌ 错误: {api.get('error_message', '未知错误')}")


def main():
    """主函数"""
    print_separator("🚀 LangGraph 工作流演示")

    # 可用的测试页面
    test_pages = [
        {
            "name": "UserList.vue - 简单页面（1个API）",
            "path": "examples/test_cases/frontend/UserList.vue",
        },
        {
            "name": "Detail.vue - 复杂页面（4个API）",
            "path": "examples/test_cases/frontend/Detail.vue",
        },
    ]

    # 显示选项
    print("\n请选择要分析的页面：")
    for i, page in enumerate(test_pages, 1):
        print(f"{i}. {page['name']}")

    # 获取用户选择
    try:
        choice = int(input("\n请输入选项 (1-2): "))
        if choice < 1 or choice > len(test_pages):
            print("❌ 无效的选项")
            return

        selected_page = test_pages[choice - 1]
    except (ValueError, KeyboardInterrupt):
        print("\n❌ 已取消")
        return

    # 执行分析
    print_separator(f"分析页面: {selected_page['name']}")

    result = analyze_page_with_workflow(
        page_path=selected_page["path"], backend_path="examples/test_cases/backend"
    )

    # 显示结果
    print_separator("📊 分析结果")

    print(f"\n总计: {result['total_apis']} 个 API")
    print(f"✅ 已完成: {len(result['completed_apis'])}")
    print(f"⚠️  需要深度分析: {len(result['pending_deep_analysis'])}")
    print(f"❌ 失败: {len(result['failed_apis'])}")

    # 显示已完成的 API
    if result["completed_apis"]:
        print_separator("✅ 已完成的 API")
        for i, api in enumerate(result["completed_apis"], 1):
            print_api_result(api, i)

    # 显示需要深度分析的 API
    if result["pending_deep_analysis"]:
        print_separator("⚠️  需要深度分析的 API")
        for i, api in enumerate(result["pending_deep_analysis"], 1):
            print_api_result(api, i)

    # 显示失败的 API
    if result["failed_apis"]:
        print_separator("❌ 失败的 API")
        for i, api in enumerate(result["failed_apis"], 1):
            print_api_result(api, i)

    # 保存结果到文件
    output_file = Path(".agent/workflow_result.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print_separator()
    print(f"✅ 结果已保存到: {output_file}")
    print_separator()


if __name__ == "__main__":
    main()
