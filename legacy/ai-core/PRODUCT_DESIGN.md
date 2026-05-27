# 产品设计 - 以页面为维度的智能问答系统

**创建时间**: 2026-05-21  
**核心理念**: 像 Claude Code 一样的交互体验 + 以页面为维度的上下文

---

## 🎯 核心体验

### 用户旅程

```
打开系统
  ↓
选择菜单（例如：明细管理）
  ↓
系统自动分析页面，生成 Skill
  ↓
Agent 准备好，等待提问
  ↓
用户提问（基于当前页面）
  ↓
Agent 实时显示工具调用
  ↓
Agent 给出完整回答
  ↓
用户继续提问或切换页面
```

---

## 💬 交互设计

### 1. 页面进入时

```
┌─────────────────────────────────────────────────────────┐
│  明细管理                                    [?] Agent   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [查询条件区域]                                          │
│  账户: [下拉框]  日期: [日期选择]  [查询] [重置]        │
│                                                          │
│  [数据表格区域]                                          │
│  ┌────┬────────┬────────┬────────┬────────┐            │
│  │ ID │ 日期   │ 金额   │ 描述   │ 操作   │            │
│  ├────┼────────┼────────┼────────┼────────┤            │
│  │ 1  │ 2024.. │ 100.00 │ ...    │ [编辑] │            │
│  └────┴────────┴────────┴────────┴────────┘            │
│                                                          │
│  [新增] [批量删除] [导出]                                │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  💬 Agent 助手                                    [×]    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🔄 正在分析页面...                                      │
│                                                          │
│  🔧 调用工具: analyze_page("Detail.vue")                │
│  ✅ 页面结构已解析                                       │
│                                                          │
│  🔧 调用工具: extract_skills("Detail.vue")              │
│  ✅ 已提取 4 个功能 Skills                               │
│                                                          │
│  📦 当前页面功能:                                        │
│  • 加载明细数据                                          │
│  • 保存明细数据                                          │
│  • 删除明细数据                                          │
│  • 导出明细数据                                          │
│                                                          │
│  💡 我已经了解了这个页面的所有功能！                     │
│  有什么问题吗？                                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 输入你的问题...                          [发送] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2. 用户提问时

```
┌─────────────────────────────────────────────────────────┐
│  💬 Agent 助手                                    [×]    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  👤 用户:                                                │
│  保存功能是怎么实现的？                                  │
│                                                          │
│  🤖 Agent:                                               │
│  🔍 正在分析...                                          │
│                                                          │
│  🔧 调用工具: find_skill("保存")                        │
│  ✅ 找到 Skill: detail_save                             │
│                                                          │
│  🔧 调用工具: get_implementation("detail_save")         │
│  ✅ 已获取实现细节                                       │
│                                                          │
│  🔧 调用工具: get_code_location("detail_save")          │
│  ✅ 已定位代码位置                                       │
│                                                          │
│  📝 完整回答:                                            │
│                                                          │
│  保存功能的实现路径：                                    │
│                                                          │
│  【前端部分】                                            │
│  📄 Detail.vue 第 78 行                                 │
│  ```javascript                                          │
│  async handleSave() {                                   │
│    // 1. 校验表单                                       │
│    if (!this.validateForm()) return;                    │
│                                                          │
│    // 2. 发送请求                                       │
│    const res = await this.$http.post(                   │
│      '/api/detail',                                     │
│      this.form                                          │
│    );                                                   │
│                                                          │
│    // 3. 处理结果                                       │
│    if (res.code === 200) {                              │
│      this.$message.success('保存成功');                 │
│      this.loadData();                                   │
│    }                                                    │
│  }                                                      │
│  ```                                                    │
│                                                          │
│  【API 接口】                                            │
│  POST /api/detail                                       │
│  参数: {id, accountId, amount, date, description}       │
│                                                          │
│  【后端部分】                                            │
│  📄 DetailController.java 第 52 行                      │
│  ```java                                                │
│  @PostMapping("/detail")                                │
│  public R save(@RequestBody Detail detail) {            │
│      detailService.saveDetail(detail);                  │
│      return R.ok();                                     │
│  }                                                      │
│  ```                                                    │
│                                                          │
│  📄 DetailService.java 第 89 行                         │
│  ```java                                                │
│  public void saveDetail(Detail detail) {                │
│      // 1. 判断新增还是修改                             │
│      if (detail.getId() == null) {                      │
│          detailMapper.insert(detail);                   │
│      } else {                                           │
│          detailMapper.updateById(detail);               │
│      }                                                  │
│                                                          │
│      // 2. 更新账户余额                                 │
│      accountService.updateBalance(                      │
│          detail.getAccountId()                          │
│      );                                                 │
│  }                                                      │
│  ```                                                    │
│                                                          │
│  💡 需要了解更多细节吗？                                 │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 输入你的问题...                          [发送] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. 添加新功能时

