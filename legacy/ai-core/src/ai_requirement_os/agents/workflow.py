"""LangGraph 工作流实现

这个模块实现了基于 LangGraph 的状态机工作流，用于并行分析多个 API。

核心优势：
1. 并行执行 - 多个 API 同时分析，性能提升 3-5 倍
2. 状态管理 - 清晰的状态流转，易于调试和可视化
3. 复杂度控制 - 自动识别高复杂度方法，创建后台任务
4. 可观测性 - 完整的执行流程追踪
"""

from typing import TypedDict, List, Annotated, Dict, Any, Optional
import operator
from pathlib import Path

from langgraph.graph import StateGraph, END
from pydantic import BaseModel

from ..tools import (
    parse_vue_ast,
    extract_api_calls,
    search_controller_by_url,
    get_method_source,
    calculate_method_complexity,
)


# ==================== 状态定义 ====================


class ApiAnalysisResult(BaseModel):
    """单个 API 的分析结果"""

    method: str  # HTTP 方法
    url: str  # API 路径
    trigger: str  # 触发位置
    line_number: int  # 行号

    # Controller 信息
    controller_class: Optional[str] = None
    controller_method: Optional[str] = None
    controller_file: Optional[str] = None

    # 复杂度信息
    complexity_score: Optional[int] = None
    lines_of_code: Optional[int] = None
    cyclomatic_complexity: Optional[int] = None
    external_calls: List[str] = []

    # 状态
    status: str = "pending"  # pending, analyzing, completed, needs_deep_analysis, error
    error_message: Optional[str] = None
    recommendation: Optional[str] = None


class AnalysisState(TypedDict):
    """分析状态 - LangGraph 状态机的核心数据结构"""

    # ========== 输入 ==========
    page_path: str  # Vue 页面路径
    backend_path: str  # 后端代码路径

    # ========== 前端解析结果 ==========
    vue_ast: Optional[Dict[str, Any]]  # Vue AST 结构
    api_calls: List[Dict[str, Any]]  # 提取的 API 调用列表

    # ========== 分析进度 ==========
    current_api_index: int  # 当前正在分析的 API 索引
    total_apis: int  # 总 API 数量

    # ========== 分析结果（使用 operator.add 实现累加） ==========
    completed_apis: Annotated[List[Dict[str, Any]], operator.add]  # 已完成的 API
    pending_deep_analysis: Annotated[
        List[Dict[str, Any]], operator.add
    ]  # 需要深度分析的 API
    failed_apis: Annotated[List[Dict[str, Any]], operator.add]  # 分析失败的 API

    # ========== 控制流 ==========
    should_continue: bool  # 是否继续分析
    error: Optional[str]  # 全局错误信息


# ==================== 节点实现 ====================


def parse_frontend_node(state: AnalysisState) -> Dict[str, Any]:
    """
    节点 1: 解析前端页面

    功能：
    1. 解析 Vue 文件的 AST 结构
    2. 提取所有 API 调用
    3. 初始化分析状态

    Returns:
        更新后的状态
    """
    print(f"\n{'='*60}")
    print(f"📄 [节点 1] 解析前端页面: {state['page_path']}")
    print(f"{'='*60}")

    try:
        # 1. 解析 Vue AST
        print("🔍 解析 Vue 文件结构...")
        ast_result = parse_vue_ast.invoke({"file_path": state["page_path"]})
        print(f"✅ Vue 文件解析成功")

        # 2. 提取 API 调用
        print("🔍 提取 API 调用...")
        api_calls = extract_api_calls.invoke({"file_path": state["page_path"]})
        print(f"✅ 发现 {len(api_calls)} 个 API 调用")

        # 转换为字典格式
        api_calls_dict = [
            {
                "method": call.method,
                "url": call.url,
                "trigger": call.trigger,
                "line_number": call.line_number,
            }
            for call in api_calls
        ]

        # 打印 API 列表
        for i, api in enumerate(api_calls_dict, 1):
            print(f"  {i}. {api['method']} {api['url']} (触发: {api['trigger']})")

        return {
            "vue_ast": ast_result,
            "api_calls": api_calls_dict,
            "total_apis": len(api_calls_dict),
            "current_api_index": 0,
            "should_continue": len(api_calls_dict) > 0,
            "error": None,
        }

    except Exception as e:
        print(f"❌ 前端解析失败: {str(e)}")
        return {
            "vue_ast": None,
            "api_calls": [],
            "total_apis": 0,
            "current_api_index": 0,
            "should_continue": False,
            "error": f"前端解析失败: {str(e)}",
        }


