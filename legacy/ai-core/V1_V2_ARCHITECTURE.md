# V1 + V2 完整架构设计

**创建时间**: 2026-05-21  
**核心愿景**: 让不懂代码的人能通过 Agent 读懂代码

---

## 🎯 核心理念

### V1 的目的
**提取业务知识** - 将代码转换为可查询的业务 Skills

### V2 的目的
**智能问答** - 让任何人都能理解代码逻辑

### 最终目标
**降低理解门槛** - 产品、实施、测试人员都能读懂代码

---

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户（不懂代码）                      │
│         产品经理 │ 实施人员 │ 测试人员 │ 业务人员        │
└────────────────────────┬────────────────────────────────┘
                         │ 自然语言提问
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  V2 - 智能问答 Agent                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │  理解问题 → 查询知识库 → 定位代码 → 生成回答    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ 查询
                         ↓
┌─────────────────────────────────────────────────────────┐
│              业务知识库（Skills Database）               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  页面 Skills │ 业务流程 │ 数据流向 │ 代码位置   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ 提取
                         ↓
┌─────────────────────────────────────────────────────────┐
│                V1 - 知识提取 Agent                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  解析代码 → 提取逻辑 → 建立映射 → 生成 Skills   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ 分析
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    源代码（Vue + Java）                  │
│         前端页面 │ API 接口 │ 后端服务 │ 数据库          │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 V1 - 知识提取层

### 目标
将源代码转换为结构化的业务知识（Skills）

### 输入
- Vue 页面文件
- Java 后端代码
- 数据库 Schema

### 输出
**Skill 定义**（扩展的 PageDataLineage）

