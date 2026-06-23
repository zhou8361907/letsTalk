"use client";

interface Props {
  value: string;
  label: string;
  unit?: string;
}

export function SummaryCard({ value, label, unit }: Props) {
  return (
    <div className="summary-card">
      <div className="summary-value">{value}</div>
      <div className="summary-label">
        {label}
        {unit && <span className="summary-unit">{unit}</span>}
      </div>

      <style jsx>{`
        .summary-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 1rem 1.2rem;
          min-width: 0;
        }
        .summary-value {
          font-size: 22px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--text);
          word-break: break-all;
        }
        .summary-label {
          font-size: 12px;
          color: var(--muted);
          margin-top: 0.25rem;
        }
        .summary-unit {
          margin-left: 0.3rem;
        }
      `}</style>
    </div>
  );
}
