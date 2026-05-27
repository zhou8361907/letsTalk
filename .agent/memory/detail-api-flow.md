---
topic: detail-api-flow
confidence: verified
updated_at: 2026-05-27T08:57:59.604Z
sources:
  - workBack/src/main/java/erp/controller/DetailController.java
  - workFront/src/views/Detail.vue
  - workFront/src/api/detailApi.js
  - workBack/src/main/java/erp/entity/Detail.java
  - workBack/src/main/java/erp/entity/dto/req/DetailFormReqDTO.java
  - workBack/src/main/java/erp/entity/dto/req/DetailQueryConditionDTO.java
  - workBack/src/main/java/erp/entity/dto/resp/DetailRespDTO.java
  - workBack/src/main/java/erp/service/DetailService.java
---

# 收支明细 (Detail) 接口流程

## 基础 URL

所有接口以 `/detail` 为前缀（请求转发至 `DetailController`）。

## 接口概览

### 1. 列表查询（分页 + 条件过滤）

- **前端调用**: `detailApi.list(queryCondition)` → `GET /detail`
- **后端**: `DetailController.list(DetailQueryConditionDTO dto)`
- **DTO 字段**:
  - `beginDate` / `endDate` — 日期范围（ISO datetime 格式）
  - `digest` — 摘要关键字（setter 自动转为 `%keyword%` 模糊匹配）
  - `projectId`, `accountId`, `departmentId`, `categoryId` — 下拉筛选条件
  - `currentPage`, `pageSize` — 分页参数
- **返回**: `Page<List<DetailRespDTO>>`，其中 `DetailRespDTO` 比 `Detail` 多一个 `hasPicture` 布尔字段
- **备注**: 前端 `Detail.vue` 每次 `loadData()` 将 `queryCondition` 与 `pageData` 合并传入

### 2. 单条查询

- **前端调用**: `detailApi.get(id)` → `GET /detail/{id}`
- **后端**: `DetailController.findOne(Integer id)`
- **返回**: `DetailRespDTO`
- **使用场景**: `openUpdateDetailDialog()` 修改前回填表单

### 3. 新增记录（2 步流程）

- **前端两步流程**:
  1. 填写表单后点击「下一步」→ `detailApi.add(detail)` → 后端返回新记录 ID → 进入图片上传步骤
  2. 在 Upload 组件上传图片到 `/detail/picture/{detailId}`
- **后端新增**: `DetailController.add(DetailFormReqDTO)` — `@PostMapping("")`, `synchronized`
  - 金额字段（earning/expense/balance）在 setter 中被处理为 **保留 2 位小数、直接舍弃（ROUND_DOWN）**
  - 日期时间重复会抛 `DuplicateKeyException`，捕获后返回失败消息
  - 返回新记录 ID（`form.getId()`）
- **后端图片上传**: `DetailController.addVouchers(MultipartFile, Integer detailId)` — `@PostMapping("/picture/{detailId}")`, `synchronized`

### 4. 修改记录

- **前端**: `openUpdateDetailDialog()` 先 `get(id)` 回填 → 修改后调用 `detailApi.update(detail)` → `PUT /detail`
- **后端**: `DetailController.update(DetailFormReqDTO)` — `@PutMapping("")`, `synchronized`
  - null 处理：earning → 0, expense → 0, digest → "无"
  - 金额同样 ROUND_DOWN 处理

### 5. 删除记录

- **前端**: `deleteDetail(index, row)` → `detailApi.delete(row)` → `DELETE /detail`
- **后端**: `DetailController.delete(Detail form)` — `@DeleteMapping("")`, `synchronized`
  - 请求体包含 `{id, date, expense, earning, account}`
- **级联**: 删除记录时 Service 层会级联删除关联的图片（文件 + 数据库记录）

### 6. 重算所有余额

- **前端**: 未直接调用（后台管理操作）
- **后端**: `DetailController.updateBalance()` → `PUT /balance`, `synchronized`
  - 调用 `detailService.updateAllBalance()`

### 7. 凭证图片管理

| 操作 | 前端 API | HTTP |
|------|----------|------|
| 上传图片 | `detailApi.addVouchers()` 内部通过 Upload 组件上传 | `POST /detail/picture/{detailId}` |
| 列表图片 | `detailApi.listPicture(detailId)` → `GET /detail/picture/{detailId}` | `GET /detail/picture/{detailId}` |
| 删除单张图片 | `detailApi.deletePicture(pictureId)` → `DELETE /detail/picture/{pictureId}` | `DELETE /detail/picture/{pictureId}` |
| 获取图片文件 | 前端拼接 URL: `${baseUrl}/detail/picture/img/${uri}` | `GET /detail/picture/img/{fileName}` |

- **按需加载**: 前端行展开折叠面板时才通过 `showPicture()` 调用 `listPicture`
- **图片展示 URL**: `Detail.vue` 中 `i.url = \`${this.baseUrl}/detail/picture/img/${i.uri}\``
- **上传成功后的数据刷新**:
  - 新记录上传图片 → 设置对应行的 `hasPicture = true`
  - 已有记录上传图片 → 重新请求 `listPicture` 更新行内 `pictures` 数组

## 前端分页

- 组件: `el-pagination`
- 参数: `pageData.currentPage`（默认 1）、`pageData.pageSize`（默认 25，可选 25/50/100/500）
- 切换后调用 `loadData()`，后端使用 MyBatis-Plus `Page` 机制

## 前端下拉选择数据

- `Detail.vue` 的 `loadSelectionData()` 调用 `optionApi.getAll()` 加载项目、账户、部门、类别信息
- 在 created 和 `openUpdateDetailDialog` 中均会调用

## 额外：报销凭证生成

- 选中多条记录（最多 7 条）→ 点击「生成报销凭证」→ `excelApi.generateExpenseClaimForm(data)` → 后端生成 Excel 文件，返回 formId → 前端 `window.open(baseUrl + /excel/expenseClaimForm?formId=...)` 下载
- 已报销记录会被标记 `reimbursement = true`

## 实体关系

```
Detail
├── id (自增主键)
├── date (日期时间, 唯一约束)
├── project (关联 Project 对象)
├── account (关联 Account 对象)
├── department (关联 Department 对象)
├── category (关联 Category 对象)
├── earning / expense / balance (BigDecimal, 2位小数)
├── digest (摘要, 最长255)
├── reimbursement (是否已报销)
├── createTime / alterTime (自动填充)
└── hasPicture (仅在 DetailRespDTO 中存在, 非持久化)
```
