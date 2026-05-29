import type { MenuUrlKind } from "./parse-menu-url.js";

/**
 * 用户选定的「关注范围」，随每轮对话传给 Agent。
 *
 * - 有锚点 → JIT 上下文 mode=focused，注入预览或菜单检索提示
 * - 无锚点 → mode=explore，Agent 在全库自行 grep
 *
 * @see BuildAgentContextInput.anchor / ChatStreamRequest.anchor
 */
export interface AgentAnchor {
  /**
   * 锚点类型，决定 ref 的含义与预览方式：
   * - `vue` / `file`：相对 WORKSPACE_ROOT 的文件路径
   * - `java`：后端 Java 源文件路径
   * - `menu` / `route`：ERP 系统菜单；ref 多为 routePath（便于 grep）
   */
  kind: "vue" | "java" | "route" | "file" | "menu";

  /**
   * 主检索键。
   * - 文件类：`workFront/src/views/Foo.vue`
   * - 菜单类：通常为 `routePath`（# 后片段）；完整门户 URL 见 `menuUrl`
   */
  ref: string;

  /** UI 展示用短标签，如「明细页」 */
  label?: string;

  /** sys_menu 主键，菜单锚点时有值 */
  menuId?: string;
  /** sys_menu.name */
  menuName?: string;
  /** 菜单树面包屑，如 ["财务", "明细查询"] */
  breadcrumb?: string[];
  /** 门户用户体系 id，多租户菜单同步时用 */
  userSysId?: string;
  /** sys_menu.url 原值（完整门户路径） */
  menuUrl?: string;
  /** 从 menuUrl 解析出的前端路由，Agent 优先用它 grep */
  routePath?: string;
  /** menuUrl 形态：hash 路由 / .html 页面 / 普通 path */
  menuUrlKind?: MenuUrlKind;
}
