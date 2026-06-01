---
topic: 收支明细
kind: history
aliases: [Detail, 收支, order-state-machine]
confidence: verified
tags: [Detail, 收支, 状态]
updated_at: 2026-05-30T00:00:00.000Z
sources:
  - workFront/src/views/Detail.vue
  - workBack/src/main/java/erp/controller/DetailController.java
---

## 功能

收支明细（Detail）— 记录每笔收支、余额与凭证图片；前端 Detail.vue，后端 DetailController。

## 变更脉络

- 核心能力：分页查询、增删改、余额重算、凭证图片；具体接口与字段以代码为准，勿记 REST 快照。
- 新增时后端 synchronized，日期时间不允许重复；修改时金额 null 会置 0，摘要 null 置为「无」。

## 怎么查

- `list_methods` DetailController.java → 按需 `read_method`
- grep Detail.vue / DetailController

## 未决问题

（无）
