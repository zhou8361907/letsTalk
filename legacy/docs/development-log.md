# AI Requirement OS 开发日志

最后更新：2026-05-19

## 1. 项目概述

### 1.1 项目名称

AI Requirement OS

### 1.2 项目定位

本项目不是 AI 自动写代码工具，而是一个基于真实代码逆向理解的 AI 需求操作系统。

核心目标：

1. 从真实 Vue + SpringBoot CRUD 系统中逆向提取业务语义。
2. 将业务语义映射为可操作的 IR 与 Runtime Schema。
3. 在不启动真实前后端工程的前提下，构建交互式需求沙箱。
4. 允许产品或研发通过自然语言修改需求。
5. 输出结构化、可执行、可追踪的需求 Diff。

### 1.3 当前目标场景

当前 MVP 聚焦于中国典型 B 端 CRUD 系统增强器。

适用业务：

- 财务系统
- 医疗系统
- OA
- ERP
- 政务审批
- 支付对账
- 单据流转

典型技术栈：

- 前端：Vue2 / Vue3 + ElementUI / Element Plus
- 后端：SpringBoot + MyBatis
- 数据库：MySQL
- 接口：RESTful API
- 状态：Vuex / Pinia
- 页面模型：表单 + 表格 + Dialog

---

## 2. MVP 核心原则

### 2.1 不碰真实运行时

MVP 阶段不启动真实前端工程，不启动真实 Java 服务。

系统只做：

1. 读取代码
2. 逆向理解
3. 构建 IR
4. 渲染沙箱投影

### 2.2 不让 AI 直接改生产代码

AI 只修改 IR Schema，不直接生成或改写生产 Vue / Java 文件。

目标链路：

`Code -> IR -> Runtime Schema -> Sandbox -> Diff`

### 2.3 当前支持范围

支持页面类型：

- 查询页
- CRUD 表单
- Dialog
- Drawer
- Tabs
- Table
- SearchForm

支持逻辑：

- 字段联动
- 状态显隐
- 简单公式
- 表格操作按钮
- 外部 API 调用
- 状态流转

支持交互：

- 新增按钮
- 修改表单
- 修改字段
- 增加校验
- 增加 API
- 修改状态流

### 2.4 当前明确不支持

- 微前端
- 动态 slot 深度嵌套
- iframe 页面
- 大型流程引擎
- 复杂 lowcode DSL
- 动态 Vue Render Function
- canvas 页面
- 可视化拖拽设计器
- 多端适配

---

## 3. 总体架构

### 3.1 架构主链路

```text
真实代码仓库
    ↓
逆向解析层
    ↓
IR Core
    ↓
Runtime Schema
    ↓
Sandbox Renderer
    ↓
交互式需求沙箱
    ↓
Agent 修改 Schema
    ↓
3D PRD Diff
```

### 3.2 当前技术决策

- AI Core：Python
- API：FastAPI
- Agent Workflow：后续接入 LangGraph
- AST / Parsing：Python 主控 + Java 解析配合
- 前端沙箱：Vue3 + Runtime Renderer
- UI：Element Plus
- Diff 输出：结构化 Schema Diff，后续扩展 Git Diff
- 存储：Git + JSON
- 项目管理：`uv`

---

## 4. 当前代码结构

当前仓库已初始化以下结构：

```text
letsTalk/
├── ai-core/
│   ├── examples/
│   ├── src/ai_requirement_os/
│   │   ├── agents/
│   │   ├── api/
│   │   ├── diff/
│   │   ├── ir_core/
│   │   ├── parser/
│   │   ├── sandbox/
│   │   ├── schema/
│   │   ├── validator/
│   │   └── settings.py
│   ├── tests/
│   ├── pyproject.toml
│   └── uv.lock
└── docs/
    └── development-log.md
```

---

## 5. 已完成内容

### 2026-05-19 - 项目骨架初始化

已完成：

1. 使用 `uv` 初始化 Python 主控层项目 `ai-core`。
2. 配置 `FastAPI`、`Pydantic`、`Typer`、`pytest`、`ruff`、`mypy`。
3. 创建第一版 IR 模型：
   - `PageIR`
   - `ContainerIR`
   - `FieldIR`
   - `ColumnIR`
   - `ActionIR`
   - `ApiIR`
   - `Formula`
   - `StateTransitionIR`
