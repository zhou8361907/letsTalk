# letsTalk 会话冷存储 — state.db 设计（V1 草案）

| 项目 | 内容 |
|------|------|
| 版本 | V1.0 草案 |
| 日期 | 2026-06-04 |
| 状态 | **设计稿，未实现** |
| 参考 | [Hermes session-storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage) · 本地 `hermes-agent/hermes_state.py` |
| 关联 | [MEMORY_V1.md](./MEMORY_V1.md)（E0 Episodic）· [IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md) · [HERMES_MEMORY_REFERENCE.md](./HERMES_MEMORY_REFERENCE.md) |

---

## 1. 为什么要引入 state.db

letsTalk 当前会话持久化是 **按 session 一个 JSON 文件**：

```text
.agent/conversations/{sessionId}.json     ← UI Transcript + meta + requirementDraft
.agent/conversations/pi/{sessionId}.jsonl ← Pi 多轮上下文（Agent 续聊）
```

这套方案解决了 **刷新页面气泡还在**、**HMR 后 Pi 上下文恢复**，但有三类缺口：

| 缺口 | 现状 | 影响 |
|------|------|------|
| **跨会话检索** | 只能侧栏按时间翻 JSON | 「上周聊过收支明细删除逻辑吗？」无法 FTS |
| **列表与统计** | `readdir` + 逐文件 `readFile` | 会话多了以后 list / 分组 / token 统计变慢 |
| **Agent 按需 recall** | 无工具 | MEMORY_V1 Phase C 的 `session_search` 无落点 |
| **双写一致性** | Transcript JSON 与 Pi jsonl 分离 | 导出、审计、搜索需拼两份数据源 |

**state.db 的定位：冷存储 / 会话档案库** —— 存 **完整 transcript + 元数据 + 可搜索索引**，**不**替代：

- **M0 记忆**（`.agent/memory/USER.md` + `CORE.md`）— 仍是有界、策展、每轮注入
- **Pi jsonl** —— 仍是 Agent 续聊的 **热上下文** 权威源（短期不迁 SQLite）
- **requirementDraft** —— 仍是 L4 任务态；可 **镜像** 进 DB 便于搜索，但不以 DB 为编辑源

```text
┌─────────────────────────────────────────────────────────────┐
│ 热路径（每轮必走）                                            │
│  Pi jsonl · Tier1 USER/CORE · Tier2 INDEX Pull · L4 清单     │
├─────────────────────────────────────────────────────────────┤
│ 温路径（UI / API）                                            │
│  Transcript JSON（v1 可保留，与 DB 双写过渡）                  │
├─────────────────────────────────────────────────────────────┤
│ 冷路径（按需）← state.db 新增                                 │
│  FTS 跨会话搜索 · 侧栏列表 · 导出 · session_search 工具       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 与 Hermes state.db 的对照

| 维度 | Hermes | letsTalk V1 建议 |
|------|--------|------------------|
| 路径 | `~/.hermes/state.db` | `{WORKSPACE_ROOT}/.agent/state.db` |
| 范围 | 全局（profile 用 HERMES_HOME） | **单工作区**（与 ERP 仓库绑定） |
| WAL | 是，多进程 gateway | 是，Next dev + agent-runtime 可能并发写 |
| FTS5 | `messages_fts` + trigram（CJK） | **必须** trigram 或等效（中文 ERP 对话） |
| system_prompt 快照 | 存 sessions 表，保 prefix cache | **可选 Phase 2**（Pi 侧 prompt 组装不同，优先 jsonl） |
| session 来源 | cli / telegram / discord… | 固定 `web`（后续可加 `cli`） |
| 工具 | `session_search` 三模式 | 同名或 `search_past_sessions`（与 MEMORY_V1 对齐） |

Hermes 文档明确：**MEMORY.md 是策展摘要，state.db 是全量录像 + 搜索引擎**。letsTalk 沿用同一分工。

---

## 3. 数据库 Schema（建议）

### 3.1 表概览

```text
.agent/state.db
├── schema_version          — 迁移版本（单值）
├── sessions                — 会话元数据
├── messages                — 消息行（user/assistant/tool/system）
├── messages_fts            — FTS5（content + tool_name，inline 模式）
├── messages_fts_trigram    — FTS5 trigram（中文子串）
└── session_anchors         — 可选：锚点快照 JSON（便于按菜单/路径过滤）
```

### 3.2 `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,           -- letsTalk sessionId (UUID)
    source          TEXT NOT NULL DEFAULT 'web',
    title           TEXT,
    title_locked    INTEGER DEFAULT 0,
    chat_mode       TEXT DEFAULT 'explore',     -- explore | prd
    model           TEXT,
    pi_session_file TEXT,                       -- 相对 WORKSPACE_ROOT 的 jsonl 路径
    anchor_json     TEXT,                       -- AgentAnchor 快照（可空）
    requirement_draft_json TEXT,                -- 清单镜像（只读副本，编辑仍走 JSON）
    created_at      TEXT NOT NULL,              -- ISO8601
    updated_at      TEXT NOT NULL,
    ended_at        TEXT,
    parent_session_id TEXT,                     -- 压缩/分支 lineage（预留）
    message_count   INTEGER DEFAULT 0,
    input_tokens    INTEGER DEFAULT 0,
    output_tokens   INTEGER DEFAULT 0,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
