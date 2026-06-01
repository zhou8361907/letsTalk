---
topic: 资金抵扣台账（河南）
kind: glossary
confidence: verified
aliases: [抵扣, 资金抵扣, 抵扣金额, fund deduction ledger, deductAmt, 暂停支付, 停用]
updated_at: 2026-06-01T06:18:05.490Z
sources:
  - workFront/src/pages/projects/HNYYB/smrts/medicalOffice/medicalInsPaymentPlanApply.vue
  - workBack/com.yonyougov.smip-8.31/src/main/java/com/yonyougov/smifc/henan/smrts/controller/HeNPayPlanController.java
  - workBack/com.yonyougov.smip-8.31/src/main/java/com/yonyougov/smifc/henan/smrts/service/impl/FundDeductionLedgerServiceImpl.java
  - workBack/com.yonyougov.smip-8.31/src/main/java/com/yonyougov/smifc/henan/smrts/controller/FundDeductionLedgerController.java
---

## 资金抵扣台账（河南）

**含义：** 医保支付计划申请时，对某些医疗机构存在历史欠款、多付、违规扣款等情况，在本次拨付中直接扣减（抵扣），或因稽查等原因暂不拨付（暂停/停用）的资金管理台账。

**涉及页面前端：**
- `workFront/src/pages/projects/HNYYB/smrts/medicalOffice/medicalInsPaymentPlanApply.vue`（河南支付计划申请页面）
- 主列表「抵扣金额」列可点击打开「资金抵扣明细」弹窗

**后端入口：**
- Controller: `HeNPayPlanController`（河南定制）
- Service: `FundDeductionLedgerServiceImpl`（2300+ 行，河南 smip 模块）
- 关键方法：`getDeductionById`（查询）、`saveDeByPlan`（保存扣减）、`generateSettle`（生成结算单）

**数据表：**
- `FundDeductionLedger`（主表）、`FundDeductionLedgerItem`（子表明细）
- `FundDeductionLedgerDe`（抵扣明细）、`FundDeductionLedgerPause`（暂停/停用记录）
- `FundDeductionLedgerMain`（汇总后的主表）

**当前问题点（已知优化方向）：**
1. getDeductionById 存在 N+1 循环查询，大量单据时慢
2. saveDeByPlan 方法 300+ 行，循环内逐条 update，有死代码
3. generateSettle 无分页全表扫描
4. 无数据归档机制，表持续膨胀
