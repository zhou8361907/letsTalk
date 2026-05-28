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
import {
  applyDraftUpdate,
  getDraft,
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
        "业务语言填写。常用：page 页面名, control 改哪里, asIs 现在怎样, toBe 希望改成, acceptance 怎么验收, province 适用范围。codePaths 可填路径仅供研发，勿在其它字段写技术词。",
    }),
  ),
});

const params = Type.Object({
  items: Type.Optional(Type.Array(itemSchema)),
  openQuestions: Type.Optional(Type.Array(Type.String())),
  blockingQuestion: Type.Optional(
    Type.Union([Type.String(), Type.Null()]),
  ),
  readyToFinalize: Type.Optional(Type.Boolean()),
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
      "读者是不懂代码的 PM：右侧只写业务话。",
      "requirement_draft_snapshot 里有 id：更新时必须带上，在同一页/同一需求上改，勿新建空第二条。",
      "PM 一件事 = 1 条；禁止「后端支持xxx」单独成条，后端写 codePaths。",
      "modify 改现有：page、control、asIs、toBe、acceptance。",
      "PM 大改 replaceItems: true；小补充 merge 并带 id。",
    ],
    parameters: params,
    execute: async (_id, raw) => {
      const p = raw as ApplyDraftInput & {
        items?: Array<{
          id?: string;
          title: string;
          type?: "modify" | "add" | "unknown";
          fields?: Record<string, string>;
        }>;
      };

      const before = getDraft(options.sessionId) ?? null;
      const anchorRef = options.getAnchorRef();

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

      return {
        content: [
          {
            type: "text",
            text: [
              "已更新需求草稿板。",
              summary || "（暂无条目）",
              draft.blockingQuestion
                ? `阻断问题：${draft.blockingQuestion}`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        details: draft,
      };
    },
  });

  return [tool];
}
