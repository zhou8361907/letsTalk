# letsTalk 后端架构迁移方案

> **目标**：从混乱的平铺结构转向清晰的分层架构，提升可维护性和可演进性
>
> **状态**：Phase 0 - 设计阶段
>
> **北极星**：参考 Mastra 工程理念，不迁移、不复刻，只吸收分层思想

---

## 一、现状问题诊断

### 1.1 当前结构

```
packages/
├── agent-runtime/          # 42 个文件，职责混杂
├── context/                # 16 个文件，平铺
├── conversation/           # 16 个文件，平铺
├── memory/                 # 13 个文件，有微分层
├── skills/                 # 11 个文件，平铺
├── ast-tools/              # 3 个文件
└── shared-types/           # 13 个文件
```

### 1.2 问题清单

| 问题 | 表现 | 影响 |
|------|------|------|
| **职责过载** | `agent-runtime` 包含 42 个文件：logging、trace、memory、requirement、session、debug、format | 难以定位代码、修改风险高 |
| **缺乏分层** | 所有文件平铺在 `src/` 下，无子目录组织 | 认知负荷高、新人导航困难 |
| **命名碎片化** | `turn-*.ts`（5 个）、`session-*.ts`（5 个）、`*-tools.ts`（6 个） | 查找困难、语义不明确 |
| **边界模糊** | `run-chat.ts` 编排 + 工具创建 + 持久化 + 调试 | 违反单一职责原则 |
| **依赖混乱** | `context`、`memory`、`conversation` 交叉引用 | 重构困难、循环依赖风险 |

---

## 二、目标结构设计

### 2.1 分层原则

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│                         (apps/web)                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Agent Runtime (Orchestration)              │
│                   仅负责编排，不包含实现                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Domain Layer                           │
│                 领域模型，无基础设施依赖                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                        │
│            日志/追踪/存储/格式化等基础设施                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 External Dependencies                        │
│          Pi SDK、数据库、文件系统等第三方服务                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 目标目录树

