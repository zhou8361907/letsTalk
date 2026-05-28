/**
 * 菜单树构建（与 packages/context/src/menu-sys.ts 保持同步）
 * Web API 使用本地副本，避免 context 包未 rebuild 时 buildMergedMenuTree 缺失。
 */
export type {
  MenuLeafItem,
  MenuMegaPanel,
  MenuNavRoot,
  MenuSection,
  MenuTreePayload,
  SysMenuRow,
} from "@lets-talk/context";

import { parseSysMenuUrl } from "./parse-menu-url.js";
import type {
  MenuLeafItem,
  MenuMegaPanel,
  MenuNavRoot,
  MenuSection,
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
  const roots: MenuNavRoot[] = childrenOf(enabled, userSysId).map((r) => ({
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
      sections.push({ menuId: g.menuId, title: g.menuName, items });
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
