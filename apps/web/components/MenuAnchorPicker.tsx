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

interface MenuSection {
  menuId: string;
  title: string;
  items: MenuLeafItem[];
}

interface MenuMegaPanel {
  rootId: string;
  rootName: string;
  breadcrumb: string[];
  sections: MenuSection[];
}

interface MenuTreePayload {
  userSysId: string;
  merged?: boolean;
  roots: MenuNavRoot[];
  panels: Record<string, MenuMegaPanel>;
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
      const res = await fetch("/api/menu/tree");
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
      const hit = p.sections.some((s) =>
        s.items.some((i) => i.menuId === anchor.menuId),
      );
      if (hit) {
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

  const filteredSections = useMemo(() => {
    if (!panel) return [];
    const q = search.trim().toLowerCase();
    if (!q) return panel.sections;
    return panel.sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (it) =>
            it.menuName.toLowerCase().includes(q) ||
            it.menuUrl.toLowerCase().includes(q) ||
            it.routePath.toLowerCase().includes(q),
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [panel, search]);

  const isLeafSelected = (menuId: string) =>
    anchor?.kind === "menu" && anchor.menuId === menuId;

  const pickLeaf = (
    root: MenuNavRoot,
    secTitle: string,
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
      breadcrumb: [root.menuName, secTitle, leaf.menuName].filter(Boolean),
    });
  };

  const handleLeafClick = (
    root: MenuNavRoot,
    secTitle: string,
    leaf: MenuLeafItem,
  ) => {
    if (isLeafSelected(leaf.menuId)) return;
    pickLeaf(root, secTitle, leaf);
  };

  const handleLeafDoubleClick = (leaf: MenuLeafItem) => {
    if (isLeafSelected(leaf.menuId)) {
      onSelect(null);
    }
  };

  return (
    <div className="menu-picker">
      <p className="menu-hint muted small">单击切换锚点 · 双击已选项取消</p>
      <input
        type="search"
        className="menu-search"
        placeholder="搜一级或当前分组…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled || !tree}
      />

      {loading && <p className="muted small">加载菜单…</p>}
      {error && <p className="menu-error small">{error}</p>}

      {!loading && tree && filteredRoots.length > 0 && (
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
              filteredSections.map((sec) => (
                <section key={sec.menuId} className="menu-section">
                  <h3 className="menu-section-title">{sec.title}</h3>
                  <div className="menu-leaf-grid">
                    {sec.items.map((leaf) => {
                      const active = isLeafSelected(leaf.menuId);
                      return (
                        <button
                          key={leaf.menuId}
                          type="button"
                          className={active ? "menu-leaf active" : "menu-leaf"}
                          disabled={disabled}
                          title={`${leaf.menuUrl}${leaf.routePath !== leaf.menuUrl ? `\n路由: ${leaf.routePath}` : ""}${active ? "\n双击取消锚点" : ""}`}
                          onClick={() => handleLeafClick(activeRoot, sec.title, leaf)}
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
                </section>
              ))}
            {panel && filteredSections.length === 0 && (
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
      {!loading && tree && tree.roots.length > 0 && filteredRoots.length === 0 && (
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
          padding: 0.5rem 0.6rem 0.75rem;
          min-width: 0;
        }
        .menu-panel-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 0.6rem;
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
        .menu-section {
          margin-bottom: 0.75rem;
        }
        .menu-section-title {
          font-size: 12px;
          font-weight: 600;
          margin: 0 0 0.4rem;
          color: var(--text);
        }
        .menu-leaf-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.35rem 0.5rem;
        }
        .menu-leaf {
          text-align: left;
          padding: 0.15rem 0;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.35;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .menu-leaf:hover:not(:disabled) {
          color: var(--accent);
        }
        .menu-leaf.active {
          color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
