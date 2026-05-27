#!/usr/bin/env python3
"""测试 Agent 追踪 API 的简单脚本"""

import json
import sys
from pathlib import Path

# 添加 src 到路径
sys.path.insert(0, str(Path(__file__).parent / "src"))

from ai_requirement_os.schema.agent_trace import (
    AgentAnalysisTrace,
    AgentThinkingStep,
)
from ai_requirement_os.agents.trace_store import (
    save_agent_trace,
    load_agent_trace,
    list_traces_for_page,
)
from datetime import UTC, datetime
from uuid import uuid4


def test_trace_storage():
    """测试追踪数据的存储和读取"""
    print("🧪 测试追踪数据存储...")
    
    # 创建一个测试追踪
    trace = AgentAnalysisTrace(
        trace_id=uuid4().hex,
        project_name="test-project",
        page_path="/src/views/test/index.vue",
        started_at=datetime.now(UTC),
        status="completed",
        model_name="deepseek-chat",
        mode="agent",
    )
    
    # 添加一些步骤
    trace.steps.append(AgentThinkingStep(
        step_number=1,
        step_type="planning",
        content="开始分析页面",
        timestamp=datetime.now(UTC),
    ))
    
    trace.steps.append(AgentThinkingStep(
        step_number=2,
        step_type="evidence",
        content="构建证据包",
        timestamp=datetime.now(UTC),
        details={"files": 5, "actions": 3}
    ))
    
    trace.completed_at = datetime.now(UTC)
    trace.total_duration_ms = 1500
    trace.files_read = ["/src/views/test/index.vue", "/src/api/test.js"]
    trace.apis_traced = ["/api/test/list", "/api/test/detail"]
    
    # 保存
    print(f"  保存追踪: {trace.trace_id}")
    save_agent_trace(trace)
    
    # 读取
    print(f"  读取追踪: {trace.trace_id}")
    loaded = load_agent_trace(trace.trace_id)
    
    if loaded:
        print(f"  ✅ 追踪读取成功")
        print(f"     - 项目: {loaded.project_name}")
        print(f"     - 页面: {loaded.page_path}")
        print(f"     - 步骤数: {len(loaded.steps)}")
        print(f"     - 文件数: {len(loaded.files_read)}")
        print(f"     - API 数: {len(loaded.apis_traced)}")
    else:
        print(f"  ❌ 追踪读取失败")
        return False
    
    # 列出页面的所有追踪
    print(f"\n  列出页面追踪...")
    traces = list_traces_for_page("test-project", "/src/views/test/index.vue")
    print(f"  找到 {len(traces)} 条追踪记录")
    
    return True


def test_trace_model():
    """测试追踪数据模型"""
    print("\n🧪 测试追踪数据模型...")
    
    trace = AgentAnalysisTrace(
        trace_id="test123",
        project_name="demo",
        page_path="/test.vue",
        started_at=datetime.now(UTC),
        status="running",
    )
    
    # 测试序列化
    json_str = trace.model_dump_json(indent=2)
    print(f"  ✅ JSON 序列化成功 ({len(json_str)} 字符)")
    
    # 测试反序列化
    data = json.loads(json_str)
    restored = AgentAnalysisTrace.model_validate(data)
    print(f"  ✅ JSON 反序列化成功")
    
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("Agent 追踪系统测试")
    print("=" * 60)
    
    success = True
    
    try:
        if not test_trace_model():
            success = False
        
        if not test_trace_storage():
            success = False
        
        if success:
            print("\n" + "=" * 60)
            print("✅ 所有测试通过！")
            print("=" * 60)
        else:
            print("\n" + "=" * 60)
            print("❌ 部分测试失败")
            print("=" * 60)
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ 测试出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
