# AI Requirement OS 架构导读

> 从产品视角理解系统：怎么用、AI 在哪里、代码怎么走。

---

## 一、一句话说清系统做什么

**输入**：一个 Vue + SpringBoot 项目的源代码路径
**输出**：结构化页面文档 + 可预览的代码修改计划
**核心**：不用启动前端/后端服务，通过读代码就能理解页面，然后辅助产品生成文档和需求方案

---

## 二、产品使用流程（三段式）

### 阶段 1：选页面、读代码（无 AI）

```
操作：选择项目 → 点击扫描 → 点击页面 → 加载工作区
AI：全程不参与
```

系统做的事：
1. 扫描 `src/views/` 下的 `.vue` 文件 → 列出所有页面
2. 选中一个页面后，解析它的：
   - 搜索字段（`v-model="queryCondition.X"`）
   - 表格列（`<el-table-column>`）
   - 弹窗结构（`<el-dialog>`）
   - 按钮动作（页面级 + 行级）
   - 关联的 API 文件（`import X from "@/api/..."`）
   - 后端的 Controller、Service、DTO
3. 把所有信息和文件指纹缓存到 `.agent/page_analysis.json`

**结果**：页面基本结构已清楚，字段/按钮/API 已提取。

### 阶段 2：生成文档（AI 增强）

```
操作：点击"生成 JSON / 报告"
AI：参与一次，目的是用自然语言润色和补全
```

系统做的事：
1. 把阶段 1 的解析结果 + 相关源代码打包成**上下文包**
2. 调用 DeepSeek，让模型输出结构化的 `PageDataLineage`
3. 把结果渲染成 Markdown 报告

**结果**：一份包含字段说明、接口链路、后端映射的页面数据报告。

### 阶段 3：提需求、改代码（AI + 人工确认）

```
操作：输入需求 → 看 diff → 确认应用 → 回滚（可选）
AI：参与一次，生成修改计划
```

1. **plan**：用户输入"给搜索区增加一个分类筛选框"，LLM 输出 `CodeModificationPlan`（一组对源代码的编辑操作）
2. **preview**：系统生成 unified diff，用户看具体改了哪些代码
3. **apply**：确认后，系统自动创建 git 分支 → 改文件 → git commit
4. **revert**：不满意 → `git revert` 撤销

---

## 三、AI 在哪里（你真正关心的）

整个系统只有 **4 个地方** 调用了 AI，其余全是普通代码。

### AI 调用位置总览

| 位置 | 文件名 | 做什么 | 输入 | 输出 |
|------|--------|--------|------|------|
| 1 | `llm/page_doc_generator.py` | 润色页面文档 | 页面上下文 + 草稿 | `PageDocumentation` |
| 2 | `llm/page_lineage_generator.py` | 生成数据链路报告 | 页面上下文 + 草稿 | `PageDataLineage` |
| 3 | `llm/page_patch_generator.py` | 生成沙箱 patch | 页面文档 + 需求 | `SandboxPatchResult` |
| 4 | `llm/code_modifier.py` | 生成代码修改计划 | 页面上下文 + 需求 | `CodeModificationPlan` |

**位置 3 已废弃**，现在主要用的是 2（文档）和 4（代码修改）。

### AI 调用的标准流程

所有 4 个位置用同一个调用模式：

```
get_llm_by_role("primary")
  ↓ 读取 .env 中的 DEEPSEEK_API_KEY、DEEPSEEK_MODEL
  ↓ 创建 ChatOpenAI 客户端
  ↓
llm.with_structuredOutput(目标模型)   ← LangChain，结果直接解析成 Pydantic 对象
  ↓
structured_llm.invoke([
  ("system", code_modification_system_prompt()),   ← 系统提示词（中文）
  ("human", build_code_modification_user_prompt(...))  ← 用户提示词（上下文 + 需求）
])
```

**关键文件**：

