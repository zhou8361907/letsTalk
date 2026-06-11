# 07 — Memory

| 档位 | 优先级 | Mastra 矩阵 |
|------|--------|---------------|
| L3 | 🟢 **冻结扩展** | Memory ✅（够用） |

← [Handbook](./README.md) · [Mastra 矩阵](./00_GAP_ASSESSMENT.md#mastra-矩阵)

> **Mastra 视角**：Memory 模块解决跨会话状态；letsTalk M0/M1/M2 已对齐需求。  
> **不要对标 Mastra 而加 Memory 功能** — 用 Eval 证明瓶颈后再动。

---

## 1. 结论（先读）

**Memory 已达到 70～80% 成熟度（Mastra 矩阵：✅ 冻结）。** 未来 12 个月 **暂停扩展**。

```text
✅ 继续：读懂现有体系、维护写入边界
❌ 暂停：graph memory · vector memory · 复杂反思 pipeline · 知识图谱 · mem0
```

**原则：Eval 驱动 Memory，不是兴趣驱动 Memory。**

---

## 2. 架构概览

```text
M0   USER.md / CORE.md          Tier1 · 每会话 system · 有界
M1   topics/*.md                Tier2/3 · 按需 Pull
M2   INDEX.md                   glossary 加速
E0   episodic · session_search  FTS 跨会话
Skills  .agent/skills/          程序性记忆
L4   requirementDraft           独立 · 不进 memory
L3   workFront/workBack         活数据 · 不写 memory
```

权威规格：[MEMORY_V1.md](../MEMORY_V1.md)

---

## 3. 已有能力

| 能力 | 实现 |
|------|------|
| Tier1 注入 | `pi-resource-loader.ts` |
| M0 刷新 | `m0-refresh.ts` · `<core_memory_refresh>` |
| Memory 工具 | `memory-tools.ts` |
| Episodic | `episodic-prefetch.ts` · `session_search` |
| Compression | `session-compaction.ts` |
| Reflection | `background-memory-review.ts` |
| Skills | [SKILLS_V1.md](../SKILLS_V1.md) |

---

## 4. 写入边界（比存储技术更重要）

| 进 memory | 不进 memory |
|-----------|-------------|
| 称呼、偏好、惯例 | 代码快照 |
| 项目 jargon 消歧 | L4 需求清单全文 |
| 稳定业务事实（非代码） | API 响应复印件 |
| 怎么查某模块 | 临时 grep 结果 |

---

## 5. 冻结扩展策略 {#冻结扩展策略}

### 5.1 暂停项

| 技术 | 暂停原因 |
|------|----------|
| mem0 | 文件型 M0/M1 已满足单用户 |
| vector db | FTS + INDEX 未证明不够 |
| graph memory | 复杂度 >> 收益 |
| 知识图谱 | 领域未要求 |

### 5.2 何时解冻

必须**同时**满足以下三条（量化判据，避免形同虚设）：

1. **Eval 指标**：`memory_hit_rate` **连续 2 周 < 20%**，且 **≥3 个 scenario** 因「找不到历史 / 召回失败」而 fail（见 [02](./02_EVALUATION.md) Layer 2 runner）
2. **PM 明确痛点**：非开发者直觉；有书面场景描述
3. **Observability 可衡量**：解冻前后各跑一轮 scenario bank，pass rate 可对比

### 5.3 允许的小步

- 优化 INDEX 词条质量
- episodic 触发词 tuning（有 unit test）
- CORE 人工整理（非自动化 pipeline）

---

## 6. Reflection vs Compact

| | Compact | Reflection |
|--|---------|--------------|
| 目的 | 省 context window | 提炼长期记忆 |
| 触发 | context ≥90% | 每 N 轮 background review |
| 产物 | 压缩后 messages | 可能写 CORE/topics/skills |

---

## 7. 与 Context 的分工

- Memory 章：**跨会话、有界、Tier 注入**
- [06_CONTEXT](./06_CONTEXT_ENGINEERING.md)：**每轮 JIT、Pull、预算**

不要重复造「第二层 RAG」。

---

## 8. 学习资源

| 资源 | 重点 |
|------|------|
| [MEMORY_V1.md](../MEMORY_V1.md) | 全文 |
| [HERMES_MEMORY_REFERENCE.md](../HERMES_MEMORY_REFERENCE.md) | 对照 |
| [SESSION_SEARCH_V1.md](../SESSION_SEARCH_V1.md) | Episodic |
| mem0 文档 | **浏览即可，不集成** |

---

## 9. 自检

- [ ] 说出 USER vs CORE vs glossary 各存什么
- [ ] 解释为何 L4 draft 不进 memory
- [ ] 列出 2 个「Eval 证明召回不足」的可观测信号
