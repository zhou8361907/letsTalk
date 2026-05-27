import type { TranscriptItem } from "@lets-talk/shared-types";

export type ToolTranscriptItem = Extract<TranscriptItem, { kind: "tool" }>;

/** 展示用：连续 tool 合并为一组 */
export type ToolGroupItem = {
  kind: "tool_group";
  tools: ToolTranscriptItem[];
};

export type DisplayTranscriptItem = TranscriptItem | ToolGroupItem;

export function isToolGroup(item: DisplayTranscriptItem): item is ToolGroupItem {
  return item.kind === "tool_group";
}

/** 把相邻的 tool 条目收成一组，减少列表刷屏 */
export function groupTranscriptForDisplay(
  items: TranscriptItem[],
): DisplayTranscriptItem[] {
  const out: DisplayTranscriptItem[] = [];
  let buf: ToolTranscriptItem[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    out.push({ kind: "tool_group", tools: [...buf] });
    buf = [];
  };

  for (const item of items) {
    if (item.kind === "tool") {
      buf.push(item);
    } else {
      flush();
      out.push(item);
    }
  }
  flush();
  return out;
}

/** 一组内失败数量 */
export function toolGroupFailedCount(tools: ToolTranscriptItem[]): number {
  return tools.filter((t) => !t.ok).length;
}
