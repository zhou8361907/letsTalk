"use client";

import { useCallback, useEffect, useState } from "react";
import type { Actor } from "@lets-talk/shared-types";
import { ANONYMOUS_ACTOR_ID } from "@lets-talk/shared-types";
import { actorFetch, persistActorChoice } from "../lib/actor-client";

interface Props {
  open: boolean;
  /** welcome=首次必选；switch=已登录后切换，可取消 */
  mode: "welcome" | "switch";
  currentActorId?: string | null;
  onClose: () => void;
  onSelect: (actor: Actor) => void;
}

function actorInitial(displayName: string, kind: Actor["kind"]): string {
  if (kind === "anonymous") return "匿";
  const t = displayName.trim();
  if (!t) return "?";
  return t.slice(0, 1).toUpperCase();
}

export function ActorPickerModal({
  open,
  mode,
  currentActorId,
  onClose,
  onSelect,
}: Props) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDismiss = mode === "switch";
  const activeId = currentActorId ?? ANONYMOUS_ACTOR_ID;

  const requestClose = useCallback(() => {
    if (canDismiss) onClose();
  }, [canDismiss, onClose]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setNewName("");
    void actorFetch("/api/actors")
      .then(async (res) => {
        if (!res.ok) throw new Error("加载身份列表失败");
        const data = (await res.json()) as { actors?: Actor[] };
        setActors(data.actors ?? []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !canDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canDismiss, requestClose]);

  const confirmPick = (actor: Actor) => {
    if (canDismiss && actor.id === activeId) {
      onClose();
      return;
    }
    persistActorChoice(actor);
    onSelect(actor);
    onClose();
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await actorFetch("/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "创建失败");
      }
      const data = (await res.json()) as { actor: Actor };
      confirmPick(data.actor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const title = mode === "welcome" ? "选择你的身份" : "切换身份";
  const subtitle =
    mode === "welcome"
      ? "部门内共用此页；选对身份后只能看到自己的对话。无需密码。"
      : "切换后将加载该身份下的会话列表，当前页面内容不会丢失。";

  return (
    <div
      className="actor-overlay"
      role="presentation"
      onClick={canDismiss ? requestClose : undefined}
    >
      <div
        className="actor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="actor-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="actor-header">
          <div>
            <h2 id="actor-picker-title">{title}</h2>
            <p className="actor-sub">{subtitle}</p>
          </div>
          {canDismiss && (
            <button
              type="button"
              className="actor-close"
              onClick={requestClose}
              aria-label="关闭"
            >
              ×
            </button>
          )}
        </header>

        {error && <p className="actor-error">{error}</p>}

        <div className="actor-body">
          {loading ? (
            <p className="actor-muted">加载身份列表…</p>
          ) : (
            <ul className="actor-list">
              {actors.map((a) => {
                const selected = a.id === activeId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={selected ? "actor-row selected" : "actor-row"}
                      onClick={() => confirmPick(a)}
                    >
                      <span
                        className={
                          a.kind === "anonymous"
                            ? "actor-avatar anon"
                            : "actor-avatar"
                        }
                        aria-hidden
                      >
                        {actorInitial(a.displayName, a.kind)}
                      </span>
                      <span className="actor-meta">
                        <span className="actor-name">{a.displayName}</span>
                        <span className="actor-desc">
                          {a.kind === "anonymous"
                            ? "临时使用；可看到迁移前的历史对话与旧版 USER 画像"
                            : "命名身份，从零开始，仅自己的对话与画像"}
                        </span>
                      </span>
                      {selected && (
                        <span className="actor-check" aria-hidden>
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="actor-divider">
            <span>或新建</span>
          </div>

          <div className="actor-create">
            <input
              type="text"
              className="actor-create-input"
              placeholder="输入你的名字，如：张三"
              value={newName}
              maxLength={32}
              disabled={creating}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            <button
              type="button"
              className="actor-create-btn"
              disabled={creating || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? "创建中…" : "创建并进入"}
            </button>
          </div>
        </div>

        <footer className="actor-footer">
          {mode === "welcome" ? (
            <span className="actor-footer-hint">
              不确定？可先选「匿名」，之后随时在顶栏切换
            </span>
          ) : (
            <>
              <span className="actor-footer-hint">不切换则保持当前身份</span>
              <button
                type="button"
                className="actor-btn ghost"
                onClick={requestClose}
              >
                取消
              </button>
            </>
          )}
        </footer>
      </div>

      <style jsx>{`
        .actor-overlay {
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
        .actor-dialog {
          width: min(440px, 100%);
          max-height: min(88vh, 560px);
          display: flex;
          flex-direction: column;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        .actor-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid var(--border);
        }
        .actor-header h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
        }
        .actor-sub {
          margin: 0.35rem 0 0;
          font-size: 12px;
          line-height: 1.45;
          color: var(--muted);
        }
        .actor-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          padding: 0 0.15rem;
          flex-shrink: 0;
        }
        .actor-close:hover {
          color: var(--text);
        }
        .actor-error {
          margin: 0;
          padding: 0.45rem 1.1rem;
          font-size: 12px;
          color: #f85149;
          background: rgba(248, 81, 73, 0.08);
        }
        .actor-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0.85rem 1.1rem 0.65rem;
        }
        .actor-muted {
          margin: 0;
          font-size: 12px;
          color: var(--muted);
        }
        .actor-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .actor-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          color: var(--text);
          cursor: pointer;
          text-align: left;
          transition:
            border-color 0.15s,
            background 0.15s;
        }
        .actor-row:hover {
          border-color: rgba(88, 166, 255, 0.45);
          background: #1a2332;
        }
        .actor-row.selected {
          border-color: var(--accent);
          background: rgba(88, 166, 255, 0.1);
        }
        .actor-avatar {
          width: 2rem;
          height: 2rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 600;
          flex-shrink: 0;
          background: rgba(88, 166, 255, 0.18);
          color: var(--accent);
        }
        .actor-avatar.anon {
          background: rgba(139, 148, 158, 0.18);
          color: var(--muted);
        }
        .actor-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .actor-name {
          font-size: 14px;
          font-weight: 500;
        }
        .actor-desc {
          font-size: 11px;
          color: var(--muted);
          line-height: 1.35;
        }
        .actor-check {
          flex-shrink: 0;
          font-size: 14px;
          color: var(--accent);
          font-weight: 700;
        }
        .actor-divider {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin: 0.85rem 0 0.65rem;
          color: var(--muted);
          font-size: 11px;
        }
        .actor-divider::before,
        .actor-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border);
        }
        .actor-create {
          display: flex;
          gap: 0.45rem;
        }
        .actor-create-input {
          flex: 1;
          min-width: 0;
          padding: 0.5rem 0.6rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font-size: 13px;
        }
        .actor-create-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .actor-create-btn {
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          border: none;
          background: var(--accent);
          color: #0d1117;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .actor-create-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .actor-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 1.1rem 0.85rem;
          border-top: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.12);
        }
        .actor-footer-hint {
          font-size: 11px;
          color: var(--muted);
          line-height: 1.4;
        }
        .actor-btn.ghost {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          font-size: 12px;
          padding: 0.35rem 0.75rem;
          cursor: pointer;
          flex-shrink: 0;
        }
        .actor-btn.ghost:hover {
          border-color: var(--muted);
        }
      `}</style>
    </div>
  );
}