```
letsTalk/
├── packages/
│   ├── agent-runtime/          # 核心编排层（瘦身）
│   │   ├── src/
│   │   │   ├── core/           # 会话生命周期
│   │   │   │   ├── create-session.ts
│   │   │   │   ├── run-chat.ts
│   │   │   │   └── session-handle.ts
│   │   │   ├── tools/          # 工具注册与分发
│   │   │   │   ├── registry.ts
│   │   │   │   ├── tool-factory.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │
│   ├── domain/                 # 新增：领域层（从 agent-runtime 拆出）
│   │   ├── src/
│   │   │   ├── requirement/    # 需求领域
│   │   │   │   ├── draft-store.ts
│   │   │   │   ├── draft-runtime.ts
│   │   │   │   ├── draft-tools.ts
│   │   │   │   └── index.ts
│   │   │   ├── turn/           # 会话轮次领域
│   │   │   │   ├── prefix.ts
│   │   │   │   ├── debug.ts
│   │   │   │   └── index.ts
│   │   │   ├── anchor/         # 锚点领域（从 context 拆出）
│   │   │   │   ├── anchor-context.ts
│   │   │   │   ├── anchor-preview.ts
│   │   │   │   ├── list-anchors.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │
│   ├── infrastructure/         # 新增：基础设施层
│   │   ├── src/
│   │   │   ├── logging/        # 日志领域
│   │   │   │   ├── agent-logger.ts
│   │   │   │   ├── log-redact.ts
│   │   │   │   ├── log-steps.ts
│   │   │   │   └── index.ts
│   │   │   ├── tracing/        # 追踪领域
│   │   │   │   ├── recorder.ts
│   │   │   │   ├── store.ts
│   │   │   │   ├── finalize.ts
│   │   │   │   ├── tool-records.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── index.ts
│   │   │   ├── context/        # 上下文领域
│   │   │   │   ├── usage.ts
│   │   │   │   ├── budget.ts
│   │   │   │   ├── pull-tools.ts
│   │   │   │   └── index.ts
│   │   │   ├── session/        # 会话领域
│   │   │   │   ├── compaction.ts
│   │   │   │   ├── context.ts
│   │   │   │   ├── token-stats.ts
│   │   │   │   └── index.ts
│   │   │   ├── pricing/        # 计费领域
│   │   │   │   ├── model.ts
│   │   │   │   └── index.ts
│   │   │   ├── debug/          # 调试领域
│   │   │   │   ├── logger.ts
│   │   │   │   ├── turn-debug.ts
│   │   │   │   └── index.ts
│   │   │   ├── format/         # 格式化领域
│   │   │   │   ├── agent-log.ts
│   │   │   │   ├── turn-summary.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │
│   ├── context/                # 上下文构建层
│   │   ├── src/
│   │   │   ├── builders/       # 上下文构建器
│   │   │   │   ├── anchor.ts
│   │   │   │   ├── requirement.ts
│   │   │   │   ├── menu.ts
│   │   │   │   └── index.ts
│   │   │   ├── formatters/     # 格式化器
│   │   │   │   ├── context-v1.ts
│   │   │   │   ├── requirement-draft.ts
│   │   │   │   └── index.ts
│   │   │   ├── prompts/        # Prompt 模板
│   │   │   │   ├── system/
│   │   │   │   ├── pm/
│   │   │   │   └── index.ts
│   │   │   ├── menu-sys.ts
│   │   │   ├── workspace-paths.ts
│   │   │   └── index.ts
│   │
│   ├── conversation/           # 会话持久化层
│   │   ├── src/
│   │   │   ├── storage/        # 存储抽象
│   │   │   │   ├── db/
│   │   │   │   │   ├── session-db.ts
│   │   │   │   │   ├── db-search.ts
│   │   │   │   │   ├── db-sync.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── file/
│   │   │   │   │   ├── pi-session.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── index.ts
│   │   │   ├── actors/         # Actor 模式
│   │   │   │   ├── actors.ts
│   │   │   │   └── index.ts
│   │   │   ├── mappers/        # 数据映射
│   │   │   │   ├── transcript.ts
│   │   │   │   └── index.ts
│   │   │   ├── schema.ts
│   │   │   └── index.ts
│   │
│   ├── memory/                 # 记忆层（微调）
│   │   ├── src/
│   │   │   ├── core/           # 核心存储
│   │   │   │   ├── store.ts
│   │   │   │   ├── core-store.ts
│   │   │   │   └── index.ts
│   │   │   ├── index/          # 索引与搜索
│   │   │   │   ├── index-table.ts
│   │   │   │   ├── match.ts
│   │   │   │   └── index.ts
│   │   │   ├── edit/           # 编辑能力
│   │   │   │   ├── editor-files.ts
│   │   │   │   ├── frontmatter.ts
│   │   │   │   └── index.ts
│   │   │   ├── meta/           # 元数据
│   │   │   │   ├── paths.ts
│   │   │   │   ├── ignore.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │
│   └── skills/                 # 能力层（微调）
│       ├── src/
│       │   ├── registry/
│       │   ├── policy/
│       │   ├── cache/
│       │   └── index.ts
```

---

## 三、迁移策略

### 3.1 原则

1. **渐进式迁移**：每个 Phase 独立可回滚
2. **兼容层保障**：保留 re-export，允许新旧路径共存
3. **分层依赖**：严格执行 `runtime` → `domain` → `infrastructure`
4. **单包单域**：每个新增包只负责一个领域

### 3.2 分阶段计划

#### Phase 0：准备工作（当前）
- [x] 提交现有改动
- [ ] 编写迁移设计文档
- [ ] 建立迁移追踪表

#### Phase 1：建立新包结构（低风险）
- [ ] 创建 `packages/domain/` 包
- [ ] 创建 `packages/infrastructure/` 包
- [ ] 配置 pnpm workspace
- [ ] 建立 re-export 兼容层

#### Phase 2：领域拆分（低风险）
- [ ] 迁移 `requirement-*.ts` → `domain/requirement/`
- [ ] 迁移 `turn-*.ts` → `domain/turn/`
- [ ] 迁移 `anchor-*.ts` → `domain/anchor/`
- [ ] 更新 import 路径

#### Phase 3：基础设施拆分（中等风险）
- [ ] 迁移 logging 模块 → `infrastructure/logging/`
- [ ] 迁移 tracing 模块 → `infrastructure/tracing/`
- [ ] 迁移 context 模块 → `infrastructure/context/`
- [ ] 迁移 session 模块 → `infrastructure/session/`
- [ ] 依次完成其余模块

#### Phase 4：编排瘦身（高风险）
- [ ] 提取工具注册逻辑 → `agent-runtime/tools/`
- [ ] 精简 `run-chat.ts` 为纯编排代码
- [ ] 清理 `agent-runtime/src/` 中的迁移残留

#### Phase 5：收尾与清理
- [ ] 移除 re-export 兼容层
- [ ] 更新所有 import 路径
- [ ] 更新文档
- [ ] 重构验收

