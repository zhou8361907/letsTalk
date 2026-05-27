"""主控 Agent 测试"""

import pytest
from pathlib import Path

from ai_requirement_os.agents.orchestrator import OrchestratorAgent
from ai_requirement_os.config.v2_config import V2Config


# 测试数据路径
TEST_BACKEND_PATH = str(Path(__file__).parent.parent.parent / "examples" / "test_cases" / "backend")
TEST_FRONTEND_PATH = str(Path(__file__).parent.parent.parent / "examples" / "test_cases" / "frontend")


@pytest.mark.skipif(
    not Path(__file__).parent.parent.parent.joinpath(".env").exists(),
    reason="需要 .env 文件配置 API Key"
)
def test_orchestrator_simple_page():
    """测试简单页面分析"""
    config = V2Config(
        backend_path=TEST_BACKEND_PATH,
        frontend_path=TEST_FRONTEND_PATH,
        max_iterations=10
    )

    agent = OrchestratorAgent(config)

    result = agent.analyze(
        page_path=f"{TEST_FRONTEND_PATH}/UserList.vue",
        backend_path=TEST_BACKEND_PATH
    )

    print("\n" + "="*80)
    print("简单页面分析结果:")
    print("="*80)
    
    assert result["success"], f"分析失败: {result.get('error')}"
    assert result["output"] is not None
    
    # 打印结果
    import json
    print(json.dumps(result["output"], indent=2, ensure_ascii=False))
    
    # 验证基本结构
    output = result["output"]
    if not output.get("parse_error"):
        assert "page_path" in output or "apis" in output
        print(f"\n✅ 发现 {len(output.get('apis', []))} 个 API")


@pytest.mark.skipif(
    not Path(__file__).parent.parent.parent.joinpath(".env").exists(),
    reason="需要 .env 文件配置 API Key"
)
def test_orchestrator_complex_page():
    """测试复杂页面分析"""
    config = V2Config(
        backend_path=TEST_BACKEND_PATH,
        frontend_path=TEST_FRONTEND_PATH,
        max_iterations=15,
        complexity_threshold=60
    )

    agent = OrchestratorAgent(config)

    result = agent.analyze(
        page_path=f"{TEST_FRONTEND_PATH}/Detail.vue",
        backend_path=TEST_BACKEND_PATH
    )

    print("\n" + "="*80)
    print("复杂页面分析结果:")
    print("="*80)
    
    assert result["success"], f"分析失败: {result.get('error')}"
    assert result["output"] is not None
    
    # 打印结果
    import json
    print(json.dumps(result["output"], indent=2, ensure_ascii=False))
    
    # 验证基本结构
    output = result["output"]
    if not output.get("parse_error"):
        apis = output.get("apis", [])
        print(f"\n✅ 发现 {len(apis)} 个 API")
        
        # 应该有需要深度分析的 API
        needs_deep = [api for api in apis if api.get("status") == "needs_deep_analysis"]
        if needs_deep:
            print(f"✅ 发现 {len(needs_deep)} 个需要深度分析的 API")
            for api in needs_deep:
                print(f"  - {api.get('method')} {api.get('url')}: {api.get('reason', 'N/A')}")


@pytest.mark.skipif(
    not Path(__file__).parent.parent.parent.joinpath(".env").exists(),
    reason="需要 .env 文件配置 API Key"
)
def test_orchestrator_analyze_simple():
    """测试简化版分析接口"""
    config = V2Config(
        backend_path=TEST_BACKEND_PATH,
        frontend_path=TEST_FRONTEND_PATH
    )

    agent = OrchestratorAgent(config)

    result = agent.analyze_simple(
        page_path=f"{TEST_FRONTEND_PATH}/UserList.vue",
        backend_path=TEST_BACKEND_PATH
    )

    print("\n" + "="*80)
    print("简化版分析结果:")
    print("="*80)
    
    # 打印结果
    import json
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    assert result is not None
    assert "error" not in result or result.get("parse_error")


def test_orchestrator_initialization():
    """测试 Agent 初始化"""
    # 使用默认配置
    agent = OrchestratorAgent()
    
    assert agent.config is not None
    assert agent.llm is not None
    assert len(agent.tools) == 6  # 应该有 6 个工具
    assert agent.executor is not None
    
    # 使用自定义配置
    config = V2Config(
        llm_model="gpt-4",
        max_iterations=20,
        complexity_threshold=70
    )
    agent = OrchestratorAgent(config)
    
    assert agent.config.llm_model == "gpt-4"
    assert agent.config.max_iterations == 20
    assert agent.config.complexity_threshold == 70


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