4. 创建第一版 Runtime Schema 转换器。
5. 提供样例 CRUD 页面 IR 和 Runtime Schema。
6. 添加最小 API：
   - `/health`
   - `/example/page-ir`
   - `/example/runtime-schema`
7. 添加基础测试并通过验证。

当前状态：

- `uv sync` 已通过
- `uv run pytest` 已通过

### 2026-05-19 - 样例项目可行性评估

已评估样例项目：

`/Users/zs/IdeaProjects/work/letsTalk/test-project/RunningAccount-master`

评估结论：

该项目适合作为第一批解析样本，能够覆盖 MVP 需要验证的主链路。

主要原因：

1. 具备明确的前后端分层：
   - 前端位于 `vue/`
   - 后端位于 `src/main/java/`
2. 前端页面具备典型 CRUD 结构：
   - 搜索区
   - 表格
   - 分页
   - 新增弹窗
   - 编辑弹窗
   - 行操作按钮
3. 后端接口组织清晰：
   - `DetailController`
   - `DetailService`
   - `DetailQueryConditionDTO`
   - `DetailFormReqDTO`
4. API 调用关系清楚：
   - 前端 `detailApi.js`
   - 后端 `/detail` Controller 映射
5. 数据语义足够真实：
   - 查询条件
   - 收支记录字段
   - 选项数据
   - 权限显隐
   - 图片附件

适合作为第一版 parser 目标的页面：

- `vue/src/views/Detail.vue`

建议第一版先解析以下主干内容：

1. 搜索字段
2. 表格列
3. 页面级按钮
4. 行级按钮
5. 新增 / 修改 Dialog
6. 关联 API

建议暂时不纳入第一版解析的复杂内容：

1. 图片上传与图片折叠区域
2. 表格 expand 内容
3. 导出凭证等衍生流程

### 2026-05-19 - 页面分析资产与真实页面沙箱切换

本次调整把系统重心从“假想 schema 草图”拉回到“真实页面副本沙箱”。

已完成：

1. 页面工作区 `PageWorkspace` 增加真实沙箱路由与地址：
   - `sandbox_route`
   - `sandbox_url`
2. 页面分析资产增加 `patch_history`，用于沉淀：
   - 当前页面的需求修改轨迹
   - 沙箱 patch 回放记录
   - 后续需求 Diff 的输入素材
3. 工作台页切换为真实 iframe 沙箱模式：
   - 左侧点击页面后实时切换
   - 中央不再主渲染手工 schema 草图
   - 直接挂载真实前端副本路由
4. 新增页面级 patch 生成能力：
   - 接口：`/api/llm/page-patch`
   - 输出：结构化 `SandboxPatchResult`
   - 当前支持动作：
     - `add_search_field`
     - `add_table_column`
     - `rename_button`
     - `add_form_field`
     - `annotate_rule`
5. 真实前端副本新增 patch runtime：
   - 通过 `postMessage` 接收页面 patch
   - 在 `#/detail`、`#/login` 等页面叠加需求修改效果
   - 当前属于沙箱表达层 patch，不改真实源代码

这次调整的意义：

1. 产品看到的是“原页面投影 + patch”，更接近原型工具体验。
2. 页面文档不再只是说明材料，而是页面沙箱和 patch 生成的上下文资产。
3. 后续如果源码变更，可以基于页面分析资产重新分析，同时保留历史 patch 记录用于对比。

当前限制：

1. 真实页面 patch 仍然是轻量 DOM 叠加，不是源码级修改。
2. 表格新增列当前以“可视化预览 + 轻量单元格补丁”为主，还不是完整组件级重渲染。
3. patch 生成已经接入统一 LLM 入口，但还需要继续细化不同页面类型的提示词和校验器。

### 2026-05-19 - 页面需求记录与沙箱重放增强

这次修正主要回应一个真实问题：

`Detail` 页面里“增加一列表格字段”不能只是往 DOM 末尾贴一个一次性节点，而应该尽量表现成一个可持续回放、页面刷新后还能保留的沙箱修改结果。

本次新增：

1. 页面 patch 历史资产升级为结构化记录：
   - `created_at`
   - `user_request`
   - `patch_result`
2. 工作台增加“需求记录”区域，用于直接展示：
   - 你的原始要求
   - agent 的 patch 摘要
   - 本次修改包含的操作
