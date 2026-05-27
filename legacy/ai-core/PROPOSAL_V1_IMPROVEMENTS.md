# V1 页面分析优化方案

**创建时间**: 2026-05-21  
**状态**: 提案

---

## 问题分析

用户反馈了两个核心问题：

### 1. 页面显示丑陋
- 当前流式输出使用简单的文本消息
- 没有使用 Rich 库的美化功能
- 缺少进度指示、彩色输出、表格展示

### 2. 报告不持久化
- 生成报告后切换页面，再切回来报告消失
- 虽然 `page_analysis.json` 已保存，但前端没有重新加载机制
- 需要每次重新生成，浪费时间和资源

---

## 解决方案

### 方案 1: 优化流式输出（后端）

**目标**: 让流式分析过程更清晰、更美观

**实施步骤**:

1. **创建 V1 专用的流式输出模块**
   - 文件: `src/ai_requirement_os/ui/v1_stream_output.py`
   - 复用 V2 的 Rich 美化系统
   - 适配 V1 的页面分析流程

2. **优化 `/api/page-lineage/stream` 端点**
   - 使用结构化的事件格式
   - 包含进度百分比
   - 包含彩色状态标记
   - 包含表格数据

3. **事件类型设计**
   ```json
   {
     "event": "start|step|progress|table|complete|error",
     "timestamp": "2026-05-21T10:00:00Z",
     "content": "消息内容",
     "data": {
       "progress": 50,
       "total": 100,
       "table": [...],
       "style": "info|success|warning|error"
     }
   }
   ```

### 方案 2: 实现报告持久化（前端 + 后端）

**目标**: 切换页面后能恢复之前的报告

**实施步骤**:

1. **后端 API 增强**
   - 新增 `/api/page-analysis/cached` 端点
   - 检查是否有缓存的分析结果
   - 返回缓存状态和最后更新时间

2. **前端加载逻辑**
   - 页面加载时先检查缓存
   - 如果有缓存且未过期，直接显示
   - 提供"重新分析"按钮刷新

3. **缓存策略**
   - 基于文件指纹判断是否过期
   - 源码未变化时使用缓存
   - 源码变化时自动标记为 stale

---

## 实施计划

### Phase 1: 优化流式输出（1-2 小时）

**优先级**: 高 ⭐⭐⭐

**任务**:
1. ✅ 创建 `v1_stream_output.py`
2. ✅ 实现美化的事件格式化
3. ✅ 更新 `/api/page-lineage/stream` 端点
4. ✅ 测试流式输出效果

**预期效果**:
- 彩色进度指示
- 清晰的步骤展示
- 表格化的 API 列表
- 实时状态更新

### Phase 2: 实现报告持久化（1-2 小时）

**优先级**: 高 ⭐⭐⭐

**任务**:
1. ✅ 新增缓存检查 API
2. ✅ 实现前端缓存加载逻辑
3. ✅ 添加刷新按钮
4. ✅ 测试缓存机制

**预期效果**:
- 切换页面后报告不丢失
- 快速加载已分析的页面
- 明确显示缓存状态
- 支持手动刷新

### Phase 3: 文档和测试（30 分钟）

**优先级**: 中 ⭐⭐

**任务**:
1. ✅ 更新 API 文档
2. ✅ 添加使用示例
3. ✅ 编写测试用例
4. ✅ 更新用户指南

---

## 技术细节

### 1. V1 流式输出格式

```python
# 事件类型
class V1StreamEvent(BaseModel):
    event: Literal["start", "step", "progress", "table", "complete", "error"]
    timestamp: datetime
    content: str
    data: Optional[Dict[str, Any]] = None

# 使用示例
yield StreamEvent(
    event="progress",
    timestamp=datetime.now(UTC),
    content="正在分析 API...",
    data={
        "progress": 3,
        "total": 5,
        "current_api": "GET /api/detail",
        "style": "info"
    }
)
```

### 2. 缓存检查 API