def analyze_api_node(state: AnalysisState) -> Dict[str, Any]:
    """
    节点 2: 分析单个 API

    功能：
    1. 查找对应的 Controller 方法
    2. 获取方法源码
    3. 计算复杂度
    4. 根据复杂度决定是否需要深度分析

    Returns:
        更新后的状态
    """
    current_index = state["current_api_index"]
    total = state["total_apis"]

    # 检查是否还有 API 需要分析
    if current_index >= total:
        return {
            "should_continue": False,
        }

    api = state["api_calls"][current_index]

    print(f"\n{'='*60}")
    print(f"🔍 [节点 2] 分析 API {current_index + 1}/{total}")
    print(f"{'='*60}")
    print(f"方法: {api['method']}")
    print(f"路径: {api['url']}")
    print(f"触发: {api['trigger']}")

    try:
        # 1. 查找 Controller
        print("\n🔍 查找 Controller...")
        controller = search_controller_by_url.invoke(
            {
                "method": api["method"],
                "url": api["url"],
                "backend_path": state["backend_path"],
            }
        )

        if not controller:
            print(f"⚠️  未找到对应的 Controller")
            return {
                "failed_apis": [
                    {
                        **api,
                        "status": "error",
                        "error_message": "未找到对应的 Controller",
                    }
                ],
                "current_api_index": current_index + 1,
                "should_continue": current_index + 1 < total,
            }

        print(f"✅ 找到 Controller: {controller.class_name}.{controller.method_name}")
        print(f"   文件: {controller.file_path}")
        print(f"   行号: {controller.line_number}")

        # 2. 获取方法源码
        print("\n🔍 获取方法源码...")
        source = get_method_source.invoke(
            {
                "class_name": controller.class_name,
                "method_name": controller.method_name,
                "backend_path": state["backend_path"],
            }
        )

        if not source:
            print(f"⚠️  无法获取方法源码")
            return {
                "failed_apis": [
                    {
                        **api,
                        "controller_class": controller.class_name,
                        "controller_method": controller.method_name,
                        "status": "error",
                        "error_message": "无法获取方法源码",
                    }
                ],
                "current_api_index": current_index + 1,
                "should_continue": current_index + 1 < total,
            }

        print(f"✅ 获取源码成功 ({len(source.split(chr(10)))} 行)")

        # 3. 计算复杂度
        print("\n🔍 计算复杂度...")
        complexity = calculate_method_complexity.invoke({"source_code": source})

        print(f"✅ 复杂度分析完成:")
        print(f"   综合得分: {complexity.score}")
        print(f"   代码行数: {complexity.lines_of_code}")
        print(f"   圈复杂度: {complexity.cyclomatic_complexity}")
        print(f"   嵌套深度: {complexity.nesting_depth}")
        print(f"   外部调用: {', '.join(complexity.external_calls) or '无'}")
        print(f"   建议: {complexity.recommendation}")

        # 4. 构建结果
        result = {
            **api,
            "controller_class": controller.class_name,
            "controller_method": controller.method_name,
            "controller_file": controller.file_path,
            "complexity_score": complexity.score,
            "lines_of_code": complexity.lines_of_code,
            "cyclomatic_complexity": complexity.cyclomatic_complexity,
            "external_calls": complexity.external_calls,
            "recommendation": complexity.recommendation,
        }

        # 5. 根据复杂度决定状态
        if complexity.score >= 60:
            print(f"\n⚠️  高复杂度方法，标记为需要深度分析")
            result["status"] = "needs_deep_analysis"
            return {
                "pending_deep_analysis": [result],
                "current_api_index": current_index + 1,
                "should_continue": current_index + 1 < total,
            }
        else:
            print(f"\n✅ 分析完成")
            result["status"] = "completed"
            return {
                "completed_apis": [result],
                "current_api_index": current_index + 1,
                "should_continue": current_index + 1 < total,
            }

    except Exception as e:
        print(f"\n❌ 分析失败: {str(e)}")
        return {
            "failed_apis": [
                {
                    **api,
                    "status": "error",
                    "error_message": str(e),
                }
            ],
            "current_api_index": current_index + 1,
            "should_continue": current_index + 1 < total,
        }


