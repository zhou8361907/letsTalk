"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentAnchor, MenuUrlKind } from "@lets-talk/shared-types";

interface MenuNavRoot {
  menuId: string;
  menuName: string;
  userSysId: string;
}

interface MenuLeafItem {
  menuId: string;
  menuName: string;
  menuUrl: string;
  routePath: string;
  urlKind: string;
  url: string;
}

interface MenuGroup {
  menuId: string;
  title: string;
  groups: MenuGroup[];
  items: MenuLeafItem[];
}

interface MenuMegaPanel {
  rootId: string;
  rootName: string;
  breadcrumb: string[];
  groups: MenuGroup[];
}

interface MenuTreePayload {
  userSysId: string;
  merged?: boolean;
  roots: MenuNavRoot[];
  panels: Record<string, MenuMegaPanel>;
}

interface SearchResult {
  leaf: MenuLeafItem;
  root: MenuNavRoot;
  groupPath: string[];
}

function walkMenuGroups(
  groups: MenuGroup[],
  groupPath: string[],
  visit: (leaf: MenuLeafItem, groupPath: string[]) => void,
): void {
  for (const group of groups) {
    const path = [...groupPath, group.title];
    for (const leaf of group.items) visit(leaf, path);
    walkMenuGroups(group.groups, path, visit);
  }
}

function panelHasMenuId(panel: MenuMegaPanel, menuId: string): boolean {
  let hit = false;
  walkMenuGroups(panel.groups, [], (leaf) => {
    if (leaf.menuId === menuId) hit = true;
  });
  return hit;
}

function leafMatchesQuery(leaf: MenuLeafItem, q: string): boolean {
  return (
    leaf.menuName.toLowerCase().includes(q) ||
    leaf.menuUrl.toLowerCase().includes(q) ||
    leaf.routePath.toLowerCase().includes(q)
  );
}

function filterMenuGroups(groups: MenuGroup[], q: string): MenuGroup[] {
  return groups
    .map((group) => {
      const items = group.items.filter((it) => leafMatchesQuery(it, q));
      const nested = filterMenuGroups(group.groups, q);
      if (items.length === 0 && nested.length === 0) return null;
      return { ...group, items, groups: nested };
    })
    .filter((g): g is MenuGroup => g !== null);
}

interface Props {
  anchor: AgentAnchor | null;
  disabled?: boolean;
  /** 传 null 表示取消菜单锚点 */
  onSelect: (anchor: AgentAnchor | null) => void;
}

