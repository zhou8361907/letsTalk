/**
 * 研发附录后台任务：生成 → 落盘 → 挂到 transcript
 */

import type { AgentAnchor, DevAppendixExportJob } from "@lets-talk/shared-types";
import {
  appendExportReadyTranscriptItem,
  getConversation,
  setConversationTitle,
  updateDevAppendixExport,
} from "@lets-talk/conversation";
import { generateDevAppendix } from "./generate-dev-appendix.js";
import { summarizeConversationTitle } from "./summarize-conversation-title.js";

const runningJobs = new Set<string>();

export function isDevAppendixJobRunning(sessionId: string): boolean {
  return runningJobs.has(sessionId);
}

export async function runDevAppendixExportJob(input: {
  workspaceRoot: string;
  sessionId: string;
  primaryMarkdown: string;
  mergedMarkdownFilename: string;
  anchor: AgentAnchor | null;
  mergeFn: (primary: string, appendix: string) => string;
  summarizeTitle?: boolean;
}): Promise<DevAppendixExportJob> {
  const { workspaceRoot, sessionId } = input;
  if (runningJobs.has(sessionId)) {
    const rec = await getConversation(workspaceRoot, sessionId);
    return rec?.devAppendixExport ?? { status: "running" };
  }

  runningJobs.add(sessionId);
  const startedAt = new Date().toISOString();

  await updateDevAppendixExport(workspaceRoot, sessionId, {
    status: "running",
    startedAt,
    primaryMarkdown: input.primaryMarkdown,
    error: undefined,
  });

  try {
    const appendix = await generateDevAppendix({
      primaryMarkdown: input.primaryMarkdown,
      anchor: input.anchor,
    });
    const merged = input.mergeFn(input.primaryMarkdown, appendix);
    const completedAt = new Date().toISOString();

    await updateDevAppendixExport(workspaceRoot, sessionId, {
      status: "done",
      completedAt,
      appendixMarkdown: appendix,
      mergedMarkdown: merged,
      filename: input.mergedMarkdownFilename,
    });

    await appendExportReadyTranscriptItem(workspaceRoot, sessionId, {
      kind: "export_ready",
      exportKind: "dev_appendix",
      label: "完整文档（含研发附录）已生成",
      filename: input.mergedMarkdownFilename,
      markdown: merged,
      completedAt,
    });

    if (input.summarizeTitle !== false) {
      const rec = await getConversation(workspaceRoot, sessionId);
      if (rec?.requirementDraft) {
        const title = await summarizeConversationTitle({
          cwd: workspaceRoot,
          draft: rec.requirementDraft,
        });
        if (title) {
          await setConversationTitle(workspaceRoot, sessionId, title, {
            lock: true,
          });
        }
      }
    }

    return {
      status: "done",
      startedAt,
      completedAt,
      primaryMarkdown: input.primaryMarkdown,
      appendixMarkdown: appendix,
      mergedMarkdown: merged,
      filename: input.mergedMarkdownFilename,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateDevAppendixExport(workspaceRoot, sessionId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: message,
    });
    return {
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      error: message,
    };
  } finally {
    runningJobs.delete(sessionId);
  }
}
