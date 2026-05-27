/** 与 page Transcript 一致，持久化到 .agent/conversations */
export type TranscriptItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; tool: string; preview: string; ok: boolean }
  | {
      kind: "context";
      mode: string;
      anchorRef: string | null;
      previewLines: number;
    };

export interface ConversationSummary {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord extends ConversationSummary {
  anchor: {
    kind: "vue" | "java" | "route" | "file";
    ref: string;
    label?: string;
  } | null;
  items: TranscriptItem[];
  /** 相对 WORKSPACE_ROOT 的 Pi session 文件（阶段 5 v2） */
  piSessionFile?: string | null;
  /** 对话模式（阶段 6 PM） */
  chatMode?: "explore" | "prd";
}