```json
{
  "page_info": {
    "page_name": "Detail",
    "page_path": "/views/Detail.vue",
    "module": "财务管理",
    "description": "明细数据管理页面"
  },
  
  "skills": [
    {
      "skill_id": "detail_load_data",
      "skill_name": "加载明细数据",
      "skill_type": "query",
      "business_description": "页面打开时自动加载明细列表",
      
      "trigger": {
        "type": "lifecycle",
        "event": "mounted",
        "condition": null
      },
      
      "implementation": {
        "frontend": {
          "method": "loadData",
          "file": "Detail.vue",
          "line": 45,
          "code_snippet": "async loadData() { ... }"
        },
        "api": {
          "method": "GET",
          "url": "/api/detail",
          "params": {
            "accountId": "账户ID",
            "dateRange": "日期范围",
            "pageNum": "页码",
            "pageSize": "每页数量"
          },
          "response": {
            "code": "状态码",
            "data": {
              "list": "明细列表",
              "total": "总数"
            }
          }
        },
        "backend": {
          "controller": {
            "class": "DetailController",
            "method": "list",
            "file": "DetailController.java",
            "line": 38,
            "signature": "public R list(@RequestParam Map<String, Object> params)"
          },
          "service": {
            "class": "DetailService",
            "method": "findAll",
            "file": "DetailService.java",
            "line": 67,
            "logic": "分页查询 + 条件过滤"
          },
          "database": {
            "table": "t_detail",
            "operation": "SELECT",
            "conditions": ["account_id", "date_range"]
          }
        }
      },
      
      "data_flow": [
        "用户打开页面",
        "触发 mounted 生命周期",
        "调用 loadData() 方法",
        "发送 GET /api/detail 请求",
        "后端 DetailController.list() 接收",
        "调用 DetailService.findAll() 查询",
        "从 t_detail 表查询数据",
        "返回分页结果",
        "前端更新 tableData",
        "页面显示数据"
      ],
      
      "dependencies": [],
      "side_effects": ["更新 tableData", "更新 total"],
      
      "error_handling": {
        "frontend": "显示错误提示",
        "backend": "返回错误码和消息"
      }
    },
    
    {
      "skill_id": "detail_save",
      "skill_name": "保存明细数据",
      "skill_type": "mutation",
      "business_description": "新增或修改明细数据",
      
      "trigger": {
        "type": "user_action",
        "event": "click",
        "element": "保存按钮"
      },
      
      "implementation": {
        "frontend": {
          "method": "handleSave",
          "file": "Detail.vue",
          "line": 78,
          "validation": [
            "检查必填字段",
            "验证金额格式",
            "验证日期范围"
          ]
        },
        "api": {
          "method": "POST",
          "url": "/api/detail",
          "payload": {
            "id": "明细ID（修改时）",
            "accountId": "账户ID",
            "amount": "金额",
            "date": "日期",
            "description": "描述"
          }
        },
        "backend": {
          "controller": {
            "class": "DetailController",
            "method": "save",
            "file": "DetailController.java",
            "line": 52
          },
          "service": {
            "class": "DetailService",
            "method": "saveDetail",
            "file": "DetailService.java",
            "line": 89,
            "logic": "判断新增/修改 → 校验数据 → 保存 → 更新余额"
          },
          "database": {
            "table": "t_detail",
            "operation": "INSERT or UPDATE",
            "affected_tables": ["t_detail", "t_account"]
          }
        }
      },
      
      "data_flow": [
        "用户填写表单",
        "点击保存按钮",
        "前端校验数据",
        "调用 handleSave() 方法",
        "发送 POST /api/detail 请求",
        "后端 DetailController.save() 接收",
        "调用 DetailService.saveDetail() 处理",
        "校验业务规则",
        "保存到 t_detail 表",
        "更新 t_account 表余额",
        "返回成功结果",
        "前端刷新列表",
        "显示成功提示"
      ],
      
      "dependencies": ["detail_load_data"],
      "side_effects": [
        "刷新明细列表",
        "更新账户余额",
        "关闭编辑弹窗"
      ],
      
      "validations": {
        "frontend": [
          "金额不能为空",
          "金额必须大于0",
          "日期不能为空"
        ],
        "backend": [
          "账户必须存在",
          "金额不能超过限额",
          "日期不能是未来"
        ]
      },
      
      "error_handling": {
        "validation_failed": "显示具体错误信息",
        "save_failed": "显示保存失败提示",
        "network_error": "显示网络错误提示"
      }
    },
    
    {
      "skill_id": "detail_delete",
      "skill_name": "删除明细数据",
      "skill_type": "mutation",
      "business_description": "删除选中的明细数据",
      
      "trigger": {
        "type": "user_action",
        "event": "click",
        "element": "删除按钮"
      },
      
      "implementation": {
        "frontend": {
          "method": "handleDelete",
          "file": "Detail.vue",
          "line": 95,
          "confirmation": "弹出确认对话框"
        },
        "api": {
          "method": "DELETE",
          "url": "/api/detail",
          "params": {
            "ids": "明细ID列表"
          }
        },
        "backend": {
          "controller": {
            "class": "DetailController",
            "method": "delete",
            "file": "DetailController.java",
            "line": 78
          },
          "service": {
            "class": "DetailService",
            "method": "deleteDetail",
            "file": "DetailService.java",
            "line": 134,
            "logic": "检查权限 → 检查引用 → 删除 → 更新余额"
          },
          "database": {
            "table": "t_detail",
            "operation": "DELETE",
            "affected_tables": ["t_detail", "t_account"]
          }
        }
      },
      
      "data_flow": [
        "用户选中数据",
        "点击删除按钮",
        "弹出确认对话框",
        "用户确认删除",
        "调用 handleDelete() 方法",
        "发送 DELETE /api/detail 请求",
        "后端 DetailController.delete() 接收",
        "调用 DetailService.deleteDetail() 处理",
        "检查删除权限",
        "检查是否被引用",
        "从 t_detail 表删除",
        "更新 t_account 表余额",
        "返回成功结果",
        "前端刷新列表",
        "显示成功提示"
      ],
      
      "dependencies": ["detail_load_data"],
      "side_effects": [
        "刷新明细列表",
        "更新账户余额"
      ],
      
      "validations": {
        "frontend": [
          "必须选中数据",
          "需要用户确认"
        ],
        "backend": [
          "数据必须存在",
          "必须有删除权限",
          "不能被其他数据引用"
        ]
      },
      
      "error_handling": {
        "no_permission": "显示无权限提示",
        "has_reference": "显示被引用提示",
        "delete_failed": "显示删除失败提示"
      }
    }
  ],
  
  "business_flows": [
    {
      "flow_name": "完整的明细管理流程",
      "steps": [
        "detail_load_data",
        "detail_save",
        "detail_delete"
      ],
      "description": "用户可以查看、新增、修改、删除明细数据"
    }
  ]
}
```

