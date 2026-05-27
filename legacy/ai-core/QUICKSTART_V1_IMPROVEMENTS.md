# V1 页面分析优化 - 快速开始

**更新时间**: 2026-05-21  
**适用版本**: V1 优化版

---

## 🎯 核心改进

1. **美化的流式输出** - 清晰的步骤、进度和表格
2. **智能缓存** - 切换页面后报告不丢失
3. **快速加载** - 缓存命中节省 30-60s

---

## 🚀 快速体验

### 1. 运行演示

```bash
cd ai-core
uv run python demo_v1_stream.py
```

**演示内容**:
- 简单模式 - 查看事件内容和表格
- JSON 模式 - 查看完整的事件数据
- SSE 模式 - 查看服务器发送事件格式

### 2. 启动服务

```bash
# 启动 API 服务
uv run uvicorn src.ai_requirement_os.api.app:app --reload --port 8000
```

### 3. 测试流式输出

```bash
# 流式分析页面
curl -X POST "http://127.0.0.1:8000/api/page-lineage/stream?page_path=/path/to/Detail.vue" \
  -H "Content-Type: application/json" \
  -d '{
    "project_name": "RunningAccount-master",
    "frontend_path": "/path/to/vue",
    "backend_path": "/path/to/server",
    "entry_pages": []
  }'
```

**输出示例**:
```
data: {"event":"start","timestamp":"2026-05-21T10:00:00Z","content":"开始分析页面: Detail.vue","data":{"page_path":"Detail.vue","total_steps":5,"style":"header"}}

data: {"event":"step","timestamp":"2026-05-21T10:00:01Z","content":"步骤 1/5: 加载页面工作区\n  ✅ 已加载 Detail.vue\n  ✅ 发现 5 个 API 调用","data":{"step":1,"total":5,"style":"info"}}

data: {"event":"table","timestamp":"2026-05-21T10:00:02Z","content":"🔍 发现的 API","data":{"title":"🔍 发现的 API","headers":["方法","路径","触发位置"],"rows":[["GET","/api/detail","loadData"]],"style":"table"}}

data: {"event":"complete","timestamp":"2026-05-21T10:00:45Z","content":"分析完成！","data":{"elapsed_time":45.2,"result":{"apis":5,"success":true},"style":"success"}}
```

### 4. 测试缓存检查

```bash
# 检查缓存状态
curl -X GET "http://127.0.0.1:8000/api/page-analysis/cached?project_name=RunningAccount-master&page_path=/path/to/Detail.vue&frontend_path=/path/to/vue&backend_path=/path/to/server"
```

**响应示例**:
```json
{
  "cached": true,
  "is_stale": false,
  "updated_at": "2026-05-21T09:30:00Z",
  "has_llm_doc": true,
  "has_lineage": true,
  "message": "缓存有效"
}
```

---

## 📚 API 使用指南

### 1. 检查缓存

**端点**: `GET /api/page-analysis/cached`

**参数**:
- `project_name` - 项目名称
- `page_path` - 页面路径
- `frontend_path` - 前端路径
- `backend_path` - 后端路径

**响应**:
```typescript
interface CacheStatusResponse {
  cached: boolean;           // 是否有缓存
  is_stale: boolean;        // 是否过期
  updated_at: string;       // 更新时间
  has_llm_doc: boolean;     // 是否有 LLM 文档
  has_lineage: boolean;     // 是否有血缘分析
  message: string;          // 状态消息
}
```

**使用场景**:
- 页面加载时先检查缓存
- 决定是否需要重新分析
- 显示缓存状态给用户

### 2. 流式分析

**端点**: `POST /api/page-lineage/stream`

**参数**:
- `page_path` - 页面路径（查询参数）
- `refresh` - 是否强制刷新（查询参数，默认 false）
- 请求体 - `SourceProjectConfig`

**响应**: SSE 流

**事件类型**:
- `start` - 开始分析
- `step` - 步骤进度
- `progress` - 进度更新
- `api_list` - API 列表
- `table` - 表格数据
- `complete` - 完成
- `error` - 错误

