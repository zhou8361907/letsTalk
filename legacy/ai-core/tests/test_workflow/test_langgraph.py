"""LangGraph 工作流测试"""

import pytest
from pathlib import Path

from ai_requirement_os.agents.workflow import (
    create_analysis_workflow,
    analyze_page_with_workflow,
    AnalysisState,
    parse_frontend_node,
    analyze_api_node,
)


class TestWorkflowNodes:
    """测试工作流节点"""

    def test_parse_frontend_node_success(self):
        """测试前端解析节点 - 成功场景"""
        state: AnalysisState = {
            "page_path": "examples/test_cases/frontend/UserList.vue",
            "backend_path": "examples/test_cases/backend",
            "vue_ast": None,
            "api_calls": [],
            "current_api_index": 0,
            "total_apis": 0,
            "completed_apis": [],
            "pending_deep_analysis": [],
            "failed_apis": [],
            "should_continue": True,
            "error": None,
        }

        result = parse_frontend_node(state)

        # 验证结果
        assert result["vue_ast"] is not None
        assert len(result["api_calls"]) > 0
        assert result["total_apis"] > 0
        assert result["should_continue"] is True
        assert result["error"] is None

    def test_parse_frontend_node_file_not_found(self):
        """测试前端解析节点 - 文件不存在"""
        state: AnalysisState = {
            "page_path": "non_existent_file.vue",
            "backend_path": "",
            "vue_ast": None,
            "api_calls": [],
            "current_api_index": 0,
            "total_apis": 0,
            "completed_apis": [],
            "pending_deep_analysis": [],
            "failed_apis": [],
            "should_continue": True,
            "error": None,
        }

        result = parse_frontend_node(state)

        # 验证错误处理
        # parse_vue_ast 工具会返回错误信息而不是 None
        # 所以我们检查是否有错误或者 API 列表为空
        assert len(result["api_calls"]) == 0
        assert result["should_continue"] is False or result["total_apis"] == 0

    def test_analyze_api_node_success(self):
        """测试 API 分析节点 - 成功场景"""
        state: AnalysisState = {
            "page_path": "examples/test_cases/frontend/UserList.vue",
            "backend_path": "examples/test_cases/backend",
            "vue_ast": {},
            "api_calls": [
                {
                    "method": "GET",
                    "url": "/api/user/list",
                    "trigger": "loadUsers",
                    "line_number": 15,
                }
            ],
            "current_api_index": 0,
            "total_apis": 1,
            "completed_apis": [],
            "pending_deep_analysis": [],
            "failed_apis": [],
            "should_continue": True,
            "error": None,
        }

        result = analyze_api_node(state)

        # 验证结果
        assert result["current_api_index"] == 1
        assert result["should_continue"] is False  # 只有 1 个 API
        # 应该有完成的 API、需要深度分析的 API 或失败的 API
        assert (
            len(result.get("completed_apis", []))
            + len(result.get("pending_deep_analysis", []))
            + len(result.get("failed_apis", []))
            > 0
        )

    def test_analyze_api_node_controller_not_found(self):
        """测试 API 分析节点 - Controller 未找到"""
        state: AnalysisState = {
            "page_path": "examples/test_cases/frontend/UserList.vue",
            "backend_path": "examples/test_cases/backend",
            "vue_ast": {},
            "api_calls": [
                {
                    "method": "GET",
                    "url": "/api/non/existent",
                    "trigger": "test",
                    "line_number": 1,
                }
            ],
            "current_api_index": 0,
            "total_apis": 1,
            "completed_apis": [],
            "pending_deep_analysis": [],
            "failed_apis": [],
            "should_continue": True,
            "error": None,
        }

        result = analyze_api_node(state)

        # 验证错误处理
        assert len(result.get("failed_apis", [])) > 0
        assert result["current_api_index"] == 1


class TestWorkflow:
    """测试完整工作流"""

    def test_workflow_creation(self):
        """测试工作流创建"""
        workflow = create_analysis_workflow()
        assert workflow is not None

    def test_workflow_simple_page(self):
        """测试简单页面分析"""
        result = analyze_page_with_workflow(
            page_path="examples/test_cases/frontend/UserList.vue",
            backend_path="examples/test_cases/backend",
        )

        # 验证结果结构
        assert "page_path" in result
        assert "total_apis" in result
        assert "completed_apis" in result
        assert "pending_deep_analysis" in result
        assert "failed_apis" in result

        # 验证至少有一些结果
        total_results = (
            len(result["completed_apis"])
            + len(result["pending_deep_analysis"])
            + len(result["failed_apis"])
        )
        assert total_results > 0

    def test_workflow_complex_page(self):
        """测试复杂页面分析（包含高复杂度方法）"""
        result = analyze_page_with_workflow(
            page_path="examples/test_cases/frontend/Detail.vue",
            backend_path="examples/test_cases/backend",
        )

        # 验证结果
        assert result["total_apis"] > 0

        # 应该有一些需要深度分析的 API（因为 Detail.vue 包含复杂方法）
        # 注意：这取决于测试用例的实际复杂度
        print(f"完成: {len(result['completed_apis'])}")
        print(f"需要深度分析: {len(result['pending_deep_analysis'])}")
        print(f"失败: {len(result['failed_apis'])}")

    def test_workflow_state_accumulation(self):
        """测试状态累加（operator.add）"""
        workflow = create_analysis_workflow()

        initial_state: AnalysisState = {
            "page_path": "examples/test_cases/frontend/Detail.vue",
            "backend_path": "examples/test_cases/backend",
            "vue_ast": None,
            "api_calls": [],
            "current_api_index": 0,
            "total_apis": 0,
            "completed_apis": [],
            "pending_deep_analysis": [],
            "failed_apis": [],
            "should_continue": True,
            "error": None,
        }

        final_state = workflow.invoke(initial_state)

        # 验证状态累加
        # completed_apis, pending_deep_analysis, failed_apis 应该累加所有结果
        total_results = (
            len(final_state.get("completed_apis", []))
            + len(final_state.get("pending_deep_analysis", []))
            + len(final_state.get("failed_apis", []))
        )

        assert total_results == final_state.get("total_apis", 0)


class TestWorkflowPerformance:
    """测试工作流性能"""

    def test_workflow_vs_sequential(self):
        """对比工作流和顺序执行的性能"""
        import time

        # 使用工作流
        start = time.time()
        result_workflow = analyze_page_with_workflow(
            page_path="examples/test_cases/frontend/Detail.vue",
            backend_path="examples/test_cases/backend",
        )
        time_workflow = time.time() - start

        print(f"\n工作流执行时间: {time_workflow:.2f}s")
        print(f"分析了 {result_workflow['total_apis']} 个 API")

        # 注意：当前版本还是顺序执行，Day 3-4 会实现并行执行
        # 届时性能会有显著提升


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
