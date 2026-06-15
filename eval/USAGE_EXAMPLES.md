# Promptfoo 使用示例

## 示例 1：运行单个测试

```bash
# 只运行 payment-approval-round-1 测试
pnpm eval --filter "payment-approval-round-1"
```

## 示例 2：查看详细输出

```bash
# 显示每个测试的详细输出
pnpm eval --verbose
```

## 示例 3：保存输出到文件

```bash
# 保存 eval 结果到指定文件
pnpm eval --output eval-results.json
```

## 示例 4：对比两次运行结果

```bash
# 第一次运行
pnpm eval --output baseline.json

# 改 prompt 后
pnpm eval --output current.json

# 对比（promptfoo 内置功能）
promptfoo view baseline.json current.json
```

## 示例 5：添加新测试用例

在 `eval/promptfoo.yaml` 中添加：

```yaml
tests:
  - description: my-new-test
    vars:
      message: |
        用户输入的新场景
    assert:
      - type: javascript
        value: output.draft?.readyToFinalize !== true
      - type: javascript
        value: output.assistantText.length > 10
```

## 示例 6：使用 llm-rubric 断言

```yaml
tests:
  - description: quality-check
    vars:
      message: |
        用户输入
    assert:
      - type: llm-rubric
        value: |
          评估回复质量：
          1. 是否以追问开头
          2. 是否包含业务概要
          3. 是否避免直接下定论
```

## 示例 7：检查工具调用

```yaml
tests:
  - description: tool-usage-check
    vars:
      message: |
        需要查询业务提示的场景
    assert:
      - type: javascript
        value: output.tools.includes('get_business_hints')
```

## 示例 8：检查 draft items

```yaml
tests:
  - description: draft-items-check
    vars:
      message: |
        多个需求的场景
    assert:
      - type: javascript
        value: |
          const items = output.draft?.items || [];
          // 至少有 2 条 item
          items.length >= 2
```

## 示例 9：成本限制

```yaml
tests:
  - description: cost-sensitive
    vars:
      message: |
        简单查询
    assert:
      - type: cost
        threshold: 0.30  # 成本不超过 $0.30
```

## 示例 10：组合断言

```yaml
tests:
  - description: comprehensive-check
    vars:
      message: |
        复杂场景
    assert:
      - type: javascript
        value: output.draft?.readyToFinalize !== true
      - type: javascript
        value: output.tools.length > 0
      - type: cost
        threshold: 0.50
      - type: llm-rubric
        value: 回复应该以追问或概要开头
```

## 常用命令速查

```bash
# 运行所有测试
pnpm eval

# 查看汇总指标
pnpm eval:summary

# 运行特定测试
pnpm eval --filter "test-name"

# 详细输出
pnpm eval --verbose

# 保存结果
pnpm eval --output results.json

# 查看历史结果
promptfoo view
```
