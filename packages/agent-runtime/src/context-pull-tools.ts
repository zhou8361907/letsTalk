/**
 * Payload Pull 工具：get_anchor_preview / get_requirement_draft / get_business_hints
 */

import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentAnchor, RequirementDraftState } from "@lets-talk/shared-types";
import {
  buildAnchorPreviewContent,
  formatHintsDirectoryHint,
  formatRequirementDraftSnapshot,
  listBusinessHintFiles,
  resolveWorkspaceLayout,
} from "@lets-talk/context";
import {
  formatMemoryContextForPrefix,
  isMemoryIgnoredMessage,
  resolveMemoryContext,
} from "@lets-talk/memory";
import { logDraftIo } from "@lets-talk/infrastructure/debug";

export function createContextPullTools(options: {
  sessionId: string;
  workspaceRoot: string;
  chatMode: "explore" | "prd";
  getAnchor: () => AgentAnchor | null;
  getDraft: () => import("@lets-talk/shared-types").RequirementDraftState | null;
  getDraftRevision: () => number;
  memoryEnabled?: boolean;
}): ToolDefinition[] {
  const layout = resolveWorkspaceLayout();

  const getAnchorPreview = defineTool({
    name: "get_anchor_preview",
    label: "Get Anchor Preview",
    description:
      "读取当前焦点锚点的预览（文件头或菜单 grep 线索）。用户切换菜单/页面后按需调用；非每问必调。",
    promptSnippet: "get_anchor_preview — 当前焦点页面/菜单预览",
    promptGuidelines: [
      "anchor_ref 是软焦点：用户点菜单只为告知当前位置，换页不清 PRD 清单。",
      "涉及控件、路由、页面结构时再调用；泛业务问题可不调用。",
    ],
    parameters: Type.Object({
      anchorRef: Type.Optional(
        Type.String({ description: "省略则使用当前会话焦点 ref" }),
      ),
    }),
    execute: async (_id, raw) => {
      const p = raw as { anchorRef?: string };
      const current = options.getAnchor();
      const ref = p.anchorRef?.trim() || current?.ref?.trim();
      if (!ref) {
        return {
          content: [
            {
              type: "text",
              text: "当前无锚点（全库探索）。请 grep/find 或让用户选择菜单/页面。",
            },
          ],
          details: undefined,
        };
      }

      let anchor = current;
      if (p.anchorRef?.trim() && current?.ref !== ref) {
        anchor = {
          kind: current?.kind ?? "file",
          ref,
          label: ref,
        };
      }
      if (!anchor) {
        anchor = { kind: "file", ref, label: ref };
      }

      const preview = await buildAnchorPreviewContent(
        options.workspaceRoot,
        anchor,
      );
      return {
        content: [
          {
            type: "text",
            text: [
              `anchorRef: ${ref}`,
              `kind: ${anchor.kind}`,
              "---",
              preview,
            ].join("\n"),
          },
        ],
        details: { anchorRef: ref, kind: anchor.kind, preview },
      };
    },
  });

  const getRequirementDraft = defineTool({
    name: "get_requirement_draft",
    label: "Get Requirement Draft",
    description: "读取当前会话 PRD 需求清单全文与 draft_revision（写前必须先 get）。",
    promptSnippet: "get_requirement_draft — 需求清单全文",
    promptGuidelines: [
      "update_requirement_draft 前必须先调用以获取 draft_revision 与条目 id。",
      "换菜单/换页后清单默认保留；勿未经确认清空。",
    ],
    parameters: Type.Object({}),
    execute: async () => {
      const draft = options.getDraft();
      const revision = options.getDraftRevision();
      const snapshot = draft ? formatRequirementDraftSnapshot(draft) : "（暂无草稿）";
      const details: { revision: number; draft: RequirementDraftState | null } = {
        revision,
        draft: draft ?? null,
      };
      const textOut = [`draftRevision: ${revision}`, "---", snapshot].join("\n");
      await logDraftIo(options.workspaceRoot, options.sessionId, "get_requirement_draft", {
        input: {},
        output: textOut,
      });
      return {
        content: [
          {
            type: "text",
            text: textOut,
          },
        ],
        details,
      };
    },
  });

  const getBusinessHints = defineTool({
    name: "get_business_hints",
    label: "Get Business Hints",
    description: "列出 .agent/hints/ 业务线索文件（仅供参考，用时再 read）。",
    promptSnippet: "get_business_hints — 业务 hints 目录",
    parameters: Type.Object({}),
    execute: async () => {
      const files = await listBusinessHintFiles(options.workspaceRoot);
      const hint = formatHintsDirectoryHint(files);
      return {
        content: [{ type: "text", text: hint || "（暂无 hints 文件）" }],
        details: { files },
      };
    },
  });

  const resolveMemoryTerms = defineTool({
    name: "resolve_memory_terms",
    label: "Resolve Memory Terms",
    description:
      "根据消息文本匹配 INDEX 黑话，Pull 对应 L2 topic 片段（prefix 已静默注入时可作补充）。",
    promptSnippet: "resolve_memory_terms(message) — INDEX 命中 Pull",
    promptGuidelines: [
      "用户提到业务黑话且需背景时调用；命中后先读 memory 再 grep 代码。",
      "用户要求忽略记忆时勿调用。",
    ],
    parameters: Type.Object({
      message: Type.String({ description: "待匹配的用户消息或关键词" }),
    }),
    execute: async (_id, params) => {
      if (isMemoryIgnoredMessage(params.message)) {
        return {
          content: [
            {
              type: "text",
              text: "（用户要求忽略 memory，本轮不 Pull）",
            },
          ],
          details: { matchedTerms: [], blocks: [], suppressed: true },
        };
      }
      const ctx = await resolveMemoryContext(
        options.workspaceRoot,
        params.message,
        { maxBodyChars: 2000 },
      );
      const text =
        ctx.blocks.length > 0
          ? formatMemoryContextForPrefix(ctx)
          : "（未命中 INDEX 黑话）";
      return {
        content: [{ type: "text", text }],
        details: ctx,
      };
    },
  });

  const memoryPull = options.memoryEnabled ? [resolveMemoryTerms] : [];

  return [
    getAnchorPreview,
    ...(options.chatMode === "prd" ? [getRequirementDraft] : []),
    getBusinessHints,
    ...memoryPull,
  ];
}
