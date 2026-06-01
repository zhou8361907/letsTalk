/**
 * Pi 自定义工具：跨会话记忆（V1 · M0 USER/CORE + M1 topics）
 */

import {
  formatMemoryIndex,
  formatM0UsageLine,
  listMemoryFiles,
  readCoreMemory,
  readMemory,
  readUserProfile,
  removeCoreMemoryEntry,
  removeUserProfileEntry,
  saveMemory,
  updateCoreMemory,
  updateUserProfile,
  type MemoryKind,
} from "@lets-talk/memory";
import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const updateModeSchema = Type.Union([
  Type.Literal("append"),
  Type.Literal("replace"),
]);

const memoryActionSchema = Type.Union([
  Type.Literal("add"),
  Type.Literal("replace"),
  Type.Literal("remove"),
]);

const memoryTargetSchema = Type.Union([
  Type.Literal("user"),
  Type.Literal("core"),
]);

function m0ResultText(
  result: { path: string; charCount: number; limit: number },
  target: "user" | "core",
): string {
  return [
    `已更新 ${result.path}`,
    formatM0UsageLine(result.charCount, result.limit, target),
    "下一轮 user 前缀将带 <core_memory_refresh>；请以工具返回为准。",
  ].join("\n");
}

export function createMemoryTools(workspaceRoot: string): ToolDefinition[] {
  const memoryTool = defineTool({
    name: "memory",
    label: "Memory (USER/CORE)",
    description:
      "跨会话持久记忆（USER 画像 / CORE 助手笔记）。主动保存用户纠正、偏好、惯例、踩坑。" +
      "WHEN TO SAVE：用户纠正、说记住、透露偏好/称呼、发现稳定惯例。" +
      "勿存任务进度/PR/本单需求；jargon 消歧用 save_memory。",
    promptSnippet: "memory(action, target, content?, old_text?)",
    promptGuidelines: [
      "target=user：称呼、偏好；target=core：惯例、踩坑。",
      "action=add|replace|remove；replace/remove 用 old_text 定位。",
      "满额时用 replace 合并，勿无限 append。",
    ],
    parameters: Type.Object({
      action: memoryActionSchema,
      target: memoryTargetSchema,
      content: Type.Optional(Type.String({ description: "add/replace 必填" })),
      old_text: Type.Optional(
        Type.String({ description: "replace/remove 定位条目" }),
      ),
    }),
    execute: async (_id, params) => {
      const target = params.target as "user" | "core";
      const action = params.action as "add" | "replace" | "remove";

      if (action === "remove") {
        const result =
          target === "user"
            ? await removeUserProfileEntry(workspaceRoot, params.old_text ?? "")
            : await removeCoreMemoryEntry(workspaceRoot, params.old_text ?? "");
        return {
          content: [{ type: "text", text: m0ResultText(result, target) }],
          details: result,
        };
      }

      if (!params.content?.trim()) {
        throw new Error("add/replace 需要 content");
      }

      const mode = action === "add" ? "append" : "replace";
      const result =
        target === "user"
          ? await updateUserProfile(workspaceRoot, {
              content: params.content,
              mode,
              old_text: params.old_text,
            })
          : await updateCoreMemory(workspaceRoot, {
              content: params.content,
              mode,
              old_text: params.old_text,
            });

      return {
        content: [{ type: "text", text: m0ResultText(result, target) }],
        details: result,
      };
    },
  });

  const saveMemoryTool = defineTool({
    name: "save_memory",
    label: "Save Memory",
    description:
      "写入 M1 主题记忆（topics + jargon INDEX 双写）。用于项目 jargon 消歧、变更脉络；称呼/偏好请用 memory(target=user)。",
    promptSnippet: "save_memory(topic, kind, content, confidence, aliases?)",
    promptGuidelines: [
      "写入路由：称呼/偏好 → memory(target=user)；惯例/踩坑 → memory(target=core)。",
      "save_memory 用于 kind=glossary（项目 jargon 消歧）或 history（变更脉络）。",
      "用户说「记住」时先提炼：去掉 PR、branch、任务进度；只留跨会话仍成立的信息。",
      "禁止 API/菜单/当前需求复印件；不确定标 draft。",
      "Pull/read 后仍须 grep；memory 是指针。",
      "用户说忽略记忆 → 本轮勿调用任何 memory 工具。",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "主题名，如「枚举字典」" }),
      kind: Type.Union([
        Type.Literal("glossary"),
        Type.Literal("history"),
      ]),
      content: Type.String({
        description: "Markdown 正文（glossary: 含义/不要误解/怎么查；history: 功能/变更脉络）",
      }),
      confidence: Type.Union([
        Type.Literal("draft"),
        Type.Literal("verified"),
      ]),
      aliases: Type.Optional(
        Type.Array(Type.String({ description: "INDEX jargon 别名" })),
      ),
      tags: Type.Optional(Type.Array(Type.String())),
      sources: Type.Optional(
        Type.Array(
          Type.String({
            description: "相对工作区根的代码路径，用于软过期检测",
          }),
        ),
      ),
    }),
    execute: async (_id, params) => {
      const result = await saveMemory(workspaceRoot, {
        ...params,
        kind: params.kind as MemoryKind,
      });
      const lines = [
        `已写入 L2：${result.path}`,
        `topic: ${result.topic} | kind: ${result.kind} | confidence: ${result.confidence}`,
        "INDEX 行：",
        ...result.indexRows,
      ];
      if (result.warnings?.length) {
        lines.push("", "⚠ 校验提示：", ...result.warnings.map((w) => `- ${w}`));
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  });

  const readMemoryTool = defineTool({
    name: "read_memory",
    label: "Read Memory",
    description:
      "读取 M1 topic。memory 仅作方向提示；给出路径/接口结论前仍须 grep/read 代码。",
    promptSnippet: "read_memory(topic) — 读取 topic 或 INDEX jargon",
    promptGuidelines: [
      "read 后必须再查 L3 代码；不得把 L2 当最终答案复述。",
      "用户要求忽略记忆时勿调用。",
    ],
    parameters: Type.Object({
      topic: Type.String({
        description: "topic、slug 或 INDEX 中的 jargon",
      }),
    }),
    execute: async (_id, params) => {
      const result = await readMemory(workspaceRoot, params.topic);
      const header = [
        `# Memory: ${result.topic}`,
        `kind: ${result.kind ?? "—"} | confidence: ${result.confidence} | updated: ${result.updated_at}`,
        `path: ${result.path}`,
        "（以下仅供参考；引用路径/接口前须 grep/read 核实）",
      ];
      if (result.aliases.length) {
        header.push(`aliases: ${result.aliases.join(", ")}`);
      }
      if (result.staleWarning) {
        header.push(result.staleWarning);
      }
      const text = `${header.join("\n")}\n\n${result.body}`;
      return {
        content: [{ type: "text", text }],
        details: result,
      };
    },
  });

  const listMemoryIndexTool = defineTool({
    name: "list_memory_index",
    label: "List Memory Index",
    description: "列出 jargon INDEX（词条 → topics 文件）。",
    promptSnippet: "list_memory_index — jargon 索引",
    parameters: Type.Object({}),
    execute: async () => {
      const indexText = await formatMemoryIndex(workspaceRoot);
      const files = await listMemoryFiles(workspaceRoot);
      const fileLines =
        files.length > 0
          ? files.map((f) => `- ${f.path} (${f.topic})`).join("\n")
          : "（暂无 L2 topic 文件）";
      return {
        content: [
          {
            type: "text",
            text: ["# INDEX (jargon)", indexText, "", "# topics", fileLines].join(
              "\n",
            ),
          },
        ],
        details: { indexText, files },
      };
    },
  });

  const updateUserProfileTool = defineTool({
    name: "update_user_profile",
    label: "Update User Profile",
    description:
      "写入 M0 USER.md（称呼、偏好）。每会话 Tier 1 注入；勿把 nickname 写进 save_memory。",
    promptSnippet: "update_user_profile(content, mode, old_text?)",
    promptGuidelines: [
      "用户给助手起名、纠正称呼、沟通偏好 → 用本工具 append 或 replace。",
      "满额时用 replace + old_text 合并，勿无限 append。",
    ],
    parameters: Type.Object({
      content: Type.String({ description: "写入 USER.md 的 Markdown 片段" }),
      mode: updateModeSchema,
      old_text: Type.Optional(
        Type.String({ description: "replace 时定位旧片段（省略则整文件替换）" }),
      ),
    }),
    execute: async (_id, params) => {
      const result = await updateUserProfile(workspaceRoot, params);
      return {
        content: [
          {
            type: "text",
            text: m0ResultText(result, "user"),
          },
        ],
        details: result,
      };
    },
  });

  const updateCoreMemoryTool = defineTool({
    name: "update_core_memory",
    label: "Update Core Memory",
    description: "写入 M0 CORE.md（仓库惯例、踩坑、助手笔记）。",
    promptSnippet: "update_core_memory(content, mode, old_text?)",
    promptGuidelines: [
      "跨会话仍成立的惯例/踩坑 → append 或 replace；非 AGENTS.md 级规则。",
      "满额时用 replace 合并。",
    ],
    parameters: Type.Object({
      content: Type.String({ description: "写入 CORE.md 的 Markdown 片段" }),
      mode: updateModeSchema,
      old_text: Type.Optional(
        Type.String({ description: "replace 时定位旧片段" }),
      ),
    }),
    execute: async (_id, params) => {
      const result = await updateCoreMemory(workspaceRoot, params);
      return {
        content: [
          {
            type: "text",
            text: m0ResultText(result, "core"),
          },
        ],
        details: result,
      };
    },
  });

  const readUserProfileTool = defineTool({
    name: "read_user_profile",
    label: "Read User Profile",
    description: "读取 M0 USER.md 全文。",
    promptSnippet: "read_user_profile",
    parameters: Type.Object({}),
    execute: async () => {
      const result = await readUserProfile(workspaceRoot);
      return {
        content: [
          {
            type: "text",
            text: [
              `# USER.md (${result.charCount}/${result.limit} 字符)`,
              result.content,
            ].join("\n\n"),
          },
        ],
        details: result,
      };
    },
  });

  const readCoreMemoryTool = defineTool({
    name: "read_core_memory",
    label: "Read Core Memory",
    description: "读取 M0 CORE.md 全文。",
    promptSnippet: "read_core_memory",
    parameters: Type.Object({}),
    execute: async () => {
      const result = await readCoreMemory(workspaceRoot);
      return {
        content: [
          {
            type: "text",
            text: [
              `# CORE.md (${result.charCount}/${result.limit} 字符)`,
              result.content,
            ].join("\n\n"),
          },
        ],
        details: result,
      };
    },
  });

  return [
    memoryTool,
    saveMemoryTool,
    readMemoryTool,
    listMemoryIndexTool,
    updateUserProfileTool,
    updateCoreMemoryTool,
    readUserProfileTool,
    readCoreMemoryTool,
  ];
}

/** 后台 memory review：仅 memory 单工具 */
export function createMemoryOnlyTool(workspaceRoot: string): ToolDefinition {
  return createMemoryTools(workspaceRoot)[0]!;
}
