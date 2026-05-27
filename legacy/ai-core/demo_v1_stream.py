"""V1 流式输出演示

演示 V1 页面分析的美化流式输出效果。
"""

import json
import time
from src.ai_requirement_os.ui.v1_stream_output import (
    V1StreamFormatter,
    create_api_table_data,
    format_lineage_summary,
)


def demo_v1_stream_simple():
    """简单演示：只显示事件内容"""
    print("=" * 60)
    print("V1 流式输出演示 - 简单模式")
    print("=" * 60)
    print()
    
    formatter = V1StreamFormatter()
    
    # 1. 开始
    event = formatter.start_event("examples/test_cases/frontend/Detail.vue")
    print(f"[{event.event}] {event.content}")
    time.sleep(0.5)
    
    # 2. 加载工作区
    event = formatter.workspace_loaded_event(
        page_file="Detail.vue",
        api_count=5,
        related_files=8
    )
    print(f"\n[{event.event}] {event.content}")
    time.sleep(0.5)
    
    # 3. 构建证据包
    event = formatter.evidence_bundle_event(
        initial_fetches=2,
        actions=4
    )
    print(f"\n[{event.event}] {event.content}")
    time.sleep(0.5)
    
    # 4. API 列表
    apis = [
        {"method": "GET", "url": "/api/detail", "trigger": "loadData"},
        {"method": "GET", "url": "/api/option/all", "trigger": "loadSelectionData"},
        {"method": "GET", "url": "/api/detail/${id}", "trigger": "openUpdateDetailDialog"},
        {"method": "POST", "url": "/api/detail", "trigger": "saveDetail"},
        {"method": "DELETE", "url": "/api/detail", "trigger": "deleteDetail"},
    ]
    event = formatter.api_list_event(apis)
    print(f"\n[{event.event}] {event.content}")
    
    # 显示表格
    table_data = create_api_table_data(apis)
    print(f"\n{table_data['title']}")
    print("-" * 60)
    print(f"{'#':<4} {'方法':<8} {'路径':<30} {'触发位置':<15}")
    print("-" * 60)
    for i, row in enumerate(table_data['rows'], 1):
        print(f"{i:<4} {row[0]:<8} {row[1]:<30} {row[2]:<15}")
    print("-" * 60)
    time.sleep(0.5)
    
    # 5. LLM 分析
    event = formatter.llm_analysis_start_event()
    print(f"\n[{event.event}] {event.content}")
    time.sleep(1.0)  # 模拟 LLM 分析
    
    event = formatter.llm_analysis_complete_event()
    print(f"[{event.event}] {event.content}")
    time.sleep(0.5)
    
    # 6. 生成报告
    event = formatter.report_generation_event()
    print(f"\n[{event.event}] {event.content}")
    time.sleep(0.5)
    
    # 7. 保存结果
    event = formatter.save_result_event(".agent/page_analysis.json")
    print(f"\n[{event.event}] {event.content}")
    time.sleep(0.5)
    
    # 8. 完成
    event = formatter.complete_event(
        message="分析完成！",
        result_data={
            "apis": len(apis),
            "success": True
        }
    )
    print(f"\n[{event.event}] {event.content}")
    if event.data:
        print(f"  耗时: {event.data['elapsed_time']:.2f}s")
        print(f"  API 数量: {event.data['result']['apis']}")
    
    print("\n" + "=" * 60)


def demo_v1_stream_json():
    """JSON 演示：显示完整的事件数据"""
    print("=" * 60)
    print("V1 流式输出演示 - JSON 模式")
    print("=" * 60)
    print()
    
    formatter = V1StreamFormatter()
    
    events = []
    
    # 1. 开始
    events.append(formatter.start_event("examples/test_cases/frontend/Detail.vue"))
    
    # 2. 加载工作区
    events.append(formatter.workspace_loaded_event(
        page_file="Detail.vue",
        api_count=5,
        related_files=8
    ))
    
    # 3. 构建证据包
    events.append(formatter.evidence_bundle_event(
        initial_fetches=2,
        actions=4
    ))
    
    # 4. API 列表
    apis = [
        {"method": "GET", "url": "/api/detail", "trigger": "loadData"},
        {"method": "GET", "url": "/api/option/all", "trigger": "loadSelectionData"},
        {"method": "POST", "url": "/api/detail", "trigger": "saveDetail"},
    ]
    events.append(formatter.api_list_event(apis))
    
    # 5. 表格
    table_data = create_api_table_data(apis)
    events.append(formatter.table_event(
        title=table_data["title"],
        headers=table_data["headers"],
        rows=table_data["rows"]
    ))
    
    # 6. LLM 分析
    events.append(formatter.llm_analysis_start_event())
    events.append(formatter.llm_analysis_complete_event())
    
    # 7. 生成报告
    events.append(formatter.report_generation_event())
    
    # 8. 保存结果
    events.append(formatter.save_result_event(".agent/page_analysis.json"))
    
    # 9. 完成
    events.append(formatter.complete_event(
        message="分析完成！",
        result_data={
            "apis": len(apis),
            "success": True
        }
    ))
    
    # 输出所有事件
    for i, event in enumerate(events, 1):
        print(f"\n事件 {i}:")
        print(json.dumps(event.model_dump(mode='json'), ensure_ascii=False, indent=2))
        print("-" * 60)


def demo_v1_stream_sse():
    """SSE 演示：模拟服务器发送事件格式"""
    print("=" * 60)
    print("V1 流式输出演示 - SSE 格式")
    print("=" * 60)
    print()
    
    formatter = V1StreamFormatter()
    
    # 模拟 SSE 流
    def event_stream():
        # 1. 开始
        event = formatter.start_event("examples/test_cases/frontend/Detail.vue")
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        
        # 2. 加载工作区
        event = formatter.workspace_loaded_event(
            page_file="Detail.vue",
            api_count=5,
            related_files=8
        )
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        
        # 3. 构建证据包
        event = formatter.evidence_bundle_event(
            initial_fetches=2,
            actions=4
        )
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        
        # 4. API 列表
        apis = [
            {"method": "GET", "url": "/api/detail", "trigger": "loadData"},
            {"method": "POST", "url": "/api/detail", "trigger": "saveDetail"},
        ]
        event = formatter.api_list_event(apis)
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        
        # 5. LLM 分析
        event = formatter.llm_analysis_start_event()
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        
        event = formatter.llm_analysis_complete_event()
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        
        # 6. 完成
        event = formatter.complete_event(
            message="分析完成！",
            result_data={"apis": len(apis), "success": True}
        )
        yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
    
    # 输出 SSE 流
    for chunk in event_stream():
        print(chunk, end='')
        time.sleep(0.3)


def main():
    """主函数"""
    print("\n")
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║         V1 页面分析流式输出演示                           ║")
    print("╚═══════════════════════════════════════════════════════════╝")
    print("\n")
    
    # 1. 简单模式
    demo_v1_stream_simple()
    
    print("\n\n按 Enter 继续查看 JSON 模式...")
    input()
    
    # 2. JSON 模式
    demo_v1_stream_json()
    
    print("\n\n按 Enter 继续查看 SSE 格式...")
    input()
    
    # 3. SSE 格式
    demo_v1_stream_sse()
    
    print("\n\n演示完成！")


if __name__ == "__main__":
    main()