3. 沙箱前端 patch runtime 增加本地持久化：
   - 使用 `localStorage` 按路由保存 patch
   - 页面刷新后自动恢复
4. 沙箱前端 patch runtime 增加 DOM 观察与自动重放：
   - 当表格重新渲染
   - 当路由切换回来
   - 当页面重新挂载
   系统会重新补上已保存的 patch

这意味着当前模式已经从“即时演示”前进到“页面级沙箱修改记录”阶段。

仍需继续优化：

1. 现在的新增列表格列仍是沙箱表达层重放，不是 Vue 源码 AST 级重组。
2. 后续可以继续把 patch 逐步提升为：
   - 组件级状态补丁
   - 页面 schema 增量
   - 最终研发需求 Diff

### 2026-05-19 - Detail 表格新增列渲染修正

发现问题：

在 `Detail` 页面执行“增加操作人列”时，之前的实现只展示了“新增表格列预览”说明条，没有把列真实插入到 Element Table 的表头和数据区中。

原因：

此前只尝试补 `th/td`，但没有同步补齐 Element Table 内部使用的 `colgroup` 结构，因此真实表格布局没有正确接纳新列。

本次修正：

1. 新增列表格列时，同时补：
   - header `colgroup`
   - body `colgroup`
   - header `th`
   - body `td`
2. 补丁列优先插入到“操作列”之前，使视觉位置更接近真实研发修改。
3. 为补丁列增加固定宽度与样式，保证在当前样例页中可见。

当前结果：

`Detail` 页面的“新增操作人列”现在应该不再只是说明条，而会在表格结构中真实显示为一列沙箱列。

### 2026-05-19 - 需求记录管理能力补充

为了避免沙箱 patch 把页面越改越乱，本次补充了页面级需求记录管理能力。

新增内容：

1. 每条 patch 记录增加 `record_id`
2. 工作台需求记录区支持：
   - 单条删除
   - 全部清空
   - 回填到输入框后再次编辑
3. 沙箱 iframe 支持 `replace-patches` 消息：
   - 删除记录后同步替换当前页面 patch
   - 清空记录后同步清空当前页面 patch

设计说明：

1. 删除记录、清空记录不需要重新调用 agent
2. 回填后修改需求文本再提交，需要重新调用 agent 生成新的 patch
3. 这样做可以把“记录管理”和“语义重算”分开，避免不必要的模型调用

下一步计划：

1. 把 patch 历史在工作台中做成可回看时间线。
2. 将页面 patch 进一步映射成结构化页面需求文档增量。
3. 在真实页面副本基础上继续补“浮动嵌入式原型改造层”。
4. 让 agent 正式接管：
   - 页面读取
   - 文档更新
   - patch 生成
   - 用户沟通
   - 后台任务与记忆扩展
4. 权限体系的完整抽象

原因：

这些内容不是不能做，而是它们会显著增加第一版 parser 的复杂度，不利于我们先验证核心链路。

### 2026-05-19 - 分析工作台设计与落地

已完成：

1. 增加工作台页面路由：
   - `/workbench`
2. 增加样例项目配置接口：
   - `/api/sample-project`
3. 增加项目发现接口：
   - `/api/analyze/discovery`
4. 增加第一版项目发现能力：
   - 扫描 Vue 页面
   - 扫描前端 API 模块
   - 扫描 SpringBoot Controller
   - 扫描 DTO / Service / Mapper 文件
5. 增加工作台静态前端页面，用于直接触发分析和展示结果。

当前工作台目标：

先把“可以点进去看分析结果”这件事做出来，让后续真正的 IR parser 有稳定入口。

第一版工作台不做的事：

1. 不直接渲染真实业务页面
2. 不接入大模型
3. 不生成最终 Diff
4. 不做复杂文件树浏览器

第一版工作台做的事：

1. 输入前端路径和后端路径
2. 一键开始分析
3. 展示前端页面候选项
4. 展示后端 Controller 候选项
5. 标出建议切入页
6. 为下一步的 IR 抽取做入口

### 2026-05-19 - 从项目分析转向页面需求工作台

方向修正：

经重新收束后，当前最小正确单位不再是“整个项目分析”，而是“具体页面工作空间”。

当前新的核心闭环：

1. 选择一个具体页面
2. 自动关联该页面涉及的前端 API 和后端接口
3. 生成页面级开发文档
4. 生成页面级 Runtime Schema
5. 在页面级沙箱中修改需求
6. 输出该页面的结构化 Diff

