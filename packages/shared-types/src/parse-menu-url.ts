/** sys_menu.url 解析结果 */
export type MenuUrlKind = "hash" | "html" | "path";

export interface ParsedMenuUrl {
  /** 库表原值，完整菜单 URL */
  menuUrl: string;
  /** 前端路由/检索用（hash 取 # 后，html 保留全路径） */
  routePath: string;
  urlKind: MenuUrlKind;
}

/**
 * 从 sys_menu.url 拆出「完整 URL」与「路由路径」。
 * - `#/smc/dictionary` → routePath `/smc/dictionary`
 * - `/df/fap/.../userConfig.html` → routePath 同 menuUrl（按页面路径检索）
 * - `/pf/vue/ma/...` → routePath 同 menuUrl
 */
export function parseSysMenuUrl(raw: string | null | undefined): ParsedMenuUrl | null {
  const menuUrl = raw?.trim();
  if (!menuUrl) return null;

  const hashIdx = menuUrl.indexOf("#");
  if (hashIdx >= 0) {
    const fragment = menuUrl.slice(hashIdx + 1);
    if (!fragment) {
      return { menuUrl, routePath: menuUrl, urlKind: "hash" };
    }
    const routePath = fragment.startsWith("/") ? fragment : `/${fragment}`;
    return { menuUrl, routePath, urlKind: "hash" };
  }

  if (/\.html(\?|#|$)/i.test(menuUrl) || menuUrl.toLowerCase().endsWith(".html")) {
    return { menuUrl, routePath: menuUrl, urlKind: "html" };
  }

  return { menuUrl, routePath: menuUrl, urlKind: "path" };
}
