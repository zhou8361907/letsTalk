/**
 * 导出/定稿后：用 LLM 生成侧栏标题（单次无工具回合）
 */

import type { RequirementDraftState } from "@lets-talk/shared-types";
import { createPiSession } from "./create-session.js";

const TITLE_MAX = 28;

function fieldValue(item: RequirementDraftState["items"][0], key: string): string {
  return item.fields.find((f) => f.key === key)?.value?.trim() ?? "";
}

function buildTitlePrompt(draft: RequirementDraftState): string {
  const lines = draft.items.map((item, i) => {
    const page = fieldValue(item, "page");
    const hint = page ? `（${page}）` : "";
    return `${i + 1}. ${item.title}${hint}`;
  });
  return [
    "根据下面 PM 需求清单，用**一句中文**概括这次对话主题，作为侧栏标题。",
    `要求：≤${TITLE_MAX} 字；不要引号；不要「需求：」「关于」等前缀；只输出标题一行。`,
    "",
    "清单：",
    ...lines,
    draft.blockingQuestion?.trim()
      ? `\n待补充：${draft.blockingQuestion.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeTitle(raw: string): string {
  let t = raw
    .trim()
    .replace(/^["'「『【]+|["'」』】]+$/g, "")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ");
  if (t.length > TITLE_MAX) {
    t = `${t.slice(0, TITLE_MAX - 1)}…`;
  }
  return t;
}

export async function summarizeConversationTitle(options: {
  cwd: string;
  draft: RequirementDraftState;
}): Promise<string | null> {
  if (options.draft.items.length === 0) return null;

  const handle = await createPiSession(options.cwd, false, {
    sessionKind: "title-summary",
    sessionId: `title-${Date.now()}`,
  });

  let text = "";
  const unsub = handle.session.subscribe((ev: unknown) => {
    const e = ev as Record<string, unknown>;
    if (e.type === "message_update") {
      const inner = e.assistantMessageEvent as { type?: string; delta?: string };
      if (inner?.type === "text_delta" && inner.delta) text += inner.delta;
    }
  });

  try {
    await handle.session.prompt(buildTitlePrompt(options.draft));
    const title = sanitizeTitle(text.split("\n")[0] ?? text);
    return title || null;
  } finally {
    unsub();
    handle.dispose();
  }
}