当前第一批页面样板：

- `Detail.vue`

本次已完成：

1. 将工作台定位调整为“页面需求工作台”
2. 增加页面工作区装配接口：
   - `/api/page-workspace`
3. 增加页面级文档装配能力：
   - 页面职责
   - 页面结构
   - 搜索字段
   - 表格列
   - 页面动作
   - 行级动作
   - 弹窗结构
   - 前端 API 方法
   - 后端接口映射
   - 业务规则摘要
4. 增加页面级沙箱投影预览
5. 默认以 `Detail.vue` 为推荐入口页

这样做的原因：

因为项目真正的交互对象应该是“某个具体页面的需求”，而不是抽象的全仓分析结果。

### 2026-05-19 - 页面级 LLM 提取与轻量浮动需求框

本次目标：

在不破坏 MVP 节奏的前提下，尽早把大模型接进“页面级工作区”，并且为后续 patch 预留沙箱内的交互入口。

本次已完成：

1. 增加页面级 LLM 文档生成器
2. 增加页面上下文包构建能力
3. 增加页面级 LLM 接口：
   - `/api/llm/page-documentation`
4. 明确约束大模型只读取当前页面及其直接关联文件
5. 在沙箱区域增加轻量浮动需求框，用于记录后续页面级需求 patch 输入

当前约束：

1. LLM 只处理一个页面
2. LLM 只读取当前页面工作区上下文
3. 没有配置 `OPENAI_API_KEY` 时，系统回退到 deterministic draft 模式
4. 当前浮动需求框仅作为 MVP 入口，不承载完整 patch 逻辑

这样做的原因：

1. 尽快把“大模型”和“页面工作区”接上
2. 不在 MVP 阶段过早投入复杂浮动交互系统
3. 保持后续 PageIR / Patch / Diff 的演进空间

### 2026-05-19 - Agent Runtime 独立升级

方向确认：

`agent` 不再作为零散函数调用存在，而是提升为独立的核心运行时模块。

这个 agent 的定位：

1. 读取页面相关代码
2. 组装页面工作区上下文
3. 编写页面级文档
4. 生成和更新沙箱前端投影
5. 与用户持续沟通
6. 记录修改意见与历史
7. 触发后续页面级 patch、diff、同步任务
8. 为未来的子代理、后台任务、持久记忆预留扩展点

本次已完成：

1. 增加独立 `agents/` 运行时骨架
2. 定义 agent manifest、session、task、memory、tool 等核心模型
3. 增加内存型 memory store 与 task queue
4. 增加默认 agent registry，用于声明当前能力和未来扩展点
5. 增加基础 API：
   - `/api/agent/manifest`
   - `/api/agent/session`
   - `/api/agent/tasks`

当前 agent 能力分层：

- active：
  - 页面上下文装配
  - 页面文档生成
  - 沙箱投影生成
- scaffolded：
  - 子代理委派
  - 后台任务
  - 持久记忆
- planned：
  - 页面级 patch 生成

这样做的原因：

因为这个系统真正长期有价值的不是某一个 parser 或某一个 prompt，
而是一个围绕“页面工作区”持续运作的 agent runtime。

### 2026-05-19 - 切换到 DeepSeek 与 .env 配置

本次调整：

1. LLM 接入从直接读取 `OPENAI_API_KEY` 改为统一走 DeepSeek OpenAI 兼容入口
2. 新增 `.env.example` 作为本地配置模板
3. 使用 `python-dotenv` 自动加载 `.env`
4. Agent 配置继续保留 `agent.toml` 负责运行时结构，但模型与密钥改由 `.env` 管理

