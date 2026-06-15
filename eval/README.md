# letsTalk Eval - Promptfoo 集成

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

promptfoo 已作为根目录 devDependency 安装。

### 2. 配置环境变量

确保 `.env` 文件包含：

```env
WORKSPACE_ROOT=/Users/zs/IdeaProjects/work/letsTalk
LLM_API_KEY=your-api-key-here
```

### 3. 运行 eval

```bash
# 运行所有测试用例
pnpm eval

# 查看汇总指标
pnpm eval:summary
```

## 目录结构

```
eval/
├── promptfoo.yaml              # 主配置文件
├── providers/
│   └── lets-talk.mjs          # 自定义 provider（调用进程内 runChat）
├── lib/
│   └── run-turn.mjs           # 执行单轮对话
├── scenarios/
│   ├── payment-approval-r1.yaml   # 支付审批第 1 轮
│   ├── bank-switch-r1.yaml        # 银行切换第 1 轮
│   └── real-requirement-r1.yaml  # 真实需求第 1 轮
└── metrics/
    └── summarize.mjs          # 汇总指标脚本
```

## 如何编写新的测试用例

### 1. 在 promptfoo.yaml 中添加测试

编辑 `eval/promptfoo.yaml`，在 `tests` 数组中添加：

```yaml
tests:
  # ... 现有测试
  - description: my-scenario-round-1
    vars:
      message: |
        这里写用户输入的消息内容
    assert:
      - type: javascript
        value: output.draft?.readyToFinalize !== true
```

### 2. 断言类型

Promptfoo 支持多种断言类型：

#### javascript 断言

用于结构化断言，访问 `output` 对象：

```yaml
- type: javascript
  value: |
    // output 是 EvalTurnResult
    output.draft?.readyToFinalize !== true
    output.tools.includes('get_business_hints')
    output.draft?.items.length > 0
```

可用的字段：
- `output.assistantText` - 助手回复文本
- `output.draft` - RequirementDraftState 对象
- `output.tools` - 调用的工具名数组
- `output.turnCostUsd` - 本轮成本（USD）
- `output.durationMs` - 耗时（毫秒）
- `output.success` - 是否成功
- `output.error` - 错误信息（如果有）

#### llm-rubric 断言

用 LLM 评估回复质量：

```yaml
- type: llm-rubric
  value: 以追问或业务概要开头，不直接把未核实的规则写成 toBe 定论
```

#### cost 断言

限制成本：

```yaml
- type: cost
  threshold: 0.50
```

#### 其他断言类型

参见 [Promptfoo 文档](https://www.promptfoo.dev/docs/configuration/expected-outputs/)

### 3. 运行新测试

```bash
pnpm eval
```

## 工作流

改 prompt 前后都跑 eval：

```bash
# 改 prompt 之前
pnpm eval
pnpm eval:summary  # 记录 baseline

# 改 packages/context/src/prompt/pm-prd.ts

# 改 prompt 之后
pnpm eval
pnpm eval:summary  # 对比指标
```

## 指标说明

运行 `pnpm eval:summary` 会输出：

- **success_rate**: 通过率（passed / total）
- **premature_finalize_rate**: 过早定稿率（第 1 轮 readyToFinalize=true 的比例）
- **cost**: 成本（平均/最大/总计）
- **latency**: 延迟（平均/P95）

首期目标：
- success_rate ≥ 80%
- premature_finalize_rate = 0%
- 单场景 cost < $0.50

## 注意事项

1. **真 API 调用**: eval 会真实调用 LLM，产生费用
2. **本地运行**: 首期不进 CI，仅在本地改 prompt 时运行
3. **会话隔离**: 每个测试用例使用新 sessionId，避免污染
4. **写盘副作用**: eval 会写入 `.agent/conversations/eval/` 目录

## 故障排查

### WORKSPACE_ROOT 未设置

检查 `.env` 文件：

```env
WORKSPACE_ROOT=/absolute/path/to/letsTalk
```

### LLM_API_KEY 未设置

在 `.env` 中配置：

```env
LLM_API_KEY=your-api-key
```

### Provider 加载失败

确保 provider 文件是 `.mjs` 格式，且导入路径正确。
