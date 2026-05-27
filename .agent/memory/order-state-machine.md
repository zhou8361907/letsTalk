---
topic: order-state-machine
confidence: verified
tags: [Detail, 收支, 状态]
updated_at: 2026-05-27T00:00:00.000Z
sources:
  - workFront/src/views/Detail.vue
  - workBack/src/main/java/erp/controller/DetailController.java
---

收支明细（Detail）核心流程：

1. 列表分页查询：`GET /detail`，条件 DTO 含 currentPage、pageSize。
2. 新增：`POST /detail`，表单 DetailFormReqDTO；后端 synchronized，日期时间不允许重复。
3. 修改：`PUT /detail`，金额字段 null 会置 0，摘要 null 置为「无」。
4. 删除：`DELETE /detail`，body 传 Detail（含 id）。
5. 余额重算：`PUT /detail/balance`，批量更新余额字段。
6. 凭证图片：POST/GET/DELETE `/detail/picture/...` 与明细 id 关联。

前端提交前通常校验金额；具体校验见 Detail.vue 表单 rules。
