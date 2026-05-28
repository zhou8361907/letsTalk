/** sys_menu 行 → 门户式 mega-menu 结构（左一级 + 右分组 + 链接网格） */

import { parseSysMenuUrl, type MenuUrlKind } from "./parse-menu-url.js";

export interface SysMenuRow {
  menuId: string;
  menuName: string;
  parentId: string;
  levelNum: number;
  isLeaf: boolean;
  enabled: boolean;
  url: string | null;
  dispOrder: number;
  userSysId: string;
}

export interface MenuNavRoot {
  menuId: string;
  menuName: string;
  /** 所属子系统（合并门户时用于区分同名一级） */
  userSysId: string;
}

export interface MenuLeafItem {
  menuId: string;
  menuName: string;
  /** sys_menu.url 原值 */
  menuUrl: string;
  /** 解析后的路由（Agent grep 用） */
  routePath: string;
  urlKind: MenuUrlKind;
  /** @deprecated 同 menuUrl，兼容旧客户端 */
  url: string;
}

function leafFromUrl(menuId: string, menuName: string, rawUrl: string): MenuLeafItem {
  const parsed = parseSysMenuUrl(rawUrl)!;
  return {
    menuId,
    menuName,
    menuUrl: parsed.menuUrl,
    routePath: parsed.routePath,
    urlKind: parsed.urlKind,
    url: parsed.menuUrl,
  };
}

export interface MenuSection {
  menuId: string;
  title: string;
  items: MenuLeafItem[];
}

export interface MenuMegaPanel {
  rootId: string;
  rootName: string;
  breadcrumb: string[];
  sections: MenuSection[];
}

export interface MenuTreePayload {
  /** 单子系统 id，或 `*` 表示已合并全部一级 */
  userSysId: string;
  roots: MenuNavRoot[];
  /** rootId → 右侧面板（按需也可单独请求） */
  panels: Record<string, MenuMegaPanel>;
  merged?: boolean;
}

function byOrder(a: SysMenuRow, b: SysMenuRow): number {
  return a.dispOrder - b.dispOrder || a.menuName.localeCompare(b.menuName, "zh");
}

function childrenOf(rows: SysMenuRow[], parentId: string): SysMenuRow[] {
  return rows.filter((r) => r.parentId === parentId).sort(byOrder);
}

/** 若一级下仅有一个同名子节点，用子节点作为内容根（医保配置管理等） */
function resolveContentRoot(rows: SysMenuRow[], root: SysMenuRow): SysMenuRow {
  const kids = childrenOf(rows, root.menuId);
  if (kids.length === 1 && kids[0]!.menuName === root.menuName) {
    return kids[0]!;
  }
  return root;
}

function collectLeaves(rows: SysMenuRow[], node: SysMenuRow): MenuLeafItem[] {
  const kids = childrenOf(rows, node.menuId);
  if (kids.length === 0) {
    if (node.isLeaf && node.url) {
      return [leafFromUrl(node.menuId, node.menuName, node.url)];
    }
    return [];
  }
  const out: MenuLeafItem[] = [];
  for (const k of kids) {
    if (k.isLeaf && k.url) {
      out.push(leafFromUrl(k.menuId, k.menuName, k.url));
    } else {
      out.push(...collectLeaves(rows, k));
    }
  }
  return out;
}

export function buildMenuTree(rows: SysMenuRow[], userSysId: string): MenuTreePayload {
  const enabled = rows.filter((r) => r.enabled && r.userSysId === userSysId);
  const roots = childrenOf(enabled, userSysId).map((r) => ({
    menuId: r.menuId,
    menuName: r.menuName,
    userSysId,
  }));

  const panels: Record<string, MenuMegaPanel> = {};
  for (const root of childrenOf(enabled, userSysId)) {
    const content = resolveContentRoot(enabled, root);
    const groups = childrenOf(enabled, content.menuId);
    const sections: MenuSection[] = [];

    for (const g of groups) {
      const items = collectLeaves(enabled, g);
      if (items.length === 0) continue;
      sections.push({
        menuId: g.menuId,
        title: g.menuName,
        items,
      });
    }

    const orphanLeaves = collectLeaves(enabled, content).filter(
      (leaf) => !sections.some((s) => s.items.some((i) => i.menuId === leaf.menuId)),
    );
    if (orphanLeaves.length > 0) {
      sections.unshift({
        menuId: `${content.menuId}-misc`,
        title: "功能入口",
        items: orphanLeaves,
      });
    }

    panels[root.menuId] = {
      rootId: root.menuId,
      rootName: root.menuName,
      breadcrumb: [root.menuName],
      sections,
    };
  }

  return { userSysId, roots, panels };
}

/** 合并各子系统的一级菜单到同一左侧栏（门户总览） */
export function buildMergedMenuTree(allRows: SysMenuRow[]): MenuTreePayload {
  const enabled = allRows.filter((r) => r.enabled);
  const sysIds = [
    ...new Set(
      enabled
        .filter((r) => r.parentId === r.userSysId)
        .map((r) => r.userSysId),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh"));

  const roots: MenuNavRoot[] = [];
  const panels: Record<string, MenuMegaPanel> = {};

  for (const userSysId of sysIds) {
    const tree = buildMenuTree(enabled, userSysId);
    roots.push(...tree.roots);
    Object.assign(panels, tree.panels);
  }

  const orderOf = (menuId: string) =>
    enabled.find((r) => r.menuId === menuId)?.dispOrder ?? 0;

  roots.sort(
    (a, b) =>
      orderOf(a.menuId) - orderOf(b.menuId) ||
      a.menuName.localeCompare(b.menuName, "zh"),
  );

  return { userSysId: "*", merged: true, roots, panels };
}