---

## 四、文件迁移映射表

### 4.1 domain 包

| 原路径 | 目标路径 |
|--------|----------|
| `agent-runtime/src/requirement-draft-store.ts` | `domain/requirement/draft-store.ts` |
| `agent-runtime/src/requirement-draft-runtime.ts` | `domain/requirement/draft-runtime.ts` |
| `agent-runtime/src/requirement-draft-tools.ts` | `domain/requirement/draft-tools.ts` |
| `agent-runtime/src/turn-prefix.ts` | `domain/turn/prefix.ts` |
| `agent-runtime/src/turn-debug.ts` | `domain/turn/debug.ts` |
| `agent-runtime/src/session-turn-debug.ts` | `domain/turn/turn-debug.ts` |
| `context/src/anchor-context.ts` | `domain/anchor/anchor-context.ts` |
| `context/src/anchor-preview.ts` | `domain/anchor/anchor-preview.ts` |
| `context/src/list-anchors.ts` | `domain/anchor/list-anchors.ts` |

### 4.2 infrastructure 包

| 原路径 | 目标路径 |
|--------|----------|
| `agent-runtime/src/agent-logger.ts` | `infrastructure/logging/agent-logger.ts` |
| `agent-runtime/src/log-redact.ts` | `infrastructure/logging/log-redact.ts` |
| `agent-runtime/src/log-steps.ts` | `infrastructure/logging/log-steps.ts` |
| `agent-runtime/src/trace-recorder.ts` | `infrastructure/tracing/recorder.ts` |
| `agent-runtime/src/trace-store.ts` | `infrastructure/tracing/store.ts` |
| `agent-runtime/src/trace-finalize.ts` | `infrastructure/tracing/finalize.ts` |
| `agent-runtime/src/trace-tool-records.ts` | `infrastructure/tracing/tool-records.ts` |
| `agent-runtime/src/trace-types.ts` | `infrastructure/tracing/types.ts` |
| `agent-runtime/src/context-usage.ts` | `infrastructure/context/usage.ts` |
| `agent-runtime/src/context-budget-config.ts` | `infrastructure/context/budget.ts` |
| `agent-runtime/src/context-pull-tools.ts` | `infrastructure/context/pull-tools.ts` |
| `agent-runtime/src/session-compaction.ts` | `infrastructure/session/compaction.ts` |
| `agent-runtime/src/session-context.ts` | `infrastructure/session/context.ts` |
| `agent-runtime/src/session-token-stats.ts` | `infrastructure/session/token-stats.ts` |
| `agent-runtime/src/model-pricing.ts` | `infrastructure/pricing/model.ts` |
| `agent-runtime/src/debug-logger.ts` | `infrastructure/debug/logger.ts` |
| `agent-runtime/src/format-agent-log.ts` | `infrastructure/format/agent-log.ts` |
| `agent-runtime/src/format-turn-summary.ts` | `infrastructure/format/turn-summary.ts` |

---

### 0.1 Phase 1 状态

| 任务 | 状态 | 完成时间 |
|------|------|----------|
| 创建 `packages/domain/` 包 | ✅ | 2026-06-15 |
| 创建 `packages/infrastructure/` 包 | ✅ | 2026-06-15 |
| 配置 pnpm workspace | ✅ | 2026-06-15 |
| 新包构建验证 | ✅ | 2026-06-15 |
| 建立 re-export 兼容层 | ⚪ 待开始 | - |

### 0.2 Phase 1 验收标准

- [x] `pnpm install` 成功，新包可通过 `workspace:*` 引用
- [ ] 新包构建产物正确
- [ ] re-export 兼容层完成

---

## 五、兼容性保障

### 5.1 Re-export 层

在 `agent-runtime/src/index.ts` 中添加：

