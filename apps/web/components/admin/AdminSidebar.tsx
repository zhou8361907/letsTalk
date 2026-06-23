"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  onLogout?: () => void;
}

export function AdminSidebar({ onLogout }: Props) {
  const pathname = usePathname();

  const nav = [
    { href: "/admin", label: "📊 概览" },
    { href: "/admin/actors", label: "👥 用户消耗" },
  ];

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <h2>Admin</h2>
        <span className="admin-sidebar-sub">管理后台</span>
      </div>
      <nav className="admin-sidebar-nav">
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "admin-nav-item active" : "admin-nav-item"}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="admin-sidebar-footer">
        <a href="/" className="admin-nav-item back-link">
          ← 返回聊天
        </a>
      </div>

      <style jsx>{`
        .admin-sidebar {
          width: 200px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border-right: 1px solid var(--border);
          height: 100vh;
          overflow: hidden;
        }
        .admin-sidebar-brand {
          padding: 1rem 1.1rem 0.6rem;
          border-bottom: 1px solid var(--border);
        }
        .admin-sidebar-brand h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }
        .admin-sidebar-sub {
          font-size: 11px;
          color: var(--muted);
        }
        .admin-sidebar-nav {
          flex: 1;
          padding: 0.5rem 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          overflow-y: auto;
        }
        .admin-nav-item {
          display: block;
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          font-size: 13px;
          color: var(--text);
          text-decoration: none;
          transition: background 0.12s;
        }
        .admin-nav-item:hover {
          background: rgba(88, 166, 255, 0.08);
        }
        .admin-nav-item.active {
          background: rgba(88, 166, 255, 0.14);
          color: var(--accent);
          font-weight: 600;
        }
        .admin-sidebar-footer {
          padding: 0.5rem 0.6rem;
          border-top: 1px solid var(--border);
        }
        .back-link {
          font-size: 12px;
          color: var(--muted);
        }
        .back-link:hover {
          color: var(--text);
        }
      `}</style>
    </aside>
  );
}
