"""主控 Agent 实现"""

import json
from typing import Dict, Any, Optional

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..tools import (
    parse_vue_ast,
    extract_api_calls,
    search_controller_by_url,
    get_method_source,
    calculate_method_complexity,
    detect_external_calls,
)
from ..prompts.orchestrator import ORCHESTRATOR_SYSTEM_PROMPT, ORCHESTRATOR_USER_PROMPT
from ..config.v2_config import V2Config
from ..config.llm_config import create_llm


class OrchestratorAgent:
    """主控 Agent - 负责协调整个分析流程"""

    def __init__(self, config: Optional[V2Config] = None):
        """
        初始化主控 Agent

        Args:
            config: V2 配置对象
        """
        self.config = config or V2Config()

        # 初始化 LLM（自动处理 DeepSeek/OpenAI 配置）
        # 添加重试和超时配置
        self.llm = create_llm(
            model=self.config.llm_model,
            temperature=self.config.llm_temperature,
            max_tokens=self.config.llm_max_tokens,
            max_retries=3,  # SDK 内置重试
            timeout=60.0,  # 60 秒超时
        )

        # 准备工具列表
        self.tools = [
            parse_vue_ast,
            extract_api_calls,
            search_controller_by_url,
            get_method_source,
            calculate_method_complexity,
            detect_external_calls,
        ]

        # 创建 Prompt
        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", ORCHESTRATOR_SYSTEM_PROMPT),
                ("human", ORCHESTRATOR_USER_PROMPT),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ]
        )

        # 创建 Agent
        agent = create_tool_calling_agent(self.llm, self.tools, self.prompt)

        # 创建 Executor
        self.executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            max_iterations=self.config.max_iterations,
            verbose=True,
            return_intermediate_steps=True,
            handle_parsing_errors=True,
        )

    def analyze(self, page_path: str, backend_path: str = "") -> Dict[str, Any]:
        """
        分析页面数据流向

        Args:
            page_path: Vue 页面路径
            backend_path: 后端代码路径（如果为空，使用配置中的路径）

        Returns:
            分析结果，包含：
            - output: Agent 的输出（JSON 格式的分析报告）
            - steps: 中间步骤列表
            - success: 是否成功
            - error: 错误信息（如果有）
        """
        # 使用配置中的路径作为默认值
        if not backend_path:
            backend_path = self.config.backend_path

        try:
            result = self.executor.invoke(
                {"page_path": page_path, "backend_path": backend_path}
            )

            # 尝试解析输出为 JSON
            output = result["output"]
            try:
                # 如果输出是 JSON 字符串，解析它
                if isinstance(output, str):
                    # 提取 JSON 部分（可能包含在 markdown 代码块中）
                    if "```json" in output:
                        json_start = output.find("```json") + 7
                        json_end = output.find("```", json_start)
                        output = output[json_start:json_end].strip()
                    elif "```" in output:
                        json_start = output.find("```") + 3
                        json_end = output.find("```", json_start)
                        output = output[json_start:json_end].strip()

                    parsed_output = json.loads(output)
                else:
                    parsed_output = output
            except json.JSONDecodeError:
                # 如果解析失败，保持原样
                parsed_output = {"raw_output": output, "parse_error": True}

            return {
                "success": True,
                "output": parsed_output,
                "steps": result.get("intermediate_steps", []),
                "error": None,
            }

        except Exception as e:
            return {
                "success": False,
                "output": None,
                "steps": [],
                "error": str(e),
            }

    def analyze_simple(self, page_path: str, backend_path: str = "") -> Dict[str, Any]:
        """
        简化版分析（直接返回解析后的 JSON）

        Args:
            page_path: Vue 页面路径
            backend_path: 后端代码路径

        Returns:
            解析后的分析报告（JSON 对象）
        """
        result = self.analyze(page_path, backend_path)

        if result["success"]:
            return result["output"]
        else:
            return {"error": result["error"]}
