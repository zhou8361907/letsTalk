/**
 * 组装单轮 user 前缀：按需 Rule Push + 每轮 State Pointer。
 * 部署配置（.env / AGENTS.md）在进程内缓存，不每轮读盘。
 */

import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";
import type { WorkspaceLayout } from "@lets-talk/context";
import {
  buildRulesContext,
  formatRequirementDraftBriefSummary,
  formatTurnPrefix,
  resolveAgentAnchor,
} from "@lets-talk/context";
import {
  markRulesPushed,
  syncSessionPointer,
} from "./session-context.js";
import { getDraft } from "./requirement-draft-store.js";

export interface BuildTurnPromptPrefixInput {
  sessionId: string;
  layout: WorkspaceLayout;
  chatMode: ChatMode;
  anchor: AgentAnchor | null;
  draftRevision: number;
}

export interface BuildTurnPromptPrefixResult {
  prefix: string;
  mode: "explore" | "focused";
  anchorRef: string | null;
}

export async function buildTurnPromptPrefix(
  input: BuildTurnPromptPrefixInput,
): Promise<BuildTurnPromptPrefixResult> {
  const resolved = await resolveAgentAnchor(
    input.layout.workspaceRoot,
    input.layout,
    input.anchor,
  );

  const { pointer, contextChange, pushRules } = syncSessionPointer(
    {
      sessionId: input.sessionId,
      chatMode: input.chatMode,
      anchor: resolved,
    },
    input.draftRevision,
  );

  let rules: { arch_rules: string; pm_rules?: string } | undefined;
  if (pushRules) {
    const ctx = await buildRulesContext({
      layout: input.layout,
      anchor: input.anchor,
      chatMode: input.chatMode,
    });
    rules = { arch_rules: ctx.arch_rules, pm_rules: ctx.pm_rules };
    markRulesPushed(input.sessionId);
  }

  let draftSummary: string | undefined;
  if (input.chatMode === "prd" && input.draftRevision > 0) {
    const draft = getDraft(input.sessionId);
    const summary = formatRequirementDraftBriefSummary(draft);
    if (summary) draftSummary = summary;
  }

  return {
    prefix: formatTurnPrefix({
      rules,
      pointer,
      change: contextChange,
      draftSummary,
    }),
    mode: resolved ? "focused" : "explore",
    anchorRef: resolved?.ref ?? null,
  };
}