```
┌─────────────────────────────────────────────────────────┐
│  💬 Agent 助手                                    [×]    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  👤 用户:                                                │
│  我想添加一个批量导入功能                                │
│                                                          │
│  🤖 Agent:                                               │
│  🔍 正在分析需求...                                      │
│                                                          │
│  🔧 调用工具: find_similar_skills("导入")               │
│  ✅ 找到 3 个类似功能:                                   │
│     • UserList 页面的批量导入                            │
│     • ProductList 页面的 Excel 导入                      │
│     • OrderList 页面的数据导入                           │
│                                                          │
│  🔧 调用工具: analyze_current_page_structure()          │
│  ✅ 当前页面结构已分析                                   │
│                                                          │
│  📝 建议方案:                                            │
│                                                          │
│  基于 UserList 页面的导入功能，我建议：                  │
│                                                          │
│  【前端实现】                                            │
│  1. 添加"批量导入"按钮                                   │
│  2. 创建导入对话框组件                                   │
│  3. 实现文件上传功能                                     │
│  4. 显示导入结果                                         │
│                                                          │
│  参考代码（UserList.vue 第 156 行）:                    │
│  ```javascript                                          │
│  async handleImport(file) {                             │
│    const formData = new FormData();                     │
│    formData.append('file', file);                       │
│                                                          │
│    const res = await this.$http.post(                   │
│      '/api/detail/import',                              │
│      formData                                           │
│    );                                                   │
│                                                          │
│    this.$message.success(                               │
│      `成功导入 ${res.data.success} 条`                  │
│    );                                                   │
│  }                                                      │
│  ```                                                    │
│                                                          │
│  【后端实现】                                            │
│  1. 添加导入接口                                         │
│  2. 解析 Excel 文件                                      │
│  3. 批量保存数据                                         │
│  4. 返回导入结果                                         │
│                                                          │
│  参考代码（UserController.java 第 234 行）:             │
│  ```java                                                │
│  @PostMapping("/detail/import")                         │
│  public R importData(                                   │
│      @RequestParam("file") MultipartFile file          │
│  ) {                                                    │
│      ImportResult result =                              │
│          detailService.importFromExcel(file);           │
│      return R.ok(result);                               │
│  }                                                      │
│  ```                                                    │
│                                                          │
│  💡 需要我生成完整的代码吗？                             │
│                                                          │
│  [生成前端代码] [生成后端代码] [查看详细步骤]           │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 输入你的问题...                          [发送] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🏗️ 技术架构

### 1. 页面上下文管理

```python
class PageContext:
    """页面上下文管理器"""
    
    def __init__(self):
        self.current_page = None
        self.page_skills = {}
        self.conversation_history = []
    
    def enter_page(self, page_path: str):
        """进入页面时"""
        # 1. 分析页面
        analysis = analyze_page(page_path)
        
        # 2. 提取 Skills
        skills = extract_skills(analysis)
        
        # 3. 保存上下文
        self.current_page = page_path
        self.page_skills[page_path] = skills
        
        # 4. 清空对话历史（新页面新对话）
        self.conversation_history = []
        
        return skills
    
    def get_context(self) -> str:
        """获取当前上下文"""
        if not self.current_page:
            return ""
        
        skills = self.page_skills[self.current_page]
        
        return f"""
当前页面: {self.current_page}

可用功能 (Skills):
{format_skills(skills)}

对话历史:
{format_history(self.conversation_history)}
"""
```

### 2. Agent 实现

```python
class PageAwareAgent:
    """页面感知的 Agent"""
    
    def __init__(self, client, tools):
        self.client = client
        self.tools = tools
        self.context = PageContext()
    
    def enter_page(self, page_path: str):
        """进入页面"""
        # 显示分析过程
        yield StreamEvent("info", "🔄 正在分析页面...")
        
        # 调用工具
        yield StreamEvent("tool_call", "analyze_page", page_path)
        skills = self.context.enter_page(page_path)
        yield StreamEvent("tool_result", "✅ 已提取 Skills")
        
        # 显示 Skills
        yield StreamEvent("skills_loaded", skills)
        
        # 欢迎消息
        yield StreamEvent("message", "💡 我已经了解了这个页面的所有功能！有什么问题吗？")
    
    def chat(self, user_message: str):
        """对话"""
        # 1. 构建消息（包含页面上下文）
        messages = [
            {
                "role": "system",
                "content": f"""你是一个代码分析专家。

{self.context.get_context()}

请基于当前页面的 Skills 回答用户问题。
如果需要查看其他页面的功能，使用 find_similar_skills 工具。
"""
            },
            {"role": "user", "content": user_message}
        ]
        
        # 2. 运行 Agent（显示工具调用）
        for event in self._run_with_streaming(messages):
            yield event
    
    def _run_with_streaming(self, messages):
        """流式运行（显示工具调用）"""
        yield StreamEvent("info", "🔍 正在分析...")
        
        for turn in range(10):
            # 调用 LLM
            response = self.client.chat(messages, tools=self.tools)
            
            # 如果需要工具
            if response.tool_calls:
                for tool_call in response.tool_calls:
                    # 显示工具调用
                    yield StreamEvent(
                        "tool_call",
                        tool_call.function.name,
                        tool_call.function.arguments
                    )
                    
                    # 执行工具
                    result = execute_tool(tool_call)
                    
                    # 显示工具结果
                    yield StreamEvent("tool_result", result)
                    
                    messages.append({"role": "tool", "content": result})
                
                continue
            
            # 完成
            yield StreamEvent("message", response.content)
            break
