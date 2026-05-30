import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentAnchor } from "@lets-talk/shared-types";
import { anchorExists } from "./list-anchors.js";
import type { BuildAgentContextInput } from "./types.js";
import { PM_MODE_RULES, trimPmRules } from "./pm-resources.js";
import {
  formatWorkspaceDirsHint,
  resolveWorkspaceLayout,
  toWorkspaceRef,
} from "./workspace-paths.js";
import { readAnchorPreview } from "./anchor-preview.js";

const ARCH_RULES_MAX = 1500;

let cachedArchRules: { key: string; text: string } | null = null;

async function readArchRules(workspaceRoot: string): Promise<string> {
  const layout = resolveWorkspaceLayout();
  const key = `${layout.workspaceRoot}|${layout.frontendRel}|${layout.backendRel}`;
  if (cachedArchRules?.key === key) {
    return cachedArchRules.text;
  }

  const path = join(workspaceRoot, "AGENTS.md");
  let text = "";
  try {
    await access(path);
    text = await readFile(path, "utf8");
  } catch {
    text = "";
  }
  if (text.length > ARCH_RULES_MAX) {
    text = `${text.slice(0, ARCH_RULES_MAX)}\n…（已截断，完整规则见 AGENTS.md）`;
  }
  cachedArchRules = { key, text };
  return text;
}

/** 规范化锚点（与 buildAgentContext 一致） */
export async function resolveAgentAnchor(
  workspaceRoot: string,
  layout: ReturnType<typeof resolveWorkspaceLayout>,
  anchor: AgentAnchor | null | undefined,
): Promise<AgentAnchor | null> {
  let resolved = anchor ?? null;
  if (resolved && (resolved.kind === "vue" || resolved.kind === "file")) {
    resolved = { ...resolved, ref: toWorkspaceRef(layout, resolved.ref) };
    if (!(await anchorExists(workspaceRoot, resolved.ref))) {
      resolved = null;
    }
  }
  return resolved;
}

/** Rule Push 用：arch_rules + pm_rules，不含 preview / draft */
export async function buildRulesContext(input: BuildAgentContextInput): Promise<{
  anchor: AgentAnchor | null;
  mode: "explore" | "focused";
  chat_mode: NonNullable<BuildAgentContextInput["chatMode"]>;
  arch_rules: string;
  pm_rules?: string;
}> {
  const layout = input.layout ?? resolveWorkspaceLayout();
  const workspaceRoot = resolve(input.workspaceRoot || layout.workspaceRoot);
  const anchor = await resolveAgentAnchor(
    workspaceRoot,
    layout,
    input.anchor ?? null,
  );
  const chat_mode = input.chatMode ?? "explore";
  const rulesFromFile = await readArchRules(workspaceRoot);
  const arch_rules = [formatWorkspaceDirsHint(layout), rulesFromFile]
    .filter(Boolean)
    .join("\n\n");

  let pm_rules: string | undefined;
  if (chat_mode === "prd") {
    pm_rules = trimPmRules(PM_MODE_RULES);
  }

  return {
    anchor,
    mode: anchor ? "focused" : "explore",
    chat_mode,
    arch_rules,
    pm_rules,
  };
}

/** get_anchor_preview 工具：按需生成预览文本 */
export async function buildAnchorPreviewContent(
  workspaceRoot: string,
  anchor: AgentAnchor,
  previewLines = 150,
): Promise<string> {
  if (anchor.kind === "menu" || anchor.kind === "route") {
    const crumbs = anchor.breadcrumb?.length
      ? anchor.breadcrumb.join(" / ")
      : anchor.menuName ?? anchor.label ?? "";
    const route = anchor.routePath ?? anchor.ref;
    return [
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
  }
  return readAnchorPreview(workspaceRoot, anchor.ref, previewLines);
}