```

### 3.3 `messages`

与 Hermes 类似，但 **content 存 UI Transcript 已归一化的文本**（工具块用 preview，不存 base64）。

```sql
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,           -- 会话内顺序（0-based）
    role            TEXT NOT NULL,              -- user | assistant | tool | system
    kind            TEXT,                       -- letsTalk TranscriptItem.kind（user/assistant/tool/...）
    content         TEXT,
    tool_name       TEXT,
    tool_call_id    TEXT,
    tool_calls_json TEXT,
    metadata_json   TEXT,                       -- 扩展：draftRevision、turnId 等
    created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_seq
    ON messages(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
```

**写入策略：增量 flush** —— 维护 `last_flushed_seq`，每轮 `_persist_session` 只 append 新行（对齐 Hermes `_last_flushed_db_idx`）。

### 3.4 FTS5

- **messages_fts**：英文/词边界检索 + tool_name
- **messages_fts_trigram**：中文「收支明细」「软删」类子串（Hermes schema v10+ 同款思路）
- 通过 trigger 与 `messages` 同步；FTS 不可用时 **降级**为 `LIKE` 扫描 + 日志告警（Hermes 同）

---

## 4. 包与模块划分（建议）

新增 **`packages/session-store`**（或扩展现有 `packages/conversation`）：

| 模块 | 职责 |
|------|------|
| `src/db.ts` | `SessionDB` 类：连接、迁移、WAL、写重试 |
| `src/schema.sql` | 建表 + trigger 定义 |
| `src/migrate.ts` | `schema_version` 递增迁移 |
| `src/sessions.ts` | create / update meta / list / get |
| `src/messages.ts` | append_message / get_messages / flush_from_seq |
| `src/search.ts` | FTS5 查询、snippet、±window 上下文 |
| `src/import-json.ts` | 一次性：`.agent/conversations/*.json` → DB |

**依赖：** `better-sqlite3`（同步 API，适合 Next API route + agent-runtime 同进程）或 `node:sqlite`（Node 22+ 实验性，需评估）。

**不推荐** Python 侧 SQLite：letsTalk 栈是 TypeScript 单体，保持一处写入。

---

## 5. 集成点

### 5.1 写入（双写过渡期）

| 时机 | 今天 | + state.db |
|------|------|------------|
| 新建会话 | `POST /api/conversations` → JSON | 同时 `sessions.insert` |
| 每轮结束 | 前端 `PUT` transcript JSON | API 或 `run-chat` `turn_end` 后 `flush_messages` |
| Pi 绑定 | `bindPiSessionFile` 写 JSON meta | 更新 `sessions.pi_session_file` |
| 锚点/模式变更 | PUT JSON | 更新 `sessions.anchor_json` / `chat_mode` |
| 清单变更 | PUT JSON / run-chat draft | 镜像 `requirement_draft_json`（可选） |

**原则：** Phase A **双写**（JSON + DB）；JSON 仍为 UI 与 Pi meta 的 **source of truth**，DB 为 **搜索与列表** 的读优化副本。Phase B 评估是否 UI 改读 DB。

### 5.2 读取

| 消费者 | 用法 |
|--------|------|
| 侧栏 `GET /api/conversations` | 改查 `sessions` ORDER BY updated_at（可保留 JSON fallback） |
| 打开会话 `GET .../:id` | Phase A 仍读 JSON；Phase B 可从 `messages` 重建 Transcript |
| **`session_search` 工具** | agent-runtime 调 `SessionDB.search()`，零 LLM |
| Web 全局搜索（可选） | 同 FTS API |

### 5.3 Agent 工具：`session_search`

对齐 Hermes 三模式（见 `tools/session_search_tool.py`）：

1. **Discovery** — `query="收支明细 软删"` → 返回命中 session + snippet + ±5 条上下文  
2. **Scroll** — `session_id` + `around_message_id` → 翻页  
3. **Browse** — 无参 → 最近 N 个 session 摘要  

工具 schema 写入 `packages/agent-runtime`；system append 说明：**查历史原话用 session_search，勿把 transcript 写进 CORE**。

与 MEMORY_V1 **E0 Episodic** 对应，完成 Phase C 验收项 #8。

### 5.4 与 Pi jsonl 的关系（重要）

```text
Pi jsonl  = 模型续聊的「Working Memory」（OpenAI messages 格式，Pi 管理）
state.db  = 人类 + Agent 的「Episodic Archive」（Transcript 语义，letsTalk 管理）
```

- **不**用 DB 替代 Pi prompt 组装  
- 压缩（compact）后：新 session lineage 写 `parent_session_id`；jsonl 新文件；DB 新 session 行  
- HMR 恢复路径 **不变**：仍 `SessionManager.open(piSessionFile)`

---

## 6. 迁移计划

### Phase 0 — 基础设施（MVP）

- [ ] `packages/session-store` + schema v1  
- [ ] 启动时自动 `migrate`  
- [ ] 双写：`saveConversation` / `turn_end` 后 flush messages  
- [ ] `hermes sessions list` 等价：`GET /api/conversations` 读 DB  
- [ ] 单元测试：WAL、并发写、FTS 中文样例  

### Phase 1 — 搜索与工具

- [ ] `session_search` 工具（Discovery + Scroll）  
- [ ] MEMORY_V1 / AGENTS.md 补充 E0 路由  
- [ ] `pnpm sessions:import` 导入现有 `.agent/conversations/*.json`  

### Phase 2 — UI 与运维

- [ ] Web 侧栏/搜索框 FTS  
- [ ] `prune`：按天数删除 ended session（默认 **关**，与 Hermes 一致）  
- [ ] 导出 Markdown / JSON 从 DB 生成  

### Phase 3 — 可选优化

- [ ] UI 直读 DB，弱化 per-session JSON  
- [ ] 按 `anchor.menuId` 过滤历史  
- [ ] token 统计仪表盘  

---

## 7. 配置与环境变量（草案）

```bash
# .env.example 预留
LETS_TALK_STATE_DB=1              # 0=仅 JSON（回滚开关）
LETS_TALK_STATE_DB_PATH=          # 空=默认 .agent/state.db
LETS_TALK_SESSION_SEARCH=1        # 是否注册 session_search 工具
LETS_TALK_SESSION_PRUNE_DAYS=0    # 0=不自动 prune
```

---

## 8. 安全与边界

| 项 | 处理 |
|----|------|
| **路径** | DB 在 `.agent/`，随 WORKSPACE_ROOT；**不入 git**（加入 `.gitignore`） |
| **敏感信息** | Transcript 可能含业务数据；与 JSON 同级，仅本机/内网部署 |
| **注入** | FTS 查询做 sanitize（Hermes `_sanitize_fts5_query` 同款） |
| **体积** | 工具结果只存 preview；大附件存路径字符串 |
| **并发** | WAL + 短 timeout + 随机 jitter 重试（抄 Hermes SessionDB） |

---

## 9. 验收标准（Phase 0 + 1）

1. 新会话双写后，`.agent/state.db` 存在且 `sessions` / `messages` 有行  
2. 刷新 Web UI 行为与现网一致（JSON 仍可用）  
3. `session_search(query="某业务关键词")` 返回 **真实消息片段**，非 LLM 摘要  
4. 中文子串「枚举字典」可命中（trigram FTS）  
5. `pnpm sessions:import` 后，旧 JSON 会话可被搜索  
6. `LETS_TALK_STATE_DB=0` 时系统退化为纯 JSON，无功能回归  

---

## 10. 开放问题

1. **better-sqlite3 vs node:sqlite** — 需 PoC 在 Next.js API route 下的打包与 Alpine 部署  
2. **JSON 何时退役** — 建议至少双写跑一个迭代再定  
3. **requirementDraft 镜像** — 是否 FTS 索引清单 cell 文本（PM 「搜历史需求」）  
4. **多 worktree** — 每个 WORKSPACE_ROOT 独立 state.db，不做跨库联邦  

---

## 11. 文档索引

| 文档 | 关系 |
|------|------|
| [MEMORY_V1.md](./MEMORY_V1.md) | E0 / Phase C 父规格 |
| [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md) | 记忆 vs 会话分层 |
| [IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md) | 阶段 5 对话记录（JSON 方案） |
| [HERMES_MEMORY_REFERENCE.md](./HERMES_MEMORY_REFERENCE.md) | Hermes 调研 |

---

*下一步实现建议：先 land `packages/session-store` Phase 0 双写 + import 脚本，再注册 `session_search` 工具完成 MEMORY_V1 Phase C。*
