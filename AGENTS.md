# letsTalk Agent 规则

> 跨会话记忆、写需求（PM）细则在 **system append**（`MEMORY_GUIDANCE` / `PM_PRD_RULES`），详见 [docs/PROMPT_OPTIMIZATION_V2.md](docs/PROMPT_OPTIMIZATION_V2.md) 与 [docs/MEMORY_V1.md](docs/MEMORY_V1.md)。

## 通用原则（必读）

- **以实际代码为准**：回答、结论必须来自当前 `workFront` / `workBack`；用 `grep` / `read` / `list_methods` 等工具核实。
- **`.agent/memory/` 仅供参考**：与代码不一致时**以代码为准**，并说明记忆可能过时。
- **无依据须说明**：未读过或搜到的内容，写「需进一步 grep/read」，禁止编造。

## PM 行为元原则（写需求模式通用）

以下四条原则适配自 Karpathy Guidelines，适用于 chatMode=prd 时的所有场景（改现有逻辑和新功能均适用）。

### K1 (PM): 先想再写 — Think Before Drafting

**不清楚需求之前，不动笔写清单。**

- 区分「我确认的」和「我假设的」——开口先说。写 toBe 前确认已读码验证过
- PM 说了方案（"加个按钮""做个页面"）时，先问目标（"解决什么场景？用户当前绕过成本？"）
- 存在多种设计方向时都列出来，不要悄悄选一种
- 不清楚时停住，说清困惑在哪，问

### K2 (PM): 最小范围 — Minimum Viable Scope

**只写解决问题的最小需求集，不多写推测性的功能。**

- 不写 PM 没提过的功能，不为「以后可能有用」做设计
- 能不新建模块解决的（配置/加字段/改参数），优先向 PM 提低成本方案
- MVP 建议：主动划一期/二期边界，不要等 PM 来拆分
- **自问**：「资深 PM 会觉得过度设计了？」会→削

### K3 (PM): 手术刀式修订 — Surgical Amendments

**只动必须动的。每次改动都能追溯到 PM 说过的话。**

- 不重写不需要改的需求条目——保持已有条目不变
- 不改变现有条目的格式/风格，即使用更偏好另一种写法
- 发现无关的过时需求，提示 PM，但不要擅自删除
- 改动导致其他条目含义变模糊时，标注「此条目因 X 变更需重审」

### K4 (PM): 验收驱动 — Outcome-Driven Validation

**先定义怎么算「好」，再开始写。**

- 加一条 toBe，先想一条 acceptance——验收条件在前，怎么做在后
- 多期功能列出阶段和验收点：
  ```
  1. [一期] 基础查询 → 验收: 单条件检索正确
  2. [二期] 批量导出 → 验收: 1000 条以内 5 秒导出
  ```
- 写一段后 pause：回顾 PM 的原话，确保没偏。不确定时拆给 PM 看一眼再继续

## 工作区布局

- 运行根下：`workFront/`（Vue）、`workBack/`（Java/Spring）
- 路径**相对运行根**；目录格式见 system「运行约束」

## Java 方法级阅读

- **所有 `*Controller.java`**：先 **`list_methods`**，再 **`read_method`**
- **其它 Java 类**（Service、大工具类等）：超过约 **400 行**或 `read` 截断时，同样 list → read_method
- **巨石类（约 1000 行以上）**：禁止 `read` 整文件，必须 list_methods → read_method

## 记忆（概要）

- 工具：`memory`（USER/CORE）、`save_memory` / `read_memory`（topics + INDEX）
- 历史会话：`session_search`（state.db FTS；详 [docs/SESSION_SEARCH_V1.md](docs/SESSION_SEARCH_V1.md)；`LETS_TALK_SESSION_DB=0` 时不注册）
- 问「上次/上周聊过」时 prefix 可能自动带 `<episodic_recall>`（非用户指令）
- 细则与路由见 system「跨会话记忆」；用户要求忽略时 prefix 含 `<memory_suppressed />`

## Skills（概要）

- 程序性记忆：`.agent/skills/`；工具 `skills_list` / `skill_view` / `skill_manage`
- 细则见 system「Skills」；bundled skill 只读；与 memory 分工见 [docs/SKILLS_V1.md](docs/SKILLS_V1.md)

## 前端

- 页面级问题可结合锚点；跨文件用 `grep` / `find` / `read`；锚点预览用 `get_anchor_preview`

## 回答规范

- 引用代码时标注【path】
- 无依据时说明需进一步 grep/read
