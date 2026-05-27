"""并行工作流测试"""

import pytest
import time
from pathlib import Path

from ai_requirement_os.agents.parallel_workflow import (
    create_parallel_analysis_workflow,
    analyze_page_parallel,
    analyze_single_api,
    ParallelAnalysisState,
)


class TestParallelAnalysis:
    """测试并行分析功能"""

    def test_analyze_single_api_success(self):
        """测试单个 API 分析 - 成功场景"""
        api = {
            "method": "GET",
            "url": "/api/user/list",
            "trigger": "loadUsers",
            "line_number": 14,
        }

        result = analyze_single_api(
            api=api,
            backend_path="examples/test_cases/backend",
            timeout=30,
        )

        # 验证结果
        assert "status" in result
        assert "analysis_time" in result
        assert result["analysis_time"] > 0

        # 如果找到 Controller，验证详细信息
        if result["status"] == "completed" or result["status"] == "needs_deep_analysis":
            assert "controller_class" in result
            assert "controller_method" in result
            assert "complexity_score" in result

    def test_analyze_single_api_not_found(self):
        """测试单个 API 分析 - Controller 未找到"""
        api = {
            "method": "GET",
            "url": "/api/non/existent",
            "trigger": "test",
            "line_number": 1,
        }

        result = analyze_single_api(
            api=api,
            backend_path="examples/test_cases/backend",
            timeout=30,
        )

        # 验证错误处理
        assert result["status"] == "error"
        assert "error_message" in result
        assert "analysis_time" in result


class TestParallelWorkflow:
    """测试并行工作流"""

    def test_workflow_creation(self):
        """测试工作流创建"""
        workflow = create_parallel_analysis_workflow()
        assert workflow is not None

    def test_parallel_analysis_simple_page(self):
        """测试并行分析 - 简单页面"""
        result = analyze_page_parallel(
            page_path="examples/test_cases/frontend/UserList.vue",
            backend_path="examples/test_cases/backend",
            max_workers=5,
            timeout_per_api=30,
        )

        # 验证结果结构
        assert "page_path" in result
        assert "total_apis" in result
        assert "completed_apis" in result
        assert "pending_deep_analysis" in result
        assert "failed_apis" in result
        assert "total_time" in result
        assert "api_times" in result

        # 验证至少有一些结果
        total_results = (
            len(result["completed_apis"])
            + len(result["pending_deep_analysis"])
            + len(result["failed_apis"])
        )
        assert total_results > 0

        # 验证性能统计
        assert result["total_time"] > 0
        assert isinstance(result["api_times"], dict)

    def test_parallel_analysis_complex_page(self):
        """测试并行分析 - 复杂页面"""
        result = analyze_page_parallel(
            page_path="examples/test_cases/frontend/Detail.vue",
            backend_path="examples/test_cases/backend",
            max_workers=5,
            timeout_per_api=30,
        )

        # 验证结果
        assert result["total_apis"] > 0

        # 验证性能统计
        assert result["total_time"] > 0
        assert len(result["api_times"]) > 0

        print(f"\n并行分析完成:")
        print(f"  总 API 数: {result['total_apis']}")
        print(f"  已完成: {len(result['completed_apis'])}")
        print(f"  需要深度分析: {len(result['pending_deep_analysis'])}")
        print(f"  失败: {len(result['failed_apis'])}")
        print(f"  总时间: {result['total_time']:.2f}s")


class TestPerformance:
    """测试性能提升"""

    def test_parallel_vs_sequential(self):
        """对比并行和顺序执行的性能"""
        page_path = "examples/test_cases/frontend/Detail.vue"
        backend_path = "examples/test_cases/backend"

        # 并行执行
        start = time.time()
        result_parallel = analyze_page_parallel(
            page_path=page_path,
            backend_path=backend_path,
            max_workers=5,
            timeout_per_api=30,
        )
        time_parallel = time.time() - start

        # 计算顺序执行的估算时间
        if result_parallel.get("api_times"):
            time_sequential_estimate = sum(result_parallel["api_times"].values())
            speedup = time_sequential_estimate / time_parallel if time_parallel > 0 else 1

            print(f"\n性能对比:")
            print(f"  并行执行: {time_parallel:.2f}s")
            print(f"  顺序执行（估算）: {time_sequential_estimate:.2f}s")
            print(f"  加速比: {speedup:.2f}x")

            # 验证性能提升
            # 对于多个 API，并行执行应该更快
            if result_parallel["total_apis"] > 1:
                assert speedup > 1.0, f"并行执行应该更快，但加速比只有 {speedup:.2f}x"

    def test_max_workers_configuration(self):
        """测试不同的并发数配置"""
        page_path = "examples/test_cases/frontend/Detail.vue"
        backend_path = "examples/test_cases/backend"

        # 测试不同的并发数
        for max_workers in [1, 3, 5]:
            result = analyze_page_parallel(
                page_path=page_path,
                backend_path=backend_path,
                max_workers=max_workers,
                timeout_per_api=30,
            )

            print(f"\n并发数 {max_workers}:")
            print(f"  总时间: {result['total_time']:.2f}s")

            # 验证结果正确性
            assert result["total_apis"] > 0
            assert result["total_time"] > 0

    def test_timeout_handling(self):
        """测试超时处理"""
        # 使用非常短的超时时间
        result = analyze_page_parallel(
            page_path="examples/test_cases/frontend/Detail.vue",
            backend_path="examples/test_cases/backend",
            max_workers=5,
            timeout_per_api=0.001,  # 1ms 超时，几乎肯定会超时
        )

        # 验证超时被正确处理
        # 注意：由于超时时间极短，大部分 API 应该失败
        assert result["total_apis"] > 0
        # 至少应该有一些结果（成功或失败）
        total_results = (
            len(result["completed_apis"])
            + len(result["pending_deep_analysis"])
            + len(result["failed_apis"])
        )
        assert total_results > 0


class TestErrorHandling:
    """测试错误处理"""

    def test_invalid_page_path(self):
        """测试无效的页面路径"""
        result = analyze_page_parallel(
            page_path="non_existent_file.vue",
            backend_path="examples/test_cases/backend",
            max_workers=5,
            timeout_per_api=30,
        )

        # 验证错误处理
        # 应该有错误信息或者 API 列表为空
        assert result["total_apis"] == 0 or result.get("error") is not None

    def test_invalid_backend_path(self):
        """测试无效的后端路径"""
        result = analyze_page_parallel(
            page_path="examples/test_cases/frontend/UserList.vue",
            backend_path="non_existent_path",
            max_workers=5,
            timeout_per_api=30,
        )

        # 验证错误处理
        # 应该能解析前端，但后端分析会失败
        if result["total_apis"] > 0:
            # 所有 API 应该失败（找不到 Controller）
            assert len(result["failed_apis"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
