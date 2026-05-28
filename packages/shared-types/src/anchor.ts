import type { MenuUrlKind } from "./parse-menu-url.js";

/** UI / API 传入的锚点（阶段 2 + 系统菜单） */
export interface AgentAnchor {
  kind: "vue" | "java" | "route" | "file" | "menu";
  /**
   * 文件：相对 WORKSPACE_ROOT；
   * 菜单：`routePath`（便于 grep），完整见 `menuUrl`
   */
  ref: string;
  label?: string;
  /** 系统菜单（sys_menu） */
  menuId?: string;
  menuName?: string;
  breadcrumb?: string[];
  userSysId?: string;
  /** sys_menu.url 原值 */
  menuUrl?: string;
  /** 从 url 解析的前端路由（hash 后为 # 片段） */
  routePath?: string;
  menuUrlKind?: MenuUrlKind;
}
