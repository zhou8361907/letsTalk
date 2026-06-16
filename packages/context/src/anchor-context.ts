import type { AgentAnchor } from "@lets-talk/shared-types";
import { anchorExists, readAnchorPreview } from "@lets-talk/domain/anchor";
import type { WorkspaceLayout } from "./workspace-paths.js";
import { toWorkspaceRef } from "./workspace-paths.js";

/** 规范化锚点路径并校验文件类锚点存在 */
export async function resolveAgentAnchor(
  workspaceRoot: string,
  layout: WorkspaceLayout,
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
