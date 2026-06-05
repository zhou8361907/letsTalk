import type { TranscriptItem } from "@lets-talk/shared-types";

export interface MessageRowInput {
  seq: number;
  role: string;
  kind: string;
  content: string;
  tool_name: string | null;
}

const PREVIEW_MAX = 4000;

function clip(text: string): string {
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX)}…`;
}

/** TranscriptItem → messages 表行（不含 session_id / created_at） */
export function transcriptItemToMessageRow(
  item: TranscriptItem,
  seq: number,
): MessageRowInput {
  switch (item.kind) {
    case "user":
      return {
        seq,
        role: "user",
        kind: "user",
        content: clip(item.text),
        tool_name: null,
      };
    case "assistant":
      return {
        seq,
        role: "assistant",
        kind: "assistant",
        content: clip(item.text),
        tool_name: null,
      };
    case "tool":
      return {
        seq,
        role: "tool",
        kind: "tool",
        content: clip(item.preview),
        tool_name: item.tool,
      };
    case "context":
      return {
        seq,
        role: "system",
        kind: "context",
        content: clip(
          `[context mode=${item.mode} anchor=${item.anchorRef ?? "none"} lines=${item.previewLines}${item.m0Refreshed ? " m0Refreshed" : ""}]`,
        ),
        tool_name: null,
      };
    case "export_ready":
      return {
        seq,
        role: "system",
        kind: "export_ready",
        content: clip(`${item.label} (${item.filename})`),
        tool_name: null,
      };
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

export function transcriptItemsToMessageRows(items: TranscriptItem[]): MessageRowInput[] {
  return items.map((item, seq) => transcriptItemToMessageRow(item, seq));
}
