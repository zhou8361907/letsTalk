# letsTalk 记忆体系 V0（对齐 Claude Code · 设计稿）

| 项目 | 内容 |
|------|------|
| 版本 | V0 |
| 日期 | 2026-05-30 |
| 状态 | **V0 已实现**（Pull + save 双写 INDEX/L2） |
| 参考 | [Claude Code Memory](https://code.claude.com/docs/en/memory) · [HERMES_MEMORY_REFERENCE.md](./HERMES_MEMORY_REFERENCE.md) |
| 关联 | [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md)（构筑与展望）· [AGENTS.md](../AGENTS.md) · [CONTEXT_MANAGEMENT_V1.md](./CONTEXT_MANAGEMENT_V1.md) |

> **产品定位：** 记忆是**后台能力**，辅助 explore / prd 听懂黑话、串起变更脉络；**不**新增主界面面板，**不**复印代码或菜单树，**不**替代需求清单。

---

## 1. 与 Claude Code 的对齐关系

| Claude Code | letsTalk V0 |
|-------------|-------------|
| CLAUDE.md（人写规则） | **L0** `AGENTS.md` + Rule Push（`arch_rules` / `pm_rules`） |
| Auto memory `MEMORY.md` 索引 | **L1** `.agent/memory/INDEX.md`（**仅黑话 → 文件**，极短） |
| Topic 文件按需 read | **L2** `.agent/memory/topics/*.md` |
| 代码 grep/read | **L3** workFront/workBack + menu-map + 锚点 |
| 当前任务状态 | **L4** requirementDraft（非 memory） |

**刻意不对齐：**

- 不把 L1/L2 全文塞进每轮 system prompt（遵循 V1 Pointer + Pull）。
- 不做 Hermes 式 background review（V0 不做）。
- L1 **禁止** Claude Code 索引里常见的长摘要；一行一词表即可。

---

## 2. 分层职责（L0–L4）

```text
L0  规则（人维护 · Rule Push · 每会话/切模式可见）
L1  黑话索引 INDEX.md（人+Agent · 仅词条→路径 · 极短）
L2  主题正文 topics/*.md（人+Agent · 按需 Pull/read）
L3  活数据（系统 · menu-map / grep / read / 锚点）
L4  需求清单（Agent 工具 · 当前单交付）
```

**依赖方向：** L0 约束怎么用 L1/L2；L1 指向 L2；L2 引用 L3 的**搜法**，不缓存 L3 快照。

---

## 3. L0 规则层（仔细设计）

L0 回答：**Agent 在这个仓库里应如何工作、记忆是什么角色**。内容必须**稳定**、**短**、**不随某次改代码而变**。

### 3.1 三层来源（避免双份）

| 来源 | 路径 | 何时进入模型 | 写什么 |
|------|------|--------------|--------|
| **仓库规则** | 根目录 `AGENTS.md` | Pi `DefaultResourceLoader` **可能**加载；letsTalk **另**在 Rule Push 时注入摘要 | 代码为准、Java 读法、工作区布局、**记忆体系一节（见 §3.2）** |
| **架构规则 Push** | `buildRulesContext` → `<arch_rules>` | 首条 user 消息或 explore↔prd 切换 | 工作区目录 hint + `AGENTS.md` 截断 + **memory 使用要点（≤15 行）** |
| **PM 规则 Push** | `pm_rules` | 同上，且 `chatMode=prd` | 需求清单写法 + **记忆如何辅助清单（不写入清单字段）** |

**原则：** 同一条规则只在一个权威位置维护；`arch_rules` 里是**摘要**，全文在 `AGENTS.md`。

### 3.2 `AGENTS.md` 中「记忆」一节应写什么（L0 核心）

建议固定为以下 **DO / DON'T**（实现时落入 AGENTS.md，此处为设计原文）：

**DO**

- 用户**强调、纠正、当事实陈述**（「记住」「我们说的 X 就是指 Y」）→ 主动 `save_memory` 或 `write` 更新 L2，并**同步 L1 一行**。
- 用户消息出现 **INDEX 中已登记黑话** → 先 `read_memory` / read L2，再 grep/read 代码。
- L2 写：**业务含义、别误解什么、建议怎么搜**（指向 L3）。
- 代码与记忆冲突 → **以代码为准**，并提示记忆可能过时。

**DON'T**

- 禁止把 **接口清单、DTO 字段、REST 路径列表、菜单树** 写入 memory（应用 grep/read）。
- 禁止把 **当前这单需求** 写入 memory（用 requirementDraft）。
- 禁止在 **INDEX.md** 写正文（只允许表格式词条→路径）。
- 禁止未经用户强调就把单次会话结论标为 `verified`。

### 3.3 `arch_rules` 中 memory 要点（注入块，保持极短）

每会话 Rule Push 时附加（示意，实现时 ≤600 字符）：

```text
记忆：.agent/memory/INDEX.md 仅黑话索引；正文在 topics/。
用户强调/纠正事实 → save_memory；出现已登记黑话 → 先 read 对应 topic 再查代码。
禁止把 API/菜单复印件写入 memory；与代码冲突以代码为准。
```

### 3.4 `pm_rules` 中 memory 要点（prd 专用）

```text
需求清单字段写 PM 业务话；跨会话共识/黑话/反复修改原因 → memory（L2），勿塞进清单 replaceItems 除非 PM 明确要求。
写清单前若 INDEX 命中相关黑话或 history topic，先 read 再 update_requirement_d draft。
```

### 3.5 L0 明确**不**包含

- 具体黑话释义（→ L2）
- 黑话列表（→ L1）
- 某 Controller 的方法表（→ L3）
- 需求清单条目（→ L4）

---

## 4. L1 索引层：尽可能简短

### 4.1 文件

**路径：** `.agent/memory/INDEX.md`（ deliberately 不用 `MEMORY.md` 存长文，避免与 Claude Code 索引长文混淆；仅作**纯表**）

### 4.2 格式（唯一合法形态）

Markdown 表格，**三列**，无第四列长文：

```markdown
# 黑话索引（仅词条 → 文件；正文禁止写在本文件）

| 黑话 | 文件 | 类型 |
|------|------|------|
| 枚举字典 | topics/glossary-enum-dict.md | glossary |
| 字典（本项目默认） | topics/glossary-enum-dict.md | glossary |
| 用户管理-删除 | topics/history-user-delete.md | history |
```

**约束**

- 每行 **≤120 字符**（硬限，写入工具校验）。
- 「类型」仅 `glossary` | `history`。
- 多个黑话可指向**同一** L2 文件。
- **禁止**在本文件写含义、API、菜单、变更故事。

### 4.3 加载策略（后台 · 省 token · 注意查全率局限）

| 时机 | 行为 |
|------|------|
| 会话开始 | **不**默认加载整表（与 Claude Code 每会话灌 MEMORY 不同） |
用户消息 | 服务端**子串匹配 + 中文连续字重叠** INDEX 黑话列 → 命中则 Pull L2 片段（**≤2000 字符，按 confidence → updated_at 排序**）进 prefix 围栏 |
| Agent 主动 | `read_memory` / `resolve_memory_terms` / `read .agent/memory/INDEX.md` |

**V0 静默注入的已知限制：**
- **匹配方式**：`message.includes(term)` 纯子串。用户说"那个字典表"而非"枚举字典"→ 不命中。同义词、拼音变体全部漏过。
- **注入量**：最多 2000 字符（2026-05-31 从 500 上调）。超长条目会截断。
- **无排序**：多个词条命中时按文件顺序返回，不按 `confidence` 或 `updated_at` 排序。
- **Agent 可忽略**：`<memory_context>` 是 prefix 围栏，不是 system prompt 硬指令，模型可以选择性忽视。

详见 [MEMORY_SYSTEM.md §4.1 及 §6](./MEMORY_SYSTEM.md) 的完整讨论。

### 4.4 规模预期

- 100 条黑话 ≈ 100 行表 ≈ 几 KB；即使偶尔全表 read 也可接受。
- 正常运行应 **命中才 Pull**，L1 多数时间不在 context 里。

---

## 5. L2 主题层

### 5.1 路径与命名

```text
.agent/memory/
├── INDEX.md
├── README.md
└── topics/
    ├── glossary-{slug}.md
    └── history-{slug}.md
```

`slug`：小写、连字符，由 topic 生成（与现有 `@lets-talk/memory` `topicToSlug` 一致）。

### 5.2 Frontmatter（在 L2 文件头）

```yaml
---
topic: 枚举字典
kind: glossary          # glossary | history
aliases: [字典, 枚举]   # 可选；与 INDEX 同步，以 INDEX 为检索权威
confidence: draft       # draft | verified
updated_at: 2026-05-30T...
---
```

**`sources`（可选）：** 仅表示「上次核对过哪类路径」，**不**表示 memory 内容与 sources 等价；sources 文件 mtime 新于 memory 时 `read_memory` 附 stale 警告（现有 `@lets-talk/memory` 已支持）。

### 5.3 正文写什么

**kind: glossary**

```markdown
## 含义（PM 能懂）
## 不要误解（例如：不是 sys_menu / 不是菜单管理）
## 怎么查（grep/read 策略，不写结果快照）
## 备注
```

**kind: history**

```markdown
## 功能（业务名，不是 Controller 名）
## 变更脉络（时间 · 改了什么 · 为什么 · 当时共识）
## 未决问题
```

**禁止：** REST 接口列表、字段表、整段代码、menuId 清单。

### 5.4 与 `.agent/hints/` 的关系

- **hints**：人维护的长线索，可保留。
- **memory topics**：短、结构化、Agent 可写。
- V0 不合并目录；hint 中稳定黑话应**迁移**为 glossary topic + INDEX 一行。

---

## 6. 写记忆功能（必须保证）

V0 要求：**用户强调 / 事实输入 → Agent 能可靠写入 L1+L2**。实现前可先手工维护文件；实现后走工具。

### 6.1 写入通道

| 通道 | 用途 | 开关 |
|------|------|------|
| **`save_memory`** | 首选：结构化写入 L2 + 更新 INDEX | `LETS_TALK_MEMORY_TOOLS=1` |
| **`write` / `edit`** | 人工或 Agent 直接改 md | 默认开（`.agent/`） |
| **手工** | 研发/PM 直接编辑 INDEX / topics | 始终 |

### 6.2 `save_memory` 行为契约（实现清单）

一次成功写入必须：

1. 写入或更新 **L2** `topics/{kind}-{slug}.md`（frontmatter + body）。
2. 更新 **L1**：对每个 alias / 黑话，INDEX 表中有且仅有一行指向该文件；已存在则不改路径只改 L2。
3. 返回文本含：`INDEX 行` + `L2 路径` + `confidence`。
4. **禁止**只写 L2 不更新 INDEX（防孤儿文件）。
5. **禁止**在 INDEX 写超过三列或带正文。

**触发（Agent guideline，写入 L0）：**

- 用户：「记住」「以后都这么理解」「我们说的 X 就是 Y」「别再用 menu 查这个」
- 用户纠正 Agent 对黑话的理解
- 用户总结**稳定**业务事实（非单次任务进度）

**不触发：**

- 仅完成当前需求清单
- 仅查到代码路径（路径属于 L3，不写进 L2 大段复印件）

### 6.3 `read_memory` / Pull

- `read_memory(topic)` → 读 L2 全文 + stale 警告。
- 实现 Pull 工具 `resolve_memory_terms(message)` → 命中 INDEX → 返回 L2 片段（供 `turn-prefix` 静默围栏，用户无感）。

### 6.4 与需求清单的关系

- memory **不**通过 SSE 推 UI。
- memory **不**占用 requirementDraft 字段。
- prd 模式下：Agent 可在对话中**引用** memory；清单仍走 `update_requirement_draft`。

---

## 7. 实现改动面（V0 落地时）

| 模块 | 改动 |
|------|------|
| `.agent/memory/` | INDEX.md + topics/ 目录规范；迁移/改写 legacy 文件 |
| `AGENTS.md` | §3.2 记忆 DO/DON'T |
| `packages/memory` | `saveMemory` 同步 INDEX；`matchIndexTerms()`；kind/aliases |
| `memory-tools.ts` | 扩展 schema（kind、aliases）；guideline 对齐 §6 |
| `context-pull-tools.ts` | 新增 `resolve_memory_terms` 或扩展现有 pull |
| `turn-prefix.ts` | 命中时静默 `<memory_context>` 围栏（可选） |
| `pm-resources.ts` | pm_rules 增加 §3.4 要点 |
| `create-session.ts` | 注册 memory 工具 + pull（`LETS_TALK_MEMORY_TOOLS=1`） |
| `apps/web` | **不改**主 UI |

**环境变量**

```bash
LETS_TALK_MEMORY_TOOLS=0   # 关闭 save_memory / read_memory / Pull
# LETS_TALK_AGENT_WRITE=0  # 若关闭则无法用 write 修 md
```

---

## 8. 影响评估

| 维度 | 影响 |
|------|------|
| **UI** | 无新面板；Transcript 工具折叠可能出现 save/read |
| **Token** | 命中黑话时 +L2 一段；平时几乎无增量 |
| **行为** | 黑话先懂再 grep；需求清单与历史脉络一致 |
| **风险** | 错误写入 → 靠 draft、人工改 md、stale 警告 |
| **维护** | INDEX 极短；主要维护 L2 topics |

---

## 9. Legacy 文件处理

| 文件 | 建议 |
|------|------|
| `order-state-machine.md` | 改写为 `topics/history-detail.md`（叙事+规则）或 `topics/glossary-detail.md`（「收支明细」黑话）；**删除** REST 列表；INDEX 加一行 |
| 已删 `detail-api-flow.md` | 不再恢复 |

---

## 10. 验收标准（V0）

### 正向验收

1. INDEX.md 仅表格式三列，无正文段落。
2. `LETS_TALK_MEMORY_TOOLS=1` 时，用户说「记住：枚举字典不是 menu…」→ Agent 调用 `save_memory` → INDEX + L2 同时存在。
3. 用户再次提「枚举字典」→ Agent 先 read/Pull L2，再 grep，**不**默认搜 menu。
4. explore / prd 均无记忆侧栏；需求清单行为不变。
5. L0：`AGENTS.md` + Rule Push 含 §3.2 DO/DON'T，Agent 不将 API 复印件写入 memory。

### 负面验收（已知缺陷，作为后续改进 baseline）

6. INDEX 中有「枚举字典」，用户说「那个字典表」→ **静默注入不命中**（纯子串匹配的局限，预期行为，无需修复但需记录为 baseline）
7. INDEX 中有「枚举字典」「收支明细」，用户说「字典和明细的关系」→ **可能命中 2 条**（2000 字符注入上限，超长截断风险）
8. 用户未明确说 INDEX 中的词条，而用同义词/省略说法 → **不命中**（当前 V0 正常行为）

---

## 11. 开放问题（后续 V1）

- INDEX 与 L2 `aliases` 双写：是否由 `save_memory` 自动生成 INDEX 行（推荐是）。
- history 按「功能名」索引还是仅按「黑话」索引。
- 是否在设置页提供 INDEX/topics 只读浏览（非 MVP）。