| 文件 | 作用 |
|------|------|
| `llm/gateway.py` | AI 统一入口。调用 `get_llm_by_role("primary")` 就行 |
| `llm/providers.py` | DeepSeek 适配器。用 `ChatOpenAI` 连 DeepSeek |
| `llm/prompts.py` | 所有提示词集中管理（中文） |
| `.env` | 配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` |

AI 不可用时的回退（无 API key 时）：

| 模块 | 回退行为 |
|------|----------|
| `page_doc_generator` | 返回"无 AI，使用草稿" |
| `page_lineage_generator` | 返回纯规则生成的草稿 `PageDataLineage` |
| `code_modifier` | 返回硬编码的示例编辑（仅限 Detail.vue 的报销筛选场景） |

---

## 四、Agent 系统详解（核心）

### Agent 不是"AI 自主 agent"，而是"人工确认的代码修改编排"

系统的 `agent/` 目录名字叫 Agent，但和那些"AI 自己决定下一步做什么"的 agent 不一样。这里的 Agent 是一个**工具编排器**，每步都等人工确认：

```
用户 → plan() → 看 diff → apply() / revert()
                  ↑              ↑
              人工决定       人工决定
```

### AgentRuntime（运行时外壳）

文件：`agents/runtime.py`

```python
class AgentRuntime:
    config      ← agent.toml + .env 配置
    manifest    ← 能力描述（registry.py）
    memory      ← 内存型记忆存储（AgentMemoryStore）
    tasks       ← 任务队列（AgentTaskQueue）
    tools       ← 工具注册表（ToolRegistry）
    code_agent  ← 代码修改 agent（CodeAgent）
```

**启动时注册了 5 个工具到 tools**：

| 工具名 | 对应方法 | 干什么 |
|--------|---------|--------|
| `read_file` | `Path.read_text` | 读文件 |
| `plan_code_modification` | `code_agent.plan` | 生成计划 |
| `preview_code_modification` | `code_agent.preview` | 看 diff |
| `apply_code_modification` | `code_agent.apply` | 应用修改 |
| `revert_code_modification` | `code_agent.revert` | 回滚修改 |

### CodeAgent（代码修改编排器）

文件：`agents/code_agent.py`

```
plan(config, page_path, user_request)
  ├── 通过 page_analysis 拿到缓存的工作区
  ├── 调用 LLM 生成 CodeModificationPlan  ← AI 在这里
  ├── 检查文件路径白名单（不让改 frontend_root 之外的文件）
  ├── 落盘到 .agent/code_plans/{plan_id}.json
  └── 返回计划

preview(plan_id)
  ├── 读内存缓存中的计划
  ├── 对每个 edit 做 in-memory 的字符串操作，生成 unified diff
  └── 返回 diff 文本（无 AI）

apply(plan_id, config)
  ├── 检查 git 工作区是否干净
  ├── 创建 feature 分支 agent-feat/{plan_id[:8]}
  ├── 对每个 edit：验证锚点唯一性 → 读文件 → 改文件 → 写文件
  ├── 全部成功后 git commit
  ├── 更新 plan 状态为 "applied"
  └── 返回执行结果（无 AI）

revert(plan_id, config)
  ├── git checkout 到 feature 分支
  ├── git revert HEAD
  ├── 删除计划文件
  └── 返回结果（无 AI）
```

### CodeEdit（最小修改单元）

文件：`agents/code_tools.py`

核心逻辑不是 AST 解析，而是**锚点定位**：

```python
class CodeEdit:
    file_path: str          # 要修改的文件
    action: str             # insert_after / insert_before / replace / delete
    anchor_text: str        # 锚点字符串（必须在文件中唯一出现）
    new_content: str        # 新代码
    description: str        # 人类可读说明

# 修改流程：
validate_anchor(path, anchor_text)  # 锚点唯一？→ 否就报错
  ↓
_read_file(path)                     # 读文件
  ↓
_apply_edit_to_text(content, edit)   # 字符串替换（find + slice）
  ↓
_write_file(path, updated)           # 写回
```

安全机制：

| 检查 | 触发条件 |
|------|----------|
| 锚点不存在 | 报错 |
| 锚点不唯一 | 报错 |
| 文件路径不在白名单 | 报错（只允许 frontend_root 内） |
| git 工作区有未提交变更 | 阻止 apply |
| 任一 edit 失败 | 停止后续，已改的保留（可 revert） |

---

## 五、持久化存储（文件系统）

```
.agent/
├── page_analysis.json          ← 页面分析缓存（工作区 + 文档 + patch 历史）
│                                 按 project_name::page_path 索引
│
└── code_plans/
    ├── index.json              ← 计划索引 { plan_id → { status, summary, ... } }
    └── {plan_id}.json          ← 完整 CodeModificationPlan
