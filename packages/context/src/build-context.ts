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
  trimPmRules,
} from "./pm-resources.js";
import { formatRequirementDraftSnapshot } from "./format-requirement-draft.js";
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

  // 文件类锚点：规范路径并校验存在；不存在则降级为 explore
  if (anchor && (anchor.kind === "vue" || anchor.kind === "file")) {
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
    // 菜单锚点不读单文件，只给 grep 线索；文件锚点读前 N 行
    if (anchor.kind === "menu" || anchor.kind === "route") {
      const crumbs = anchor.breadcrumb?.length
        ? anchor.breadcrumb.join(" / ")
        : anchor.menuName ?? anchor.label ?? "";
      const route = anchor.routePath ?? anchor.ref;
      anchor_preview_content = [
        "[系统菜单锚点]",
        crumbs ? `面包屑: ${crumbs}` : "",
        anchor.menuName ? `菜单: ${anchor.menuName}` : "",
        anchor.menuUrl ? `sys_menu.url: ${anchor.menuUrl}` : "",
        route ? `路由(检索用): ${route}` : "",
        anchor.menuUrlKind ? `类型: ${anchor.menuUrlKind}` : "",
        anchor.menuId ? `MENU_ID: ${anchor.menuId}` : "",
        "说明: 优先用「路由」在仓库 grep；完整 url 对照门户配置；未必对应 workFront 下单个 .vue。",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      anchor_preview_content = await readAnchorPreview(
        workspaceRoot,
        anchor.ref,
        input.previewLines ?? 150,
      );
    }
  }

  let pm_rules: string | undefined;
  let hints_directory_hint: string | undefined;
  let requirement_draft_snapshot: string | undefined;
  // PRD 模式额外注入：写作规则、业务 hints 目录、当前草稿快照
  if (chat_mode === "prd") {
    pm_rules = trimPmRules(PM_MODE_RULES);
    const hintFiles = await listBusinessHintFiles(workspaceRoot);
    hints_directory_hint = formatHintsDirectoryHint(hintFiles);
    requirement_draft_snapshot = formatRequirementDraftSnapshot(
      input.requirementDraft,
    );
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
    hints_directory_hint,
    requirement_draft_snapshot,
  };
}
