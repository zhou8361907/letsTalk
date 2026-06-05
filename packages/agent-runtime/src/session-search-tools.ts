/**
 * session_search — 跨会话历史召回（state.db FTS，零 LLM 成本）
 */

import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  getSessionDb,
  isSessionDbEnabled,
  runSessionSearch,
} from "@lets-talk/conversation";

export interface SessionSearchToolsOptions {
  currentSessionId?: string;
}

function toolJson(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 0) }],
    details: data,
  };
}

export function isSessionSearchAvailable(workspaceRoot: string): boolean {
  if (!isSessionDbEnabled()) return false;
  return getSessionDb(workspaceRoot) !== null;
}

export function createSessionSearchTools(
  workspaceRoot: string,
  options?: SessionSearchToolsOptions,
): ToolDefinition[] {
  if (!isSessionSearchAvailable(workspaceRoot)) {
    return [];
  }

  const tool = defineTool({
    name: "session_search",
    label: "Session search",
    description: `搜索历史会话 transcript（state.db FTS，零 LLM 成本）。详 docs/SESSION_SEARCH_V1.md。

三模式（参数推断，无 mode）：
1. Discovery — query= 关键词（勿写 FROM session:uuid）。返回每 session：match_message_id、snippet、messages(±5)、bookend_start/end(各3)、messages_before/after。最多 3 个 session。
2. Scroll — session_id + around_message_id（用 Discovery 的 match_message_id，勿猜 id）+ 可选 window。
3. Browse — 无参，最近 20 个会话摘要。

勿 bulk 写入 CORE/memory。`,
    promptSnippet: "session_search(query?) | session_search(session_id, around_message_id, window?)",
    promptGuidelines: [
      "要历史原话 → session_search(query=单词)；结果含 bookend 与 match_message_id。",
      "不够 → scroll(session_id, match_message_id)。",
      "浏览最近 → session_search() 无参。",
      "用户问历史时 prefix 可能已有 <episodic_recall>，可先读再决定是否再搜。",
    ],
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description: "Discovery：FTS 关键词（中英文子串）",
        }),
      ),
      session_id: Type.Optional(
        Type.String({ description: "Scroll：目标会话 UUID" }),
      ),
      around_message_id: Type.Optional(
        Type.Number({ description: "Scroll：match_message_id（Discovery 返回，SQLite 自增 id）" }),
      ),
      window: Type.Optional(
        Type.Number({
          description: "Scroll：锚点两侧条数，默认 5，最大 10；返回 hard cap 21 条",
        }),
      ),
    }),
    execute: async (_id, params) => {
      const db = getSessionDb(workspaceRoot);
      if (!db) {
        return toolJson({
          success: false,
          error: "Session DB 不可用（LETS_TALK_SESSION_DB=0 或 open 失败）",
        });
      }

      const result = runSessionSearch(db, {
        query: params.query,
        session_id: params.session_id,
        around_message_id: params.around_message_id,
        window: params.window,
        current_session_id: options?.currentSessionId,
      });

      return toolJson(result);
    },
  });

  return [tool];
}
