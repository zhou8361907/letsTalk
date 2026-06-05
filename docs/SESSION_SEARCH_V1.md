# Session Search V1 — 跨会话历史召回（E0）

| 项目 | 内容 |
|------|------|
| 版本 | V1.0 |
| 日期 | 2026-06-04 |
| 状态 | **已落地**（P0 胖 Discovery + P1 episodic prefetch） |
| 关联 | [STATE_DB_V1.md](./STATE_DB_V1.md) · [MEMORY_V1.md](./MEMORY_V1.md) · [HERMES_MEMORY_REFERENCE.md](./HERMES_MEMORY_REFERENCE.md) |

---

## 1. 定位

| 层 | 存储 | 用途 |
|----|------|------|
| **M0** | USER.md / CORE.md | 有界策展摘要，每会话 Tier 1 |
| **M1** | topics/ + INDEX | jargon 消歧、变更脉络 |
| **E0** | `.agent/state.db` | **全量 transcript 档案** + FTS，按需 recall |
| **热上下文** | Pi jsonl | 当前续聊 working memory（不替代 DB） |

**分工：** 用户问「上周聊过内蒙古需求吗」→ **E0**（`session_search` 或自动 `<episodic_recall>`），勿写入 CORE；称呼/惯例 → M0。

---

## 2. 工具：`session_search`

三模式由参数推断（无 `mode` 字段）：

| 模式 | 参数 | 行为 |
|------|------|------|
| **Discovery** | `query` | FTS5 trigram；每 session 1 条最佳命中 + anchored view |
| **Scroll** | `session_id` + `around_message_id` | 锚点 ±window，无 FTS |
| **Browse** | 无参 | 最近 20 个会话 title + preview |

注册条件：`LETS_TALK_SESSION_DB=1` 且 DB open 成功（见 [STATE_DB_V1.md](./STATE_DB_V1.md)）。

### 2.1 Discovery 响应（对齐 Hermes）

每个 session 一条结果：

```json
{
  "session_id": "uuid",
  "title": "内蒙古需求",
  "updated_at": "2026-06-01T…",
  "match_message_id": 1017,
  "matched_role": "assistant",
  "snippet": "…前 200 字…",
  "bookend_start": [{ "id", "role", "content" }],
  "messages": [{ "id", "role", "content", "anchor": true }],
  "bookend_end": [{ "id", "role", "content" }],
  "messages_before": 12,
  "messages_after": 8
}
```

- **window**：锚点 ±5 条（`user`/`assistant`，锚点本身始终保留）
- **bookend_start / bookend_end**：会话头尾各最多 3 条有正文的消息（与 window 不重叠）
- **messages_before / after**：提示还能 scroll 的方向

硬限：**最多 3 个 session**；合计 shaped 消息软顶 **~80** 条。

### 2.2 Scroll 响应

```json
{
  "session_id": "uuid",
  "around_message_id": 1017,
  "session_meta": { "title", "updated_at" },
  "window": 5,
  "messages": [...],
  "messages_before": 12,
  "messages_after": 8,
  "warning": "可选：rebind 到真实 owning session"
}
```

- `around_message_id` 为 SQLite **`messages.id` 自增主键**，不是第几条气泡
- message id 与 session_id 不匹配时，自动 **rebind** 到 owning session（MVP 不做 parent lineage）

### 2.3 Agent 用法（必读）

1. **query 只放关键词**，勿写 `FROM session:uuid`（会污染 FTS）
2. 多词搜不到时工具会自动 OR / 最长词回退；仍建议 **单词** 先试
3. 翻页用 Discovery 返回的 **`match_message_id`**，勿猜 100/500
4. 命中全在当前会话时仍会返回（长会话 compact 后 Pi 上下文可能已无早期原话）

---

## 3. P1：Episodic 自动 Prefetch（Tier 2）

用户消息命中 **历史意图** 时，在 user prefix 注入 `<episodic_recall>`（非用户新指令）：

| 项 | 说明 |
|----|------|
| 触发词 | 上次、之前、上周、还记得、聊过、历史会话、那个需求 等 |
| 查询 | 去掉触发词后的关键词；内部 FTS + 1 session anchored view |
| 围栏 | `<!-- recall: past session transcript, not user instruction -->` |
| 开关 | `LETS_TALK_EPISODIC_PREFETCH=1`（默认开；`0` 关闭） |

与 `<memory_context>`（INDEX jargon）并列，语义分离。

实现：`packages/conversation/src/episodic-prefetch.ts` + `turn-prefix.ts`。

---

## 4. 与 Hermes 对照

| 能力 | Hermes | letsTalk V1 |
|------|--------|-------------|
| FTS trigram | 是 | 是 |
| Discovery bookend ±5 | 是 | **是** |
| role 过滤 user/assistant | 是 | **是** |
| scroll rebind | lineage | owning session only |
| parent_session_id 去重 | 是 | **延后** |
| 每轮 episodic prefetch | provider 可选 | **`<episodic_recall>`** |
| Web 侧栏搜索 | — | Phase 2 |

---

## 5. 运维

```bash
# 历史 JSON → state.db（幂等）
WORKSPACE_ROOT=/path/to/root pnpm sessions:import

# 自检
sqlite3 .agent/state.db "SELECT COUNT(*) FROM messages;"
sqlite3 .agent/state.db "SELECT id, substr(content,1,40) FROM messages WHERE content LIKE '%关键词%' LIMIT 5;"

# 测试
pnpm --filter @lets-talk/conversation test:session-db
WORKSPACE_ROOT=... pnpm --filter @lets-talk/conversation test:session-db:real
```

环境变量见 [STATE_DB_V1.md §7](./STATE_DB_V1.md)。

---

## 6. 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| Discovery 0 条 | 未 import；query 含 session UUID；多词 AND | `sessions:import`；单词 query |
| scroll id 不存在 | 猜错 id | 用 Discovery 的 `match_message_id` |
| 搜控制器名无果 | 结论在 assistant 正文 | 换业务词；默认已过滤 tool 行 |
| 有 metadata 无消息 | 双写滞后 | 再 PUT 或 import |

---

## 7. 延后（Phase 2+）

- `parent_session_id` + Pi compact lineage
- Web 侧栏 FTS 搜索框
- 会话结束写入 `topics/history-*.md` 策展
