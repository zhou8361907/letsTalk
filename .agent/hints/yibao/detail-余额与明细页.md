---
topic: detail-余额与明细页
pages:
  - workFront/src/views/Detail.vue
backend:
  - workBack/src/main/java/erp/controller/DetailController.java
---

# 报销明细页（Detail）

## 业务说明

- 用户在此页查看/维护流水明细，涉及余额展示与重置类操作（以代码为准）。
- 问「明细」「余额」「Detail 页」时，优先看上述前端页 + DetailController。

## 提示

- 前端路径相对运行根：`workFront/src/views/Detail.vue`
- 后端接口：先 `list_methods` on DetailController，再 `read_method` 看具体方法
