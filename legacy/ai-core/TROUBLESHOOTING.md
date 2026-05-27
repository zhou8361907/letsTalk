# 🔧 问题排查指南

## 问题：404 Not Found - workbench/workbench/ 路径重复

### 症状
```
INFO: 127.0.0.1:50871 - "GET /assets/workbench/workbench/debug-panel.js HTTP/1.1" 404 Not Found
INFO: 127.0.0.1:50872 - "GET /assets/workbench/workbench/shared.js HTTP/1.1" 404 Not Found
INFO: 127.0.0.1:50870 - "GET /assets/workbench/workbench/agent-panel.js HTTP/1.1" 404 Not Found
```

### 原因
`main.js` 文件位于 `workbench/` 目录下，但导入路径错误地使用了 `./workbench/`，导致路径重复。

### 解决方案 ✅
已修复！`main.js` 的导入路径已改为：
```javascript
import { runAgent } from "./agent-panel.js";
import { clearDebugEntries, logPageLineageDebug, renderDebugLog } from "./debug-panel.js";
import { clearContent, els, escapeHtml, ... } from "./shared.js";
```

### 验证修复
```bash
# 1. 验证所有文件存在
./verify_files.sh

# 2. 重启服务
./scripts/run_workbench.sh

# 3. 清除浏览器缓存
# Chrome: Cmd+Shift+R (Mac) 或 Ctrl+Shift+R (Windows)
# Firefox: Cmd+Shift+R (Mac) 或 Ctrl+F5 (Windows)

# 4. 打开工作台
open http://127.0.0.1:8000/workbench
```

---

## 常见问题排查

### 1. 服务启动失败

**症状**: `./scripts/run_workbench.sh` 报错

**检查**:
```bash
# 检查 Python 版本
python --version  # 应该是 3.10+

# 检查 uv 是否安装
uv --version

# 重新同步依赖
uv sync

# 检查端口是否被占用
lsof -i :8000
```

**解决**:
```bash
# 如果端口被占用，杀掉进程
kill -9 <PID>

# 或者修改端口
AIRO_API_PORT=8001 ./scripts/run_workbench.sh
```

### 2. 前端资源 404

**症状**: 浏览器控制台显示 JS/CSS 文件 404

**检查**:
```bash
# 验证文件存在
./verify_files.sh

# 检查文件权限
ls -la src/ai_requirement_os/web/assets/

# 检查 FastAPI 静态文件挂载
grep -n "StaticFiles" src/ai_requirement_os/api/app.py
```

**解决**:
```bash
# 确保文件存在且可读
chmod -R 644 src/ai_requirement_os/web/assets/*.js
chmod -R 644 src/ai_requirement_os/web/assets/*.css

# 重启服务
./scripts/run_workbench.sh
```

### 3. 追踪功能不工作

**症状**: 点击"生成 JSON / 报告"后看不到追踪信息

**检查**:
```bash
# 1. 检查浏览器控制台是否有 JS 错误
# 打开浏览器开发者工具 (F12)

# 2. 检查 API 是否正常
curl http://127.0.0.1:8000/health

# 3. 检查追踪目录
ls -la .agent/traces/

# 4. 查看服务端日志
# 在运行 run_workbench.sh 的终端查看
```

**解决**:
```bash
# 清除浏览器缓存
# Chrome: Cmd+Shift+Delete

# 清除追踪数据重新开始
rm -rf .agent/traces/*.json
echo '{}' > .agent/traces/index.json

# 重启服务
./scripts/run_workbench.sh
```

### 4. 流式输出不显示

**症状**: 看不到实时的分析步骤

**检查**:
```bash
# 测试 SSE 端点
curl -N "http://127.0.0.1:8000/api/page-lineage/stream?page_path=/test"

# 检查浏览器是否支持 EventSource
# 在浏览器控制台输入：
# typeof EventSource
# 应该返回 "function"
```

**解决**:
- 使用现代浏览器（Chrome 80+, Firefox 75+, Safari 14+）
- 检查网络连接
- 查看服务端日志是否有错误

### 5. LLM 调用失败

**症状**: 生成结果显示 "fallback" 模式

**检查**:
```bash
# 检查 .env 文件
cat .env | grep DEEPSEEK

# 测试 API Key
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY"
```

**解决**:
```bash
# 配置正确的 API Key
echo "DEEPSEEK_API_KEY=your-key-here" >> .env

# 重启服务
./scripts/run_workbench.sh
```

### 6. 页面扫描失败

**症状**: 点击"扫描页面"后报错

**检查**:
```bash
# 检查路径是否存在
ls -la /path/to/frontend
ls -la /path/to/backend

# 检查路径是否为绝对路径
# 应该以 / 开头
```

**解决**:
- 使用绝对路径
- 确保路径存在且可读
- 检查路径中是否有特殊字符

### 7. 追踪文件太多

**症状**: `.agent/traces/` 目录占用空间过大

**解决**:
```bash
# 查看追踪文件数量
ls .agent/traces/*.json | wc -l

# 清理旧追踪（保留最近 10 个）
cd .agent/traces
ls -t *.json | tail -n +11 | xargs rm -f

# 或者全部清空
rm -rf .agent/traces/*.json
echo '{}' > .agent/traces/index.json
```

---

## 调试技巧

### 1. 启用详细日志

```bash
# 设置日志级别
export AIRO_LOG_LEVEL=DEBUG
./scripts/run_workbench.sh
```

### 2. 查看追踪数据

```bash
# 查看最新的追踪
ls -t .agent/traces/*.json | head -1 | xargs cat | jq .

# 查看索引
cat .agent/traces/index.json | jq .
```

### 3. 测试 API

```bash
# 测试健康检查
curl http://127.0.0.1:8000/health

# 测试样例项目
curl http://127.0.0.1:8000/api/sample-project

# 测试追踪 API
curl http://127.0.0.1:8000/api/agent-traces?project_name=test&page_path=/test
```

### 4. 浏览器开发者工具

```
F12 打开开发者工具

Console 标签页:
- 查看 JS 错误
- 测试 AgentTraceViewer

Network 标签页:
- 查看 API 请求
- 检查响应状态码
- 查看 SSE 连接

Application 标签页:
- 清除缓存
- 查看 LocalStorage
```

---

## 获取帮助

如果以上方法都无法解决问题：

1. **查看日志**: 服务端终端的完整输出
2. **浏览器控制台**: 完整的错误信息
3. **环境信息**: Python 版本、操作系统、浏览器版本
4. **复现步骤**: 详细的操作步骤

---

## 快速诊断脚本

```bash
#!/bin/bash
echo "🔍 快速诊断..."
echo ""

echo "Python 版本:"
python --version

echo ""
echo "uv 版本:"
uv --version

echo ""
echo "文件验证:"
./verify_files.sh

echo ""
echo "服务状态:"
curl -s http://127.0.0.1:8000/health || echo "服务未运行"

echo ""
echo "追踪目录:"
ls -lh .agent/traces/ 2>/dev/null || echo "追踪目录不存在"

echo ""
echo "环境变量:"
env | grep AIRO
```

保存为 `diagnose.sh`，运行 `chmod +x diagnose.sh && ./diagnose.sh`
