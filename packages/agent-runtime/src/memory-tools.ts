/**
 * Pi 自定义工具：跨会话业务记忆（阶段 4）
 * 落盘 {WORKSPACE_ROOT}/.agent/memory/*.md
 */

import { listMemoryFiles, readMemory, saveMemory } from "@lets-talk/memory";
import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

export function createMemoryTools(workspaceRoot: string): ToolDefinition[] {
  const saveMemoryTool = defineTool({
    name: "save_memory",
    label: "Save Memory",
    description:
      "将跨会话、跨文件的业务规则写入 .agent/memory/{topic}.md。需有代码依据；单次即可回答的问题不要写。",
    promptSnippet: "save_memory(topic, content, confidence) — 写入业务记忆",
    promptGuidelines: [
      "跨页面/跨会话的业务结论、流程规则 → save_memory（verified 需引用 sources 代码路径）。",
      "读取顺序：grep .agent/memory → read_memory → grep/read 业务代码。",
      "记忆与代码冲突时以代码为准。",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "主题 slug，如 order-state-machine" }),
      content: Type.String({ description: "Markdown 正文（不含 frontmatter）" }),
      confidence: Type.Union([
        Type.Literal("draft"),
        Type.Literal("verified"),
      ]),
      tags: Type.Optional(Type.Array(Type.String())),
      sources: Type.Optional(
        Type.Array(Type.String({
          description: "相对工作区根的代码路径，用于软过期检测",
        })),
      ),
    }),
    execute: async (_id, params) => {
      const result = await saveMemory(workspaceRoot, params);
      return {
        content: [
          {
            type: "text",
            text: `已写入记忆：${result.path}\ntopic: ${result.topic}`,
          },
        ],
        details: result,
      };
    },
  });

  const readMemoryTool = defineTool({
    name: "read_memory",
    label: "Read Memory",
    description:
      "读取 .agent/memory 下某 topic 的全文。若 sources 对应代码已更新，会附过期提示。",
    promptSnippet: "read_memory(topic) — 读取业务记忆全文",
    parameters: Type.Object({
      topic: Type.String({
        description: "topic 或 slug，与 save_memory 时一致",
      }),
    }),
    execute: async (_id, params) => {
      const result = await readMemory(workspaceRoot, params.topic);
      const header = [
        `# Memory: ${result.topic}`,
        `confidence: ${result.confidence} | updated: ${result.updated_at}`,
        `path: ${result.path}`,
      ];
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

  return [saveMemoryTool, readMemoryTool];
}
