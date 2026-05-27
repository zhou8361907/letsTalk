"""流式输出美化系统

使用 Rich 库提供漂亮的终端输出，包括：
1. 彩色文本和图标
2. 进度条和 Spinner
3. 表格和树形结构
4. 实时流式更新
"""

from typing import Optional, Dict, Any, List
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn
from rich.table import Table
from rich.tree import Tree
from rich.panel import Panel
from rich.live import Live
from rich.layout import Layout
from rich import box
from rich.text import Text
import time

# 创建全局 Console
console = Console()


class StreamOutput:
    """流式输出管理器"""

    def __init__(self):
        self.console = console
        self.current_progress = None
        self.current_task = None

    # ==================== 标题和分隔符 ====================

    def print_header(self, title: str, subtitle: str = ""):
        """打印漂亮的标题"""
        if subtitle:
            text = f"[bold cyan]{title}[/bold cyan]\n[dim]{subtitle}[/dim]"
        else:
            text = f"[bold cyan]{title}[/bold cyan]"

        panel = Panel(
            text,
            border_style="cyan",
            box=box.DOUBLE,
            padding=(1, 2),
        )
        self.console.print(panel)

    def print_section(self, title: str, icon: str = "📋"):
        """打印章节标题"""
        self.console.print(f"\n{icon} [bold yellow]{title}[/bold yellow]")

    def print_separator(self):
        """打印分隔线"""
        self.console.print("─" * 60, style="dim")

    # ==================== 状态消息 ====================

    def print_info(self, message: str):
        """打印信息"""
        self.console.print(f"ℹ️  [cyan]{message}[/cyan]")

    def print_success(self, message: str):
        """打印成功消息"""
        self.console.print(f"✅ [green]{message}[/green]")

    def print_warning(self, message: str):
        """打印警告"""
        self.console.print(f"⚠️  [yellow]{message}[/yellow]")

    def print_error(self, message: str):
        """打印错误"""
        self.console.print(f"❌ [red]{message}[/red]")

    def print_step(self, step: int, total: int, message: str):
        """打印步骤"""
        self.console.print(f"[bold cyan][{step}/{total}][/bold cyan] {message}")

    # ==================== 进度条 ====================

    def create_progress(self) -> Progress:
        """创建进度条"""
        return Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            console=self.console,
        )

    def start_progress(self, description: str, total: int = 100):
        """开始进度条"""
        self.current_progress = self.create_progress()
        self.current_progress.start()
        self.current_task = self.current_progress.add_task(description, total=total)
        return self.current_progress, self.current_task

    def update_progress(self, advance: int = 1, description: str = None):
        """更新进度"""
        if self.current_progress and self.current_task is not None:
            if description:
                self.current_progress.update(
                    self.current_task, advance=advance, description=description
                )
            else:
                self.current_progress.update(self.current_task, advance=advance)

    def stop_progress(self):
        """停止进度条"""
        if self.current_progress:
            self.current_progress.stop()
            self.current_progress = None
            self.current_task = None

    # ==================== 表格 ====================

    def create_table(self, title: str, columns: List[str]) -> Table:
        """创建表格"""
        table = Table(title=title, box=box.ROUNDED, show_header=True, header_style="bold cyan")
        for col in columns:
            table.add_column(col)
        return table

    def print_api_table(self, apis: List[Dict[str, Any]]):
        """打印 API 列表表格"""
        table = self.create_table("🔍 发现的 API", ["#", "方法", "路径", "触发位置"])

        for i, api in enumerate(apis, 1):
            method_color = {
                "GET": "green",
                "POST": "blue",
                "PUT": "yellow",
                "DELETE": "red",
            }.get(api["method"], "white")

            table.add_row(
                str(i),
                f"[{method_color}]{api['method']}[/{method_color}]",
                api["url"],
                api.get("trigger", "unknown"),
            )

        self.console.print(table)

    def print_result_table(
        self, completed: List[Dict], pending: List[Dict], failed: List[Dict]
    ):
        """打印分析结果表格"""
        table = self.create_table(
            "📊 分析结果", ["API", "Controller", "复杂度", "状态"]
        )

        # 已完成的 API
        for api in completed:
            table.add_row(
                f"[green]{api['method']}[/green] {api['url']}",
                f"{api.get('controller_class', 'N/A')}.{api.get('controller_method', 'N/A')}",
                f"[green]{api.get('complexity_score', 'N/A')}[/green]",
                "✅ 完成",
            )

        # 需要深度分析的 API
        for api in pending:
            table.add_row(
                f"[yellow]{api['method']}[/yellow] {api['url']}",
                f"{api.get('controller_class', 'N/A')}.{api.get('controller_method', 'N/A')}",
                f"[yellow]{api.get('complexity_score', 'N/A')}[/yellow]",
                "⚠️  深度分析",
            )

        # 失败的 API
        for api in failed:
            table.add_row(
                f"[red]{api['method']}[/red] {api['url']}",
                api.get("error_message", "N/A"),
                "N/A",
                "❌ 失败",
            )

        self.console.print(table)

    def print_stats_table(self, stats: Dict[str, Any]):
        """打印统计信息表格"""
        table = self.create_table("📈 统计信息", ["指标", "数值"])

        table.add_row("总 API 数", str(stats.get("total_apis", 0)))
        table.add_row(
            "✅ 已完成", f"[green]{len(stats.get('completed_apis', []))}[/green]"
        )
        table.add_row(
            "⚠️  需要深度分析",
            f"[yellow]{len(stats.get('pending_deep_analysis', []))}[/yellow]",
        )
        table.add_row("❌ 失败", f"[red]{len(stats.get('failed_apis', []))}[/red]")

        if "total_time" in stats:
            table.add_row("⏱️  总时间", f"{stats['total_time']:.2f}s")

        if "api_times" in stats and stats["api_times"]:
            avg_time = sum(stats["api_times"].values()) / len(stats["api_times"])
            table.add_row("⏱️  平均时间", f"{avg_time:.2f}s")

            if stats.get("total_time"):
                sequential_time = sum(stats["api_times"].values())
                speedup = sequential_time / stats["total_time"]
                table.add_row("🚀 加速比", f"[cyan]{speedup:.2f}x[/cyan]")

        self.console.print(table)

    # ==================== 树形结构 ====================

    def create_api_tree(self, api: Dict[str, Any]) -> Tree:
        """创建 API 分析树"""
        method_color = {
            "GET": "green",
            "POST": "blue",
            "PUT": "yellow",
            "DELETE": "red",
        }.get(api["method"], "white")

        tree = Tree(
            f"[{method_color}]{api['method']}[/{method_color}] {api['url']}",
            guide_style="dim",
        )

        # Controller 信息
        if api.get("controller_class"):
            controller_branch = tree.add("🎯 Controller")
            controller_branch.add(
                f"[cyan]{api['controller_class']}.{api['controller_method']}[/cyan]"
            )
            if api.get("controller_file"):
                controller_branch.add(f"[dim]{api['controller_file']}[/dim]")

        # 复杂度信息
        if api.get("complexity_score") is not None:
            complexity_branch = tree.add("📊 复杂度")
            score = api["complexity_score"]
            score_color = "green" if score < 30 else "yellow" if score < 60 else "red"
            complexity_branch.add(f"[{score_color}]得分: {score}[/{score_color}]")
            complexity_branch.add(f"代码行数: {api.get('lines_of_code', 'N/A')}")
            complexity_branch.add(
                f"圈复杂度: {api.get('cyclomatic_complexity', 'N/A')}"
            )

            if api.get("external_calls"):
                calls_branch = complexity_branch.add("外部调用")
                for call in api["external_calls"]:
                    calls_branch.add(f"• {call}")

        # 建议
        if api.get("recommendation"):
            tree.add(f"💡 [italic]{api['recommendation']}[/italic]")

        return tree

    def print_api_analysis(self, api: Dict[str, Any], index: int, total: int):
        """打印单个 API 的分析结果"""
        self.console.print(f"\n[bold cyan][{index}/{total}][/bold cyan]")
        tree = self.create_api_tree(api)
        self.console.print(tree)

    # ==================== 实时流式输出 ====================

    def stream_analysis(self, page_path: str, apis: List[Dict[str, Any]]):
        """流式显示分析过程"""
        # 打印标题
        self.print_header("🚀 开始分析", f"页面: {page_path}")

        # 打印 API 列表
        self.print_section("发现的 API", "🔍")
        self.print_api_table(apis)

        # 开始分析
        self.print_section("分析进度", "⚙️")

        return len(apis)

    def stream_api_result(
        self, api: Dict[str, Any], index: int, total: int, elapsed_time: float = 0
    ):
        """流式显示单个 API 的分析结果"""
        method_color = {
            "GET": "green",
            "POST": "blue",
            "PUT": "yellow",
            "DELETE": "red",
        }.get(api["method"], "white")

        # 状态图标
        status_icon = {
            "completed": "✅",
            "needs_deep_analysis": "⚠️",
            "error": "❌",
        }.get(api.get("status"), "❓")

        # 打印简要信息
        self.console.print(
            f"\n[bold cyan][{index}/{total}][/bold cyan] "
            f"[{method_color}]{api['method']}[/{method_color}] {api['url']} "
            f"{status_icon}"
        )

        # 打印详细信息
        if api.get("controller_class"):
            self.console.print(
                f"  └─ Controller: [cyan]{api['controller_class']}.{api['controller_method']}[/cyan]"
            )

        if api.get("complexity_score") is not None:
            score = api["complexity_score"]
            score_color = "green" if score < 30 else "yellow" if score < 60 else "red"
            self.console.print(f"  └─ 复杂度: [{score_color}]{score}[/{score_color}]")

        if elapsed_time > 0:
            self.console.print(f"  └─ 耗时: [dim]{elapsed_time:.2f}s[/dim]")

        if api.get("error_message"):
            self.console.print(f"  └─ 错误: [red]{api['error_message']}[/red]")


# 创建全局实例
stream = StreamOutput()


# ==================== 便捷函数 ====================


def print_header(title: str, subtitle: str = ""):
    """打印标题"""
    stream.print_header(title, subtitle)


def print_section(title: str, icon: str = "📋"):
    """打印章节"""
    stream.print_section(title, icon)


def print_success(message: str):
    """打印成功消息"""
    stream.print_success(message)


def print_error(message: str):
    """打印错误"""
    stream.print_error(message)


def print_api_table(apis: List[Dict[str, Any]]):
    """打印 API 表格"""
    stream.print_api_table(apis)


def print_result_table(
    completed: List[Dict], pending: List[Dict], failed: List[Dict]
):
    """打印结果表格"""
    stream.print_result_table(completed, pending, failed)


def print_stats_table(stats: Dict[str, Any]):
    """打印统计表格"""
    stream.print_stats_table(stats)


def stream_api_result(
    api: Dict[str, Any], index: int, total: int, elapsed_time: float = 0
):
    """流式显示 API 结果"""
    stream.stream_api_result(api, index, total, elapsed_time)