export function MenuAnchorPicker({ anchor, disabled, onSelect }: Props) {
  const [tree, setTree] = useState<MenuTreePayload | null>(null);
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pl = typeof window !== "undefined" ? sessionStorage.getItem("letsTalk.productLine") : null;
      const res = await fetch(`/api/menu/tree${pl ? `?productLine=${pl}` : ""}`);
      const data = (await res.json()) as MenuTreePayload & { error?: string };
      if (!res.ok) {
          throw new Error(data.error ?? res.statusText);
      }
      setTree(data);
      const first = data.roots[0]?.menuId ?? null;
      setActiveRootId((prev) =>
          prev && data.roots.some((r) => r.menuId === prev) ? prev : first,
      );
    } catch (e) {
      setTree(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  /** 已选菜单锚点时，左侧定位到对应一级 */
  useEffect(() => {
    if (anchor?.kind !== "menu" || !anchor.menuId || !tree) return;
    for (const [rootId, p] of Object.entries(tree.panels)) {
      if (panelHasMenuId(p, anchor.menuId)) {
        setActiveRootId(rootId);
        break;
      }
    }
  }, [anchor?.kind, anchor?.menuId, tree]);

  const activeRoot = tree?.roots.find((r) => r.menuId === activeRootId);
  const panel: MenuMegaPanel | undefined =
    activeRootId && tree?.panels[activeRootId]
      ? tree.panels[activeRootId]
      : undefined;

  /** 全量模糊匹配：搜索时遍历所有面板下所有菜单项 */
  const searchResults = useMemo(() => {
    if (!tree) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];
    for (const [rootId, panel] of Object.entries(tree.panels)) {
      const root = tree.roots.find((r) => r.menuId === rootId);
      if (!root) continue;
      walkMenuGroups(panel.groups, [], (leaf, groupPath) => {
        if (
          leafMatchesQuery(leaf, q) ||
          groupPath.some((p) => p.toLowerCase().includes(q))
        ) {
          results.push({ leaf, root, groupPath });
        }
      });
    }
    return results;
  }, [tree, search]);

  const filteredRoots = useMemo(() => {
    if (!tree) return [];
    const q = search.trim().toLowerCase();
    if (!q) return tree.roots;
    return tree.roots.filter(
      (r) =>
        r.menuName.toLowerCase().includes(q) ||
        r.userSysId.toLowerCase().includes(q),
    );
  }, [tree, search]);

  const filteredGroups = useMemo(() => {
    if (!panel) return [];
    const q = search.trim().toLowerCase();
    if (!q) return panel.groups;
    return filterMenuGroups(panel.groups, q);
  }, [panel, search]);

  const isLeafSelected = (menuId: string) =>
    anchor?.kind === "menu" && anchor.menuId === menuId;

  const pickLeaf = (
    root: MenuNavRoot,
    groupPath: string[],
    leaf: MenuLeafItem,
  ) => {
    onSelect({
      kind: "menu",
      ref: leaf.routePath,
      label: leaf.menuName,
      menuId: leaf.menuId,
      menuName: leaf.menuName,
      menuUrl: leaf.menuUrl,
      routePath: leaf.routePath,
      menuUrlKind: leaf.urlKind as MenuUrlKind,
      userSysId: root.userSysId,
      breadcrumb: [root.menuName, ...groupPath, leaf.menuName].filter(Boolean),
    });
  };

  const handleLeafClick = (
    root: MenuNavRoot,
    groupPath: string[],
    leaf: MenuLeafItem,
  ) => {
    if (isLeafSelected(leaf.menuId)) return;
    pickLeaf(root, groupPath, leaf);
  };

  const handleLeafDoubleClick = (leaf: MenuLeafItem) => {
    if (isLeafSelected(leaf.menuId)) {
      onSelect(null);
    }
  };

  const renderMenuGroup = (
    group: MenuGroup,
    root: MenuNavRoot,
    groupPath: string[],
    depth: number,
  ) => {
    const path = [...groupPath, group.title];
    const depthClass = `menu-group-depth-${Math.min(depth, 3)}`;
    const hasNested = group.groups.length > 0;
    const hasItems = group.items.length > 0;

    return (
      <section
        key={group.menuId}
        className={`menu-group ${depthClass}${hasNested && hasItems ? " menu-group-mixed" : ""}`}
      >
        <div className="menu-group-head">
          <span className="menu-group-title">{group.title}</span>
          {hasItems && (
            <span className="menu-group-count">{group.items.length}</span>
          )}
        </div>

        {hasNested && (
          <div className="menu-group-children">
            {group.groups.map((sub) =>
              renderMenuGroup(sub, root, path, depth + 1),
            )}
          </div>
        )}

        {hasItems && (
          <div className="menu-leaf-grid">
            {group.items.map((leaf) => {
              const active = isLeafSelected(leaf.menuId);
              return (
                <button
                  key={leaf.menuId}
                  type="button"
                  className={active ? "menu-leaf active" : "menu-leaf"}
                  disabled={disabled}
                  title={`${leaf.menuUrl}${leaf.routePath !== leaf.menuUrl ? `\n路由: ${leaf.routePath}` : ""}${active ? "\n双击取消锚点" : ""}`}
                  onClick={() => handleLeafClick(root, path, leaf)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    handleLeafDoubleClick(leaf);
                  }}
                >
                  {leaf.menuName}
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="menu-picker">
      <p className="menu-hint muted small">单击切换锚点 · 双击已选项取消</p>
      <input
        type="search"
        className="menu-search"
        placeholder="模糊匹配所有菜单…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled || !tree}
      />

      {loading && <p className="muted small">加载菜单…</p>}
      {error && <p className="menu-error small">{error}</p>}

      {!loading && tree && search.trim() && (
        <div className="menu-mega">
          <div className="menu-panel" style={{ flex: 1 }}>
            {searchResults.length > 0 && (
              <div className="menu-search-results">
                <p className="menu-search-results-count">
                  找到 {searchResults.length} 个匹配菜单
                </p>
                {searchResults.map((sr, i) => {
                  const active = isLeafSelected(sr.leaf.menuId);
                  const path = [
                    sr.root.menuName,
                    ...sr.groupPath,
                    sr.leaf.menuName,
                  ]
                    .filter(Boolean)
                    .join(" › ");
                  return (
                    <button
                      key={`${sr.leaf.menuId}-${i}`}
                      type="button"
                      className={
                        active
                          ? "menu-search-result active"
                          : "menu-search-result"
                      }
                      disabled={disabled}
                      title={`${sr.leaf.menuUrl}${sr.leaf.routePath !== sr.leaf.menuUrl ? `\n路由: ${sr.leaf.routePath}` : ""}${active ? "\n双击取消锚点" : ""}`}
                      onClick={() => {
                        if (active) return;
                        pickLeaf(sr.root, sr.groupPath, sr.leaf);
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        handleLeafDoubleClick(sr.leaf);
                      }}
                    >
                      <span className="menu-search-result-name">
                        {sr.leaf.menuName}
                      </span>
                      <span className="menu-search-result-path">{path}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {searchResults.length === 0 && (
              <p className="muted small" style={{ padding: "1rem" }}>
                无匹配菜单
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && tree && !search.trim() && filteredRoots.length > 0 && (
        <div className="menu-mega">
          <nav className="menu-l1" aria-label="一级菜单">
            {filteredRoots.map((r) => {
              const dup =
                tree.roots.filter((x) => x.menuName === r.menuName).length > 1;
              return (
                <button
                  key={r.menuId}
                  type="button"
                  className={
                    activeRootId === r.menuId ? "menu-l1-item active" : "menu-l1-item"
                  }
                  disabled={disabled}
                  onClick={() => {
                    setActiveRootId(r.menuId);
                  }}
                  title={
                    dup ? `${r.menuName}（${r.userSysId}）` : r.menuName
                  }
                >
                  <span className="menu-l1-label">{r.menuName}</span>
                  {dup && <span className="menu-l1-sys">{r.userSysId}</span>}
                </button>
              );
            })}
          </nav>

          <div className="menu-panel" aria-label={panel?.rootName ?? "子菜单"}>
            {panel && activeRoot && (
              <div className="menu-panel-title">
                {panel.rootName}
                {tree.merged && (
                  <span className="menu-panel-sys">{activeRoot.userSysId}</span>
                )}
              </div>
            )}
            {panel &&
              activeRoot &&
              filteredGroups.map((group) =>
                renderMenuGroup(group, activeRoot, [], 0),
              )}
            {panel && filteredGroups.length === 0 && (
              <p className="muted small">无匹配菜单</p>
            )}
            {!panel && activeRootId && (
              <p className="muted small">该一级下暂无子菜单</p>
            )}
          </div>
        </div>
      )}

      {!loading && tree && tree.roots.length === 0 && !error && (
        <p className="muted small">暂无一级菜单</p>
      )}
      {!loading && tree && !search.trim() && tree.roots.length > 0 && filteredRoots.length === 0 && (
        <p className="muted small">无匹配一级菜单</p>
      )}

      <style jsx>{`
        .menu-picker {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
          flex: 1;
        }
        .menu-hint {
          margin: 0;
          line-height: 1.3;
        }
        .menu-search {
          width: 100%;
          font-size: 11px;
          padding: 0.3rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
        }
        .menu-error {
          color: #f85149;
        }
        .menu-mega {
          display: flex;
          flex: 1;
          min-height: 0;
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
          background: var(--panel);
        }
        .menu-l1 {
          width: 118px;
          flex-shrink: 0;
          overflow-y: auto;
          border-right: 1px solid var(--border);
          padding: 0.25rem 0;
        }
        .menu-l1-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          width: 100%;
          text-align: left;
          padding: 0.35rem 0.45rem;
          border: none;
          background: transparent;
          color: var(--text);
          font-size: 11px;
          line-height: 1.35;
          cursor: pointer;
          gap: 0.1rem;
        }
        .menu-l1-label {
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .menu-l1-sys {
          font-size: 9px;
          color: var(--muted);
        }
        .menu-l1-item:hover:not(:disabled) {
          background: rgba(88, 166, 255, 0.08);
        }
        .menu-l1-item.active {
          color: var(--accent);
          background: rgba(88, 166, 255, 0.12);
          font-weight: 600;
        }
        .menu-l1-item.active .menu-l1-sys {
          color: var(--accent);
          opacity: 0.85;
        }
        .menu-panel {
          flex: 1;
          overflow-y: auto;
          padding: 0.55rem 0.65rem 0.85rem;
          min-width: 0;
        }
        .menu-panel-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 0.65rem;
          padding-bottom: 0.45rem;
          border-bottom: 1px solid var(--border);
          color: var(--text);
          display: flex;
          align-items: baseline;
          gap: 0.35rem;
        }
        .menu-panel-sys {
          font-size: 10px;
          font-weight: 400;
          color: var(--muted);
        }
        .menu-group {
          margin-bottom: 0.55rem;
        }
        .menu-group:last-child {
          margin-bottom: 0;
        }
        .menu-group-depth-0 {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.5rem 0.6rem 0.55rem;
          background: rgba(88, 166, 255, 0.03);
        }
        .menu-group-depth-1,
        .menu-group-depth-2,
        .menu-group-depth-3 {
          margin-top: 0.4rem;
          padding: 0.15rem 0 0.15rem 0.55rem;
          border-left: 2px solid rgba(88, 166, 255, 0.22);
        }
        .menu-group-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.35rem;
          margin-bottom: 0.35rem;
        }
        .menu-group-depth-0 > .menu-group-head {
          margin-bottom: 0.45rem;
          padding-bottom: 0.35rem;
          border-bottom: 1px solid rgba(88, 166, 255, 0.12);
        }
        .menu-group-depth-1 > .menu-group-head,
        .menu-group-depth-2 > .menu-group-head,
        .menu-group-depth-3 > .menu-group-head {
          margin-bottom: 0.25rem;
        }
        .menu-group-mixed > .menu-group-children {
          margin-bottom: 0.35rem;
        }
        .menu-group-title {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.35;
          color: var(--text);
        }
        .menu-group-depth-1 .menu-group-title,
        .menu-group-depth-2 .menu-group-title,
        .menu-group-depth-3 .menu-group-title {
          font-size: 11px;
          font-weight: 500;
          color: var(--muted);
        }
        .menu-group-count {
          flex-shrink: 0;
          font-size: 9px;
          line-height: 1;
          padding: 0.12rem 0.32rem;
          border-radius: 999px;
          color: var(--muted);
          background: rgba(88, 166, 255, 0.08);
        }
        .menu-group-children {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .menu-leaf-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }
        .menu-leaf {
          max-width: 100%;
          text-align: left;
          padding: 0.22rem 0.48rem;
          border: 1px solid rgba(88, 166, 255, 0.14);
          border-radius: 4px;
          background: rgba(88, 166, 255, 0.05);
          color: var(--text);
          font-size: 11px;
          line-height: 1.35;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition:
            border-color 0.12s ease,
            background 0.12s ease,
            color 0.12s ease;
        }
        .menu-leaf:hover:not(:disabled) {
          border-color: rgba(88, 166, 255, 0.42);
          background: rgba(88, 166, 255, 0.11);
          color: var(--accent);
        }
        .menu-leaf.active {
          border-color: rgba(88, 166, 255, 0.55);
          background: rgba(88, 166, 255, 0.16);
          color: var(--accent);
          font-weight: 600;
        }
        .menu-search-results {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          padding: 0.5rem 0.75rem;
        }
        .menu-search-results-count {
          margin: 0 0 0.35rem;
          font-size: 10px;
          color: var(--muted);
        }
        .menu-search-result {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          width: 100%;
          text-align: left;
          padding: 0.3rem 0.4rem;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text);
          font-size: 11px;
          line-height: 1.35;
          cursor: pointer;
          gap: 0.1rem;
        }
        .menu-search-result:hover:not(:disabled) {
          background: rgba(88, 166, 255, 0.08);
        }
        .menu-search-result.active {
          color: var(--accent);
          font-weight: 600;
          background: rgba(88, 166, 255, 0.12);
        }
        .menu-search-result-name {
          font-size: 11px;
        }
        .menu-search-result-path {
          font-size: 9px;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }
        .menu-search-result.active .menu-search-result-path {
          color: var(--accent);
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
