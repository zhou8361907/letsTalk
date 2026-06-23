"use client";

import { useEffect, useState } from "react";
import { ActorTable } from "../../../components/admin/ActorTable";
import type { ActorConsumptionRow } from "../../../lib/admin-aggregation";

export default function AdminActorsPage() {
  const [actors, setActors] = useState<ActorConsumptionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/actors")
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          throw new Error(`请求失败: ${res.status}`);
        }
        const json = (await res.json()) as { actors: ActorConsumptionRow[] };
        setActors(json.actors);
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

  return (
    <div className="page">
      <h1 className="page-title">用户消耗排行</h1>
      <p className="page-desc">按总消耗降序排列</p>
      <ActorTable actors={actors} />

      <style jsx>{`
        .page {
          max-width: 900px;
        }
        .page-title {
          margin: 0 0 0.25rem;
          font-size: 18px;
          font-weight: 700;
        }
        .page-desc {
          margin: 0 0 1rem;
          font-size: 12px;
          color: var(--muted);
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
