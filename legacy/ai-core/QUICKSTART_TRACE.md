# 🚀 Agent 追踪功能快速启动指南

## 1️⃣ 启动服务

```bash
cd ai-core
./scripts/run_workbench.sh
```

服务将在 `http://127.0.0.1:8000` 启动

## 2️⃣ 打开工作台

浏览器访问：**http://127.0.0.1:8000/workbench**

## 3️⃣ 使用追踪功能

### 步骤 1：加载样例项目

点击左侧 **"载入"** 按钮，自动填充样例项目路径

### 步骤 2：扫描页面

点击 **"扫描页面"** 按钮，等待扫描完成

### 步骤 3：选择页面

在左侧页面列表中点击任意页面

### 步骤 4：加载工作区

点击 **"加载页面工作区"** 按钮

### 步骤 5：生成分析（带追踪）

点击 **"生成 JSON / 报告"** 按钮

### 步骤 6：查看追踪过程

切换到 **"Agent 分析过程"** 标签页，你会看到：

#### 实时流式展示
```
🚀 开始分析页面: /src/views/Detail/index.vue
▶️ 加载页面工作区...
▶️ 构建证据包（Evidence Bundle）...
▶️ 证据包构建完成：3 个初始请求、5 个操作
▶️ 正在调用 LLM 分析代码...
✅ 分析完成
```

#### 完整追踪视图

**统计卡片**
```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ 执行步骤 │ 工具调用 │ 文件读取 │ API追踪 │  耗时   │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│    6    │    0    │    5    │    3    │  2.5s   │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

**执行步骤时间线**
```
📋 #1 规划
   开始构建页面证据包（Evidence Bundle）
   10:00:00

📊 #2 证据收集
   证据包构建完成：发现 3 个初始请求、5 个操作
   10:00:01
   • initial_fetches: 3
   • actions: 5

🤔 #3 推理
   调用 deepseek-chat 分析证据包
   10:00:01

✅ #4 结论
   生成 Markdown 报告
   10:00:03
```

**读取的文件**
```
📄 /src/views/Detail/index.vue
📄 /src/api/detail.js
📄 /backend/controller/DetailController.java
```

**追踪的 API**
```
🔗 /api/detail/info
🔗 /api/detail/update
```

## 4️⃣ 通过 API 使用

### 生成带追踪的分析

```bash
curl -X POST "http://127.0.0.1:8000/api/page-lineage/traced?page_path=/path/to/page.vue" \
  -H "Content-Type: application/json" \
  -d '{
    "project_name": "RunningAccount-master",
    "frontend_path": "/absolute/path/to/vue",
    "backend_path": "/absolute/path/to/backend",
    "entry_pages": []
  }'
```

### 获取追踪记录

```bash
# 获取指定追踪
curl "http://127.0.0.1:8000/api/agent-traces/{trace_id}"

# 列出页面的所有追踪
curl "http://127.0.0.1:8000/api/agent-traces?project_name=RunningAccount-master&page_path=/path/to/page.vue"
```

### 流式获取分析过程

```bash
curl -N "http://127.0.0.1:8000/api/page-lineage/stream?page_path=/path/to/page.vue"
```

## 5️⃣ 验证功能

### 运行测试

```bash
cd ai-core
uv run python test_trace_api.py
```

预期输出：
```
============================================================
Agent 追踪系统测试
============================================================

🧪 测试追踪数据模型...
  ✅ JSON 序列化成功
  ✅ JSON 反序列化成功

🧪 测试追踪数据存储...
  ✅ 追踪读取成功
  找到 1 条追踪记录

============================================================
✅ 所有测试通过！
============================================================
```

### 检查追踪文件

```bash
# 查看追踪目录
ls -la .agent/traces/

# 查看索引文件
cat .agent/traces/index.json

# 查看追踪文件
cat .agent/traces/{trace_id}.json | jq .
```

## 6️⃣ 常见问题

### Q: 看不到追踪标签页？

**A**: 确保已经：
1. 重启了服务
2. 清除了浏览器缓存
3. 检查浏览器控制台是否有 JS 错误

### Q: 流式展示不工作？

**A**: 检查：
1. 浏览器是否支持 EventSource（现代浏览器都支持）
2. 网络连接是否正常
3. 服务端日志是否有错误

### Q: 追踪文件太多怎么办？

**A**: 手动清理：
```bash
# 删除所有追踪
rm -rf .agent/traces/*.json

# 只保留索引
rm -rf .agent/traces/*.json
echo '{}' > .agent/traces/index.json
```

### Q: 如何关闭追踪功能？

**A**: 当前版本追踪功能默认启用，暂无配置项。如需关闭，可以：
1. 使用旧的 API 端点 `/api/page-lineage`（不带追踪）
2. 等待后续版本添加配置项

## 7️⃣ 下一步

现在你已经掌握了 Agent 追踪功能，可以：

1. **分析自己的项目** - 填写真实的前后端路径
2. **查看历史追踪** - 对比不同版本的分析结果
3. **优化分析质量** - 根据追踪信息调整代码
4. **准备 V2** - 基于追踪数据设计多轮对话

## 📚 更多文档

- **功能文档**: `AGENT_TRACE_FEATURE.md`
- **实现总结**: `V1_TRACE_IMPLEMENTATION_SUMMARY.md`
- **改进方案**: `PROPOSAL_V1_IMPROVEMENTS.md`
- **使用指南**: `docs/使用指南.md`

## 🎉 享受透明的 Agent 分析过程！

有任何问题或建议，欢迎反馈！
