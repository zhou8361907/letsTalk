# Eval 快速开始指南

## 已完成的工作

✅ 创建了 eval 目录结构
✅ 实现了 Promptfoo custom provider（进程内调用 runChat）
✅ 配置了 3 个首期测试场景
✅ 添加了 metrics 汇总脚本
✅ 在根 package.json 添加了 `pnpm eval` 和 `pnpm eval:summary` 脚本
✅ 安装了 promptfoo 依赖

## 目录结构

```
eval/
├── promptfoo.yaml              # 主配置（包含 3 个测试场景）
├── providers/
│   └── lets-talk.mjs          # Custom provider
├── lib/
│   └── run-turn.mjs           # 调用 runChat 的核心逻辑
├── scenarios/
│   ├── payment-approval-r1.yaml   # 支付审批第 1 轮
│   ├── bank-switch-r1.yaml        # 银行切换第 1 轮
│   └── real-requirement-r1.yaml  # 真实需求第 1 轮
├── metrics/
│   └── summarize.mjs          # 汇总指标
├── README.md                  # 详细文档
└── USAGE_EXAMPLES.md          # 使用示例
```

## 如何使用

### 1. 确保环境变量配置

检查 `.env` 文件：
```env
WORKSPACE_ROOT=/Users/zs/IdeaProjects/work/letsTalk
LLM_API_KEY=your-api-key-here
```

### 2. 运行 eval

```bash
# 运行所有测试
pnpm eval

# 查看汇总指标
pnpm eval:summary
```

### 3. 添加新测试用例

编辑 `eval/promptfoo.yaml`，在 `tests` 数组中添加：

```yaml
- description: my-new-test
  vars:
    message: |
      用户输入内容
  assert:
    - type: javascript
      value: output.draft?.readyToFinalize !== true
```

### 4. 改 prompt 前后对比

```bash
# 改 prompt 之前
pnpm eval
pnpm eval:summary  # 记录 baseline

# 改 packages/context/src/prompt/pm-prd.ts

# 改 prompt 之后
pnpm eval
pnpm eval:summary  # 对比指标
```

## 首期目标

- **success_rate**: ≥ 80%（3 场景中至少 2 个通过）
- **premature_finalize_rate**: 0%（所有第 1 轮场景都不应 readyToFinalize）
- **cost**: 单场景 < $0.50

## 注意事项

1. **真 API 调用**: 每次 eval 会调用 LLM，产生费用
2. **本地运行**: 首期不进 CI，仅在本地改 prompt 时运行
3. **会话隔离**: 每个测试用例使用新 sessionId（`eval-{uuid}`）
4. **写盘副作用**: 会写入 `.agent/conversations/eval/` 目录

## 下一步

1. 运行 `pnpm eval` 测试当前实现
2. 根据结果调整 prompt 或测试用例
3. 参考 `USAGE_EXAMPLES.md` 添加更多测试场景
4. 查看 `README.md` 了解更多细节
