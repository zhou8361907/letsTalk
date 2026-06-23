"use client";

import { useCallback, useEffect, useState } from "react";
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

interface DebugSnapshot {
  turnId: string;
  at: string;
  userMessage: string;
  contextPrefix: string;
  promptUserText: string;
  assistantText: string;
  tools: Array<{ tool: string; ok: boolean; durationMs: number; preview?: string }>;
  modelLabel?: string | null;
  activeTools?: string[];
  contextUsage: { tokens: number | null; contextWindow: number; percent: number | null } | null;
  systemPrompt?: { text?: string; files?: Array<{ label: string; text: string }> } | null;
  piJsonlTail: string | null;
}

export default function AdminSessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [detail, setDetail] = useState<SessionTraceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Debug modal state
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugSnapshot | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/login";
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

  const handleDebugTurn = useCallback(async (sid: string, turnIndex: number) => {
    setDebugLoading(true);
    setDebugOpen(true);
    try {
      const res = await fetch(`/api/debug/session/${encodeURIComponent(sid)}/turns`);
      if (!res.ok) throw new Error("获取调试数据失败");
      const data = (await res.json()) as { turns?: DebugSnapshot[] };
      const turn = data.turns?.[turnIndex - 1] ?? null;
      setDebugData(turn);
    } catch {
      setDebugData(null);
    } finally {
      setDebugLoading(false);
    }
  }, []);

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
        <TurnDetailTable
          sessionId={sessionId}
          turns={detail.turns}
          onDebugTurn={handleDebugTurn}
        />
      </div>

      {/* Debug modal */}
      {debugOpen && (
        <div className="debug-overlay" onClick={() => setDebugOpen(false)}>
          <div className="debug-dialog" onClick={(e) => e.stopPropagation()}>
            <header className="debug-header">
              <h2>LLM 调试详情</h2>
              <button
                type="button"
                className="debug-close"
                onClick={() => setDebugOpen(false)}
              >
                ×
              </button>
            </header>

            {debugLoading ? (
              <p className="debug-muted" style={{ padding: "1rem 1.1rem" }}>加载中…</p>
            ) : !debugData ? (
              <p className="debug-muted" style={{ padding: "1rem 1.1rem", color: "#f85149" }}>
                该轮无调试数据，可能 Pi 会话已过期
              </p>
            ) : (
              <div className="debug-body">
                <div className="debug-field">
                  <span className="debug-label">模型</span>
                  <span className="debug-code">{debugData.modelLabel || "未知"}</span>
                </div>
                <div className="debug-field">
                  <span className="debug-label">注册工具</span>
                  <span className="debug-code">{debugData.activeTools?.join(", ") || "无"}</span>
                </div>
                {debugData.contextUsage && (
                  <div className="debug-field">
                    <span className="debug-label">上下文</span>
                    <span className="debug-code">
                      {debugData.contextUsage.tokens ?? "?"} / {debugData.contextUsage.contextWindow}
                      {debugData.contextUsage.percent != null
                        ? ` (${debugData.contextUsage.percent.toFixed(1)}%)`
                        : ""}
                    </span>
                  </div>
                )}
                <div className="debug-field">
                  <span className="debug-label">用户输入</span>
                  <pre className="debug-pre">{debugData.userMessage || "(空)"}</pre>
                </div>
                <div className="debug-field">
                  <span className="debug-label">上下文前缀</span>
                  <pre className="debug-pre">{debugData.contextPrefix || "(空)"}</pre>
                </div>
                <div className="debug-field">
                  <span className="debug-label">Prompt 文本</span>
                  <pre className="debug-pre">{debugData.promptUserText || "(空)"}</pre>
                </div>
                <div className="debug-field">
                  <span className="debug-label">回复内容</span>
                  <pre className="debug-pre">{debugData.assistantText || "(空)"}</pre>
                </div>
                {debugData.tools.length > 0 && (
                  <div className="debug-field">
                    <span className="debug-label">工具调用 ({debugData.tools.length} 次)</span>
                    <div className="debug-tools">
                      {debugData.tools.map((t, i) => (
                        <div key={i} className="debug-tool-item">
                          <span className={t.ok ? "tool-ok" : "tool-fail"}>
                            {t.ok ? "✓" : "✗"}
                          </span>
                          <span className="tool-name">{t.tool}</span>
                          <span className="tool-duration">{(t.durationMs / 1000).toFixed(1)}s</span>
                          {t.preview && <span className="tool-preview">{t.preview}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
        /* Debug modal */
        .debug-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(0, 0, 0, 0.62);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          backdrop-filter: blur(2px);
        }
        .debug-dialog {
          width: min(720px, 100%);
          max-height: min(90vh, 700px);
          display: flex;
          flex-direction: column;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        .debug-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.1rem;
          border-bottom: 1px solid var(--border);
        }
        .debug-header h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
        }
        .debug-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          padding: 0 0.15rem;
        }
        .debug-close:hover { color: var(--text); }
        .debug-muted {
          font-size: 12px;
          color: var(--muted);
        }
        .debug-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0.85rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .debug-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .debug-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .debug-code {
          font-size: 12px;
          color: var(--accent);
        }
        .debug-pre {
          margin: 0;
          padding: 0.5rem 0.6rem;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.45;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 200px;
          overflow-y: auto;
          color: var(--text);
        }
        .debug-tools {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .debug-tool-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 12px;
          padding: 0.3rem 0.5rem;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .tool-ok { color: #3fb950; font-weight: 700; }
        .tool-fail { color: #f85149; font-weight: 700; }
        .tool-name { font-weight: 500; }
        .tool-duration { color: var(--muted); font-size: 11px; }
        .tool-preview { color: var(--muted); font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </div>
  );
}
