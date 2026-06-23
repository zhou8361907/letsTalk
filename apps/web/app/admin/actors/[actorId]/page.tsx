"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SessionTable } from "../../../../components/admin/SessionTable";
import type { ActorSessionRow } from "../../../../lib/admin-aggregation";

function formatCost(v: number): string {
  return `$${v.toFixed(6)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

export default function AdminActorDetailPage() {
  const params = useParams();
  const actorId = params.actorId as string;
  const [sessions, setSessions] = useState<ActorSessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/actors/${encodeURIComponent(actorId)}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          throw new Error(`请求失败: ${res.status}`);
        }
        const json = (await res.json()) as { actorId: string; sessions: ActorSessionRow[] };
        setSessions(json.sessions);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => setLoading(false));
  }, [actorId]);

  const totalCost = sessions.reduce((sum, s) => sum + s.costUsd, 0);
  const totalTokens = sessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0);

  if (loading) {
    return <p className="state-text">加载中…</p>;
  }

  if (error) {
    return <p className="state-text error">加载失败: {error}</p>;
  }

  return (
    <div className="page">
      <a href="/admin/actors" className="back-link">← 返回用户列表</a>
      <h1 className="page-title">用户: {decodeURIComponent(actorId)}</h1>

      <div className="cards-row">
        <div className="info-card">
          <div className="info-value">{sessions.length}</div>
          <div className="info-label">会话数</div>
        </div>
        <div className="info-card">
          <div className="info-value">{formatTokens(totalTokens)}</div>
          <div className="info-label">总 Token</div>
        </div>
        <div className="info-card">
          <div className="info-value">{formatCost(totalCost)}</div>
          <div className="info-label">总花费</div>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">会话列表</h2>
        <SessionTable sessions={sessions} />
      </div>

      <style jsx>{`
        .page {
          max-width: 900px;
        }
        .back-link {
          display: inline-block;
          margin-bottom: 0.5rem;
          font-size: 12px;
          color: var(--muted);
          text-decoration: none;
        }
        .back-link:hover {
          color: var(--text);
        }
        .page-title {
          margin: 0 0 1rem;
          font-size: 18px;
          font-weight: 700;
        }
        .cards-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.2rem;
        }
        .info-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 1rem 1.2rem;
        }
        .info-value {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.2;
        }
        .info-label {
          font-size: 12px;
          color: var(--muted);
          margin-top: 0.25rem;
        }
        .section {
          margin-bottom: 1.2rem;
        }
        .section-title {
          margin: 0 0 0.5rem;
          font-size: 14px;
          font-weight: 600;
        }
        .state-text {
          color: var(--muted);
          font-size: 14px;
          padding: 2rem 0;
        }
        .state-text.error {
          color: #f85149;
        }
      `}</style>
    </div>
  );
}
