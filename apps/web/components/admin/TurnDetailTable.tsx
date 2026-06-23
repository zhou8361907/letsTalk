"use client";

import type { SessionTraceTurn } from "../../lib/admin-aggregation";

interface Props {
  sessionId: string;
  turns: SessionTraceTurn[];
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
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function modelShort(model: string): string {
  if (model.includes("deepseek")) return model.includes("v4") ? "DS V4" : "DS";
  if (model.includes("claude")) return "Claude";
  return model.split("/").pop() || model;
}

export function TurnDetailTable({ sessionId, turns }: Props) {
  if (turns.length === 0) {
    return (
      <div className="empty">
        <p>暂无回合数据</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>时间</th>
            <th>模型</th>
            <th>输入 Token</th>
            <th>输出 Token</th>
            <th>本轮花费</th>
            <th>累计花费</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {turns.map((t) => (
            <tr key={t.turnIndex} className={t.success ? "" : "row-fail"}>
              <td className="idx-cell">{t.turnIndex}</td>
              <td className="muted-cell">{formatTime(t.at)}</td>
              <td>
                <span className="model-badge">{modelShort(t.model)}</span>
              </td>
              <td>{formatTokens(t.inputTokens)}</td>
              <td>{formatTokens(t.outputTokens)}</td>
              <td>{formatCost(t.turnCostUsd)}</td>
              <td className="muted-cell">{formatCost(t.cumulativeCostUsd)}</td>
              <td>
                {t.success ? (
                  <span className="ok-badge">✓</span>
                ) : (
                  <span className="fail-badge">✗</span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="debug-btn"
                  title="查看本轮 LLM 详细请求与响应"
                  onClick={() => {
                    sessionStorage.setItem("letsTalk.debugSession", sessionId);
                    sessionStorage.setItem("letsTalk.debugTurnIdx", String(t.turnIndex));
                    window.location.href = "/";
                  }}
                >
                  🔍
                </button>
              </td>
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
          font-size: 12px;
        }
        .data-table th {
          text-align: left;
          padding: 0.5rem 0.65rem;
          font-weight: 600;
          color: var(--muted);
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .data-table td {
          padding: 0.45rem 0.65rem;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .data-table tr:last-child td {
          border-bottom: none;
        }
        .data-table tr:hover td {
          background: rgba(88, 166, 255, 0.04);
        }
        .row-fail td {
          background: rgba(248, 81, 73, 0.04);
        }
        .idx-cell {
          font-weight: 600;
          color: var(--muted);
        }
        .muted-cell {
          color: var(--muted);
        }
        .model-badge {
          display: inline-block;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          font-size: 11px;
          background: rgba(88, 166, 255, 0.1);
          color: var(--accent);
        }
        .ok-badge {
          color: #3fb950;
          font-weight: 700;
        }
        .fail-badge {
          color: #f85149;
          font-weight: 700;
        }
        .debug-btn {
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-size: 13px;
          padding: 0.15rem 0.3rem;
          border-radius: 4px;
        }
        .debug-btn:hover {
          background: rgba(88, 166, 255, 0.12);
          color: var(--accent);
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