当前关键环境变量：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_BASE_URL`
- `AIRO_FRONTEND_ROOT`
- `AIRO_BACKEND_ROOT`
- `AIRO_DEFAULT_PAGE`

这样做的原因：

1. 敏感配置不应写进结构化运行时文件
2. 便于你本地快速切换模型与密钥
3. 后续 PageDoc / PageIR / Patch 都能复用同一个 LLM provider 入口

### 2026-05-19 - 页面分析资产关联与复用

本次目标：

把已经分析出的页面文档、关联文件和沙箱结果沉淀成“页面分析资产”，避免重复分析。

本次已完成：

1. 增加页面分析资产存储
2. 为页面建立稳定关联键：
   - `project_name + page_path`
3. 记录页面关联文件指纹
4. 默认优先复用未变化的分析结果
5. 当源码变更时允许识别 stale 并刷新

当前行为：

1. 首次加载页面时生成分析资产
2. 再次进入同一页面时优先读取缓存
3. 若页面相关源码未变，则不重复分析
4. 若页面相关源码已变，则可重新分析并覆盖资产

这样做的原因：

1. 页面级文档、沙箱、LLM 结果本质上都应该是“页面资产”
2. 资产应当可复用，而不是每次从头分析
3. 资产又不能僵死，所以必须保留 refresh 能力

---

## 6. 当前阶段目标

### Phase 1：跑通最小业务语义链路

阶段目标：

从一个真实 CRUD 页面中，抽取出可用于沙箱渲染的结构化语义。

本阶段重点：

- 锁定 IR 结构
- 接入真实前端路径与后端路径
- 解析单页面 CRUD
- 输出稳定 JSON

### 当前待办

- [x] 初始化 `ai-core`
- [x] 定义第一版 IR
- [x] 定义第一版 Runtime Schema
- [ ] 增加项目源配置文件
- [ ] 接入真实 Vue 页面解析
- [ ] 接入真实 SpringBoot 模块解析
- [ ] 将解析结果输出为标准 IR JSON
- [ ] 评估第一版字段映射规则

---

## 7. 分阶段开发计划

### Phase 1：单页面 CRUD 逆向理解

目标：

支持一个典型列表页的完整语义抽取：

- 搜索表单
- 表格列
- 页面按钮
- 行操作按钮
- 新增 / 编辑弹窗
- API 依赖

交付物：

- Vue Parser MVP
- SpringBoot Parser MVP
- PageIR JSON
- Runtime Schema JSON

### Phase 2：外部 API 与联动能力

目标：

在 IR 中支持更强的业务规则表达。

范围：

- 外部 API 调用
- 选项加载
- 字段联动
- 显隐控制
- disable 规则
- 简单公式

交付物：

- Formula / Condition 扩展
- 外部 API 描述模型
- 更真实的沙箱上下文模型

### Phase 3：状态流与需求 Diff

目标：

从“页面结构提取”走向“需求变更表达”。

范围：

- 状态流转抽象
- 需求修改指令
- UI Diff
- API Diff
- State Diff
- Schema Diff

交付物：

- Diff Agent MVP
- 结构化变更报告
- 第一版 3D PRD Diff 展示模型

### Phase 4：沙箱交互闭环

目标：

将 IR 真正转化为可交互的需求沙箱。

范围：

- Vue3 Runtime Renderer
- Element Plus 基础组件渲染
- 组件状态联动
- 公式执行
- Action 行为模拟

交付物：

- sandbox-ui 初版
- mock data 运行上下文
- schema 驱动交互页

---

## 8. 后续变更记录模板

后续每次需求调整、方向变化、设计修改、实现决策，都记录在这里。

记录格式：

### YYYY-MM-DD - 主题

背景：

- 为什么要改

变更内容：

- 改了什么

影响范围：

- 影响哪些模块

结论：

- 最终采用什么方案

---

## 9. 效果验收记录

这一部分用于记录每个阶段最终做到了什么，而不是只记录“写了哪些代码”。

### 目标验收模板

#### 验收项

- 目标名称：
- 完成日期：
- 输入样例：
- 输出结果：
- 是否达成：

#### 备注

- 当前不足
- 下一步优化方向

---

## 10. 近期行动建议

下一步建议按下面顺序推进：

1. 增加一个项目源配置文件，用于接收未来的前端路径和后端路径。
2. 选一个最典型的 Vue CRUD 页面作为第一批解析样本。
3. 先做前端 parser，只提取：
   - 搜索项
   - 表格列
   - 页面按钮
   - 行按钮
4. 再补后端 parser，提取：
   - Controller
   - API 路径
   - DTO
   - Service 方法
5. 将前后端信息合并为单页 `PageIR`。

---

## 11. 文档维护约定

这份文档将持续承担四个角色：

1. 总体开发说明
2. 阶段计划看板
3. 变更历史记录
4. 最终效果沉淀

后续每完成一项关键工作，都应补充：

- 做了什么
- 为什么这样做
- 当前效果如何
- 下一步是什么