```

### 3. 工具定义

```python
# 页面分析工具
@registry.register(
    name="analyze_page",
    description="分析页面结构，提取 Skills",
    parameters={...}
)
def analyze_page(page_path: str):
    """分析页面"""
    # V1 的页面分析逻辑
    return page_analysis_result

# Skill 查找工具
@registry.register(
    name="find_skill",
    description="在当前页面查找指定的 Skill",
    parameters={...}
)
def find_skill(skill_name: str):
    """查找 Skill"""
    # 在当前页面的 Skills 中查找
    return skill

# 相似 Skill 查找工具
@registry.register(
    name="find_similar_skills",
    description="在其他页面查找类似的 Skills",
    parameters={...}
)
def find_similar_skills(keyword: str):
    """查找相似 Skills"""
    # 在所有页面的 Skills 中查找
    return similar_skills

# 代码定位工具
@registry.register(
    name="get_code_location",
    description="获取 Skill 的代码位置",
    parameters={...}
)
def get_code_location(skill_id: str, layer: str):
    """获取代码位置"""
    # 返回文件路径和行号
    return code_location

# 代码生成工具
@registry.register(
    name="generate_code",
    description="基于现有 Skill 生成新代码",
    parameters={...}
)
def generate_code(template_skill: str, new_feature: str):
    """生成代码"""
    # 基于模板 Skill 生成新代码
    return generated_code
