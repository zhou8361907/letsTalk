# letsTalk Agent 规则

> 跨会话记忆、写需求（PM）细则在 **system append**（`MEMORY_GUIDANCE` / `PM_PRD_RULES`），详见 [docs/PROMPT_OPTIMIZATION_V2.md](docs/PROMPT_OPTIMIZATION_V2.md) 与 [docs/MEMORY_V1.md](docs/MEMORY_V1.md)。

## 通用原则（必读）

- **以实际代码为准**：回答、结论必须来自当前 `workFront` / `workBack`；用 `grep` / `read` / `list_methods` 等工具核实。
- **`.agent/memory/` 仅供参考**：与代码不一致时**以代码为准**，并说明记忆可能过时。
- **无依据须说明**：未读过或搜到的内容，写「需进一步 grep/read」，禁止编造。

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
