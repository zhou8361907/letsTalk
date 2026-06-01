# letsTalk Agent 规则

## 通用原则（必读）

- **以实际代码为准**：回答、结论必须来自当前 `workFront` / `workBack` 中的文件；用 `grep` / `read` / `list_methods` 等工具核实。
- **`.agent/memory/` 仅供参考**：若存在 md 笔记，只能作线索或历史背景；**不得**把记忆当权威。与代码不一致时，**以代码为准**，并说明记忆可能过时。
- **无依据须说明**：没有读过或搜到的内容，应写「需进一步 grep/read」，禁止编造。

## 工作区布局

- 运行根目录下：`workFront/`（Vue 前端）、`workBack/`（Java/Spring 后端）
- 工具路径均**相对运行根**，例如 `workFront/src/views/Login.vue`、`workBack/src/main/java/erp/controller/DetailController.java`

## Java 方法级阅读（阶段 3）

- **所有 `*Controller.java`**（不论多少行）：先 **`list_methods`** 看接口表，需要细节再 **`read_method`**
- **其它 Java 类**（Service、大工具类等）：超过约 **400 行**，或 `read` 会截断 / 看不清结构时，同样 list → read_method
- **巨石类（约 1000 行以上）**：禁止 `read` 整文件，必须 list_methods → read_method
- Pi 内置 `read` 默认最多约 **2000 行**；真正的问题是 token 浪费和模型抓不住结构，不是「200 行」这条线

## 跨会话记忆（见 docs/MEMORY_V1.md · V1 可成长助手）

> **注入：** AGENTS.md + USER/CORE 在会话创建时进 **system prompt（Tier 1）**；jargon 命中才 **Pull** 到 user 前缀（Tier 2）。

**写入路由（先分类再写）**

| 类型 | 工具 / 文件 |
|------|-------------|
| 称呼、偏好 | `update_user_profile` → **USER.md** |
| 惯例、踩坑 | `update_core_memory` → **CORE.md** |
| 项目 jargon（原「黑话」） | `save_memory` kind=glossary + **INDEX** |
| 变更脉络 | `save_memory` kind=history |
| 当前这单需求 | L4 requirementDraft |

**DO**

- 用户强调、纠正、当事实陈述 → 优先 `memory`（user/core）；不确定标 `draft`。
- jargon INDEX 命中 → 先 `read_memory`，再 grep/read 代码。
- 代码与记忆冲突 → **以代码为准**。

**DON'T**

- 禁止把 nickname/偏好写进 glossary/INDEX（→ USER.md）。
- 禁止 API/菜单/PR/当前需求复印件。
- INDEX 仅 jargon 词条表，禁止正文。

**忽略 memory**：本轮不 Pull、不调任何 memory 工具（prefix 带 `<memory_suppressed />`）。

**目录**

- **M0** `USER.md` · `CORE.md` · **M1** `topics/` · **M2** `INDEX.md`（仅 jargon）
- 工具默认开启；`LETS_TALK_MEMORY_TOOLS=0` 关闭

## 前端

- 页面级问题可结合锚点预览；跨文件用 `grep` / `find` / `read`

## 回答规范

- 引用代码时标注【path】
- 无依据时说明需进一步 grep/read

## 产品经理 · 写需求模式（阶段 6）

当 UI 选择 **「写需求」** 时，每轮 JIT 会额外注入 `pm_rules` 与 `.agent/templates/prd-template.md` 摘要。

- 输出须按 PRD 模板章节组织（现状 / 目标 / 验收 / 开放问题）
- 必须用工具核实现有页面与接口；`.agent/hints/` 仅作业务线索
- 用户要求整理 PRD 时，给出完整 Markdown 文档，而非仅闲聊式回答
