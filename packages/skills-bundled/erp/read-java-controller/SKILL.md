---
name: read-java-controller
description: 读 Java Spring Controller：先 list_methods 再 read_method，禁止整文件 read
metadata:
  letsTalk:
    source: bundled
---

# 读 Java Controller（ERP）

## 何时使用

- 分析或修改 `workBack/` 下任意 `*Controller.java`
- 追踪 API 接口、路由、后端业务入口

## 流程

1. 路径相对 `workBack/`；**禁止** read 整文件（>400 行必 list → read_method）
2. 所有 `*Controller.java`：**先** `list_methods`，**再** `read_method` 目标方法
3. 结论必须标注【path】；无依据写「需进一步 grep/read」

## 常见后续

- grep 方法名 / `@RequestMapping` / `@GetMapping` → 找 Service 调用
- 前端：在 `workFront/` grep 接口 path 或 API 常量

## 参考

- 仓库根 `AGENTS.md` Java 方法级阅读段
