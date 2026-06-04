# Skills 体系 V1

| 项目 | 内容 |
|------|------|
| 版本 | V1.0 MVP |
| 日期 | 2026-06-01 |
| 参考 | [Hermes Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) · [agentskills.io](https://agentskills.io/specification) |

## 是什么

**Skills** 是 letsTalk 网页 Agent 的**程序性记忆**：教 Agent「怎么做」某类可复用任务（读 Controller、追菜单、写需求五格等）。

与 **memory**（USER/CORE，记事实）分工：

| 存什么 | 用什么 |
|--------|--------|
| 称呼、偏好、惯例、踩坑一句话 | `memory` |
| 可复用流程、步骤、pitfalls | `skill_manage` → `.agent/skills/` |
| 当前这单需求 | `requirementDraft` |

## 存储

```text
.agent/skills/
├── erp/read-java-controller/SKILL.md   # bundled（只读）
├── erp/trace-menu-to-code/SKILL.md
├── pm/requirement-cell/SKILL.md
└── user/my-workflow/SKILL.md           # Agent 自建
```

种子 skills 来自仓库 `packages/skills-bundled/`，首次无 skill 时自动复制。

## 渐进披露

1. **Level 0**：system `<available_skills>` 索引（name + description）
2. **Level 1**：`skill_view(name)` → 完整 SKILL.md + linked_files
3. **Level 2**：`skill_view(name, "references/xxx.md")` → 附属文件

## 工具

| 工具 | 作用 |
|------|------|
| `skills_list` | 刷新/列出全部 skill 元数据 |
| `skill_view` | 加载 SKILL.md 或附属文件 |
| `skill_manage` | create / patch / edit / delete / write_file / remove_file |

**禁止**用 `write`/`edit` 改 `.agent/skills/`（已白名单拦截）。

## bundled 保护

frontmatter 含：

```yaml
metadata:
  letsTalk:
    source: bundled
```

此类 skill 不可 delete/edit/patch；需 `skill_manage(create)` 新建用户 skill。

## 自进化

每 `LETS_TALK_SELF_IMPROVE_NUDGE_INTERVAL` 轮（默认 10）user turn，后台 fork 子 Agent（`memory` + `skill_manage`），回顾 transcript 并更新 memory/skills。当轮已写 memory 或 skill_manage 则跳过。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `LETS_TALK_SKILLS` | 开启 | `0` 关闭 skills 工具与索引 |
| `LETS_TALK_SELF_IMPROVE_NUDGE_INTERVAL` | `10` | `0` 关闭后台 review |
| `LETS_TALK_MEMORY_NUDGE_INTERVAL` | — | 兼容旧名，同上 |

## 编辑 prompt

可在 `.agent/prompt/` 覆盖：

- `skills-guidance.md` — system append 细则
- `self-improvement-review.md` — 后台 review 合并 prompt

（见网页 prompt 编辑器或 `packages/context/src/prompt/prompt-editor.ts`）

## MVP 范围外

Skills Hub 安装、Curator、Web UI 管理、Cursor IDE 互通。
