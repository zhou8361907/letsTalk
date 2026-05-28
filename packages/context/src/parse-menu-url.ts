/** sys_menu.url 解析（context 本地实现，避免运行时 shared-types 解析失败） */

export type MenuUrlKind = "hash" | "html" | "path";

export interface ParsedMenuUrl {
  menuUrl: string;
  routePath: string;
  urlKind: MenuUrlKind;
}

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
