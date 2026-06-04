---
name: trace-menu-to-code
description: 从业务菜单名定位前后端代码路径（menu-map → grep → Vue/Controller）
metadata:
  letsTalk:
    source: bundled
---

# 菜单名 → 代码路径

## 何时使用

- 用户用业务语言问「XX 功能在哪」「XX 页面代码」
- PM 需要知道菜单对应的 Vue 页与后端接口

## 流程

1. **菜单映射**：读 `.agent/menu-map/` 下 JSON，或 `grep` 菜单中文名 / 路由
2. **前端**：定位 `workFront/` 下 Vue 文件（路由、views、components）
3. **后端**：从页面 API 调用 grep 接口 path → `workBack/` Controller
4. **Controller 必读法**：加载 `read-java-controller` skill 或按 AGENTS.md 用 list_methods → read_method

## 输出

- 菜单面包屑（若已知）
- 前端路径 + 关键组件/方法
- 后端 Controller 方法名 + 路径
- 标注【path】；不确定处写「可能」「需进一步 grep/read」

## 锚点

- 若用户已在 letsTalk 选了菜单锚点，优先 `get_anchor_preview` 再展开
