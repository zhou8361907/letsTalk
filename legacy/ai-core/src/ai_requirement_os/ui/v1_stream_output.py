"""V1 页面分析流式输出美化

专门为 V1 页面分析流程设计的美化输出系统，
复用 V2 的 Rich 库基础设施，适配 V1 的分析步骤。
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, UTC
from pydantic import BaseModel
from enum import Enum


class V1EventType(str, Enum):
    """V1 流式事件类型"""
    START = "start"              # 开始分析
    STEP = "step"                # 步骤进度
    PROGRESS = "progress"        # 进度更新
    TABLE = "table"              # 表格数据
    API_LIST = "api_list"        # API 列表
    COMPLETE = "complete"        # 完成
    ERROR = "error"              # 错误


class V1StreamEvent(BaseModel):
    """V1 流式事件"""
    event: V1EventType
    timestamp: datetime
    content: str
    data: Optional[Dict[str, Any]] = None


class V1StreamFormatter:
    """V1 流式输出格式化器
    
    将分析步骤转换为结构化的流式事件，
    前端可以根据事件类型进行美化展示。
    """
    
    def __init__(self):
        self.start_time = None
        self.total_steps = 5  # V1 分析的总步骤数
        self.current_step = 0
    
    # ==================== 事件生成 ====================
    
    def start_event(self, page_path: str) -> V1StreamEvent:
        """生成开始事件"""
        self.start_time = datetime.now(UTC)
        self.current_step = 0
        
        return V1StreamEvent(
            event=V1EventType.START,
            timestamp=self.start_time,
            content=f"开始分析页面: {page_path}",
            data={
                "page_path": page_path,
                "total_steps": self.total_steps,
                "style": "header"
            }
        )
    
    def step_event(self, step_name: str, details: Optional[str] = None) -> V1StreamEvent:
        """生成步骤事件"""
        self.current_step += 1
        
        content = f"步骤 {self.current_step}/{self.total_steps}: {step_name}"
        if details:
            content += f"\n  {details}"
        
        return V1StreamEvent(
            event=V1EventType.STEP,
            timestamp=datetime.now(UTC),
            content=content,
            data={
                "step": self.current_step,
                "total": self.total_steps,
                "step_name": step_name,
                "details": details,
                "style": "info"
            }
        )
    
    def progress_event(
        self,
        message: str,
        current: int,
        total: int,
        style: str = "info"
    ) -> V1StreamEvent:
        """生成进度事件"""
        percentage = int((current / total) * 100) if total > 0 else 0
        
        return V1StreamEvent(
            event=V1EventType.PROGRESS,
            timestamp=datetime.now(UTC),
            content=message,
            data={
                "current": current,
                "total": total,
                "percentage": percentage,
                "style": style
            }
        )
    
    def api_list_event(self, apis: List[Dict[str, Any]]) -> V1StreamEvent:
        """生成 API 列表事件"""
        return V1StreamEvent(
            event=V1EventType.API_LIST,
            timestamp=datetime.now(UTC),
            content=f"发现 {len(apis)} 个 API",
            data={
                "apis": apis,
                "count": len(apis),
                "style": "table"
            }
        )
    
    def table_event(
        self,
        title: str,
        headers: List[str],
        rows: List[List[str]]
    ) -> V1StreamEvent:
        """生成表格事件"""
        return V1StreamEvent(
            event=V1EventType.TABLE,
            timestamp=datetime.now(UTC),
            content=title,
            data={
                "title": title,
                "headers": headers,
                "rows": rows,
                "style": "table"
            }
        )
    
    def complete_event(
        self,
        message: str = "分析完成",
        result_data: Optional[Dict[str, Any]] = None
    ) -> V1StreamEvent:
        """生成完成事件"""
        elapsed = 0.0
        if self.start_time:
            elapsed = (datetime.now(UTC) - self.start_time).total_seconds()
        
        return V1StreamEvent(
            event=V1EventType.COMPLETE,
            timestamp=datetime.now(UTC),
            content=message,
            data={
                "elapsed_time": elapsed,
                "result": result_data,
                "style": "success"
            }
        )
    
    def error_event(self, error_message: str, details: Optional[str] = None) -> V1StreamEvent:
        """生成错误事件"""
        return V1StreamEvent(
            event=V1EventType.ERROR,
            timestamp=datetime.now(UTC),
            content=error_message,
            data={
                "error": error_message,
                "details": details,
                "style": "error"
            }
        )
    
    # ==================== V1 特定的事件生成器 ====================
    
    def workspace_loaded_event(
        self,
        page_file: str,
        api_count: int,
        related_files: int
    ) -> V1StreamEvent:
        """工作区加载完成事件"""
        return self.step_event(
            "加载页面工作区",
            f"✅ 已加载 {page_file}\n  ✅ 发现 {api_count} 个 API 调用\n  ✅ 关联 {related_files} 个文件"
        )
    
    def evidence_bundle_event(
        self,
        initial_fetches: int,
        actions: int
    ) -> V1StreamEvent:
        """证据包构建完成事件"""
        return self.step_event(
            "构建证据包",
            f"✅ {initial_fetches} 个初始请求\n  ✅ {actions} 个操作"
        )
    
    def llm_analysis_start_event(self) -> V1StreamEvent:
        """LLM 分析开始事件"""
        return self.step_event(
            "调用 LLM 分析",
            "⏳ 正在分析代码逻辑..."
        )
    
    def llm_analysis_complete_event(self) -> V1StreamEvent:
        """LLM 分析完成事件"""
        return self.progress_event(
            "✅ LLM 分析完成",
            current=1,
            total=1,
            style="success"
        )
    
    def report_generation_event(self) -> V1StreamEvent:
        """报告生成事件"""
        return self.step_event(
            "生成报告",
            "✅ Markdown 报告已生成"
        )
    
    def save_result_event(self, save_path: str) -> V1StreamEvent:
        """保存结果事件"""
        return self.step_event(
            "保存结果",
            f"✅ 已保存到 {save_path}"
        )


# ==================== 便捷函数 ====================


def format_api_for_table(api: Dict[str, Any]) -> List[str]:
    """格式化 API 为表格行"""
    return [
        api.get("method", "UNKNOWN"),
        api.get("url", ""),
        api.get("trigger", "unknown")
    ]


def create_api_table_data(apis: List[Dict[str, Any]]) -> Dict[str, Any]:
    """创建 API 表格数据"""
    headers = ["方法", "路径", "触发位置"]
    rows = [format_api_for_table(api) for api in apis]
    
    return {
        "title": "🔍 发现的 API",
        "headers": headers,
        "rows": rows
    }


def format_lineage_summary(lineage: Dict[str, Any]) -> Dict[str, Any]:
    """格式化血缘分析摘要"""
    page_info = lineage.get("page_info", {})
    
    return {
        "page_name": page_info.get("page_name", "Unknown"),
        "module": page_info.get("module_name", "Unknown"),
        "search_fields": len(lineage.get("search_fields", [])),
        "display_fields": len(lineage.get("display_fields", [])),
        "initial_fetches": len(lineage.get("initial_fetches", [])),
        "actions": len(lineage.get("actions", [])),
        "controllers": len(lineage.get("backend_overview", {}).get("controllers", [])),
        "services": len(lineage.get("backend_overview", {}).get("services", [])),
    }


# ==================== 示例使用 ====================


def example_v1_stream():
    """示例：V1 流式输出"""
    formatter = V1StreamFormatter()
    
    # 1. 开始
    yield formatter.start_event("Detail.vue")
    
    # 2. 加载工作区
    yield formatter.workspace_loaded_event(
        page_file="Detail.vue",
        api_count=3,
        related_files=5
    )
    
    # 3. 构建证据包
    yield formatter.evidence_bundle_event(
        initial_fetches=2,
        actions=3
    )
    
    # 4. API 列表
    apis = [
        {"method": "GET", "url": "/api/detail", "trigger": "loadData"},
        {"method": "GET", "url": "/api/option/all", "trigger": "mounted"},
        {"method": "POST", "url": "/api/detail", "trigger": "save"},
    ]
    yield formatter.api_list_event(apis)
    
    # 5. LLM 分析
    yield formatter.llm_analysis_start_event()
    # ... 模拟分析过程 ...
    yield formatter.llm_analysis_complete_event()
    
    # 6. 生成报告
    yield formatter.report_generation_event()
    
    # 7. 保存结果
    yield formatter.save_result_event(".agent/page_analysis.json")
    
    # 8. 完成
    yield formatter.complete_event(
        message="分析完成！",
        result_data={
            "apis": len(apis),
            "success": True
        }
    )


if __name__ == "__main__":
    """测试流式输出"""
    import json
    
    print("V1 流式输出示例：\n")
    
    for event in example_v1_stream():
        print(f"[{event.event}] {event.content}")
        if event.data:
            print(f"  数据: {json.dumps(event.data, ensure_ascii=False, indent=2)}")
        print()
