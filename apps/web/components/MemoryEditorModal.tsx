"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface MemoryEditorFileEntry {
  path: string;
  label: string;
  group: "m0" | "m2" | "m1";
  description: string;
}

const GROUP_LABEL: Record<MemoryEditorFileEntry["group"], string> = {
  m0: "M0 · 核心记忆（每会话注入）",
  m2: "M2 · jargon 索引",
  m1: "M1 · 主题 topics",
};

export function MemoryEditorModal(props: {
  open: boolean;
  sessionId: string;
  onClose: () => void;
}) {
  const { open, sessionId, onClose } = props;
  const [files, setFiles] = useState<MemoryEditorFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [limit, setLimit] = useState<number | undefined>();
  const [loadingList, setLoadingList] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = content !== savedContent;

  const grouped = useMemo(() => {
    const map = new Map<MemoryEditorFileEntry["group"], MemoryEditorFileEntry[]>();
    for (const f of files) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return (["m0", "m2", "m1"] as const)
      .filter((g) => (map.get(g)?.length ?? 0) > 0)
      .map((g) => ({ group: g, items: map.get(g)! }));
  }, [files]);

  const loadFile = useCallback(async (path: string) => {
    setLoadingFile(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/memory/file?path=${encodeURIComponent(path)}`,
      );
      const data = (await res.json()) as {
        error?: string;
        content?: string;
        charCount?: number;
        limit?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "读取失败");
      }
      const text = data.content ?? "";
      setSelectedPath(path);
      setContent(text);
      setSavedContent(text);
      setCharCount(data.charCount ?? text.length);
      setLimit(data.limit);
      setNotice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFile(false);
    }
  }, []);

  const selectFile = useCallback(
    async (path: string) => {
      if (path === selectedPath) return;
      if (dirty) {
        const ok = window.confirm("当前文件有未保存修改，确定切换？");
        if (!ok) return;
      }
      await loadFile(path);
    },
    [dirty, loadFile, selectedPath],
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingList(true);
    setError(null);
    setNotice(null);

    void (async () => {
      try {
        const res = await fetch("/api/workspace/memory");
        const data = (await res.json()) as {
          error?: string;
          files?: MemoryEditorFileEntry[];
        };
        if (!res.ok) {
          throw new Error(data.error ?? "加载列表失败");
        }
        if (cancelled) return;
        const list = data.files ?? [];
        setFiles(list);
        const preferred =
          list.find((f) => f.path.endsWith("/USER.md"))?.path ??
          list[0]?.path ??
          null;
        if (preferred) {
          await loadFile(preferred);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, loadFile]);

  const requestClose = useCallback(() => {
    if (dirty) {
      const ok = window.confirm("有未保存修改，确定关闭？");
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  const save = useCallback(
    async (applyToNextReply: boolean) => {
      if (!selectedPath) return;
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/workspace/memory/file", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: selectedPath,
            content,
            sessionId: applyToNextReply ? sessionId : undefined,
            applyToNextReply,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          message?: string;
          charCount?: number;
          limit?: number;
          warnings?: string[];
        };
        if (!res.ok) {
          throw new Error(data.error ?? "保存失败");
        }
        setSavedContent(content);
        setCharCount(data.charCount ?? content.length);
        setLimit(data.limit);
        const warn =
          data.warnings && data.warnings.length > 0
            ? `（提示：${data.warnings.join("；")}）`
            : "";
        setNotice(`${data.message ?? "已保存"}${warn}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [content, selectedPath, sessionId],
  );

  if (!open) return null;

  return (
    <div className="mem-overlay" role="presentation" onClick={requestClose}>
      <div
        className="mem-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mem-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mem-header">
          <div>
            <h2 id="mem-editor-title">记忆编辑</h2>
            <p className="mem-sub">
              编辑 USER / CORE / INDEX / topics；保存后下一条回复生效
            </p>
          </div>
          <button
            type="button"
            className="mem-close"
            onClick={requestClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        {error && <p className="mem-error">{error}</p>}
        {notice && <p className="mem-notice">{notice}</p>}

        <div className="mem-body">
          <aside className="mem-sidebar">
            {loadingList && <p className="mem-muted">加载文件…</p>}
            {grouped.map(({ group, items }) => (
              <div key={group} className="mem-group">
                <div className="mem-group-label">{GROUP_LABEL[group]}</div>
                <ul className="mem-file-list">
                  {items.map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        className={
                          f.path === selectedPath
                            ? "mem-file active"
                            : "mem-file"
                        }
                        onClick={() => void selectFile(f.path)}
                        title={f.description}
                      >
                        {f.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          <section className="mem-editor">
            {loadingFile ? (
              <p className="mem-muted">读取中…</p>
            ) : selectedPath ? (
              <>
                <div className="mem-editor-meta">
                  <code>{selectedPath}</code>
                  <span>
                    {charCount}
                    {limit ? ` / ${limit}` : ""} 字符
                    {dirty ? " · 未保存" : ""}
                  </span>
                </div>
                <textarea
                  className="mem-textarea"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setCharCount(e.target.value.length);
                  }}
                  spellCheck={false}
                />
              </>
            ) : (
              <p className="mem-muted">请选择左侧文件</p>
            )}
          </section>
        </div>

        <footer className="mem-footer">
          <button type="button" className="mem-btn ghost" onClick={requestClose}>
            取消
          </button>
          <button
            type="button"
            className="mem-btn"
            disabled={!selectedPath || saving || !dirty}
            onClick={() => void save(false)}
          >
            仅保存
          </button>
          <button
            type="button"
            className="mem-btn primary"
            disabled={!selectedPath || saving || !sessionId}
            onClick={() => void save(true)}
            title={
              dirty
                ? "保存并刷新 Agent 上下文，下一条回复使用最新记忆"
                : "无修改；仍可刷新 Agent 上下文"
            }
          >
            {saving
              ? "保存中…"
              : dirty
                ? "保存并应用到下一条回复"
                : "刷新到下一条回复"}
          </button>
        </footer>
      </div>

      <style jsx>{`
        .mem-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0, 0, 0, 0.62);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .mem-dialog {
          width: min(920px, 100%);
          max-height: min(88vh, 820px);
          display: flex;
          flex-direction: column;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        .mem-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--border);
        }
        .mem-header h2 {
          margin: 0;
          font-size: 15px;
        }
        .mem-sub {
          margin: 0.25rem 0 0;
          font-size: 11px;
          color: var(--muted);
        }
        .mem-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          padding: 0 0.2rem;
        }
        .mem-close:hover {
          color: var(--text);
        }
        .mem-error {
          margin: 0;
          padding: 0.45rem 1rem;
          font-size: 12px;
          color: #f85149;
          background: rgba(248, 81, 73, 0.08);
        }
        .mem-notice {
          margin: 0;
          padding: 0.45rem 1rem;
          font-size: 12px;
          color: var(--accent);
          background: rgba(88, 166, 255, 0.08);
        }
        .mem-body {
          flex: 1;
          min-height: 0;
          display: flex;
          gap: 0;
        }
        .mem-sidebar {
          width: 220px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          overflow-y: auto;
          padding: 0.5rem 0.4rem 0.75rem 0.65rem;
        }
        .mem-group-label {
          font-size: 10px;
          color: var(--muted);
          margin: 0.35rem 0 0.25rem;
        }
        .mem-file-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .mem-file {
          width: 100%;
          text-align: left;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          font-size: 11px;
          padding: 0.35rem 0.45rem;
          cursor: pointer;
          line-height: 1.35;
        }
        .mem-file:hover {
          background: var(--panel);
        }
        .mem-file.active {
          background: var(--panel);
          outline: 1px solid var(--accent);
        }
        .mem-editor {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: 0.65rem 0.75rem 0.75rem;
          min-height: 280px;
        }
        .mem-editor-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          font-size: 10px;
          color: var(--muted);
          margin-bottom: 0.4rem;
        }
        .mem-editor-meta code {
          font-size: 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mem-textarea {
          flex: 1;
          min-height: 240px;
          resize: vertical;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          line-height: 1.45;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          color: var(--text);
        }
        .mem-muted {
          font-size: 12px;
          color: var(--muted);
        }
        .mem-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.45rem;
          padding: 0.65rem 1rem;
          border-top: 1px solid var(--border);
        }
        .mem-btn {
          font-size: 12px;
          padding: 0.35rem 0.7rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          cursor: pointer;
        }
        .mem-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .mem-btn.ghost {
          background: transparent;
        }
        .mem-btn.primary {
          background: var(--accent);
          color: #000;
          border-color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
