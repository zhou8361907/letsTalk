"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface DataPoint {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

interface Props {
  data: DataPoint[];
  mode?: "cost" | "tokens";
}

function formatDate(d: string): string {
  // YYYY-MM-DD → MM/DD
  const parts = d.split("-");
  if (parts.length < 3) return d;
  return `${parts[1]}/${parts[2]}`;
}

function formatCost(v: number): string {
  return `$${v.toFixed(6)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

export function CostTrendChart({ data, mode = "cost" }: Props) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>暂无消耗数据</p>
      </div>
    );
  }

  const isCost = mode === "cost";
  const yKey = isCost ? "costUsd" : "outputTokens";
  const color = isCost ? "#58a6ff" : "#3fb950";
  const yFormatter = isCost ? formatCost : formatTokens;

  return (
    <div className="chart-container">
      <h3 className="chart-title">{isCost ? "每日消耗趋势" : "每日 Token 趋势"}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#8b949e" }}
            axisLine={{ stroke: "#30363d" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={yFormatter}
            tick={{ fontSize: 11, fill: "#8b949e" }}
            axisLine={{ stroke: "#30363d" }}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(label) => String(label)}
            formatter={(value) => [yFormatter(Number(value)), isCost ? "花费" : "Token"] as [string, string]}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>

      <style jsx>{`
        .chart-container {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.8rem 0.6rem 0.4rem;
        }
        .chart-title {
          margin: 0 0 0.5rem 0.8rem;
          font-size: 13px;
          font-weight: 600;
        }
        .chart-empty {
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
