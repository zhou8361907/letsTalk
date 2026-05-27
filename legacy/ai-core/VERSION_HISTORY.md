# 版本历史

## V2.1 - PageAwareAgent 初版（2026-05-21）

**状态**: ✅ 已完成，准备重构

### 实现的功能

#### 1. SimpleAgent - 极简 Agent 核心
- **文件**: `src/ai_requirement_os/simple_agent/agent.py` (200 行)
- **文件**: `src/ai_requirement_os/simple_agent/tool.py` (150 行)
- **特点**: 
  - 学习 Pi 的极简设计
  - 纯粹的循环，不做任何假设
  - 工具优先，完全解耦

#### 2. PageContext - 页面上下文管理器
- **文件**: `src/ai_requirement_os/agents/page_context.py` (350 行)
- **功能**:
  - 管理当前页面信息
  - 保存页面 Skills
  - 管理对话历史
  - 搜索和查询 Skills

#### 3. PageAwareAgent - 页面感知的 Agent
- **文件**: `src/ai_requirement_os/agents/page_aware_agent.py` (450 行)
- **功能**:
  - 继承 SimpleAgent
  - 集成 PageContext
  - 实现流式输出
  - 实时显示工具调用

#### 4. Skill Tools - Skill 相关工具
- **文件**: `src/ai_requirement_os/tools/skill_tools.py` (400 行)
- **工具**:
  - `find_skill` - 查找 Skill
  - `get_skill_implementation` - 获取实现细节
  - `get_code_location` - 获取代码位置
  - `find_similar_skills` - 跨页面查找（待完善）
  - `generate_code` - 生成代码（待完善）
  - `analyze_page` - 分析页面（待集成 V1）

#### 5. Demo Scripts
- `demo_simple_agent.py` - SimpleAgent 演示
- `demo_page_aware_agent.py` - PageAwareAgent 演示（已测试通过）

### 设计理念

1. **极简设计** - 学习 Pi，代码简洁透明
2. **工具优先** - 工具是核心价值，Agent 只是辅助
3. **流式输出** - 实时显示工具调用，像 Claude Code
4. **页面维度** - 以页面为单位管理上下文

### 存在的问题

1. **上下文与页面耦合过紧**
   - 切换页面会清空对话历史
   - 不支持跨页面对话
   - 不符合实际使用场景

2. **Skills 局限于当前页面**
   - 无法跨页面搜索
   - 产品经理经常需要查找"其他页面有没有类似功能"

3. **前端交互设计不够成熟**
   - 简单的聊天界面
   - 没有凸显 Agent 的能力和轨迹

4. **缺少后台分析机制**
   - 分析页面会阻塞对话
   - 没有进度显示
   - 用户体验不好

### 文档

- `ARCHITECTURE_REDESIGN.md` - 架构重新设计
- `V1_V2_ARCHITECTURE.md` - V1 + V2 完整架构
- `PRODUCT_DESIGN.md` - 产品设计
- `SIMPLE_AGENT_SUMMARY.md` - SimpleAgent 实现总结
- `PAGE_AWARE_AGENT_IMPLEMENTATION.md` - PageAwareAgent 实现总结

---

## V2.2 - 重构版（计划中）

**状态**: 📝 设计中

### 核心改进

#### 1. 上下文与页面解耦

**旧设计**:
```
PageContext（页面上下文）
  ├─ current_page（当前页面）
  ├─ page_skills（当前页面的 Skills）
  └─ conversation_history（对话历史）
  
切换页面 → 清空对话历史 ❌
```

**新设计**:
```
ConversationContext（对话上下文）
  ├─ current_page_path（当前页面路径，仅用于前端显示）
  ├─ visited_pages（访问过的页面列表）
  ├─ conversation_history（对话历史，不清空）
  └─ loaded_skills_cache（按需加载的 Skills 缓存）

SkillDatabase（全局 Skills 数据库）
  ├─ search_globally（跨页面搜索）
  ├─ get_by_page（按页面获取）
  └─ check_analyzed（检查是否已分析）

切换页面 → 只更新 current_page_path ✅
```

#### 2. 对话压缩策略

**方案**: 使用 LLM 总结对话历史

**保留**:
- 访问过的页面列表
- 关键的工具调用
- 最近 N 条对话

**压缩**:
- 用 LLM 总结中间的对话内容
- 保留核心信息

#### 3. Skills 存储

**方案**: 文件系统（JSON）

**结构**:
```
.agent/
├── skills/
│   ├── Detail.vue.json
│   ├── UserList.vue.json
│   └── ProductList.vue.json
├── index.json          # 全局索引
└── metadata.json       # 元数据
```

#### 4. 前端交互

**方案**: 纯 Web（成熟产品风格）

**参考**: Claude Code、Cursor、GitHub Copilot Chat

**特点**:
- 实时显示 Agent 轨迹
- 工具调用可视化
- 进度条显示分析进度
- 代码高亮显示

#### 5. 后台分析 + 前端刷新

**方案**: SSE (Server-Sent Events)

**流程**:
```
用户提问 → 检查页面是否已分析
  ↓
【未分析】
  ↓
后台启动分析任务
  ↓
SSE 推送分析进度
  ↓
前端实时显示进度条
  ↓
分析完成，SSE 推送完成事件
  ↓
前端自动刷新
  ↓
Agent 继续回答问题
```

### 技术栈

- **后端**: FastAPI + asyncio + SSE
- **前端**: Vue + EventSource
- **存储**: 文件系统（JSON）
- **对话压缩**: LLM 总结

### 下一步

1. **创建设计文档** - 详细的架构设计和实现计划
2. **重构 ConversationContext** - 替换 PageContext
3. **实现 SkillDatabase** - 全局 Skills 管理
4. **实现后台分析** - asyncio + SSE
5. **实现前端界面** - Vue + 成熟产品风格
6. **测试和优化** - 端到端测试

---

## 版本对比

| 维度 | V2.1 (当前) | V2.2 (计划) |
|------|-------------|-------------|
| **上下文管理** | 页面级别 | 对话级别 |
| **Skills 范围** | 当前页面 | 全局跨页面 |
| **对话历史** | 切换页面清空 | 持续保留 |
| **对话压缩** | 无 | LLM 总结 |
| **页面分析** | 同步阻塞 | 异步后台 |
| **前端刷新** | 手动 | SSE 自动 |
| **前端风格** | 简单聊天 | 成熟产品 |
| **工具调用** | 流式显示 | 流式 + 轨迹 |

---

## 保留的组件

以下组件在 V2.2 中保留并继续使用：

1. ✅ **SimpleAgent** - 极简 Agent 核心
2. ✅ **Tool 系统** - 工具注册和管理
3. ✅ **流式输出** - StreamEvent 机制
4. ✅ **Skill 数据结构** - PageSkill 定义
5. ✅ **V1 集成** - 页面分析功能

---

## 废弃的组件

以下组件在 V2.2 中废弃或重构：

1. ❌ **PageContext** → 重构为 **ConversationContext**
2. ❌ **PageAwareAgent** → 重构为支持新的上下文管理
3. ⚠️ **Skill Tools** → 部分重构，添加全局搜索

---

**创建时间**: 2026-05-21  
**创建原因**: 准备重构，保存当前版本进度