**使用场景**:
- 实时显示分析进度
- 展示 API 列表
- 显示完成状态

### 3. 加载缓存报告

**端点**: `POST /api/page-analysis`

**参数**:
- `config` - `SourceProjectConfig`
- `page_path` - 页面路径
- `refresh` - 是否刷新（默认 false）

**响应**: `PageAnalysisResult`

**使用场景**:
- 缓存命中时快速加载
- 获取完整的分析结果

---

## 💻 前端集成示例

### 1. 基础集成

```javascript
// 页面加载逻辑
async function loadPageAnalysis(projectName, pagePath) {
  // 1. 检查缓存
  const cacheStatus = await fetch('/api/page-analysis/cached', {
    params: {
      project_name: projectName,
      page_path: pagePath,
      frontend_path: frontendPath,
      backend_path: backendPath
    }
  });
  
  if (cacheStatus.cached && !cacheStatus.is_stale) {
    // 2. 加载缓存
    const analysis = await fetch('/api/page-analysis', {
      method: 'POST',
      body: JSON.stringify({
        config: { project_name: projectName, ... },
        page_path: pagePath
      })
    });
    
    displayReport(analysis);
    showCacheIndicator(cacheStatus.updated_at);
    return;
  }
  
  // 3. 开始流式分析
  startStreamingAnalysis(projectName, pagePath);
}
```

### 2. 流式事件处理

```javascript
function startStreamingAnalysis(projectName, pagePath) {
  const eventSource = new EventSource(
    `/api/page-lineage/stream?page_path=${pagePath}&...`
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.event) {
      case 'start':
        showHeader(data.content);
        break;
        
      case 'step':
        showStep(data.data.step, data.data.total, data.content);
        break;
        
      case 'table':
        showTable(data.data.title, data.data.headers, data.data.rows);
        break;
        
      case 'complete':
        showComplete(data.content, data.data.elapsed_time);
        displayReport(data.data.result.lineage);
        eventSource.close();
        break;
        
      case 'error':
        showError(data.content);
        eventSource.close();
        break;
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    eventSource.close();
  };
}
```

### 3. UI 组件示例

```javascript
// 进度条
function showStep(step, total, content) {
  const percentage = (step / total) * 100;
  return `
    <div class="step-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
      <div class="step-content">
        <span class="step-number">[${step}/${total}]</span>
        <span class="step-text">${content}</span>
      </div>
    </div>
  `;
}

// 表格
function showTable(title, headers, rows) {
  return `
    <div class="table-container">
      <h3 class="table-title">${title}</h3>
      <table class="api-table">
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 缓存指示器
function showCacheIndicator(updatedAt) {
  const timeAgo = formatTimeAgo(updatedAt);
  return `
    <div class="cache-indicator">
      <span class="cache-icon">💾</span>
      <span class="cache-text">使用缓存（${timeAgo}）</span>
      <button class="refresh-btn" onclick="refreshAnalysis()">
        🔄 刷新
      </button>
    </div>
  `;
}
```

### 4. 样式建议

```css
/* 进度条 */
.progress-bar {
  width: 100%;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  transition: width 0.3s ease;
}

/* 步骤 */
.step-container {
  margin: 16px 0;
}

.step-number {
  color: #2196F3;
  font-weight: bold;
  margin-right: 8px;
}

/* 表格 */
.api-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.api-table th {
  background: #f5f5f5;
  padding: 12px;
  text-align: left;
  border-bottom: 2px solid #ddd;
}

.api-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
}

/* 缓存指示器 */
.cache-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #E3F2FD;
  border-radius: 4px;
  margin: 16px 0;
}

