"""Simple Agent - Pi 风格的极简 Agent

核心理念（学习 Pi）：
1. Agent 只是一个透明的循环 - 不做任何假设
2. 不在代码里写死任何逻辑 - 用文档引导
3. 让模型自己决定 - 不强制工作流
4. 完全透明可控 - 用户掌控一切
"""

from typing import List, Dict, Any, Optional, Union
import json

from .tool import Tool


class SimpleAgent:
    """Pi 风格的极简 Agent
    
    设计原则：
    - 不假设任何使用场景
    - 不提供默认的系统提示
    - 不强制任何工作流
    - 只提供纯粹的循环
    
    使用示例：
    ```python
    from openai import OpenAI
    from ai_requirement_os.simple_agent import SimpleAgent
    from ai_requirement_os.tools import get_all_tools
    
    client = OpenAI(api_key="...", base_url="...")
    tools = get_all_tools()
    agent = SimpleAgent(client, tools)
    
    # 用户自己提供完整的消息
    messages = [
        {"role": "system", "content": "你是一个代码分析专家..."},
        {"role": "user", "content": "分析 Detail.vue 页面"}
    ]
    
    result = agent.run(messages)
    print(result)
    ```
    """
    
    def __init__(
        self,
        llm_client,  # OpenAI/DeepSeek client
        tools: List[Tool],
        model: str = "deepseek-chat",
        max_turns: int = 10,
        verbose: bool = False
    ):
        """初始化 Agent
        
        Args:
            llm_client: LLM 客户端（OpenAI/DeepSeek）
            tools: 工具列表
            model: 模型名称
            max_turns: 最大轮次
            verbose: 是否打印详细信息
        """
        self.client = llm_client
        self.model = model
        self.tools = {tool.name: tool for tool in tools}
        self.tool_schemas = [tool.to_openai_format() for tool in tools]
        self.max_turns = max_turns
        self.verbose = verbose
    
    def run(self, messages: Union[str, List[Dict[str, str]]]) -> str:
        """运行 Agent - Pi 风格的简单循环
        
        Args:
            user_message: 用户消息
            
        Returns:
            Agent 的最终回复
        """
        
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        for turn in range(self.max_turns):
            if self.verbose:
                print(f"\n{'='*60}")
                print(f"🔄 Turn {turn + 1}/{self.max_turns}")
                print(f"{'='*60}")
            
            # 1. 调用 LLM
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=self.tool_schemas,
                    tool_choice="auto"
                )
            except Exception as e:
                if self.verbose:
                    print(f"❌ LLM 调用失败: {str(e)}")
                return f"错误: LLM 调用失败 - {str(e)}"
            
            message = response.choices[0].message
            
            # 将消息转换为字典（兼容不同的 SDK）
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
            
            # 2. 检查是否需要工具
            if message.tool_calls:
                if self.verbose:
                    print(f"\n🔧 需要调用 {len(message.tool_calls)} 个工具:")
                
                # 执行所有工具调用
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    
                    try:
                        tool_args = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError as e:
                        if self.verbose:
                            print(f"  ❌ {tool_name}: 参数解析失败 - {str(e)}")
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": f"参数解析失败: {str(e)}"})
                        })
                        continue
                    
                    if self.verbose:
                        print(f"  📞 {tool_name}({json.dumps(tool_args, ensure_ascii=False)})")
                    
                    # 执行工具
                    try:
                        tool = self.tools[tool_name]
                        result = tool.execute(**tool_args)
                        
                        if self.verbose:
                            print(f"    ✅ 成功")
                        
                        # 添加工具结果到消息
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result, ensure_ascii=False)
                        })
                    
                    except KeyError:
                        error_msg = f"工具不存在: {tool_name}"
                        if self.verbose:
                            print(f"    ❌ {error_msg}")
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": error_msg})
                        })
                    
                    except Exception as e:
                        error_msg = f"工具执行失败: {str(e)}"
                        if self.verbose:
                            print(f"    ❌ {error_msg}")
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({"error": error_msg})
                        })
                
                # 继续下一轮
                continue
            
            # 3. 没有工具调用，返回结果
            if self.verbose:
                print(f"\n✅ 完成！用了 {turn + 1} 轮")
            
            return message.content or ""
        
        # 达到最大轮次
        if self.verbose:
            print(f"\n⚠️  达到最大轮次 ({self.max_turns})")
        
        return "达到最大轮次，分析未完成"
    
    def run_with_history(self, user_message: str) -> Dict[str, Any]:
        """运行 Agent 并返回完整历史
        
        Args:
            user_message: 用户消息
            
        Returns:
            包含结果和历史的字典
        """
        # TODO: 实现带历史的运行
        result = self.run(user_message)
        return {
            "result": result,
            "history": [],  # TODO: 保存消息历史
            "turns": 0,     # TODO: 记录轮次
        }
