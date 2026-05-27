"""Simple Agent - Pi 风格的极简 Agent

学习 Pi 的设计理念，用 Python 实现。

核心特点：
1. 极简的循环（~100 行）
2. 模型自主决策
3. 工具只是辅助
4. 完全透明可控
"""

from .agent import SimpleAgent
from .tool import Tool, ToolRegistry

__all__ = ["SimpleAgent", "Tool", "ToolRegistry"]
