#!/usr/bin/env python3
"""漂亮的流式输出演示

展示使用 Rich 库美化后的分析过程。

使用方法：
    uv run python demo_beautiful.py
"""

from src.ai_requirement_os.agents.parallel_workflow import analyze_page_parallel

def main():
    """主函数"""
    # 可用的测试页面
    test_pages = [
        {
            "name": "UserList.vue - 简单页面（2个API）",
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

    # 执行分析（使用美化输出）
    result = analyze_page_parallel(
        page_path=selected_page["path"],
        backend_path="examples/test_cases/backend",
        max_workers=5,
        timeout_per_api=30,
    )

    print(f"\n✅ 分析完成！结果已保存。")


if __name__ == "__main__":
    main()