### 关键特性

1. **完整的代码位置** - 精确到文件和行号
2. **清晰的数据流** - 从前端到后端到数据库
3. **业务描述** - 用自然语言描述功能
4. **依赖关系** - 哪些 Skill 依赖哪些
5. **副作用** - 执行后会影响什么
6. **错误处理** - 各种异常情况

---

## 🤖 V2 - 智能问答层

### 目标
让不懂代码的人能通过自然语言查询代码逻辑

### 核心能力

#### 1. 功能查询
```
Q: "Detail 页面有哪些功能？"

A: "Detail 页面提供以下功能：
1. 加载明细数据 - 页面打开时自动加载
2. 保存明细数据 - 新增或修改明细
3. 删除明细数据 - 删除选中的明细

每个功能都有完整的前后端实现。"
```

#### 2. 实现查询
```
Q: "保存功能是怎么实现的？"

A: "保存功能的完整实现：

【前端部分】
- 文件：Detail.vue 第 78 行
- 方法：handleSave()
- 逻辑：
  1. 校验表单数据
  2. 发送 POST 请求
  3. 处理返回结果

【API 接口】
- 地址：POST /api/detail
- 参数：id, accountId, amount, date, description

【后端部分】
- Controller：DetailController.save() (第 52 行)
- Service：DetailService.saveDetail() (第 89 行)
- 逻辑：
  1. 判断新增还是修改
  2. 校验业务规则
  3. 保存到数据库
  4. 更新账户余额

【数据库】
- 表：t_detail, t_account
- 操作：INSERT or UPDATE

需要查看具体代码吗？"
```

#### 3. 流程查询
```
Q: "用户保存数据时，系统做了哪些操作？"

A: "保存数据的完整流程：

1. 用户填写表单
2. 点击保存按钮
3. 前端校验：
   - 金额不能为空
   - 金额必须大于0
   - 日期不能为空
4. 发送 API 请求
5. 后端接收并校验：
   - 账户必须存在
   - 金额不能超过限额
   - 日期不能是未来
6. 保存到 t_detail 表
7. 更新 t_account 表的余额
8. 返回成功结果
9. 前端刷新列表
10. 显示成功提示

如果任何步骤失败，会显示相应的错误提示。"
```

#### 4. 校验查询
```
Q: "删除数据时有哪些校验？"

A: "删除数据的校验规则：

【前端校验】
1. 必须选中数据
2. 需要用户确认

【后端校验】
1. 数据必须存在
2. 必须有删除权限
3. 不能被其他数据引用

【错误处理】
- 无权限：显示'您没有删除权限'
- 被引用：显示'该数据被其他记录引用，无法删除'
- 删除失败：显示'删除失败，请稍后重试'

代码位置：
- DetailController.delete() 第 78 行
- DetailService.deleteDetail() 第 134 行"
```

#### 5. 代码定位
```
Q: "保存功能的后端代码在哪里？"

A: "保存功能的后端代码位置：

【Controller 层】
- 文件：DetailController.java
- 方法：save()
- 行号：第 52 行
- 签名：public R save(@RequestBody Detail detail)

【Service 层】
- 文件：DetailService.java
- 方法：saveDetail()
- 行号：第 89 行
- 签名：public void saveDetail(Detail detail)

需要我展示具体代码吗？"
```

