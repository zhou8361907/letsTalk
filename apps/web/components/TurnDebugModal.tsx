"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SystemPromptSnapshot,
  TurnDebugSnapshot,
} from "@lets-talk/shared-types";
import {
  formatTurnFullExport,
  formatTurnOverview,
} from "../lib/turn-debug-format";

type DebugTab =
  | "overview"
  | "system"
  | "prompt"
  | "prefix"
  | "jsonl"
  | "tools"
  | "meta";

const TAB_LABEL: Record<DebugTab, string> = {
  overview: "概览",
  system: "System",
  prompt: "User 文本",
  prefix: "JIT 前缀",
  jsonl: "Pi JSONL",
  tools: "工具调用",
  meta: "元信息",
};

const SOURCE_LABEL: Record<"debug" | "pi" | "none", string> = {
  debug: ".agent/debug",
  pi: "pi jsonl",
  none: "无",
};

type SourceKind = keyof typeof SOURCE_LABEL;

function formatTurnTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function turnShortId(turnId: string, index: number): string {
  const m = turnId.match(/turn-(\d+)/);
  if (m) return `#${Number(m[1])}`;
  const pi = turnId.match(/pi-turn-(\d+)/);
  if (pi) return `#${Number(pi[1])}`;
  return `#${index + 1}`;
}

