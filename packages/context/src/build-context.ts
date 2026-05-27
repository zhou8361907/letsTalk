import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentAnchor } from "@lets-talk/shared-types";
import { readAnchorPreview } from "./anchor-preview.js";
import { anchorExists } from "./list-anchors.js";
import type { AgentContext, BuildAgentContextInput } from "./types.js";
import {
  formatHintsDirectoryHint,
  listBusinessHintFiles,
  PM_MODE_RULES,
  readPrdTemplateOutline,
  trimPmRules,
} from "./pm-resources.js";
import {
  formatWorkspaceDirsHint,
  resolveWorkspaceLayout,
  toWorkspaceRef,
} from "./workspace-paths.js";

const ARCH_RULES_MAX = 1500;

async function readArchRules(workspaceRoot: string): Promise<string> {
  const path = join(workspaceRoot, "AGENTS.md");
  try {
    await access(path);
  } catch {
    return "";
  }
  const text = await readFile(path, "utf8");
  if (text.length <= ARCH_RULES_MAX) return text;
  return `${text.slice(0, ARCH_RULES_MAX)}\n…（已截断，完整规则见 AGENTS.md）`;
}

/** 每轮对话前组装 JIT 上下文（不替 Agent 做 grep） */
export async function buildAgentContext(
  input: BuildAgentContextInput,
): Promise<AgentContext> {
  const layout = input.layout ?? resolveWorkspaceLayout();
  const workspaceRoot = resolve(input.workspaceRoot || layout.workspaceRoot);
  let anchor: AgentAnchor | null = input.anchor ?? null;

  if (anchor) {
    anchor = { ...anchor, ref: toWorkspaceRef(layout, anchor.ref) };
    if (!(await anchorExists(workspaceRoot, anchor.ref))) {
      anchor = null;
    }
  }

  const mode = anchor ? "focused" : "explore";
  const chat_mode = input.chatMode ?? "explore";
  const rulesFromFile = await readArchRules(workspaceRoot);
  const arch_rules = [formatWorkspaceDirsHint(layout), rulesFromFile]
    .filter(Boolean)
    .join("\n\n");
  let anchor_preview_content: string | undefined;
  if (anchor) {
    anchor_preview_content = await readAnchorPreview(
      workspaceRoot,
      anchor.ref,
      input.previewLines ?? 150,
    );
  }

  let pm_rules: string | undefined;
  let prd_template_outline: string | undefined;
  let hints_directory_hint: string | undefined;
  if (chat_mode === "prd") {
    pm_rules = trimPmRules(PM_MODE_RULES);
    prd_template_outline = await readPrdTemplateOutline(workspaceRoot);
    const hintFiles = await listBusinessHintFiles(workspaceRoot);
    hints_directory_hint = formatHintsDirectoryHint(hintFiles);
  }

  return {
    version: "1",
    workspace_root: workspaceRoot,
    anchor,
    arch_rules,
    mode,
    chat_mode,
    anchor_preview_content,
    pm_rules,
    prd_template_outline,
    hints_directory_hint,
  };
}
