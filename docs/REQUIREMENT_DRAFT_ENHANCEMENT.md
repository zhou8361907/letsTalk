# letsTalk 需求整理增强方案 — 从顺从型 PM 到主动型架构师

| 项目 | 内容 |
|------|------|
| 文档类型 | 设计文稿 + 实施路线图 |
| 日期 | 2026-06-05 |
| 范围 | PM 需求整理模式（能力 B）Prompt 重写 + 工具增强 + 工作流优化 |
| 关联 | `PM_PRD_RULES`（pm-prd.ts）· `PM_REQUIREMENT_PROBING_ANALYSIS.md` · `PM_REQUIREMENT_ASSISTANT.md` · `PM_TEST_RECORD.md` · `HERMES_MEMORY_REFERENCE.md` |

---

## 目录

1. [当前痛点诊断](#1-当前痛点诊断)
2. [目标蓝图](#2-目标蓝图)
3. [Prompt 改造方案](#3-prompt-改造方案)
4. [工具/工作流改造建议](#4-工具工作流改造建议)
5. [多区域多模块银行适配](#5-多区域多模块银行财政项目的专属适配)
6. [优先级排序](#6-优先级排序)
7. [验收标准](#7-验收标准)

---

## 1. 当前痛点诊断

### 1.1 顺从型速记员而非批判型搭档

`PM_PRD_RULES` 开篇定义：

> 你正在协助产品经理整理需求。读者是不懂代码的 PM。

这一定位将代理锁定为技术支持者/抄写员。代理的核心行为被约束为：

- 记录 PM 口语 → 填入字段
- 最多问 1 个 blockingQuestion
- 不猜测业务规则
- 不拆分前后端条目

结果是：**Agent 行为更像「速记员」而非「帮 PM 和研发对齐最小公约的搭档」**。

### 1.2 四个结构性根因

| # | 现象 | 根因 |
|---|------|------|
| 1 | PM 一句话 Agent 就产出 2 条完整需求 | **把猜测当定稿**；未用 pending 标记缺口 |
| 2 | 未追问「可用额度」计算口径 | **该问没问**——toBe 含规则但 PM 从未明确 |
| 3 | 对话出现 `submit()`、校验链 | **对话/清单语言分层未 enforcing** |
| 4 | 问了省份但没问具体页面 | **场景完整性 checklist 缺失** |

### 1.3 更深层的系统性问题

**Persona 层：**
- 代理被定位为「助理」，而不是有经验的资深 PM
- 大量「不要做什么」的约束，但没有赋予代理主动主导需求的相应身份
- `PM_REQUIREMENT_PROBING_ANALYSIS.md` 明确识别了差距，但提示词尚未修正

**提问策略层：**
- blockingQuestion 仅限 1 个，偏保守
- 提示词侧重于「不要问太多」而非「深入挖掘」
- 没有识别模糊表述（自动、优化、兼容、支持）的要求
- 没有探询隐式假设（批量上限、失败策略、权限范围）

**领域知识层：**
- 提示词中完全没有银行业务/财政领域上下文
- 不针对政府财政系统常见陷阱的引导（区县隔离、财务年度转换）

**技术深度层：**
- 无 API 合约提示、无错误状态指示、无安全/权限提示
- 没有边界情况的系统性思考

**输出结构层：**
- 输出对 PM 友好但对开发者缺少关键维度
- 研发附录是导出时懒生成且标注「非 PM 定稿」

### 1.4 当前 flow

```
PM 口语 → get_requirement_draft → （读代码）→ update_requirement_draft
                    ↑                            ↑
             有锚点才读代码                  自检 toBe 禁止猜规则
             最多 1 blockingQuestion          readyToFinalize 严控
```

---

## 2. 目标蓝图

### 2.1 Persona 重构

从**被动抄写员** → **批判性 PM 搭档**：

```
旧：「你正在协助产品经理整理需求。读者是不懂代码的 PM。」

新：「你是一位有 10 年经验的资深产品经理，正在协助另一位 PM 梳理需求。
    你的价值不仅是记录，而是：
    1) 用代码实证挑战模糊假设；
    2) 预判研发开工后必问的 gap；
    3) 帮 PM 和研发收敛到最小公约。
    读者是不懂代码的 PM——但你的思维必须是资深 PM 级别。」
```

### 2.2 行为转变

| 维度 | 旧行为 | 新行为 |
|------|--------|--------|
| 需求录入 | 每轮填格子 | 读码后先填 asIs/codePaths，再渐进填 toBe |
| 模糊表述 | 直接录入口语 | 标记模糊词，追问含义 |
| 隐式假设 | 不识别 | 批量→上限/失败策略；数据→空/加载/错误态 |
| 代码验证 | PM 说啥信啥 | 用 grep/read 核实 |
| 技术深度 | 只有 codePaths 文件路径 | 含 API 合约、安全规则、错误场景 |
| 领域意识 | 无 | 银行对接、基金收支、多区域差异 |

### 2.3 核心流程变化

```
PM 口语 → 识别领域/模块 → 读代码（Controller/Service/页面）
       → 填 asIs + codePaths（业务语言）
       → 对照公约找缺口：
           模糊词？隐式假设？安全？边界？性能？
       → blockingQuestion（最多 1 个最高代价）
       → openQuestions（分类：[权限]、[边界]、[性能]、[数据]）
       → 渐进 update（带待确认标记的 toBe）
       → 自检：本轮发现了几个模糊词？几个隐式假设？
```

---

## 3. Prompt 改造方案

所有改动集中在 `packages/context/src/prompt/pm-prd.ts`。

### 3.1 Persona 重写（P0，文件开头）

**当前内容：**
```
你正在协助产品经理整理需求。读者是不懂代码的 PM。
```

**替换为：**
```
你是一位有 10 年经验的资深产品经理，正在协助另一位 PM 梳理需求。
你的价值不仅是记录，而是：
1) 用代码实证挑战模糊假设——PM 说「X 现在表现如此」时，用 grep/read 核实；
2) 预判研发开工后必问的 gap——模糊表述、隐式假设、边界条件、安全权限；
3) 帮 PM 和研发收敛到最小公约——不要问卷式提问，每轮自然嵌入 1-2 点。
读者是不懂代码的 PM——但你的思维必须是资深 PM 级别：
    能挑战需求、能预判风险、能把口语净化成可落地的业务规格。
```

### 3.2 深度探询章节（P0，在「最小公约」后新增）

```
### 深度探询（系统性挖掘，非问卷）
当用户描述需求时，对以下维度逐项评估——不是连问，而是每轮自然嵌入 1-2 点：

**模糊表述清单**（触发 → 追问）：
- '自动' → '触发条件是什么？定时还是事件驱动？'
- '优化' → '具体指标？速度/准确率/用户体验？当前基线是多少？'
- '兼容' → '兼容哪些版本/浏览器/银行？'
- '支持' → '支持到什么程度？批量上限？部分成功策略？'
- '统一' → '统一到什么粒度？字段级、接口级还是流程级？'

**隐式假设探测**（PM 没说但隐含的）：
- 批量操作 → '上限多少？失败时回滚还是部分成功？用户能看到进度吗？'
- 数据显示 → '空状态、加载态、错误态分别怎么展示？'
- 权限/可见性 → '哪些角色能看到？数据按什么范围隔离（省份/区县/机构）？'
- 安全/审计 → '操作要不要记日志？敏感数据脱敏规则？'

**技术可行性线索**：
- PM 说某字段现在就有 → 用 grep/read 核实数据库中/前端页面是否存在
- PM 说某个流程目前是这样 → 读 Controller 和 Service 确认
- 发现现有代码已部分实现 → asIs 里写清楚现有行为，避免重复建设

**规则**：
- blockingQuestion 仍限 1 个（最高代价缺口）；其余进 openQuestions
- openQuestions 应分类标注：[权限]、[边界]、[性能]、[数据]、[兼容]
- 不要问卷式一次全问；每轮自然带 1-2 点
- **自检**：本轮对话中你发现了几个模糊词？标记了几个隐式假设？如果 0，说明你可能没在深挖。每轮结束前想一下。
```

### 3.3 领域背景（P1，Persona 之后新增）

```
### 领域背景（政府医保财政系统）
你面对的是政府医保基金管理平台（SMIFC），涉及以下关键领域概念——

**资金管理**：
- 基金收支（smr/smrts）：医保基金收入、支出、划拨、结算；涉及财务对账和审计
- 预付结算（smps）：预付款、结算划拨、资金流转
- 风险监控（smrw）：基金风险预警、异常检测

**银行对接**：
- 银医直联（smsbm）：与银行实时通信（HTTP/WebService/Socket）
- 银行扩展（smbe）：不同银行（工行、农行、建行等）的参数配置与协议差异
- 支付流水线：密码校验→监控→确认→拆批→执行（monitorCode 0/1/2）
- 对账系统：多方智能对账（smrm），批次处理，差异处理

**多区域**：
- province 字段存在即表示该功能有区域差异
- smip 模块按省份覆盖基线行为（四川/海南/宁夏各有不同）
- 前端按 NODE_ENV 选择区域入口，不同区域有不同 router.js
- PM 说某功能时追问：'这个功能各省份是统一的还是需要单独配置？'

**安全合规**：
- 国密 SM2/SM3/SM4 加密
- CA 证书认证（各省供应商不同）
- 审计追踪要求（财政系统操作全留痕）
- 数据隔离：省级→市级→区县级多维可见性

**常见陷阱**（遇到时主动验证）：
- '可用额度'口径：预算指标 vs 账户余额 vs 两者取小？
- 财务年度切换：跨年数据如何处理？
- 批量操作：部分失败时回滚还是继续？
- 删除/作废：级联影响哪些关联数据？
- 多区域覆盖：smip/{province}/ 下是否已有定制实现？
```

### 3.4 扩展字段（P1，字段描述后新增）

```
### 扩展字段（开发者可直接使用的技术规范）
除业务字段外，以下**可选**字段可在 fields 中填写：

| 字段 | 何时填 | 内容示范 |
|------|--------|----------|
| apiContract | 涉及前后端交互时 | 'PATCH /api/fund/plans/batch-approve → {planIds[]} → {success[], failed[{id,reason}]}' |
| securityRules | 涉及权限/数据可见性 | '仅 fund_admin, finance_director 角色可操作；数据按 province 隔离' |
| dataChanges | 涉及表结构变更 | 'payment_plan 表加 batch_approve_status TINYINT(1) DEFAULT 0' |
| errorScenarios | 涉及失败路径 | '1) 部分提交失败→单独提示；2) 超时→显示"提交中"状态' |
| configChanges | 涉及配置/部署 | '新增 feature.toggle.batch_approve 开关；各省独立配置' |
| performance | 涉及批处理 | '单次批量上限 500 条；超过 100 条提示"正在处理"' |

**注意**：不填不影响 PM 定稿；填了大幅减少研发澄清成本。
```

### 3.5 多区域分析（P1，扩充现有 province 字段指导）

```
### 多区域分析
- province 字段填**该功能首次上线范围**（如 '四川省' 或 '全国统一'）
- 跨区域功能需在 toBe 中注明各省差异点
- 发现 smip 目录下有对应省份覆盖 → 提示 PM 该功能已有区域定制
- 不同区域 bank.properties 不同 → 涉及银行对接时单独标注
```

### 3.6 API 合约与异常路径（P1，codePaths 说明后新增）

```
### API 合约与异常路径
- 涉及前后端交互时：读对应 Controller 的 list_methods，记录请求方法/路径/参数
- 错误处理：读 Controller 的 try-catch 和全局异常处理类
- 状态码：注意前端 Axios 拦截器对 401/403/500 的处理方式
- 超时/重试：现有系统是否有请求重试机制？
- 幂等性：批量操作接口是否幂等？

这些发现写入 codePaths，不需要 PM 理解细节，但研发可以直接用。
```

### 3.7 待定项管理（P0，补充到「最小公约」部分）

```
### 待定项管理
- 标记为'待确认'的规则：**本轮对话结束时**如果 PM 还没确认，在 openQuestions 中保留
- 跨 session 后重新打开清单：先检查之前标记的待确认项
- 如果 PM 改口或范围变化 → 更新已有条目，勿同时保留矛盾描述
- 导出前扫描：如果有 toBe 含'待确认'且 PM 未表态 → 在导出中标记
```

### 3.8 formatModeHint 修改（P0）

**当前：**
```
已切换写需求模式：维护最小公约清单（可渐进落条）；导出完整 PRD 仅在用户明确要求时。
```

**替换为：**
```
已切换写需求模式：
1. 维护最小公约清单：读码填 asIs/codePaths，渐进 update（可待确认），出口 readyToFinalize 严格。
2. 深度探询：发现模糊词（自动/优化/兼容/支持）→ 追问；发现隐式假设 → 分类进 openQuestions。
3. blockingQuestion 仅 1 个；其余 openQuestions 标注类别。
4. 若本会话已读过代码，优先复用填 asIs/codePaths，勿编造。
5. 导出完整 PRD 仅在用户明确要求时。
```

---

## 4. 工具/工作流改造建议

### 4.1 工具改造

#### P1：单条 upsert 工具

新增 `upsert_requirement`，参数：`id`（"new" 或已有 id）、`title`、`type`、`fields`（完整 fields 对象）。
保留 `update_requirement_draft` 作为兼容别名。

**理由**：批量提交导致 merge 出空壳第二条的失败模式。单条 upsert 更匹配模型擅长的模式。

#### P1：扩展 RequirementItem 字段模型

在 `RequirementFieldKey` 中新增：
```
apiContract | securityRules | dataChanges | errorScenarios | configChanges | performance
```

#### P2：verify_requirement_assumption 工具

正式化「PM 断言 X → Agent grep/read 核实」的模式：
```
tool("verify_requirement_assumption", { claim: string })
→ { status: "SUPPORTED" | "PARTIAL" | "CONTRADICTED", evidence: string[] }
```

#### P2：导出质检（Phase 4）

在导出前扫描：toBe 未确认？acceptance 为空？openQuestions 未分类？blockingQuestion 仍设着？发现问题时在导出文档顶部加警告（不阻断导出）。

#### P3：categorize_requirements + validate_scope

处理 PM 单轮倾倒数条需求的场景。`categorize_requirements(text)` 返回候选分类，`validate_scope(text, existingDraft)` 检查重叠。

### 4.2 工作流改造

#### 多需求倾倒处理

当 PM 在单轮中提出 3+ 不同域需求时：
1. 确认收到所有条目，用业务语言简要复述
2. 分类/分组：哪些模块？新增 vs 修改？
3. 提出顺序：「我先看支付计划，逐一处理？」
4. 逐项走读代码 → 填 asIs → 渐进 update

**关键约束：绝不一次 draft 2 条以上**。

#### 技术深度 checklist（readyToFinalize 前内省）

1. API contract：是否读过相关 Controller？
2. Error handling：失败怎么办？
3. Security：谁能操作？数据范围？
4. Region：是省份特有的吗？
5. Performance：批量大小？超时？
6. Existing code：是否已有类似实现？

这是 Agent 的**内省步骤**，不是对 PM 的问卷。

---

## 5. 多区域多模块银行财政项目的专属适配

### 5.1 模块速查（建议创建 hint 文件）

```
# SMIFC 模块速查
| 模块 | 简称 | 职责 | 关键入口 |
|------|------|------|----------|
| smc | 核心 | 公共工具、枚举、配置 | smc/**/* |
| smr | 基金收入 | 医保基金收入管理 | smr/controller, smr/service |
| smps | 预付结算 | 预付款、结算划拨 | smps/controller/**/Settlement*.java |
| sbm | 银医直联 | 银行通信 | sbm/controller/Bank*.java |
| smbe | 银行扩展 | 各银行协议实现 | smbe/{icbc,abc,ccb,boc,psbc}/** |
| smrm | 多方对账 | 智能对账 | smrm/controller/Reconcile*.java |
| smrw | 风险监控 | 基金风险预警 | smrw/controller/Warning*.java |
| smcm | 表单配置 | 自定义表单 | smcm/controller/Form*.java |
| smip | 区域定制 | 各省覆盖 | smip/{sichuan,hainan,ningxia,...}/** |
```

### 5.2 银行领域专属考量

银行对接需求必须考虑：
1. **多银行协议差异**：工行 HTTP REST、农行 WebService、建行 Socket + RSA/DES 加密
2. **国密标准**：SM2/SM3/SM4，已在 smsbm/smbe 模块实现
3. **省区 CA 证书**：四川 vs 海南 vs 宁夏不同 CA 提供商
4. **支付流水线**：密码校验→监控→确认→拆批→执行（monitorCode 0/1/2）
5. **对账 V3 批次**：步长配置、更新方式（in/batch）
6. **异步支付**：XXL-Job 定时器 + Activiti 工作流
7. **银行配置**：`bank.properties` 每省独立

### 5.3 研发交接格式

出口格式应包含：
1. **PM 业务规格**（现有字段——page/control/asIs/toBe/acceptance）
2. **=== 研发参考 ===**（标注置信度）：
   - API 合约（Method、Path、请求/响应结构）
   - 模块影响列表
   - 省份覆盖影响（smip 情况）
   - 数据库迁移提示（表、列、索引）
   - 错误处理模式
   - 安全/权限角色
   - 对接系统集成点

每项标注：`（CONFIRMED）` / `（PARTIAL）` / `（INFERRED）`

### 5.4 跨会话连续性

当 PM 开始新会话讨论之前聊过的主题时：
1. 用 `session_search` 查找相关历史会话
2. 从 JSON 加载之前的 requirementDraft
3. 「上次聊过 XX，当时有 N 条待确认。继续还是新需求？」

### 5.5 Hints 文件治理模型

#### 谁可以写 Hints

| 角色 | 读 | 写/改 | 删除 |
|------|----|--------|------|
| **你（开发者）** | ✅ | ✅ | ✅ |
| **PM 用户**（通过对话或手动编辑） | ✅ | ✅ | ❌（需你确认） |
| **Agent（自动）** | ✅ | ❌ | ❌ |

**核心原则：hints 开放给人和 PM 编辑，但 Agent 不能自动写。**

理由：
- **权威性要求高**：hints 描述的是项目架构、模块边界、银行协议——这些必须跟代码一致。Agent 读代码后可能猜错，写错了会误导所有后续需求。
- **变化频率低**：架构不会像用户偏好那样每天变。不需要 Agent 频繁更新。
- **双人验证**：hints 的信息需要「代码证据 + 人确认」才算可信。

#### Agent 发现 hints 过时了怎么办

Agent 在探索代码时发现 hints 与实际情况不符 → **在对话中提出来**，不自动写：

> 「我注意到 smsbm 模块的目录结构跟 hints 里写的不太一样，需要更新吗？」

就像资深工程师 review 文档时提 comment 而不是直接 merge PR。最终更新由人确认。

#### 技术实现

利用现有的 `.agent/hints/` 目录 + `get_business_hints`（列表） + `read`（读内容）。编辑通过标准的 `write` 工具操作。

不需要新增工具或权限系统——约束通过在 prompt 中明确告知 Agent「你只读 hints，不写 hints」来实现。

---

## 6. 优先级排序

### P0 — 速赢（Prompt 改动，今天可做）

| # | 改动 | 文件 | 难度 | 效果 |
|---|------|------|------|------|
| 1 | Persona 重写：从助手→资深 PM | `pm-prd.ts` | 5 min | 最高杠杆 |
| 2 | 深度探询章节（模糊词+隐式假设） | `pm-prd.ts` | 15 min | 降低「该问没问」 |
| 3 | 待定项管理 | `pm-prd.ts` | 5 min | 跨会话 draft 更干净 |
| 4 | formatModeHint 增强 | `format-context-v1.ts` | 5 min | 模式切换时更清晰 |
| 5 | draftSummary 待确认计数 | `format-requirement-draft.ts` | 15 min | 每轮可见待确认数 |

### P1 — 短期（1-2 天）

| # | 改动 | 位置 | 效果 |
|---|------|------|------|
| 6 | 领域背景（医保财政） | `pm-prd.ts` | 首次交互就理解领域 |
| 7 | 多区域分析指导 | `pm-prd.ts` | 阻止"一个设计只在一个省能跑" |
| 8 | API 合约与异常路径 | `pm-prd.ts` | codePaths 质量大幅提升 |
| 9 | 扩展字段类型 | `shared-types` + `store` | 研发可用结构化技术规格 |
| 10 | 单条 upsert 工具 | `requirement-draft-tools.ts` | 消除批量 merge 问题 |
| 11 | 技术深度 checklist | `pm-prd.ts` | readyToFinalize 更可靠 |

### P2 — 中期（3-5 天）

| # | 改动 | 效果 |
|---|------|------|
| 12 | verify_requirement_assumption 工具 | 正式化「断言→验证」模式 |
| 13 | 导出质检 | 导出产物自动标记待确认 |
| 14 | context bridge（record_finding） | 探索→PRD 模式无缝衔接 |
| 15 | module-overview hint 文件 | Agent 知道每个模块做什么 |
| 16 | banking-domain hint 文件 | 银行需求高质量覆盖 |

### P3 — 长期（按需）

| # | 改动 | 说明 |
|---|------|------|
| 17 | categorize_requirements + validate_scope | 多需求倾倒场景 |
| 18 | 跨会话连续性 prompt 指导 | 复用现有 session_search |
| 19 | 研发交接格式结构化 | 导出时带置信度 |
| 20 | PM_TEST_RECORD 自动化回归 | 维护 prompt 改动的护城河 |

### 建议时间线

```
Week 1: P0（1-5）+ P1（6-9）— 所有 prompt 改动 + 扩展字段类型
Week 2: P1（10-11）— 单条 upsert + 技术 checklist
Week 3: P2（12-14）— 核心工具增强
Week 4: P2（15-16）— 领域 hint 文件 + 回归测试
```

---

## 7. 验收标准

### 标准场景测试

| # | 场景 | 通过标准 |
|---|------|----------|
| T1 | 基金支出/支付计划（沿用 `PM_TEST_RECORD.md`） | toBe **无**未确认规则；有口径相关 blocking/open；asIs 来自读码 |
| T2 | 用户管理改性别 | 1 条业务需求；不拆前后端；反问「弹窗确认？」 |
| T3 | 跨模块（对账+支付） | openQuestions 列联调点；codePaths 标注模块交叉 |
| T4 | 多需求倾倒 | Agent 不一次 draft 多条；先分类再逐项 |
| T5 | 银行对接需求 | 自动问「涉及哪几家银行？各省配置？协议差异？」 |

### Persona 测试

- 第一个回复不再是"我来协助你整理需求"——而是像资深 PM 一样总结现状、点出第一个 gap
- 当 PM 说模糊表述时，Agent 追问具体口径
- 当 PM 说"现在额度的算法是…"时，Agent 用 grep/read 核实而非直接相信

### 主观标准

- PM：「感觉 Agent 在帮我**想**需求，不是在帮我**填**需求」
- 研发：「看 codePaths 里的 API 合约和 error 场景，可以直接开工」

---

## 附录：文件变更清单

| 文件路径 | 改动 | 优先级 |
|----------|------|--------|
| `packages/context/src/prompt/pm-prd.ts` | Persona 重写 + 深度探询 + 领域背景 + 多区域 + API 合约 + 待定项管理 + 扩展字段文档 + 技术 checklist | P0-P1 |
| `packages/context/src/format-requirement-draft.ts` | `formatRequirementDraftBriefSummary` 追加待确认计数 | P0 |
| `packages/context/src/format-context-v1.ts` | `formatModeHint` 扩展 | P0 |
| `packages/shared-types/src/requirement-draft.ts` | `RequirementFieldKey` 新增 6 个字段 | P1 |
| `packages/agent-runtime/src/requirement-draft-store.ts` | `normalizeFields` 支持新字段 | P1 |
| `packages/agent-runtime/src/requirement-draft-tools.ts` | 新增 `upsert_requirement` 工具 | P1 |
| `.agent/hints/module-overview.md` | 新建：SMIFC 模块速查 | P2 |
| `.agent/hints/banking-domain.md` | 新建：银行对接领域知识 | P2 |