---

## 🔄 V1 + V2 协同工作流

### 初始化阶段

```
1. V1 分析所有页面
   ↓
2. 提取所有 Skills
   ↓
3. 构建知识库
   ↓
4. V2 加载知识库
   ↓
5. 准备好回答问题
```

### 运行时阶段

```
用户提问
  ↓
V2 理解问题
  ↓
V2 查询知识库
  ├─ 查找相关 Skills
  ├─ 定位代码位置
  └─ 提取数据流
  ↓
V2 生成回答
  ├─ 业务描述
  ├─ 实现细节
  ├─ 代码位置
  └─ 流程说明
  ↓
返回给用户
```

### 更新阶段

```
代码变更
  ↓
V1 重新分析
  ↓
更新知识库
  ↓
V2 自动同步
  ↓
继续服务用户
```

---

## 💡 核心价值

### 1. 降低理解门槛 ⭐⭐⭐

**从**：需要懂代码才能理解系统  
**到**：用自然语言就能查询逻辑

### 2. 提高协作效率 ⭐⭐⭐

**产品经理**：快速了解功能实现  
**实施人员**：准确理解业务流程  
**测试人员**：清楚知道测试点  
**开发人员**：快速定位代码

### 3. 知识沉淀 ⭐⭐⭐

**代码即文档** - 从代码自动提取知识  
**持续更新** - 代码变化，知识同步  
**可查询** - 随时查询任何逻辑

### 4. 降低维护成本 ⭐⭐⭐

**新人上手快** - 通过 Agent 快速了解系统  
**交接简单** - 知识库自动生成  
**文档不过时** - 与代码同步

---

## 🚀 实施路径

### Phase 1: 完善 V1（1 周）

1. **扩展 PageDataLineage 格式**
   - 添加 skills 字段
   - 添加 data_flow 字段
   - 添加 validations 字段
   - 添加 error_handling 字段

2. **增强代码定位**
   - 精确到行号
   - 提取代码片段
   - 记录方法签名

3. **提取业务描述**
   - 用自然语言描述功能
   - 记录触发条件
   - 记录副作用

### Phase 2: 构建知识库（3 天）

1. **设计 Skill 数据库**
   - Skill 表结构
   - 索引设计
   - 查询接口

2. **实现 SkillManager**
   - 加载 Skills
   - 查询 Skills
   - 更新 Skills

3. **构建索引**
   - 按页面索引
   - 按功能索引
   - 按代码位置索引

### Phase 3: 实现 V2（1 周）

1. **问题理解**
   - 意图识别
   - 实体提取
   - 查询生成

2. **知识查询**
   - Skill 检索
   - 代码定位
   - 流程追踪

3. **回答生成**
   - 结构化回答
   - 代码展示
   - 流程图生成

### Phase 4: 集成测试（3 天）

1. **端到端测试**
2. **用户体验优化**
3. **性能优化**

---

## 📊 预期效果

### 对产品经理

- ✅ 5 分钟了解一个页面的所有功能
- ✅ 快速验证需求是否已实现
- ✅ 准确评估功能改动影响

### 对实施人员

- ✅ 快速理解业务流程
- ✅ 准确回答客户问题
- ✅ 快速定位问题原因

### 对测试人员

- ✅ 清楚知道测试点
- ✅ 了解所有校验规则
- ✅ 知道所有异常情况

### 对开发人员

- ✅ 快速定位代码
- ✅ 了解功能依赖
- ✅ 评估改动影响

---

## 🎯 总结

**V1 + V2 = 让代码可以被任何人理解**

**V1**：提取知识（代码 → Skills）  
**V2**：智能问答（问题 → 答案）  
**结果**：降低门槛（不懂代码 → 理解逻辑）

**这是一个非常有价值的方向！** 🎉

---

**下一步：开始实施？** 🚀
