"""工具系统 - 标准化的工具接口"""

from typing import Any, Dict, Callable, List
from pydantic import BaseModel


class ToolSchema(BaseModel):
    """工具 Schema - 兼容 OpenAI Function Calling"""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema 格式


class Tool:
    """标准工具接口
    
    设计目标：
    1. 简单 - 只需要 name, description, func, parameters
    2. 标准 - 兼容 OpenAI function calling 格式
    3. 灵活 - 可以转换为任何框架的格式
    """
    
    def __init__(
        self,
        name: str,
        description: str,
        func: Callable,
        parameters: Dict[str, Any]
    ):
        self.name = name
        self.description = description
        self.func = func
        self.parameters = parameters
    
    @property
    def schema(self) -> ToolSchema:
        """返回工具 Schema"""
        return ToolSchema(
            name=self.name,
            description=self.description,
            parameters=self.parameters
        )
    
    def execute(self, **kwargs) -> Any:
        """执行工具"""
        return self.func(**kwargs)
    
    def to_openai_format(self) -> Dict:
        """转换为 OpenAI function calling 格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }
    
    def to_dict(self) -> Dict:
        """转换为字典（用于序列化）"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters
        }


class ToolRegistry:
    """工具注册器
    
    使用装饰器模式，方便注册工具：
    
    ```python
    registry = ToolRegistry()
    
    @registry.register(
        name="my_tool",
        description="My tool description",
        parameters={...}
    )
    def my_tool(arg1: str) -> str:
        return f"Result: {arg1}"
    ```
    """
    
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
    
    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any]
    ):
        """装饰器：注册工具"""
        def decorator(func: Callable):
            tool = Tool(
                name=name,
                description=description,
                func=func,
                parameters=parameters
            )
            self.tools[name] = tool
            return func
        return decorator
    
    def add_tool(self, tool: Tool):
        """直接添加工具对象"""
        self.tools[tool.name] = tool
    
    def get_all(self) -> List[Tool]:
        """获取所有工具"""
        return list(self.tools.values())
    
    def get(self, name: str) -> Tool:
        """获取单个工具"""
        return self.tools[name]
    
    def has(self, name: str) -> bool:
        """检查工具是否存在"""
        return name in self.tools
    
    def remove(self, name: str):
        """移除工具"""
        if name in self.tools:
            del self.tools[name]
    
    def clear(self):
        """清空所有工具"""
        self.tools.clear()
    
    def __len__(self) -> int:
        """工具数量"""
        return len(self.tools)
    
    def __iter__(self):
        """迭代工具"""
        return iter(self.tools.values())