.refresh-btn {
  margin-left: auto;
  padding: 4px 12px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.refresh-btn:hover {
  background: #1976D2;
}
```

---

## 🎨 事件样式映射

```javascript
const eventStyles = {
  'header': {
    color: '#00BCD4',
    icon: '🚀',
    bgColor: '#E0F7FA'
  },
  'info': {
    color: '#2196F3',
    icon: 'ℹ️',
    bgColor: '#E3F2FD'
  },
  'success': {
    color: '#4CAF50',
    icon: '✅',
    bgColor: '#E8F5E9'
  },
  'warning': {
    color: '#FF9800',
    icon: '⚠️',
    bgColor: '#FFF3E0'
  },
  'error': {
    color: '#F44336',
    icon: '❌',
    bgColor: '#FFEBEE'
  },
  'table': {
    color: '#9C27B0',
    icon: '📊',
    bgColor: '#F3E5F5'
  }
};

function applyEventStyle(element, style) {
  const styleConfig = eventStyles[style] || eventStyles.info;
  element.style.color = styleConfig.color;
  element.style.backgroundColor = styleConfig.bgColor;
  element.querySelector('.icon').textContent = styleConfig.icon;
}
```

---

## 🔧 配置和调试

### 1. 日志级别

```bash
# 设置日志级别
export AIRO_LOG_LEVEL=DEBUG

# 启动服务
uv run uvicorn src.ai_requirement_os.api.app:app --reload
```

### 2. 缓存清理

```python
# 手动清理缓存
from pathlib import Path
from ai_requirement_os.settings import PROJECT_ROOT

cache_file = PROJECT_ROOT / ".agent" / "page_analysis.json"
if cache_file.exists():
    cache_file.unlink()
    print("缓存已清理")
```

### 3. 调试流式输出

```javascript
// 在浏览器控制台查看原始事件
const eventSource = new EventSource('/api/page-lineage/stream?...');
eventSource.onmessage = (event) => {
  console.log('Raw event:', event.data);
  const data = JSON.parse(event.data);
  console.log('Parsed event:', data);
};
```

---

## 📊 性能优化建议

### 1. 缓存策略

- **首次访问**: 完整分析（30-60s）
- **再次访问**: 缓存加载（<1s）
- **源码变化**: 自动检测并重新分析

### 2. 网络优化

- 使用 SSE 而不是轮询
- 压缩 JSON 响应
- 使用 CDN 加速静态资源

### 3. 用户体验

- 显示进度条和步骤
- 提供取消按钮
- 显示预计剩余时间
- 缓存命中时显示指示器

---

## 🐛 常见问题

### Q1: 缓存没有生效？

**检查**:
1. 确认 `.agent/page_analysis.json` 文件存在
2. 检查文件指纹是否匹配
3. 查看日志中的缓存检查结果

**解决**:
```bash
# 查看缓存状态
curl -X GET "http://127.0.0.1:8000/api/page-analysis/cached?..."

# 强制刷新
curl -X POST "http://127.0.0.1:8000/api/page-lineage/stream?refresh=true&..."
```

### Q2: 流式输出中断？

**检查**:
1. 网络连接是否稳定
2. 服务器是否正常运行
3. 是否有错误日志

**解决**:
```javascript
// 添加错误处理和重连
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  // 重连逻辑
  setTimeout(() => {
    startStreamingAnalysis(projectName, pagePath);
  }, 3000);
};
```

### Q3: 表格显示不正确？

**检查**:
1. 事件数据结构是否正确
2. 前端解析逻辑是否正确
3. CSS 样式是否加载

**解决**:
```javascript
// 验证表格数据
console.log('Table data:', data.data);
console.log('Headers:', data.data.headers);
console.log('Rows:', data.data.rows);
```

---

## 📖 更多资源

- [V1_IMPROVEMENTS_SUMMARY.md](V1_IMPROVEMENTS_SUMMARY.md) - 完整的优化总结
- [PROPOSAL_V1_IMPROVEMENTS.md](PROPOSAL_V1_IMPROVEMENTS.md) - 优化方案
- [docs/V1页面分析规范.md](docs/V1页面分析规范.md) - V1 规范
- [docs/V1页面分析接口与样例.md](docs/V1页面分析接口与样例.md) - API 文档

---

**开始使用吧！** 🚀

如有问题，请查看日志或联系开发团队。
