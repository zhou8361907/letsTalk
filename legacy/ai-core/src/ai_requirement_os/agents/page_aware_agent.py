"""页面感知的 Agent - 基于 SimpleAgent，集成 PageContext

核心功能：
1. 管理页面上下文
2. 流式输出（实时显示工具调用）
3. 支持页面切换
4. 像 Claude Code 一样的交互体验
"""

from typing import List, Dict, Any, Optional, Iterator, Union
import json
from enum import Enum

from ..simple_agent import SimpleAgent, Tool
from .page_context import PageContext, PageSkill


class StreamEventType(str, Enum):
    """流式事件类型"""
    INFO = "info"                    # 信息提示
    TOOL_CALL = "tool_call"          # 工具调用
    TOOL_RESULT = "tool_result"      # 工具结果
    SKILLS_LOADED = "skills_loaded"  # Skills 加载完成
    MESSAGE = "message"              # Agent 消息
    ERROR = "error"                  # 错误
    COMPLETE = "complete"            # 完成


class StreamEvent:
    """流式事件"""
    
    def __init__(
        self,
        event_type: StreamEventType,
        data: Any,
        metadata: Optional[Dict] = None
    ):
        self.type = event_type
        self.data = data
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "type": self.type.value,
            "data": self.data,
            "metadata": self.metadata
        }
    
    def to_json(self) -> str:
        """转换为 JSON"""
        return json.dumps(self.to_dict(), ensure_ascii=False)