```

**PageAnalysis** 缓存在 `page_analysis.json`，用文件 SHA256 指纹判断是否过期。
**CodePlan** 独立存放在 `code_plans/` 目录，不与页面分析混在一起。

---

## 六、Git 操作策略

| 操作 | git 命令 | 说明 |
|------|----------|------|
| apply 前检查 | `git diff --quiet HEAD -- <file>` | 只检查计划涉及的文件 |
| apply | `git add <files>` + `git commit` | 创建本地 commit，不 push |
| revert | `git revert <commit-hash>` | 生成撤销 commit，保留历史 |
| 分支 | `agent-feat/{plan_id[:8]}` | 每次 apply 创建新分支 |

---

## 七、API 端点一览

### 页面分析（无 AI）

| 端点 | 做什么 |
|------|--------|
| `GET /api/sample-project` | 返回样例项目配置 |
| `POST /api/analyze/discovery` | 扫描项目结构 |
| `POST /api/page-analysis` | 加载/缓存页面工作区 |

### 文档生成（有 AI）

| 端点 | 做什么 |
|------|--------|
| `POST /api/llm/page-lineage` | 生成页面数据链路报告（字段→接口→后端） |

### 代码修改（plan/preview 有 AI，apply/revert 无 AI）

| 端点 | 做什么 |
|------|--------|
| `POST /api/agent/code-plan` | 生成代码修改计划 |
| `GET /api/agent/code-preview/{id}` | 预览 diff |
| `POST /api/agent/code-apply/{id}` | 应用修改 |
| `POST /api/agent/code-revert/{id}` | 回滚修改 |
| `GET /api/agent/code-plans` | 列出所有计划 |
| `POST /api/agent/reset-workspace` | 重置所有 agent 修改 |

---

## 八、文件路径速查

```
ai-core/src/ai_requirement_os/
├── api/app.py                       # 所有 API 端点
├── agents/
│   ├── runtime.py                   # AgentRuntime（总控）
│   ├── code_agent.py                # CodeAgent（编排 plan/apply/revert）
│   ├── code_tools.py                # CodeEdit 模型 + 文件操作引擎
│   ├── config.py                    # agent.toml + .env 加载
│   ├── models.py                    # Agent 数据模型
│   ├── registry.py                  # 能力/工具注册
│   ├── tooling.py                   # ToolRegistry
│   └── memory.py / tasks.py         # 记忆/任务队列
├── llm/
│   ├── gateway.py                   # 统一 LLM 入口
│   ├── providers.py                 # DeepSeek 适配器
│   ├── prompts.py                   # 所有提示词
│   ├── code_modifier.py             # LLM 生成代码计划（关键 AI 点）
│   ├── page_doc_generator.py        # LLM 生成页面文档
│   ├── page_lineage_generator.py    # LLM 生成数据链路报告
│   └── page_patch_generator.py      # （已废弃）旧 patch 生成
├── parser/
│   ├── page_workspace.py            # 页面解析引擎（纯正则）
│   ├── page_analysis.py             # 缓存管理层
│   └── discovery.py                 # 项目扫描
├── schema/
│   ├── page_lineage.py              # 数据链路模型
│   └── runtime_schema.py            # 运行时 schema
└── web/
    ├── workbench.html               # 工作台 UI
    └── assets/
        ├── workbench.js             # 前端逻辑
        └── workbench.css            # 样式
```

---

## 九、常见问题

**Q：产品想看页面分析结果，需要启动什么？**
A：只需要 `uv run fastapi dev src/ai_requirement_os/api/app.py`，打开工作台就行。不需要启动 Vue dev server，不需要启动 Java 后端。

**Q：没有 DeepSeek API key 能跑吗？**
A：能。所有 LLM 功能都有 fallback 回退到纯规则模式，只是文档质量不如 AI 增强版。

**Q：改代码会弄坏真实项目吗？**
A：有 3 层保护：文件路径白名单（只能改 frontend_root 内）、git 分支隔离（每次新建分支）、git commit 可回滚。

**Q：产品怎么看到改代码后的效果？**
A：在真实前端项目目录运行 `VUE_APP_MOCK=true npm run dev`，workbench 的 iframe 指向这个 dev server。
