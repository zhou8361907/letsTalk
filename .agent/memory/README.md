# 跨会话记忆（V1 · 可成长助手）

设计说明：[docs/MEMORY_V1.md](../../docs/MEMORY_V1.md)（当前规格）· [docs/MEMORY_SYSTEM.md](../../docs/MEMORY_SYSTEM.md)（构筑与路线图）

## 目录结构

```text
.agent/memory/
├── USER.md           # M0：用户画像（称呼、偏好）· Tier 1 每会话注入
├── CORE.md           # M0：助手笔记（惯例、踩坑）
├── INDEX.md          # M2：jargon 索引（仅 glossary/history 锚词 → topics）
├── README.md
└── topics/           # M1：主题记忆
    ├── glossary-*.md
    └── history-*.md
```

## 分工

| 层 | 文件 | 谁写 | 写什么 |
|----|------|------|--------|
| L0 | `AGENTS.md` + system append | 人 | 怎么用记忆 |
| M0 | `USER.md` · `CORE.md` | 人 + Agent | 称呼、偏好、惯例、踩坑 |
| M1 | `topics/*.md` | 人 + Agent | jargon 消歧、变更脉络 |
| M2 | `INDEX.md` | save glossary/history 时同步 | **仅** jargon 词条 → 路径 |
| L3 | workFront/workBack | 工具 | 代码（不写 memory） |
| L4 | requirementDraft | Agent | 当前单需求 |

## 工具

| 工具 | 用途 |
|------|------|
| `update_user_profile` / `read_user_profile` | USER.md |
| `update_core_memory` / `read_core_memory` | CORE.md |
| `save_memory` / `read_memory` / `list_memory_index` | topics + INDEX |
| `resolve_memory_terms` | Tier 2 静默 Pull（服务端） |

默认开启；`LETS_TALK_MEMORY_TOOLS=0` 关闭。

## 权威顺序

与代码冲突时 **以 workFront/workBack 为准**。
