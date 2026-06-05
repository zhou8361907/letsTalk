---
topic: SMIFC 核心数据模型与数据流
pages:
  - workFront/src/pages/common/smc/
  - workFront/src/pages/common/smsbm/
  - workFront/src/pages/common/smr/
  - workFront/src/pages/common/smrts/
  - workFront/src/pages/common/smrm/
  - workFront/src/pages/common/smps/
  - workFront/src/pages/common/smrw/
  - workFront/src/pages/common/smda/
backend:
  - workBack/com.yonyougov.smc-8.31/
  - workBack/com.yonyougov.smsbm-8.31/
  - workBack/com.yonyougov.smr-8.31/
  - workBack/com.yonyougov.smrm-8.31/
  - workBack/com.yonyougov.smps-8.31/
---

# SMIFC 核心数据模型与数据流

## 一、业务实体总览

SMIFC 的业务数据围绕"医保基金"这一核心概念展开，主要涉及以下实体群组：

```
单位/机构 ──→ 医保账户 ──→ 银行账户
    │                          │
    │                   ┌──────┴──────┐
    │                   │             │
    ├──→ 基金收入    银行流水    基金支出
    │      (smr)      (smsbm)     (smps/smrts)
    │                   │             │
    │                   └──────┬──────┘
    │                          │
    └──────────→       对账匹配
                       (smrm)
```

---

## 二、核心表与业务说明

以下列出各模块最核心的业务表。实体命名以实际 Java 类名为准，数据库表名以 DDL 为准。

### 2.1 基础信息表（smc 模块）

**单位/机构表**
- 业务含义：参保单位、医疗机构、两定机构等
- Java 实体：Unit 等（具体实体名需按代码确认）
- 关键字段：单位编码（unitCode）、单位名称（unitName）、机构类型、行政区划、启停状态
- 出现位置：多个模块的外键引用来源

**银行账户表（Bank Account）**
- 业务含义：单位在银行的结算账户信息
- 关键字段：账户编码、银行账号、开户行行号、银行编码（bankCode，字符串存储，非枚举）、账户类型、账户状态
- 注意：
  - 一个单位可以有多个银行账户，分别用于不同险种或支付类型
  - 银行编码（bankCode）以字符串形式存储，**不存在名为 BankCodeEnum 的 Java 枚举**——bankCode 是各实体上的普通字符串字段

**基金款项表（SmcFund，表名 SMC_FUND）**
- 业务含义：医保基金款项分类。**不存在独立的 InsuranceType 实体或 FundSubject 实体**。险种信息和基金科目信息均存储在 SmcFund 内。
- 关键字段：insuranceCode（险种编码）、insuranceName（险种名称）、fundCode（基金编码）、fundName（基金名称）

**数据字典表**
- 业务含义：全平台统一的码表，用于业务类型的标准化
- 关键字段：字典编码（typeCode，如 `SIGN_SERVER`）、字典项编码（asCode，如 `IP`、`PORT`）、字典值（asValue）
- 覆盖范围：支付类型、业务类型、费用类别、状态码等全系统共用码表

**业务类型**：**不存在独立的 BusinessType 实体表**。业务类型字段（businessCode、payBusinessType、businessType）作为字段存在于各业务实体（如 MedicalBankEntity、SmccSummary）上。

### 2.2 基金账表（smc + smr + smps/smrts）

**基金账表说明**：不存在独立的 FundAccountBalance（基金账户余额表）实体。基金余额相关信息作为字段或通过查询计算得出。

### 2.3 银行支付表（smsbm 模块）

**银行支付主表（MedicalBankEntity，表名 SMSBM_MEDICAL_BANK）**
- 业务含义：记录每一笔发往银行的支付请求及处理结果。这是最核心的业务表，贯穿支付全流程。中文描述"银医直连汇总支付凭证表"。
- 关键字段（以实际代码为准）：
  - `fundBatchNum` —— 基金批次号（**注意：字段名是 fundBatchNum，不是 fundBatchNo**），系统内部唯一标识一次业务操作
  - `serialNo` —— 银行流水号（**不是 bankSerialNo**）
  - `amount`/`transAmt` —— 交易金额
  - `dataStatus`/`dataState` —— 交易状态（**不存在 transStatus 字段**）
  - `payBankCode`/`receiveBankCode` —— 银行编码（字符串，**不存在 BankCodeEnum 枚举**）
  - `businessCode` —— 业务编码
  - `payBusinessType` —— 支付业务类型
  - 收款人账号、户名、开户行
  - 支付日期、回执日期
  - 失败原因（`failReason`）
  - **注意**：实体中**不包含** `encryptionRequestMessage` 或 `encryptionResponseMessage` 字段。加密前后报文存储在其他位置或 DTO 中，不被持久化到此实体。

