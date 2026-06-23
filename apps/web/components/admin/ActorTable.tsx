"use client";

import Link from "next/link";
import type { ActorConsumptionRow } from "../../lib/admin-aggregation";

interface Props {
  actors: ActorConsumptionRow[];
}

function formatCost(v: number): string {
  return `$${v.toFixed(6)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function formatTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActorTable({ actors }: Props) {
  if (actors.length === 0) {
    return (
      <div className="empty">
        <p>暂无用户数据</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>会话数</th>
            <th>总 Token</th>
            <th>总花费</th>
            <th>最后活跃</th>
          </tr>
        </thead>
        <tbody>
          {actors.map((a) => (
            <tr key={a.actorId}>
              <td>
                <Link
                  href={`/admin/actors/${encodeURIComponent(a.actorId)}`}
                  className="actor-link"
                >
                  {a.actorName}
                </Link>
              </td>
              <td>{a.sessionCount}</td>
              <td>{formatTokens(a.totalTokens)}</td>
              <td>{formatCost(a.totalCostUsd)}</td>
              <td className="muted-cell">{formatTime(a.lastActive)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
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
        .actor-link {
          color: var(--accent);
          text-decoration: none;
          font-weight: 500;
        }
        .actor-link:hover {
          text-decoration: underline;
        }
        .muted-cell {
          color: var(--muted);
          font-size: 12px;
        }
        .empty {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          color: var(--muted);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