```typescript
// === Re-export for backward compatibility (to be removed in Phase 5) ===

// Domain
export * from "../domain/requirement/index.js";
export * from "../domain/turn/index.js";
export * from "../domain/anchor/index.js";

// Infrastructure - Logging
export {
  createRequestLogger,
  createTraceId,
  logAgentStep,
} from "../infrastructure/logging/index.js";
export { hashText, truncateForProdLog } from "../infrastructure/logging/index.js";
export type { AgentStepLogFields, LogStep } from "../infrastructure/logging/index.js";

// Infrastructure - Tracing
export { TraceRecorder } from "../infrastructure/tracing/index.js";
export { finalizeTrace } from "../infrastructure/tracing/index.js";
export {
  findTraceById,
  listSessionTraces,
  summarizeDailySessionCosts,
} from "../infrastructure/tracing/index.js";

// Infrastructure - Pricing
export { estimateCostUsd, MODEL_PRICING } from "../infrastructure/pricing/index.js";

// Infrastructure - Context
export {
  getContextUsageForSession,
  snapshotContextUsage,
} from "../infrastructure/context/index.js";

// Infrastructure - Session
export { cleanupSessionDebug } from "../infrastructure/debug/index.js";

// Infrastructure - Format
export { formatAgentLog } from "../infrastructure/format/index.js";

// Domain - Turn
export {
  buildTurnDebugSnapshot,
  isTurnDebugSseEnabled,
  readPiJsonlFull,
  readPiJsonlTail,
} from "../domain/turn/index.js";
export {
  findTurnIdByUserMessage,
  loadSessionSystemPromptFromDisk,
  loadSessionTurnDebugFromDisk,
  mergeTurnDebugSnapshots,
} from "../domain/turn/index.js";

// Infrastructure - Debug
export { buildTurnDebugSnapshot, isTurnDebugSseEnabled } from "../infrastructure/debug/index.js";

// Core
export {
  createPiSession,
  type CreatePiSessionOptions,
  type PiSessionHandle,
} from "./core/create-session.js";
export {
  runChat,
  getWorkspaceRoot,
  queryContextUsage,
  disposePiSession,
  type RunChatOptions,
} from "./core/run-chat.js";
```

---

## 六、风险控制

| 风险 | 缓解措施 |
|------|----------|
| **迁移中断** | 每个包迁移后立即运行 `pnpm lint` + `pnpm dev` 验证 |
| **循环依赖** | 严格执行分层依赖：`runtime` → `domain` → `infrastructure` |
| **历史包袱** | 保留 re-export 层，但不添加新代码 |
| **类型丢失** | 每个新包保留 `tsconfig.build.json`，确保类型导出正确 |
| **运行时错误** | Phase 1-3 保留原文件，仅 re-export，逐步替换 |

---

## 七、验收标准

### 7.1 Phase 验收

| Phase | 验收标准 |
|-------|----------|
| Phase 1 | `pnpm install` 成功，新包可通过 `workspace:*` 引用 |
| Phase 2 | `pnpm lint` 通过，领域代码无循环依赖 |
| Phase 3 | `pnpm dev` 正常运行，基础设施层无破坏 |
| Phase 4 | `agent-runtime/src/` 文件数 ≤ 8 |
| Phase 5 | 所有 import 路径更新，无 re-export 残留 |

### 7.2 最终验收

- [ ] `pnpm lint` 全部通过
- [ ] `pnpm build` 成功
- [ ] `pnpm dev` 正常运行
- [ ] 所有端到端测试通过
- [ ] 文档同步更新

---

## 八、进度追踪

| Phase | 状态 | 完成时间 |
|-------|------|----------|
| Phase 0: 准备 | 🟡 进行中 | - |
| Phase 1: 建立结构 | 🟡 部分完成 | 2026-06-15 |
| Phase 2: 领域拆分 | ⚪ 待开始 | - |
| Phase 3: 基础设施拆分 | ⚪ 待开始 | - |
| Phase 4: 编排瘦身 | ⚪ 待开始 | - |
| Phase 5: 收尾清理 | ⚪ 待开始 | - |

---

## 九、Phase 1 执行日志

### 2026-06-15

**执行内容**：
1. 创建 `packages/domain/` 包结构
   - `src/requirement/` - 需求领域占位
   - `src/turn/` - 轮次领域占位
   - `src/anchor/` - 锚点领域占位
2. 创建 `packages/infrastructure/` 包结构
   - `src/logging/` - 日志基础设施占位
   - `src/tracing/` - 追踪基础设施占位
   - `src/context/` - 上下文基础设施占位
   - `src/session/` - 会话基础设施占位
   - `src/pricing/` - 计费基础设施占位
   - `src/debug/` - 调试基础设施占位
   - `src/format/` - 格式化基础设施占位
3. 配置 package.json 和 tsconfig
4. 验证构建成功

**剩余任务**：
- 在 `agent-runtime/src/index.ts` 添加 re-export 兼容层
- 验证 `pnpm lint` 通过
- 验证 `pnpm dev` 正常运行

---

**最后更新**: 2026-06-15
**维护者**: @zhoushuaif