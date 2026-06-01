import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { toolOutputCharLimit } from "./context-budget-config.js";

const NOTICE =
  "…（输出已截断，请用 read_method / grep / get_* 精查所需片段，勿依赖整段原文）";

/** 截断单段 tool 文本：保留头 40% + 尾，中间插入说明 */
export function truncateToolText(text: string, limit?: number): string {
  const max = limit ?? toolOutputCharLimit();
  if (text.length <= max) return text;

  const noticeLen = NOTICE.length + 24;
  const budget = Math.max(0, max - noticeLen);
  const headLen = Math.floor(budget * 0.4);
  const tailLen = Math.max(0, budget - headLen);
  const omitted = text.length - headLen - tailLen;

  return `${text.slice(0, headLen)}\n\n${NOTICE}\n（省略约 ${omitted} 字符）\n\n${text.slice(text.length - tailLen)}`;
}

function truncateToolContent<T extends { type: string; text?: string }>(
  content: T[],
  limit: number,
): T[] {
  return content.map((block) => {
    if (block.type !== "text" || !block.text) return block;
    if (block.text.length <= limit) return block;
    return { ...block, text: truncateToolText(block.text, limit) };
  });
}

/** 包装 Pi 自定义工具 execute，对返回文本做字符软顶 */
export function wrapToolWithOutputLimit(tool: ToolDefinition): ToolDefinition {
  const { execute } = tool;
  if (!execute) return tool;

  const limit = toolOutputCharLimit();
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const result = await execute(toolCallId, params, signal, onUpdate, ctx);
      if (!result?.content?.length) return result;
      return {
        ...result,
        content: truncateToolContent(result.content, limit),
      };
    },
  };
}

export function wrapToolsWithOutputLimit(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map(wrapToolWithOutputLimit);
}
