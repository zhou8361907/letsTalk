/** state.db messages 行（查询结果） */
export interface DbMessageRow {
  id: number;
  session_id: string;
  seq: number;
  role: string;
  kind: string | null;
  content: string | null;
  tool_name: string | null;
  created_at: string;
}

export interface DbSessionBrowseRow {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export interface ShapedMessage {
  id: number;
  role: string;
  content: string | null;
  kind?: string | null;
  tool_name?: string | null;
  anchor?: boolean;
}

export interface MessagesAroundResult {
  window: DbMessageRow[];
  messages_before: number;
  messages_after: number;
}

export interface AnchoredViewResult {
  window: DbMessageRow[];
  messages_before: number;
  messages_after: number;
  bookend_start: DbMessageRow[];
  bookend_end: DbMessageRow[];
}

export interface FtsHitRow {
  session_id: string;
  id: number;
  content: string;
  role: string;
}

export interface DiscoverySessionResult {
  session_id: string;
  title: string;
  updated_at: string;
  match_message_id: number;
  matched_role: string;
  snippet: string;
  bookend_start: ShapedMessage[];
  messages: ShapedMessage[];
  bookend_end: ShapedMessage[];
  messages_before: number;
  messages_after: number;
}

export interface ScrollSessionResult {
  session_id: string;
  around_message_id: number;
  session_meta: { title: string; updated_at: string };
  window: number;
  messages: ShapedMessage[];
  messages_before: number;
  messages_after: number;
  warning?: string;
}

export interface SessionSearchResult {
  success: boolean;
  mode: "discovery" | "scroll" | "browse";
  error?: string;
  message?: string;
  results?: unknown[];
  count?: number;
  query?: string;
}