```

---

## 🎨 前端实现

### 1. Agent 面板组件

```vue
<template>
  <div class="agent-panel">
    <!-- 标题栏 -->
    <div class="panel-header">
      <span>💬 Agent 助手</span>
      <button @click="close">×</button>
    </div>
    
    <!-- 消息区域 -->
    <div class="messages" ref="messages">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message', msg.type]"
      >
        <!-- 用户消息 -->
        <div v-if="msg.type === 'user'" class="user-message">
          <div class="avatar">👤</div>
          <div class="content">{{ msg.content }}</div>
        </div>
        
        <!-- Agent 消息 -->
        <div v-else-if="msg.type === 'agent'" class="agent-message">
          <div class="avatar">🤖</div>
          <div class="content" v-html="formatMarkdown(msg.content)"></div>
        </div>
        
        <!-- 工具调用 -->
        <div v-else-if="msg.type === 'tool_call'" class="tool-call">
          <span class="icon">🔧</span>
          <span>调用工具: {{ msg.tool }}</span>
          <span class="args">{{ msg.args }}</span>
        </div>
        
        <!-- 工具结果 -->
        <div v-else-if="msg.type === 'tool_result'" class="tool-result">
          <span class="icon">✅</span>
          <span>{{ msg.content }}</span>
        </div>
        
        <!-- Skills 列表 -->
        <div v-else-if="msg.type === 'skills'" class="skills-list">
          <div class="title">📦 当前页面功能:</div>
          <ul>
            <li v-for="skill in msg.skills" :key="skill.id">
              • {{ skill.name }}
            </li>
          </ul>
        </div>
      </div>
    </div>
    
    <!-- 输入区域 -->
    <div class="input-area">
      <input
        v-model="userInput"
        @keyup.enter="sendMessage"
        placeholder="输入你的问题..."
      />
      <button @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      messages: [],
      userInput: '',
      currentPage: null
    }
  },
  
  methods: {
    async enterPage(pagePath) {
      // 进入页面时自动分析
      this.currentPage = pagePath
      
      // 连接 SSE
      const eventSource = new EventSource(
        `/api/agent/enter-page?page=${pagePath}`
      )
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        this.handleEvent(data)
      }
    },
    
    async sendMessage() {
      if (!this.userInput.trim()) return
      
      // 添加用户消息
      this.messages.push({
        id: Date.now(),
        type: 'user',
        content: this.userInput
      })
      
      const message = this.userInput
      this.userInput = ''
      
      // 发送到后端
      const eventSource = new EventSource(
        `/api/agent/chat?message=${encodeURIComponent(message)}`
      )
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        this.handleEvent(data)
      }
    },
    
    handleEvent(event) {
      switch (event.type) {
        case 'tool_call':
          this.messages.push({
            id: Date.now(),
            type: 'tool_call',
            tool: event.tool,
            args: event.args
          })
          break
        
        case 'tool_result':
          this.messages.push({
            id: Date.now(),
            type: 'tool_result',
            content: event.content
          })
          break
        
        case 'skills':
          this.messages.push({
            id: Date.now(),
            type: 'skills',
            skills: event.skills
          })
          break
        
        case 'message':
          this.messages.push({
            id: Date.now(),
            type: 'agent',
            content: event.content
          })
          break
      }
      
      // 滚动到底部
      this.$nextTick(() => {
        this.$refs.messages.scrollTop = this.$refs.messages.scrollHeight
      })
    }
  }
}
</script>
```

---

## 🚀 实施路径

### Phase 1: 核心功能（1 周）

1. **实现 PageContext**
2. **实现 PageAwareAgent**
3. **实现流式输出**
4. **实现工具调用显示**

### Phase 2: 前端集成（3 天）

1. **Agent 面板组件**
2. **SSE 事件处理**
3. **消息展示**
4. **代码高亮**

### Phase 3: 高级功能（1 周）

1. **相似 Skill 查找**
2. **代码生成**
3. **多页面对比**
4. **历史记录**

---

## 💡 总结

**你想要的是**：

1. ✅ **Claude Code 式的交互** - 实时显示工具调用
2. ✅ **以页面为维度** - 每个页面有独立的上下文
3. ✅ **自动分析** - 进入页面自动生成 Skill
4. ✅ **智能问答** - 基于当前页面 Skill 回答
5. ✅ **代码生成** - 参考现有 Skill 生成新功能

**这是一个非常完整且实用的产品设计！** 🎉

---

**要不要开始实施？** 🚀