**支付状态（PayState 枚举）**：
- `PRESENDING('0')` —— 待发送
- `SENDING('1')` —— 发送中
- `SENDINGSUCCESS('2')` —— 发送成功
- `SENDINGFAILURE('-2')` —— 发送失败
- `TRANSFERSUCESS('3')` —— 转账成功（注意拼写：SUCESS 非 SUCCESS）
- `TRANSFERFAILURE('-3')` —— 转账失败
- `PAYSUCCESS('4')` —— 支付成功
- `PAYFAIlURE('-4')` —— 支付失败（注意 I 大写）
- `TRANSFER_PROCCESS('5')` —— 转账处理中（PROCCESS 拼写）
- `RETURN_SUCCESS('6')` —— 回执成功
- `REWRITE_SUCCESS('7')` —— 重写成功
- `REWRITE_FAILURE('-7')` —— 重写失败
- `VALIDATEFAILURE('-9')` —— 校验失败

**补充状态（PayBillStatus 枚举）**：
- `UNPAID('00')` —— 未支付
- `SIGN_SUCC('04')` —— 签名成功
- `SIGN_FAIL('05')` —— 签名失败
- `CANCEL_PAY('09')` —— 撤单/止付
- `BANK_PROCCESS('10')` —— 银行处理中
- `RE_PAYED('11')` —— 重新支付
- `PRE_AMT_WRITE_OFF('12')` —— 预付款核销
- `MANUAL_PAY_AUDIT('13')` —— 人工支付审核
- `BACK_PROCESSING('14')` —— 回执处理中

**支付明细表（PaymentsDetail，表名 SMAM_PAYMENTS_DETAIL）**
- 业务含义：账户往来明细，银行交易流水的记录实体。**并非"银行流水表（DayBook）"**。
- 关键字段：serialNum、dealDate、drFlag（借贷方向）、oppoSideNo/oppoSideName（对方账户）、amount、summary

**日记账（DayBook）**
- 业务含义：财务云日记账模块，由银行流水（PaymentsDetail）生成的财务日记账，**不是银行流水表本身**。

### 2.4 基金收入表（smr 模块）

**征收计划表（Collection Plan）**
- 业务含义：医保费征收计划（通常是月度/季度计划）
- 关键字段：计划编码、险种、征收期间、计划金额、已征收金额、状态

**收入明细表（Income Detail）**
- 业务含义：各类基金收入的具体明细记录
- 类型按来源区分：转移收入、财政补贴收入、利息收入、下级上缴、上级补助等
- 共性字段：收入类型、收入日期、收入金额、对方单位、业务类型、凭证号

**退款表（Refund）**
- 业务含义：收入退款（如多收退费）
- 关键字段：原收入记录ID、退款金额、退款原因、审批状态

**未知来款表（Unknown Payment）**
- 业务含义：银行收款但无法自动匹配到对应征收计划的来款，需要人工认领
- 关键字段：银行流水号、金额、来款日期、来源行名、认领状态

### 2.5 对账表（smrm 模块）

**对账实体说明**：smrm 模块不以"Bank Statement"或"Reconciliation Result"命名实体，而是使用以下实体名：
- `CollectRecStatement` —— 汇总对账记录（对账单）
- `DetailRecRecord` —— 明细对账记录
- `DetailRecDiff` —— 对账差异记录
- `CollectRecRecord` —— 汇总对账结果

**汇总对账单（CollectRecStatement）**
- 业务含义：经审批后的汇总对账结果，可上报
- 关键字段：汇总期间、总笔数、总金额、相符笔数、差异笔数、审批状态

**明细对账记录（DetailRecRecord）**
- 业务含义：系统记录与银行流水逐笔核对的结果
- 关键字段：系统记录ID、银行流水ID、核对金额、差异金额、核对状态（匹配/差异/缺失）

### 2.6 风险监控表（smrw 模块）