export function TurnDebugModal(props: {
  open: boolean;
  sessionId: string;
  turns: TurnDebugSnapshot[];
  initialTurnId?: string | null;
  source?: SourceKind;
  loading?: boolean;
  onClose: () => void;
}) {
  const { open, sessionId, turns, initialTurnId, source, loading, onClose } =
    props;
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [tab, setTab] = useState<DebugTab>("prompt");
  const [fullJsonl, setFullJsonl] = useState<string | null>(null);
  const [fullJsonlLoading, setFullJsonlLoading] = useState(false);
  const [fullJsonlError, setFullJsonlError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [sessionSystem, setSessionSystem] =
    useState<SystemPromptSnapshot | null>(null);
  const [sessionSystemLoading, setSessionSystemLoading] = useState(false);

  /** 与对话顺序一致：最早在上，最新在下 */
  const sortedTurns = useMemo(
    () => [...turns].sort((a, b) => a.at.localeCompare(b.at)),
    [turns],
  );

  const selected = useMemo(
    () => sortedTurns.find((t) => t.turnId === selectedTurnId) ?? null,
    [sortedTurns, selectedTurnId],
  );

  const selectedIndex = useMemo(
    () => sortedTurns.findIndex((t) => t.turnId === selectedTurnId),
    [sortedTurns, selectedTurnId],
  );

  useEffect(() => {
    if (!open) return;
    const pick =
      initialTurnId && sortedTurns.some((t) => t.turnId === initialTurnId)
        ? initialTurnId
        : sortedTurns[sortedTurns.length - 1]?.turnId ?? null;
    setSelectedTurnId(pick);
    setTab("overview");
    setFullJsonl(null);
    setFullJsonlError(null);
    setCopyHint(null);
    setSessionSystem(null);
  }, [open, initialTurnId, sortedTurns]);

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    setSessionSystemLoading(true);
    void fetch(`/api/debug/session/${sessionId}/system`)
      .then((res) => res.json() as Promise<{ systemPrompt?: SystemPromptSnapshot }>)
      .then((data) => {
        if (!cancelled) setSessionSystem(data.systemPrompt ?? null);
      })
      .catch(() => {
        if (!cancelled) setSessionSystem(null);
      })
      .finally(() => {
        if (!cancelled) setSessionSystemLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  useEffect(() => {
    setFullJsonl(null);
    setFullJsonlError(null);
  }, [selectedTurnId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadFullJsonl = useCallback(async () => {
    if (!sessionId) return;
    setFullJsonlLoading(true);
    setFullJsonlError(null);
    try {
      const res = await fetch(`/api/debug/session/${sessionId}/jsonl`);
      const data = (await res.json()) as {
        error?: string;
        content?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "读取失败");
      setFullJsonl(data.content ?? "");
    } catch (e) {
      setFullJsonlError(e instanceof Error ? e.message : String(e));
    } finally {
      setFullJsonlLoading(false);
    }
  }, [sessionId]);

  const effectiveSystem = useMemo(() => {
    if (!selected) return sessionSystem;
    return selected.systemPrompt ?? sessionSystem;
  }, [selected, sessionSystem]);

  const panelText = useMemo(() => {
    if (!selected) return "";
    switch (tab) {
      case "overview":
        return formatTurnOverview({
          ...selected,
          systemPrompt: effectiveSystem ?? selected.systemPrompt ?? null,
        });
      case "system": {
        const sp = effectiveSystem;
        if (sessionSystemLoading && !sp) return "正在加载 system prompt…";
        if (!sp?.combined?.trim()) {
          return "（无 system 快照。发送新消息后 SSE 会带上；或确认 LETS_TALK_DEBUG=1 已落盘）";
        }
        const note = sp.sourceNote ? `\n\n---\n\n> ${sp.sourceNote}` : "";
        return sp.combined + note;
      }
      case "prompt":
        return selected.promptUserText;
      case "prefix":
        return selected.contextPrefix || "（本轮无前缀）";
      case "jsonl":
        return fullJsonl ?? selected.piJsonlTail ?? "（无 jsonl）";
      case "tools":
        if (selected.tools.length === 0) return "（本轮无工具调用）";
        return selected.tools
          .map(
            (t, i) =>
              `### ${i + 1}. ${t.tool}${t.ok === false ? " (failed)" : ""}\n\n${t.preview}`,
          )
          .join("\n\n---\n\n");
      case "meta":
        return JSON.stringify(
          { ...selected, systemPrompt: effectiveSystem ?? selected.systemPrompt },
          null,
          2,
        );
      default:
        return "";
    }
  }, [selected, tab, fullJsonl, effectiveSystem, sessionSystemLoading]);

  const copyPanel = useCallback(async () => {
    if (!panelText) return;
    try {
      await navigator.clipboard.writeText(panelText);
      setCopyHint("已复制");
      window.setTimeout(() => setCopyHint(null), 1500);
    } catch {
      setCopyHint("复制失败");
    }
  }, [panelText]);

  const copyFullTurn = useCallback(async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(
        formatTurnFullExport({
          ...selected,
          systemPrompt: effectiveSystem ?? selected.systemPrompt ?? null,
        }),
      );
      setCopyHint("已复制完整回合");
      window.setTimeout(() => setCopyHint(null), 1500);
    } catch {
      setCopyHint("复制失败");
    }
  }, [selected, effectiveSystem]);

  if (!open) return null;

  return (
    <div className="dbg-overlay" role="presentation" onClick={onClose}>
      <div
        className="dbg-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dbg-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dbg-header">
          <div className="dbg-header-text">
            <div className="dbg-title-row">
              <h2 id="dbg-title">回合调试</h2>
              {source && source !== "none" && (
                <span className="dbg-badge">{SOURCE_LABEL[source]}</span>
              )}
              {loading && <span className="dbg-badge muted">加载中</span>}
            </div>
            <p className="dbg-sub">
              System（会话级）+ User 每轮前缀 + Pi 多轮历史 · 共{" "}
              {sortedTurns.length} 回合
            </p>
          </div>
          <button
            type="button"
            className="dbg-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <div className="dbg-body">
          <aside className="dbg-sidebar">
            <div className="dbg-sidebar-head">回合列表</div>
            {loading && sortedTurns.length === 0 ? (
              <p className="dbg-muted">正在从磁盘加载…</p>
            ) : sortedTurns.length === 0 ? (
              <p className="dbg-muted">暂无回合。发送消息或切换有历史的会话。</p>
            ) : (
              <ul className="dbg-turn-list">
                {sortedTurns.map((t, i) => (
                  <li key={t.turnId}>
                    <button
                      type="button"
                      className={
                        t.turnId === selectedTurnId
                          ? "dbg-turn active"
                          : "dbg-turn"
                      }
                      onClick={() => setSelectedTurnId(t.turnId)}
                    >
                      <span className="dbg-turn-top">
                        <span className="dbg-turn-num">
                          {turnShortId(t.turnId, i)}
                        </span>
                        <span className="dbg-turn-time">{formatTurnTime(t.at)}</span>
                      </span>
                      <span className="dbg-turn-user">{t.userMessage || "（空）"}</span>
                      {t.tools.length > 0 && (
                        <span className="dbg-turn-tools">{t.tools.length} 次工具</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="dbg-main">
            {selected ? (
              <>
                <div className="dbg-tabs" role="tablist">
                  {(Object.keys(TAB_LABEL) as DebugTab[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      className={tab === key ? "dbg-tab active" : "dbg-tab"}
                      onClick={() => setTab(key)}
                    >
                      {TAB_LABEL[key]}
                    </button>
                  ))}
                  <span className="dbg-tabs-spacer" />
                  <button
                    type="button"
                    className="dbg-copy"
                    onClick={() => void copyFullTurn()}
                    disabled={!selected}
                  >
                    复制完整回合
                  </button>
                  <button
                    type="button"
                    className="dbg-copy"
                    onClick={() => void copyPanel()}
                    disabled={!panelText}
                  >
                    {copyHint ?? "复制当前页"}
                  </button>
                </div>

                <div className="dbg-meta-bar">
                  <span className="dbg-chip">
                    {turnShortId(selected.turnId, selectedIndex)} · {selected.chatMode}
                  </span>
                  {selected.modelLabel && (
                    <span className="dbg-chip">{selected.modelLabel}</span>
                  )}
                  {effectiveSystem?.combined && (
                    <span className="dbg-chip">
                      system {effectiveSystem.combined.length.toLocaleString()} 字
                    </span>
                  )}
                  {selected.contextUsage && (
                    <span className="dbg-chip">
                      ctx {selected.contextUsage.tokens ?? "?"} /{" "}
                      {selected.contextUsage.contextWindow}
                    </span>
                  )}
                  {tab === "jsonl" && selected.piJsonlTruncated && !fullJsonl && (
                    <button
                      type="button"
                      className="dbg-link"
                      disabled={fullJsonlLoading}
                      onClick={() => void loadFullJsonl()}
                    >
                      {fullJsonlLoading ? "加载中…" : "加载完整 JSONL"}
                    </button>
                  )}
                </div>
                {selected.piSessionFile && (
                  <div className="dbg-path-row">
                    <code>{selected.piSessionFile}</code>
                  </div>
                )}
                {fullJsonlError && <p className="dbg-error">{fullJsonlError}</p>}

                <pre className="dbg-pre">{panelText}</pre>
              </>
            ) : (
              <p className="dbg-muted">请从左侧选择回合</p>
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        .dbg-overlay {
          position: fixed;
          inset: 0;
          z-index: 210;
          background: rgba(0, 0, 0, 0.68);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .dbg-dialog {
          width: min(980px, 100%);
          max-height: min(88vh, 880px);
          display: flex;
          flex-direction: column;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        .dbg-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          padding: 0.9rem 1.1rem;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(
            180deg,
            rgba(88, 166, 255, 0.06) 0%,
            transparent 100%
          );
        }
        .dbg-title-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .dbg-header h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
        }
        .dbg-badge {
          font-size: 10px;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          background: rgba(88, 166, 255, 0.15);
          color: var(--accent);
          border: 1px solid rgba(88, 166, 255, 0.35);
        }
        .dbg-badge.muted {
          background: var(--panel);
          color: var(--muted);
          border-color: var(--border);
        }
        .dbg-sub {
          margin: 0.3rem 0 0;
          font-size: 11px;
          color: var(--muted);
        }
        .dbg-close {
          border: none;
          background: var(--panel);
          color: var(--muted);
          font-size: 18px;
          line-height: 1;
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 8px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .dbg-close:hover {
          color: var(--text);
          border: 1px solid var(--border);
        }
        .dbg-body {
          flex: 1;
          min-height: 0;
          display: flex;
        }
        .dbg-sidebar {
          width: 260px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          overflow-y: auto;
          padding: 0.55rem 0.5rem 0.75rem;
          background: rgba(0, 0, 0, 0.12);
        }
        .dbg-sidebar-head {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 0.2rem 0.45rem 0.45rem;
        }
        .dbg-turn-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .dbg-turn {
          width: 100%;
          text-align: left;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          padding: 0.45rem 0.5rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          transition: background 0.12s, border-color 0.12s;
        }
        .dbg-turn:hover {
          background: var(--panel);
          border-color: var(--border);
        }
        .dbg-turn.active {
          background: var(--panel);
          border-color: rgba(88, 166, 255, 0.55);
          box-shadow: inset 3px 0 0 var(--accent);
        }
        .dbg-turn-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.35rem;
        }
        .dbg-turn-num {
          font-size: 10px;
          font-weight: 700;
          color: var(--accent);
          font-variant-numeric: tabular-nums;
        }
        .dbg-turn-time {
          font-size: 9px;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .dbg-turn-user {
          font-size: 11px;
          color: var(--text);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dbg-turn-tools {
          font-size: 9px;
          color: var(--muted);
        }
        .dbg-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          min-height: 340px;
        }
        .dbg-tabs {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.3rem;
          padding: 0.55rem 0.75rem 0;
        }
        .dbg-tabs-spacer {
          flex: 1;
        }
        .dbg-tab {
          font-size: 11px;
          padding: 0.28rem 0.55rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
        }
        .dbg-tab:hover {
          color: var(--text);
          background: var(--panel);
        }
        .dbg-tab.active {
          background: var(--accent);
          color: #0d1117;
          border-color: var(--accent);
          font-weight: 600;
        }
        .dbg-copy {
          font-size: 10px;
          padding: 0.28rem 0.55rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--panel);
          color: var(--muted);
          cursor: pointer;
        }
        .dbg-copy:hover:not(:disabled) {
          color: var(--text);
          border-color: var(--accent);
        }
        .dbg-meta-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 0.75rem 0;
        }
        .dbg-chip {
          font-size: 10px;
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .dbg-path-row {
          padding: 0.25rem 0.75rem 0;
        }
        .dbg-path-row code {
          font-size: 9px;
          color: var(--muted);
          word-break: break-all;
        }
        .dbg-link {
          font-size: 10px;
          border: none;
          background: transparent;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
        }
        .dbg-error {
          margin: 0;
          padding: 0.4rem 0.75rem;
          font-size: 11px;
          color: #f85149;
        }
        .dbg-pre {
          flex: 1;
          margin: 0.5rem 0.75rem 0.75rem;
          padding: 0.75rem 0.85rem;
          overflow: auto;
          font-size: 11px;
          line-height: 1.5;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          white-space: pre-wrap;
          word-break: break-word;
          background: #0a0d12;
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .dbg-muted {
          font-size: 12px;
          color: var(--muted);
          padding: 0.75rem;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
