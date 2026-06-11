/**
 * 菜单树构建（与 packages/context/src/menu-sys.ts 保持同步）
 * Web API 使用本地副本，避免 context 包未 rebuild 时 buildMergedMenuTree 缺失。
 */
export type {
  MenuGroup,
  MenuLeafItem,
  MenuMegaPanel,
  MenuNavRoot,
  MenuTreePayload,
  SysMenuRow,
} from "@lets-talk/context";

import { parseSysMenuUrl } from "./parse-menu-url.js";
import type {
  MenuGroup,
  MenuLeafItem,
  MenuMegaPanel,
  MenuNavRoot,
  MenuTreePayload,
  SysMenuRow,
} from "@lets-talk/context";

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

function byOrder(a: SysMenuRow, b: SysMenuRow): number {
  return a.dispOrder - b.dispOrder || a.menuName.localeCompare(b.menuName, "zh");
}

function childrenOf(rows: SysMenuRow[], parentId: string): SysMenuRow[] {
  return rows.filter((r) => r.parentId === parentId).sort(byOrder);
}

function resolveContentRoot(rows: SysMenuRow[], root: SysMenuRow): SysMenuRow {
  const kids = childrenOf(rows, root.menuId);
  if (kids.length === 1 && kids[0]!.menuName === root.menuName) {
    return kids[0]!;
  }
  return root;
}

function buildMenuGroup(rows: SysMenuRow[], node: SysMenuRow): MenuGroup | null {
  const kids = childrenOf(rows, node.menuId);
  const groups: MenuGroup[] = [];
  const items: MenuLeafItem[] = [];

  for (const k of kids) {
    if (k.isLeaf && k.url) {
      items.push(leafFromUrl(k.menuId, k.menuName, k.url));
    } else {
      const sub = buildMenuGroup(rows, k);
      if (sub) groups.push(sub);
    }
  }

  if (groups.length === 0 && items.length === 0) return null;
  return { menuId: node.menuId, title: node.menuName, groups, items };
}

function buildTopGroups(rows: SysMenuRow[], content: SysMenuRow): MenuGroup[] {
  const kids = childrenOf(rows, content.menuId);
  const groups: MenuGroup[] = [];
  const orphanItems: MenuLeafItem[] = [];

  for (const k of kids) {
    if (k.isLeaf && k.url) {
      orphanItems.push(leafFromUrl(k.menuId, k.menuName, k.url));
    } else {
      const g = buildMenuGroup(rows, k);
      if (g) groups.push(g);
    }
  }

  if (orphanItems.length > 0) {
    groups.unshift({
      menuId: `${content.menuId}-misc`,
      title: "功能入口",
      groups: [],
      items: orphanItems,
    });
  }

  return groups;
}

export function buildMenuTree(rows: SysMenuRow[], userSysId: string): MenuTreePayload {
  const enabled = rows.filter((r) => r.enabled && r.userSysId === userSysId);
  const roots: MenuNavRoot[] = childrenOf(enabled, userSysId).map((r) => ({
    menuId: r.menuId,
    menuName: r.menuName,
    userSysId,
  }));

  const panels: Record<string, MenuMegaPanel> = {};
  for (const root of childrenOf(enabled, userSysId)) {
    const content = resolveContentRoot(enabled, root);

    panels[root.menuId] = {
      rootId: root.menuId,
      rootName: root.menuName,
      breadcrumb: [root.menuName],
      groups: buildTopGroups(enabled, content),
    };
  }

  return { userSysId, roots, panels };
}

export function buildMergedMenuTree(allRows: SysMenuRow[]): MenuTreePayload {
  const enabled = allRows.filter((r) => r.enabled);
  const sysIds = [
    ...new Set(
      enabled.filter((r) => r.parentId === r.userSysId).map((r) => r.userSysId),
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
