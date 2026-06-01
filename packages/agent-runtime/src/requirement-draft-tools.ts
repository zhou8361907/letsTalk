/**
 * Pi 工具：更新右侧需求草稿板（PM 助手 M1）
 */

import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { RequirementDraftState } from "@lets-talk/shared-types";
import { notifyDraftUpdated } from "./requirement-draft-runtime.js";
import {
  getActiveTurnId,
  isDebugLoggingEnabled,
  logDraftUpdate,
} from "./debug-logger.js";
import { logDraftIo } from "./draft-io-log.js";
import {
  applyDraftUpdate,
  getDraft,
  getDraftRevision,
  validateDraftUpdateInput,
  type ApplyDraftInput,
} from "./requirement-draft-store.js";

const itemSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "已有条目 id；大改需求时用 replaceItems 整体替换" })),
  title: Type.String({ description: "一句话需求标题，PM 能看懂，如「删除改为切换性别」" }),
  type: Type.Optional(
    Type.Union([
      Type.Literal("modify"),
      Type.Literal("add"),
      Type.Literal("unknown"),
    ]),
  ),
  fields: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description:
        "业务语言填写。常用：page 页面名, control 改哪里, asIs 现在怎样, toBe 希望改成（流程/交互用 1）2）编号步骤）, acceptance 怎么验收（与 toBe 步骤对应）, province 适用范围。codePaths 可填路径仅供研发，勿在其它字段写技术词。",
    }),
  ),
});

const params = Type.Object({
  draftRevision: Type.Number({
    description: "必须先 get_requirement_draft 取得当前 draftRevision",
  }),
  items: Type.Optional(Type.Array(itemSchema)),
  openQuestions: Type.Optional(Type.Array(Type.String())),
  blockingQuestion: Type.Optional(
    Type.Union([Type.String(), Type.Null()]),
  ),
  readyToFinalize: Type.Optional(
    Type.Boolean({
      description:
        "true=认为可导出定稿；仅当无 blockingQuestion、每条 toBe/acceptance 已填且 toBe 无「待确认」未核实规则时生效",
    }),
  ),
  replaceItems: Type.Optional(
    Type.Boolean({
      description: "true=用 items 整体替换；false=按 id 合并。默认首次替换、后续合并",
    }),
  ),
});

export function createRequirementDraftTools(options: {
  sessionId: string;
  getAnchorRef: () => string | null;
  /** 调试日志落盘目录（WORKSPACE_ROOT） */
  workspaceRoot?: string;
}): ToolDefinition[] {
  const tool = defineTool({
    name: "update_requirement_draft",
    label: "Update Requirement Draft",
    description:
      "更新右侧「需求清单」（给产品经理看）。用业务语言拆条，禁止把代码术语写进 page/control/toBe 等字段。",
    promptSnippet: "update_requirement_draft — 同步需求清单（业务语言）",
    promptGuidelines: [
      "有需求变更时：先 get_requirement_draft，再 update（非每轮必调）。",
      "update 前自检 toBe：你猜的规则（PM 未说的口径/阈值）改为「待确认：…」。",
      "小改：带 id，只传要改的 fields；大改：replaceItems: true + 全量 items。",
      "modify 至少填 page 或 control 之一。",
    ],
    parameters: params,
    execute: async (_id, raw) => {
      const p = raw as ApplyDraftInput & {
        draftRevision?: number;
        items?: Array<{
          id?: string;
          title: string;
          type?: "modify" | "add" | "unknown";
          fields?: Record<string, string>;
        }>;
      };

      const expected = getDraftRevision(options.sessionId);
      if (p.draftRevision !== expected) {
        const textOut = [
          "RevisionMismatch",
          `Current draftRevision = ${expected}`,
          "Please call get_requirement_draft() before updating.",
        ].join("\n");
        await logDraftIo(
          options.workspaceRoot,
          options.sessionId,
          "update_revision_mismatch",
          {
            input: raw,
            output: textOut,
            error: "RevisionMismatch",
          },
        );
        return {
          content: [{ type: "text", text: textOut }],
          details: undefined,
        };
      }

      const before = getDraft(options.sessionId) ?? null;
      const anchorRef = options.getAnchorRef();

      const validationError = validateDraftUpdateInput(
        options.sessionId,
        anchorRef,
        {
          items: p.items,
          openQuestions: p.openQuestions,
          blockingQuestion: p.blockingQuestion,
          readyToFinalize: p.readyToFinalize,
          replaceItems: p.replaceItems,
        },
      );
      if (validationError) {
        await logDraftIo(
          options.workspaceRoot,
          options.sessionId,
          "update_requirement_draft",
          {
            input: raw,
            output: validationError,
            error: "ValidationError",
          },
        );
        return {
          content: [{ type: "text", text: validationError }],
          details: undefined,
        };
      }

      const draft = applyDraftUpdate(options.sessionId, anchorRef, {
        items: p.items,
        openQuestions: p.openQuestions,
        blockingQuestion: p.blockingQuestion,
        readyToFinalize: p.readyToFinalize,
        replaceItems: p.replaceItems,
      });

      if (isDebugLoggingEnabled() && options.workspaceRoot) {
        await logDraftUpdate(options.workspaceRoot, options.sessionId, {
          turnId: getActiveTurnId(options.sessionId),
          toolInput: raw,
          before,
          after: draft,
          anchorRef,
        });
      }

      notifyDraftUpdated(options.sessionId, draft);

      const summary = draft.items
        .map(
          (it, i) =>
            `${i + 1}. [${it.type}] ${it.title} (${it.status})`,
        )
        .join("\n");

      const textOut = [
        "已更新需求草稿板。",
        `draftRevision: ${getDraftRevision(options.sessionId)}`,
        summary || "（暂无条目）",
        draft.blockingQuestion ? `阻断问题：${draft.blockingQuestion}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await logDraftIo(
        options.workspaceRoot,
        options.sessionId,
        "update_requirement_draft",
        {
          input: raw,
          output: textOut,
        },
      );

      return {
        content: [{ type: "text", text: textOut }],
        details: { draft, draftRevision: getDraftRevision(options.sessionId) },
      };
    },
  });

  return [tool];
}
