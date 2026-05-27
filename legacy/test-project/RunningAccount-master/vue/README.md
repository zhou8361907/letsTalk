# workFront — 待分析的前端工程

把要分析的 Vue 前端放在本目录下（或做符号链接）。

## 示例：链到 demo

```bash
# 在 letsTalk 仓库根执行
rm -rf workFront
ln -s legacy/test-project/RunningAccount-master/vue workFront
```

之后 Agent 会通过 `workFront/src/views/...` 访问页面；左侧锚点列表会自动扫描本目录。
