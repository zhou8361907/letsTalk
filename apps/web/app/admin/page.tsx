"use client";

import { useEffect, useState } from "react";
import { SummaryCard } from "../../components/admin/SummaryCard";
import { CostTrendChart } from "../../components/admin/CostTrendChart";
import { ModelPieChart } from "../../components/admin/ModelPieChart";
import type { AdminOverview } from "../../lib/admin-aggregation";

function formatCost(v: number): string {
  return `$${v.toFixed(6)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/overview")
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/";
            return;
          }
          throw new Error(`请求失败: ${res.status}`);
        }
        const json = (await res.json()) as AdminOverview;
        setData(json);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="state-text">加载中…</p>;
  }

  if (error) {
    return <p className="state-text error">加载失败: {error}</p>;
  }

  if (!data) {
    return <p className="state-text">暂无数据</p>;
  }

  return (
    <div className="page">
      <h1 className="page-title">仪表盘概览</h1>

      <div className="cards-row">
        <SummaryCard
          value={formatCost(data.totalCostUsd)}
          label="总消耗"
        />
        <SummaryCard
          value={formatTokens(data.totalInputTokens + data.totalOutputTokens)}
          label="总 Token"
        />
        <SummaryCard
          value={String(data.sessionCount)}
          label="会话总数"
          unit="个"
        />
        <SummaryCard
          value={String(data.actorCount)}
          label="活跃用户"
          unit="人"
        />
      </div>

      <div className="charts-row">
        <CostTrendChart data={data.dailyTrend} mode="cost" />
        <ModelPieChart data={data.modelBreakdown} />
      </div>

      <div className="section">
        <h2 className="section-title">最近会话</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>用户</th>
                <th>花费</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>
                    <a
                      href={`/admin/sessions/${encodeURIComponent(s.sessionId)}`}
                      className="session-link"
                    >
                      {s.title}
                    </a>
                  </td>
                  <td>{s.actorName}</td>
                  <td>{formatCost(s.costUsd)}</td>
                  <td className="muted-cell">
                    {s.updatedAt
                      ? new Date(s.updatedAt).toLocaleString("zh-CN")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .page {
          max-width: 1100px;
        }
        .page-title {
          margin: 0 0 1rem;
          font-size: 18px;
          font-weight: 700;
        }
        .state-text {
          color: var(--muted);
          font-size: 14px;
          padding: 2rem 0;
        }
        .state-text.error {
          color: #f85149;
        }
        .cards-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .charts-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          margin-bottom: 1.2rem;
        }
        .section {
          margin-bottom: 1.2rem;
        }
        .section-title {
          margin: 0 0 0.5rem;
          font-size: 14px;
          font-weight: 600;
        }
        .table-wrap {
          overflow-x: auto;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .data-table th {
          text-align: left;
          padding: 0.6rem 0.8rem;
          font-weight: 600;
          color: var(--muted);
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .data-table td {
          padding: 0.55rem 0.8rem;
          border-bottom: 1px solid var(--border);
        }
        .data-table tr:last-child td {
          border-bottom: none;
        }
        .data-table tr:hover td {
          background: rgba(88, 166, 255, 0.04);
        }
        .session-link {
          color: var(--accent);
          text-decoration: none;
        }
        .session-link:hover {
          text-decoration: underline;
        }
        .muted-cell {
          color: var(--muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
