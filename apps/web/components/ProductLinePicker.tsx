"use client";

import { PRODUCT_LINES, DEFAULT_PRODUCT_LINE, type ProductLineId } from "@lets-talk/shared-types";
import { useCallback, useState } from "react";

const STORAGE_KEY = "letsTalk.productLine";

function load(): ProductLineId {
  if (typeof window === "undefined") return DEFAULT_PRODUCT_LINE;
  const v = sessionStorage.getItem(STORAGE_KEY);
  if (v === "yibao" || v === "shebao") return v;
  return DEFAULT_PRODUCT_LINE;
}

interface Props {
  onChange?: (id: ProductLineId) => void;
}

export function ProductLinePicker({ onChange }: Props) {
  const [current, setCurrent] = useState<ProductLineId>(load);

  const handleSwitch = useCallback((id: ProductLineId) => {
    setCurrent(id);
    sessionStorage.setItem(STORAGE_KEY, id);
    onChange?.(id);
  }, [onChange]);

  return (
    <div className="product-line-picker">
      <span className="pl-label">产品线</span>
      {(Object.values(PRODUCT_LINES) as { id: ProductLineId; label: string }[]).map((pl) => (
        <button
          key={pl.id}
          type="button"
          className={`pl-btn${current === pl.id ? " active" : ""}`}
          onClick={() => handleSwitch(pl.id)}
        >
          {pl.label}
        </button>
      ))}

      <style jsx>{`
        .product-line-picker {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          margin: 0 0.5rem;
        }
        .pl-label {
          font-size: 10px;
          color: var(--muted);
          margin-right: 0.15rem;
        }
        .pl-btn {
          font-size: 11px;
          padding: 0.15rem 0.4rem;
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          background: var(--panel);
          color: var(--text);
        }
        .pl-btn.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(88, 166, 255, 0.08);
        }
        .pl-btn:hover:not(.active) {
          background: rgba(128, 128, 128, 0.06);
        }
      `}</style>
    </div>
  );
}
