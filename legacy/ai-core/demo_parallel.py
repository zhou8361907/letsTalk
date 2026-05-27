#!/usr/bin/env python3
"""并行工作流性能对比演示

这个脚本对比顺序执行和并行执行的性能差异。

使用方法：
    uv run python demo_parallel.py
"""

import json
from pathlib import Path

from src.ai_requirement_os.agents.workflow import analyze_page_with_workflow
from src.ai_requirement_os.agents.parallel_workflow import analyze_page_parallel


def print_separator(title: str = ""):
    """打印分隔线"""
    if title:
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
    else:
        print(f"{'='*60}")


def print_results(result: dict, title: str):
    """打印分析结果"""
    print_separator(title)

    print(f"\n总计: {result['total_apis']} 个 API")
    print(f"✅ 已完成: {len(result['completed_apis'])}")
    print(f"⚠️  需要深度分析: {len(result['pending_deep_analysis'])}")
    print(f"❌ 失败: {len(result['failed_apis'])}")

    if "total_time" in result:
        print(f"\n⏱️  总时间: {result['total_time']:.2f}s")

        if result.get("api_times"):
            api_times = result["api_times"]
            avg_time = sum(api_times.values()) / len(api_times)
            sequential_time = sum(api_times.values())
            speedup = sequential_time / result["total_time"] if result["total_time"] > 0 else 1

            print(f"   平均每个 API: {avg_time:.2f}s")
            print(f"   顺序执行预计: {sequential_time:.2f}s")
            print(f"   加速比: {speedup:.2f}x")


def main():
    """主函数"""
    print_separator("🚀 并行工作流性能对比演示")

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

    backend_path = "examples/test_cases/backend"

    # ========== 测试 1: 顺序执行 ==========
    print_separator(f"测试 1: 顺序执行 - {selected_page['name']}")
    print("\n⏳ 正在分析（顺序执行）...")

    result_sequential = analyze_page_with_workflow(
        page_path=selected_page["path"], backend_path=backend_path
    )

    print_results(result_sequential, "顺序执行结果")

    # ========== 测试 2: 并行执行 ==========
    print_separator(f"测试 2: 并行执行 - {selected_page['name']}")
    print("\n⏳ 正在分析（并行执行）...")

    result_parallel = analyze_page_parallel(
        page_path=selected_page["path"],
        backend_path=backend_path,
        max_workers=5,
        timeout_per_api=30,
    )

    print_results(result_parallel, "并行执行结果")

    # ========== 性能对比 ==========
    print_separator("📊 性能对比")

    if "total_time" in result_parallel:
        # 估算顺序执行时间（基于并行执行的单个 API 时间）
        if result_parallel.get("api_times"):
            sequential_estimate = sum(result_parallel["api_times"].values())
            parallel_time = result_parallel["total_time"]
            speedup = sequential_estimate / parallel_time if parallel_time > 0 else 1

            print(f"\n顺序执行（估算）: {sequential_estimate:.2f}s")
            print(f"并行执行（实际）: {parallel_time:.2f}s")
            print(f"性能提升: {speedup:.2f}x")
            print(f"节省时间: {sequential_estimate - parallel_time:.2f}s")

            # 计算效率
            num_apis = result_parallel["total_apis"]
            max_workers = 5
            theoretical_speedup = min(num_apis, max_workers)
            efficiency = (speedup / theoretical_speedup) * 100 if theoretical_speedup > 0 else 0

            print(f"\n理论最大加速比: {theoretical_speedup:.2f}x")
            print(f"实际效率: {efficiency:.1f}%")

    # ========== 保存结果 ==========
    output_dir = Path(".agent")
    output_dir.mkdir(parents=True, exist_ok=True)

    # 保存并行结果
    with open(output_dir / "parallel_result.json", "w", encoding="utf-8") as f:
        json.dump(result_parallel, f, indent=2, ensure_ascii=False)

    print_separator()
    print(f"✅ 结果已保存到: {output_dir / 'parallel_result.json'}")
    print_separator()


if __name__ == "__main__":
    main()