**预警规则表（Alert Rule）**
- 业务含义：定义风险预警的条件和阈值
- 关键字段：规则编码、规则名称、预警指标、阈值（金额/百分比/频次）、生效状态

**预警任务表（Alert Task）**
- 业务含义：每次预警扫描的执行记录
- 关键字段：执行时间、扫描范围、触发规则数、疑点数、执行状态

**疑点数据表（Alert Doubt Data）**
- 业务含义：预警扫描发现的疑点记录
- 关键字段：关联业务表、记录ID、疑点类型、疑点说明、风险等级、处理状态

### 2.7 预结算表（smps 模块）

**基金比例配置表（Fund Ratio）**
- 业务含义：定义预付结算基金的比例（如：某险种基金按 90% 预付）
- 关键字段：险种、基金类型、预付比例、生效日期、失效日期

**月度支付申请表（Monthly Pay Apply）**
- 业务含义：单位按月申请的支付计划
- 关键字段：申请编码、申请单位、申请期间、申请金额、审批状态

**定额配置表（Unit Norm）**
- 业务含义：单位的基金使用定额（总额度）
- 关键字段：单位、险种、定额类型（年度/月度）、定额金额、已使用金额、剩余金额

---

## 三、关键字段 CROSS-CUTTING 模式

以下字段模式在多张表中反复出现，但**字段名在各模块间并不统一**：

| 字段模式 | 实际字段名（按模块） | 出现位置 |
|---------|-------------------|---------|
| 基金批次号 | fundBatchNum（smsbm MedicalBankEntity）、fundBatchNo（SmccSummary） | 支付、清算 |
| 银行编码 | payBankCode/receiveBankCode（字符串，非枚举） | 支付、账户、对账、配置 |
| 险种编码 | insuranceCode（SmcFund） | 款项、账户、收入、支出、预算 |
| 单位编码 | unitCode | 几乎所有业务表 |
| 交易金额 | amount/transAmt | 支付、收入、对账、预算 |
| 交易状态 | dataStatus/dataState（MedicalBankEntity）、dataState（SmccSummary） | 支付、对账、审批 |
| 业务类型 | businessCode/payBusinessType（MedicalBankEntity）、businessType（SmccSummary） | 支付、收入、支出 |
| 统筹区划 | regionCode | 单位、账户、基金 |

**关键注意**：跨模块引用字段时务必确认实际字段名。以下在原始文档中声称存在但实际上**不存在**的字段：
- `fundBatchNo`（应为 `fundBatchNum`）
- `bankSerialNo`（应为 `serialNo`）
- `transStatus`（应为 `dataStatus`/`dataState`）
- `encryptionRequestMessage` / `encryptionResponseMessage`（不存在于任何持久化实体）
- `businessTypeCode`（不存在，各实体使用自己的命名）
- `insuranceTypeCode`（不存在，使用 `insuranceCode`）

---

## 四、数据流向

### 4.1 支付数据流

```
前端发起支付
    ↓
smsbm Controller 创建 MedicalBankEntity（表 SMSBM_MEDICAL_BANK）
    ↓
组装报文 -> 加密 -> 发送银行
    ↓
银行返回 -> 解密 -> 解析结果
    ↓
更新 MedicalBankEntity 状态（dataStatus/dataState）
    ↓
（异步）银行回执到达 -> 再次更新状态
    ↓
对账模块（smrm）比对银行流水
```

**关键规则**：
- 一笔支付从创建到完成至少经过两次状态更新（发送结果 + 回执结果）
- 批量支付包含主单状态和明细状态
- 超时未回执的需通过 Xxl-Job 定时任务轮询

### 4.2 收入数据流

```
外部系统/银行收款
    ↓
smda 数据交换（导入银行收款数据）
    ↓
smr 业务处理（识别来源、匹配征收计划）
    ↓
匹配成功 -> 入账（更新基金余额/款项）
匹配失败 -> 进入未知来款（人工认领）
    ↓
退款/上缴/转移等特殊处理
```

**关键规则**：
- 收入来源多样（保费、财政、利息、上缴/下拨等），处理逻辑各异
- 未知来款需人工干预
- 各类收入最终汇总到基金款项余额

### 4.3 对账数据流

