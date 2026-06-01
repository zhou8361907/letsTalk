/**
 * 导出时 lazy 生成研发附录（单次 Pi 回合，只读工具）
 */

import {
  buildDevAppendixPromptInput,
  formatWorkspaceDirsHint,
  resolveWorkspaceLayout,
} from "@lets-talk/context";
import type { AgentAnchor } from "@lets-talk/shared-types";
import { createPiSession } from "./create-session.js";

export async function generateDevAppendix(options: {
  primaryMarkdown: string;
  anchor: AgentAnchor | null;
}): Promise<string> {
  const layout = resolveWorkspaceLayout();
  const cwd = layout.workspaceRoot;
  const piSessionFile = `${cwd}/.agent/conversations/pi/export-${Date.now()}.jsonl`;

  const prompt = buildDevAppendixPromptInput(
    options.primaryMarkdown,
    options.anchor,
    formatWorkspaceDirsHint(layout),
  );

  const handle = await createPiSession(cwd, true, {
    piSessionFile,
    sessionId: `export-${Date.now()}`,
    sessionKind: "export-appendix",
    getAnchorRef: () => options.anchor?.routePath ?? options.anchor?.ref ?? null,
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
    await handle.session.prompt(prompt);
    return text.trim() || "（未能生成附录，请稍后重试或在仓库内自行定位）";
  } finally {
    unsub();
    handle.dispose();
  }
}
