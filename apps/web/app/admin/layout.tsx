"use client";

import { AdminSidebar } from "../../components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">{children}</main>

      <style jsx>{`
        .admin-layout {
          display: flex;
          height: 100vh;
          width: 100%;
          overflow: hidden;
          background: var(--bg);
          color: var(--text);
          font-family:
            ui-monospace,
            SFMono-Regular,
            "SF Mono",
            Menlo,
            Consolas,
            monospace;
          font-size: 14px;
        }
        .admin-content {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          padding: 1.2rem 1.5rem;
        }
      `}</style>
    </div>
  );
}
