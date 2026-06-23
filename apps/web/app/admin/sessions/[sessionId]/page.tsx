"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TurnDetailTable } from "../../../../components/admin/TurnDetailTable";
import type { SessionTraceDetail } from "../../../../lib/admin-aggregation";

function formatCost(v: number): string {
  return `$${v.toFixed(6)}`;
}

function formatTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN");
}

export default function AdminSessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [detail, setDetail] = useState<SessionTraceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/";
            return;
          }
          if (res.status === 404) throw new Error("会话不存在");
          throw new Error(`请求失败: ${res.status}`);
        }
        const json = (await res.json()) as SessionTraceDetail;
        setDetail(json);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return <p className="state-text">加载中…</p>;
  }

  if (error) {
    return <p className="state-text error">加载失败: {error}</p>;
  }

  if (!detail) {
    return <p className="state-text">会话不存在</p>;
  }

  return (
    <div className="page">
      <h1 className="page-title">对话详情</h1>

      <div className="meta-grid">
        <div className="meta-item">
          <span className="meta-label">标题</span>
          <span className="meta-value">{detail.title}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">用户</span>
          <span className="meta-value">{detail.actorName}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">创建时间</span>
          <span className="meta-value muted">{formatTime(detail.createdAt)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">更新时间</span>
          <span className="meta-value muted">{formatTime(detail.updatedAt)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">总消耗</span>
          <span className="meta-value">{formatCost(detail.totalCostUsd)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">总轮次</span>
          <span className="meta-value">{detail.turns.length}</span>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">Turn 级明细</h2>
        <TurnDetailTable sessionId={sessionId} turns={detail.turns} />
      </div>

      <style jsx>{`
        .page {
          max-width: 1000px;
        }
        .page-title {
          margin: 0 0 1rem;
          font-size: 18px;
          font-weight: 700;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.6rem;
          margin-bottom: 1.2rem;
        }
        .meta-item {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.65rem 0.9rem;
        }
        .meta-label {
          display: block;
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 0.15rem;
        }
        .meta-value {
          display: block;
          font-size: 13px;
          font-weight: 500;
          word-break: break-all;
        }
        .meta-value.muted {
          color: var(--muted);
          font-weight: 400;
          font-size: 12px;
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