```
银行侧：导出银行流水 / 对账单
    ↓
导入 smrm 模块（银行对账单管理）
    ↓
系统侧：smr 收入记录 + smsbm 支付记录
    ↓
对账引擎 v1/v2/v3 逐笔匹配
    ↓
匹配结果：相符 / 差异 / 系统有银行无 / 银行有系统无
    ↓
差异处理（人工核查 / 自动调整 / 生成凭证）
    ↓
汇总上报（提交 + 审批流程）
```

**关键规则**：
- 对账支持三个版本引擎并行，选择哪一个由配置控制
- 对账周期通常为日/月
- 差异处理需要人工审批

### 4.4 省份/区域定制化数据流

SMIFC 的一大重要但常被遗漏的数据流特性是省份维度的定制。各省有独立的加密协议和 HTTP Server 实现，数据经过以下区域定制路径：

```
业务数据（基线模块）
    ↓
ProvinceTypeFilter 按 app.province 加载省份 Bean
    ↓
EncryptEnum 按省份映射加密标志和 HTTP Server 类
    ↓
省份特定 EncryptionHandle（位于 smbe/direct/client/xinjiang/handle/）
    ↓
银行通信（基线或省份定制）
```

支持省份包括：新疆、新疆兵团、甘肃、重庆、广西、内蒙古、福建、吉林、宁夏、四川、河南、浙江等，每个使用不同的加密提供商（JIT/SWXA/JNTA/XASJ/自定义）和 HTTP 服务端。

---

## 五、金额与财务模式

### 5.1 金额精度

- 数据库中所有金额字段使用 `DECIMAL(18,2)` 或 `DECIMAL(18,4)`（具体取决于字段）
- Java 中使用 `BigDecimal`，严禁使用 `Double` 或 `Float`
- 单位统一：全系统使用"元"，部分银行接口使用"分"，需在对接时转换

### 5.2 借贷方向

收入和支出采用借贷记账法思维：
- 收入类：借方增加（银行收款），贷方减少（退款）
- 支出类：借方减少（支付），贷方增加（追回）
- 余额 = 期初余额 + 本期借方 - 本期贷方

### 5.3 状态模式

业务单据普遍使用状态机模式，典型状态流：
```
新建 -> 待提交 -> 已提交 -> 审批中 -> 已审批 -> 已处理
                                                    │
                                            已驳回 <-┘
```
不同业务的状态机略有差异，但规律相似：
- 支付：创建 -> 发送 -> 成功/失败/异常（详见 PayState 枚举）
- 收入：创建 -> 入账 -> 确认/退款
- 对账：导入 -> 匹配 -> 核对 -> 审批 -> 上报
- 审批：待审批 -> 通过/驳回

---

## 六、数据字典使用

- 全系统的业务类型、状态码、分类等统一通过数据字典管理
- 新增枚举类型时优先扩展数据字典，而非硬编码到 Java 代码中
- 数据字典以 `typeCode` + `asCode` + `asValue` 三层结构组织（非 dictCode + dictValue）
- 前端通过接口 `/api/smc/commonBasicData/asListByCode?typeCode=XXX` 获取字典数据，用于下拉框等控件（**不是 `/dict/list`**）

---

## 七、跨模块数据引用

**重要原则**：smc 模块提供了全系统共享的实体和 Mapper，大部分业务表的外键关系都指向 smc 定义的基础表。

```
smc 基础实体                  各模块业务实体
──────────────────            ──────────────────────
Unit (单位)  ────────────────  Payment 等
BankAccount (银行账户) ──────  Payment 等
Dict/字典 (typeCode+asCode) ─  Payment 等的 businessCode
SmcFund (基金款项) ──────────  Income 等的 fundCode
```

新增业务表时，优先使用 smc 已定义的基础实体作为外键，避免重复定义相同语义的字段。

**重要说明**：以下在原始设计文档中声称存在但实际**没有独立实体**的概念：
- Insurance Fund Type（独立表）—— 实际存储在 SmcFund 的 insuranceCode/insuranceName 字段
- Business Type（独立表）—— 实际是各实体上的 businessCode/payBusinessType 字段
- Fund Subject/Account（基金科目表）—— 实际使用 SmcFund（基金款项表）
- Fund Account Balance（基金账户余额表）—— 不存在
- Bank Statement（独立实体）—— 实际使用 CollectRecStatement
- Reconciliation Result（对账结果表）—— 实际使用 DetailRecRecord/DetailRecDiff