class PageAwareAgent:
    """页面感知的 Agent
    
    特点：
    1. 以页面为维度管理上下文
    2. 实时显示工具调用过程
    3. 支持流式输出
    4. 像 Claude Code 一样的交互体验
    
    使用示例：
    ```python
    from openai import OpenAI
    from ai_requirement_os.agents import PageAwareAgent
    from ai_requirement_os.tools import get_all_tools
    
    client = OpenAI(api_key="...", base_url="...")
    tools = get_all_tools()
    agent = PageAwareAgent(client, tools)
    
    # 进入页面
    for event in agent.enter_page("Detail.vue"):
        print(event.to_json())
    
    # 对话
    for event in agent.chat("保存功能怎么实现的？"):
        print(event.to_json())
    ```
    """
    
    def __init__(
        self,
        llm_client,
        tools: List[Tool],
        model: str = "deepseek-chat",
        max_turns: int = 10
    ):
        """初始化 Agent
        
        Args:
            llm_client: LLM 客户端
            tools: 工具列表
            model: 模型名称
            max_turns: 最大轮次
        """
        self.client = llm_client
        self.model = model
        self.tools = {tool.name: tool for tool in tools}
        self.tool_schemas = [tool.to_openai_format() for tool in tools]
        self.max_turns = max_turns
        self.context = PageContext()
    
    def enter_page(
        self,
        page_path: str,
        page_info: Optional[Dict[str, Any]] = None
    ) -> Iterator[StreamEvent]:
        """进入页面（流式输出）
        
        Args:
            page_path: 页面路径
            page_info: 页面信息（如果为 None，会调用 analyze_page 工具）
            
        Yields:
            StreamEvent 对象
        """
        yield StreamEvent(StreamEventType.INFO, "🔄 正在分析页面...")
        
        # 如果没有提供页面信息，调用 analyze_page 工具
        if page_info is None:
            if "analyze_page" not in self.tools:
                yield StreamEvent(
                    StreamEventType.ERROR,
                    "analyze_page 工具不存在，无法分析页面"
                )
                return
            
            # 调用工具
            yield StreamEvent(
                StreamEventType.TOOL_CALL,
                {
                    "tool": "analyze_page",
                    "args": {"page_path": page_path}
                }
            )
            
            try:
                tool = self.tools["analyze_page"]
                page_info = tool.execute(page_path=page_path)
                yield StreamEvent(StreamEventType.TOOL_RESULT, "✅ 页面分析完成")
            except Exception as e:
                yield StreamEvent(
                    StreamEventType.ERROR,
                    f"页面分析失败: {str(e)}"
                )
                return
        
        # 加载页面上下文
        try:
            self.context.enter_page(page_path, page_info)
            
            # 发送 Skills 加载事件
            skills_summary = self.context.get_skills_summary()
            yield StreamEvent(StreamEventType.SKILLS_LOADED, skills_summary)
            
            # 欢迎消息
            skill_count = len(self.context.page_info.skills)
            yield StreamEvent(
                StreamEventType.MESSAGE,
                f"💡 我已经了解了这个页面的 {skill_count} 个功能！有什么问题吗？"
            )
            
            yield StreamEvent(StreamEventType.COMPLETE, "页面加载完成")
        
        except Exception as e:
            yield StreamEvent(
                StreamEventType.ERROR,
                f"加载页面上下文失败: {str(e)}"
            )
    
    def chat(self, user_message: str) -> Iterator[StreamEvent]:
        """对话（流式输出）
        
        Args:
            user_message: 用户消息
            
        Yields:
            StreamEvent 对象
        """
        # 检查是否有页面上下文
        if not self.context.page_info:
            yield StreamEvent(
                StreamEventType.ERROR,
                "请先进入一个页面"
            )
            return
        
        # 添加用户消息到历史
        self.context.add_message("user", user_message)
        
        # 构建消息（包含页面上下文）
        system_prompt = self._build_system_prompt()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        yield StreamEvent(StreamEventType.INFO, "🔍 正在分析...")
        
        # 运行 Agent 循环
        for event in self._run_with_streaming(messages):
            yield event
    
    def _build_system_prompt(self) -> str:
        """构建系统提示（包含页面上下文）"""
        context_str = self.context.get_context(include_history=False)
        
        return f"""你是一个专业的代码分析助手。

{context_str}

## 你的任务

基于当前页面的 Skills 回答用户问题。

## 可用工具

你可以使用以下工具：
- find_skill: 在当前页面查找指定的 Skill
- get_skill_implementation: 获取 Skill 的实现细节
- get_code_location: 获取代码位置
- find_similar_skills: 在其他页面查找类似的 Skills
- generate_code: 基于现有 Skill 生成新代码

## 回答要求

1. **准确**: 基于实际的 Skills 回答，不要编造
2. **详细**: 提供完整的实现路径（前端 → API → 后端 → 数据库）
3. **清晰**: 使用结构化的格式（标题、列表、代码块）
4. **实用**: 提供代码位置和代码片段

## 回答格式

当用户询问功能实现时，按照以下格式回答：

```
【功能描述】
简要描述功能的业务含义

【实现路径】

1. 前端部分
   - 文件: xxx.vue 第 xx 行
   - 方法: xxx()
   - 逻辑: ...

2. API 接口
   - 地址: POST /api/xxx
   - 参数: {...}

3. 后端部分
   - Controller: xxx.java 第 xx 行
   - Service: xxx.java 第 xx 行
   - 逻辑: ...

4. 数据库
   - 表: xxx
   - 操作: INSERT/UPDATE/DELETE

【数据流】
1. 用户操作
2. 前端处理
3. API 调用
4. 后端处理
5. 数据库操作
6. 返回结果

【校验规则】
- 前端: ...
- 后端: ...

【错误处理】
- 情况1: ...
- 情况2: ...
```

请开始回答用户的问题。
"""
    
    def _run_with_streaming(
        self,
        messages: List[Dict[str, str]]
    ) -> Iterator[StreamEvent]:
        """运行 Agent 循环（流式输出）
        
        Args:
            messages: 消息列表
            
        Yields:
            StreamEvent 对象
        """
        for turn in range(self.max_turns):
            # 调用 LLM
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=self.tool_schemas,
                    tool_choice="auto"
                )
            except Exception as e:
                yield StreamEvent(
                    StreamEventType.ERROR,
                    f"LLM 调用失败: {str(e)}"
                )
                return
            
            message = response.choices[0].message
            
            # 转换消息格式
            if hasattr(message, 'model_dump'):
                message_dict = message.model_dump()
            else:
                message_dict = {
                    "role": message.role,
                    "content": message.content,
                }
                if hasattr(message, 'tool_calls') and message.tool_calls:
                    message_dict["tool_calls"] = [
                        {
                            "id": tc.id,
                            "type": tc.type,
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in message.tool_calls
                    ]
            
            messages.append(message_dict)
            
            # 检查是否需要工具
            if message.tool_calls:
                # 执行所有工具调用
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    
                    # 解析参数
                    try:
                        tool_args = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError as e:
                        yield StreamEvent(
                            StreamEventType.ERROR,
                            f"工具参数解析失败: {str(e)}"
                        )
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": f"参数解析失败: {str(e)}"})
                        })
                        continue
                    
                    # 发送工具调用事件
                    yield StreamEvent(
                        StreamEventType.TOOL_CALL,
                        {
                            "tool": tool_name,
                            "args": tool_args
                        }
                    )
                    
                    # 执行工具
                    try:
                        tool = self.tools[tool_name]
                        result = tool.execute(**tool_args)
                        
                        # 发送工具结果事件
                        yield StreamEvent(
                            StreamEventType.TOOL_RESULT,
                            {
                                "tool": tool_name,
                                "success": True,
                                "result": result
                            }
                        )
                        
                        # 添加工具结果到消息
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result, ensure_ascii=False)
                        })
                    
                    except KeyError:
                        error_msg = f"工具不存在: {tool_name}"
                        yield StreamEvent(StreamEventType.ERROR, error_msg)
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": error_msg})
                        })
                    
                    except Exception as e:
                        error_msg = f"工具执行失败: {str(e)}"
                        yield StreamEvent(StreamEventType.ERROR, error_msg)
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": error_msg})
                        })
                
                # 继续下一轮
                continue
            
            # 没有工具调用，返回结果
            if message.content:
                # 添加到历史
                self.context.add_message("assistant", message.content)
                
                # 发送消息事件
                yield StreamEvent(StreamEventType.MESSAGE, message.content)
            
            # 完成
            yield StreamEvent(
                StreamEventType.COMPLETE,
                {
                    "turns": turn + 1,
                    "max_turns": self.max_turns
                }
            )
            return
        
        # 达到最大轮次
        yield StreamEvent(
            StreamEventType.ERROR,
            f"达到最大轮次 ({self.max_turns})，分析未完成"
        )
    
    def get_current_page(self) -> Optional[str]:
        """获取当前页面路径"""
        return self.context.current_page
    
    def get_skills_summary(self) -> Dict[str, Any]:
        """获取当前页面的 Skills 摘要"""
        return self.context.get_skills_summary()
    
    def search_skills(self, keyword: str) -> List[PageSkill]:
        """搜索当前页面的 Skills"""
        return self.context.search_skills(keyword)
