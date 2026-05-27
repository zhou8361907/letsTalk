#!/bin/bash

echo "🔍 验证 Agent 追踪功能文件..."
echo ""

# 定义颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查文件是否存在的函数
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 (缺失)"
        return 1
    fi
}

# 检查目录是否存在的函数
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/ (缺失)"
        return 1
    fi
}

all_ok=true

echo "📦 后端文件"
echo "─────────────────────────────────────────────────────"
check_file "src/ai_requirement_os/schema/agent_trace.py" || all_ok=false
check_file "src/ai_requirement_os/agents/trace_store.py" || all_ok=false
check_file "src/ai_requirement_os/llm/page_lineage_generator.py" || all_ok=false
check_file "src/ai_requirement_os/api/app.py" || all_ok=false

echo ""
echo "🎨 前端文件"
echo "─────────────────────────────────────────────────────"
check_file "src/ai_requirement_os/web/assets/agent-trace-viewer.js" || all_ok=false
check_file "src/ai_requirement_os/web/assets/agent-trace-viewer.css" || all_ok=false
check_file "src/ai_requirement_os/web/workbench.html" || all_ok=false
check_file "src/ai_requirement_os/web/assets/workbench.js" || all_ok=false
check_file "src/ai_requirement_os/web/assets/workbench/main.js" || all_ok=false
check_file "src/ai_requirement_os/web/assets/workbench/shared.js" || all_ok=false
check_file "src/ai_requirement_os/web/assets/workbench/agent-panel.js" || all_ok=false
check_file "src/ai_requirement_os/web/assets/workbench/debug-panel.js" || all_ok=false

echo ""
echo "📚 文档和测试"
echo "─────────────────────────────────────────────────────"
check_file "test_trace_api.py" || all_ok=false
check_file "AGENT_TRACE_FEATURE.md" || all_ok=false
check_file "V1_TRACE_IMPLEMENTATION_SUMMARY.md" || all_ok=false
check_file "QUICKSTART_TRACE.md" || all_ok=false

echo ""
echo "📁 追踪存储目录"
echo "─────────────────────────────────────────────────────"
if [ -d ".agent" ]; then
    check_dir ".agent"
    if [ -d ".agent/traces" ]; then
        check_dir ".agent/traces"
        if [ -f ".agent/traces/index.json" ]; then
            echo -e "${GREEN}✓${NC} .agent/traces/index.json"
        else
            echo -e "  (index.json 将在首次使用时创建)"
        fi
    else
        echo -e "  (traces/ 目录将在首次使用时创建)"
    fi
else
    echo -e "  (.agent/ 目录将在首次使用时创建)"
fi

echo ""
echo "═════════════════════════════════════════════════════"
if [ "$all_ok" = true ]; then
    echo -e "${GREEN}✅ 所有文件验证通过！${NC}"
    echo ""
    echo "🚀 可以启动服务了："
    echo "   ./scripts/run_workbench.sh"
    exit 0
else
    echo -e "${RED}❌ 部分文件缺失，请检查！${NC}"
    exit 1
fi