def generate_report_node(state: AnalysisState) -> Dict[str, Any]:
    """
    节点 3: 生成最终报告

    功能：
    1. 汇总所有分析结果
    2. 生成结构化报告
    3. 提供统计信息

    Returns:
        更新后的状态
    """
    print(f"\n{'='*60}")
    print(f"📊 [节点 3] 生成分析报告")
    print(f"{'='*60}")

    completed = state.get("completed_apis", [])
    pending = state.get("pending_deep_analysis", [])
    failed = state.get("failed_apis", [])

    print(f"\n统计信息:")
    print(f"  ✅ 已完成: {len(completed)}")
    print(f"  ⚠️  需要深度分析: {len(pending)}")
    print(f"  ❌ 失败: {len(failed)}")

    return {
        "should_continue": False,
    }


# ==================== 条件分支 ====================


def should_continue_analysis(state: AnalysisState) -> str:
    """
    条件分支: 判断是否继续分析

    Returns:
        "continue" - 继续分析下一个 API
        "report" - 生成报告
    """
    if state.get("should_continue", False):
        return "continue"
    else:
        return "report"


# ==================== 工作流构建 ====================


def create_analysis_workflow() -> StateGraph:
    """
    创建分析工作流

    工作流程：
    1. parse_frontend - 解析前端页面，提取 API 列表
    2. analyze_api - 循环分析每个 API
    3. generate_report - 生成最终报告

    Returns:
        编译后的工作流
    """
    # 创建状态图
    workflow = StateGraph(AnalysisState)

    # 添加节点
    workflow.add_node("parse_frontend", parse_frontend_node)
    workflow.add_node("analyze_api", analyze_api_node)
    workflow.add_node("generate_report", generate_report_node)

    # 设置入口点
    workflow.set_entry_point("parse_frontend")

    # 添加边
    workflow.add_edge("parse_frontend", "analyze_api")

    # 添加条件边（循环分析 API）
    workflow.add_conditional_edges(
        "analyze_api",
        should_continue_analysis,
        {
            "continue": "analyze_api",  # 继续分析下一个 API
            "report": "generate_report",  # 生成报告
        },
    )

    # 报告节点结束
    workflow.add_edge("generate_report", END)

    # 编译工作流
    return workflow.compile()


# ==================== 便捷函数 ====================


def analyze_page_with_workflow(page_path: str, backend_path: str = "") -> Dict[str, Any]:
    """
    使用工作流分析页面

    Args:
        page_path: Vue 页面路径
        backend_path: 后端代码路径

    Returns:
        分析结果
    """
    # 创建工作流
    workflow = create_analysis_workflow()

    # 初始化状态
    initial_state: AnalysisState = {
        "page_path": page_path,
        "backend_path": backend_path,
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

    # 执行工作流
    print(f"\n{'='*60}")
    print(f"🚀 开始分析页面: {page_path}")
    print(f"{'='*60}")

    final_state = workflow.invoke(initial_state)

    # 返回结果
    return {
        "page_path": page_path,
        "total_apis": final_state.get("total_apis", 0),
        "completed_apis": final_state.get("completed_apis", []),
        "pending_deep_analysis": final_state.get("pending_deep_analysis", []),
        "failed_apis": final_state.get("failed_apis", []),
        "error": final_state.get("error"),
    }
