"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface DataPoint {
  model: string;
  costUsd: number;
  sessionCount: number;
}

interface Props {
  data: DataPoint[];
}

const COLORS = ["#58a6ff", "#3fb950", "#d29922", "#f85149", "#bc8cff", "#a371f7"];

function formatCost(v: number): string {
  return `$${v.toFixed(6)}`;
}

function modelShortName(model: string): string {
  if (model.includes("deepseek")) return model.includes("v4") ? "DeepSeek V4" : "DeepSeek";
  if (model.includes("claude")) return "Claude";
  if (model.includes("gpt")) return "GPT";
  return model.split("/").pop() || model;
}

export function ModelPieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>暂无模型数据</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">模型占比（按花费）</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="costUsd"
            nameKey="model"
            cx="50%"
            cy="50%"
            outerRadius={72}
            innerRadius={36}
            paddingAngle={2}
          >
            {data.map((_, idx) => (
              <Cell
                key={idx}
                fill={COLORS[idx % COLORS.length]}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatCost(Number(value)),
              modelShortName(String(name)),
            ] as [string, string]}
          />
          <Legend
            formatter={(value: string) => modelShortName(value)}
            fontSize={11}
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>

      <style jsx>{`
        .chart-container {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.8rem 0.6rem 0.4rem;
        }
        .chart-title {
          margin: 0 0 0.2rem 0.8rem;
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