```python
@app.get("/api/page-analysis/cached")
def check_cached_analysis(
    project_name: str,
    page_path: str,
) -> Dict[str, Any]:
    """检查是否有缓存的分析结果"""
    asset = load_page_analysis_asset(project_name, page_path)
    
    if not asset:
        return {
            "cached": False,
            "message": "没有缓存的分析结果"
        }
    
    # 检查是否过期
    fresh_workspace = build_page_workspace(config, page_path)
    fresh_fingerprints = _fingerprint_workspace(fresh_workspace)
    is_stale = not _is_same_fingerprint(
        asset.fingerprints,
        fresh_fingerprints
    )
    
    return {
        "cached": True,
        "is_stale": is_stale,
        "updated_at": asset.updated_at,
        "has_llm_doc": asset.llm_doc_result is not None,
        "message": "缓存已过期，源码已变化" if is_stale else "缓存有效"
    }
```

### 3. 前端加载逻辑（伪代码）

```javascript
async function loadPageAnalysis(projectName, pagePath) {
  // 1. 检查缓存
  const cacheStatus = await fetch('/api/page-analysis/cached', {
    params: { project_name: projectName, page_path: pagePath }
  });
  
  if (cacheStatus.cached && !cacheStatus.is_stale) {
    // 2. 加载缓存的报告
    const analysis = await fetch('/api/page-analysis', {
      params: { project_name: projectName, page_path: pagePath }
    });
    
    displayReport(analysis);
    showCacheIndicator(cacheStatus.updated_at);
    return;
  }
  
  // 3. 没有缓存或已过期，开始流式分析
  startStreamingAnalysis(projectName, pagePath);
}
```

---

## 预期效果对比

### 优化前

**流式输出**:
```
开始分析页面: Detail.vue
加载页面工作区...
构建证据包（Evidence Bundle）...
证据包构建完成：2 个初始请求、3 个操作
正在调用 LLM 分析代码...
生成 Markdown 报告...
分析完成
```

**报告持久化**: ❌ 不支持

### 优化后

**流式输出**:
```
╔═══════════════════════════════════════════════════════════╗
║  🚀 开始页面分析                                          ║
║  页面: Detail.vue                                         ║
╚═══════════════════════════════════════════════════════════╝

📋 步骤 1/5: 加载页面工作区
  ✅ 已加载 Detail.vue
  ✅ 发现 3 个 API 调用

📋 步骤 2/5: 构建证据包
  ✅ 2 个初始请求
  ✅ 3 个操作
  
                    🔍 发现的 API                    
╭───┬──────┬─────────────────────────────────┬──────────╮
│ # │ 方法 │ 路径                            │ 触发位置 │
├───┼──────┼─────────────────────────────────┼──────────┤
│ 1 │ GET  │ /api/detail                     │ loadData │
│ 2 │ GET  │ /api/option/all                 │ mounted  │
│ 3 │ POST │ /api/detail                     │ save     │
╰───┴──────┴─────────────────────────────────┴──────────╯

📋 步骤 3/5: 调用 LLM 分析
  ⏳ 正在分析代码逻辑...
  ✅ 分析完成

📋 步骤 4/5: 生成报告
  ✅ Markdown 报告已生成

📋 步骤 5/5: 保存结果
  ✅ 已保存到 .agent/page_analysis.json

✅ 分析完成！耗时 45.2s
```

**报告持久化**: ✅ 支持
- 切换页面后报告保留
- 显示缓存时间戳
- 提供刷新按钮

---

## 风险和注意事项

### 风险

1. **前端改动**: 需要修改前端代码，可能影响现有功能
2. **缓存一致性**: 需要确保缓存失效机制正确
3. **性能影响**: 流式输出可能增加网络传输量

### 缓解措施

1. **渐进式改进**: 先优化后端，再改前端
2. **向后兼容**: 保留旧的 API 端点
3. **充分测试**: 测试各种缓存场景
4. **性能监控**: 监控流式输出的性能影响

---

## 下一步行动

### 立即开始（推荐）

1. **Phase 1**: 优化流式输出
   - 创建 `v1_stream_output.py`
   - 更新流式端点
   - 测试效果

2. **Phase 2**: 实现持久化
   - 添加缓存检查 API
   - 更新前端逻辑
   - 测试缓存

### 或者

**先看效果**: 我可以先实现 Phase 1，让你看看美化后的流式输出效果，再决定是否继续 Phase 2

---

**你想怎么做？** 🚀

1. 直接开始 Phase 1 + Phase 2（全部实现）
2. 先做 Phase 1，看效果再决定
3. 只做 Phase 2（持久化），流式输出保持简单
4. 其他想法？
