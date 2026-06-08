# CLAUDE.md — letsTalk / SMIFC

本项目结合了 **Karpathy Guidelines**（通用编码规范）和 **letsTalk 领域特定规则**（SMIFC 医保财政系统）。

**使用原则**：对于简单任务（改文案、修 typo）可以跳过完整规范；对于非平凡任务，请遵循以下指南。

---

## 第一部分：Karpathy Guidelines（通用编码规范）

### 1. Think Before Coding — 先想再写

**不要猜。不要隐藏困惑。把取舍摊出来。**

- 把你的假设说清楚。如果不确定，问。
- 如果存在多种解释，都列出来——不要悄悄选一种。
- 如果有更简单的方案，说出来。该 push back 的时候 push back。
- 如果不清楚，停下来。说清楚困惑在哪。

### 2. Simplicity First — 简单优先

**只写解决问题的最小代码。不多写一行推测性的东西。**

- 不多写没要求的功能
- 只用一次的逻辑不做抽象
- 不写「以防万一」的灵活性
- 不处理不可能发生的错误场景
- 写了 200 行但 50 行就能搞定，重写

问自己：「资深工程师会说过度设计吗？」会→简化。

### 3. Surgical Changes — 手术刀式修改

**只动必须动的。只清理自己造成的混乱。**

改现有代码时：
- 不改旁边的代码、注释、格式化
- 不重构没坏的东西
- 匹配现有风格，即使你更喜欢另一种写法
- 发现无关的死代码，提一下——别删

改动造成孤儿时：
- 删掉你改动的代码导致不再被引用的 import/变量/函数
- 不改动已存在的死代码除非被要求

检验标准：**每行改动都应该能直接追溯到用户需求。**

### 4. Goal-Driven Execution — 目标驱动执行

**定义成功标准。循环直到验证通过。**

把任务转化成可验证的目标：
- 「加校验」→「写无效输入的测试→让测试通过」
- 「修 bug」→「写重现 bug 的测试→让测试通过」
- 「重构 X」→「确保重构前后测试都通过」

多步任务时列出步骤和验证点：
```
1. [步骤] → 验证: [检查项]
2. [步骤] → 验证: [检查项]
3. [步骤] → 验证: [检查项]
```

---

## 第二部分：letsTalk / SMIFC 项目特定规则

### 项目定位

SMIFC（医保基金监管平台）——多区域、多模块的政府医保财政系统。

### 关键模块速查

| 模块 | 简称 | 职责 | 代码入口 |
|------|------|------|----------|
| 基金收入 | smr | 医保基金收入管理 | smr/controller, smr/service |
| 预付结算 | smps | 预付款、结算划拨 | smps/controller/**/Settlement*.java |
| 银医直联 | smsbm | 银行通信（HTTP/WS/Socket） | smsbm/controller/Bank*.java |
| 银行扩展 | smbe | 各银行协议实现 | smbe/{icbc,abc,ccb,boc,psbc}/** |
| 多方对账 | smrm | 智能对账、批次处理 | smrm/controller/Reconcile*.java |
| 风险监控 | smrw | 基金风险预警 | smrw/controller/Warning*.java |
| 区域定制 | smip | 各省覆盖 | smip/{sichuan,hainan,ningxia,...}/** |
| 核心 | smc | 公共工具、枚举、配置 | smc/**/* |

### 需求整理模式（chatMode=prd 时）

详见 `packages/context/src/prompt/pm-prd.ts` 和 `.agent/hints/` 目录。

当进入 PRD 模式时：
- 遵循 PM_PRD_RULES 的深度探询规则
- 涉及具体模块时调 `get_business_hints` 看相关 hints
- 新功能场景 read `hints/pm-new-feature.md`
- 将结论写入 update_requirement_draft

### 架构约定

- **前端**：Vue + Webpack，按省份多入口（src/entrys/ 下 27 省目录）
- **后端**：Spring Boot（5.2.4.RELEASE），Maven 多模块
- **数据库**：Oracle/MySQL，MyBatis + Hibernate 混合
- **银行对接**：21 家银行适配器，ICBC HTTP REST、ABC WebService、CCB Socket+RSA/DES 等
- **区域差异**：smip 模块按省份覆盖，前端按 NODE_ENV 选择入口

### 行为红线

- ❌ 不自作主张给跨省需求出统一方案——标注各省差异，让 PM 决定
- ❌ 不在 codePaths 里写类名/方法名给 PM 看——用业务语言描述
- ❌ 不评估业务 ROI——只评估开发成本（低/中/高）
- ✅ 新功能场景先 read pm-new-feature.md 再动手
