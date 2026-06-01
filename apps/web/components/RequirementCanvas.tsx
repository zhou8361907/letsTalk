"use client";

import type {
  AgentAction,
  RequirementDraftState,
  RequirementItem,
} from "@lets-talk/shared-types";
import {
  pmDraftSummary,
  pmDisplayItems,
  pmFormatFieldValue,
  pmItemStatus,
  pmMissingSummary,
  pmPageHint,
  pmVisibleFields,
  pmFieldLabel,
  pmCanExportDraft,
} from "../lib/format-requirement-draft";

function RequirementCard(props: {
  index: number;
  item: RequirementItem;
  draft: RequirementDraftState;
}) {
  const { index, item, draft } = props;
  const status = pmItemStatus(item);
  const fields = pmVisibleFields(item);
  const missing = pmMissingSummary(item);
  const pageHint = pmPageHint(draft, item);

  return (
    <article className="req-item">
      <div className="req-item-head">
        <span className="req-index">{index + 1}</span>
        <div className="req-title-block">
          <strong>{item.title}</strong>
          {pageHint && !fields.some((f) => f.key === "page" && f.value.trim()) && (
            <span className="req-page-hint">{pageHint}</span>
          )}
        </div>
        <span className="req-status" title={status.hint}>
          {status.icon} {status.label}
        </span>
      </div>

      {fields.length > 0 && (
        <dl className="req-fields">
          {fields.map((f) => (
            <div
              key={`${item.id}-${f.key}`}
              className={`req-field field-${f.status}${f.key === "toBe" || f.key === "acceptance" ? " field-multiline" : ""}`}
            >
              <dt>{f.label || pmFieldLabel(String(f.key))}</dt>
              <dd>{pmFormatFieldValue(f)}</dd>
            </div>
          ))}
        </dl>
      )}

      {missing.length > 0 && (
        <p className="req-missing">
          还缺：{missing.join("、")}
        </p>
      )}
    </article>
  );
}

export function RequirementCanvas(props: {
  draft: RequirementDraftState | null;
  actions: AgentAction[];
  onFinalize?: (action: AgentAction) => void;
  onExport?: () => void;
  /** 导出 PM 定稿 + lazy 生成研发附录（实验） */
  onExportWithAppendix?: () => void;
  /** 附录已就绪时直接下载合并稿 */
  onDownloadMergedAppendix?: () => void;
  exportAppendixBusy?: boolean;
  appendixJobStatus?: "idle" | "running" | "done" | "failed";
}) {
  const {
    draft,
    actions,
    onFinalize,
    onExport,
    onExportWithAppendix,
    onDownloadMergedAppendix,
    exportAppendixBusy,
    appendixJobStatus = "idle",
  } = props;
  const displayItems = draft ? pmDisplayItems(draft) : [];

  if (!draft) {
    return (
      <aside className="req-canvas empty">
        <h2>需求清单</h2>
        <p className="muted">
          切换到「需求整理」后，在左侧用口语说即可；右侧会收成你和研发都能开工的
          <strong>最小公约</strong>（可渐进补全，不必一次写满）。
        </p>
        <style jsx>{canvasStyles}</style>
      </aside>
    );
  }

  return (
    <aside className="req-canvas">
      <header className="req-header">
        <div>
          <h2>需求清单</h2>
          <p className="req-sub muted">{pmDraftSummary(draft)}</p>
        </div>
      </header>

      {draft.blockingQuestion && (
        <div className="req-confirm">
          <div className="req-confirm-label">需要你确认一件事</div>
          <p className="req-confirm-hint muted small">
            这件事不说清，研发按当前描述做容易返工
          </p>
          <p>{draft.blockingQuestion}</p>
        </div>
      )}

      <div className="req-scroll">
        {displayItems.length === 0 && (
          <p className="muted small">
            在左侧说说你想改什么，例如「用户管理页把删除改成切换性别」——Agent 会帮你拆条写在这里。
          </p>
        )}
        {displayItems.map((item, i) => (
          <RequirementCard key={item.id} index={i} item={item} draft={draft} />
        ))}

        {draft.openQuestions.length > 0 && (
          <section className="req-open">
            <h3>还不清楚的事</h3>
            <p className="muted small">后补也行；在左侧对话补充即可</p>
            <ul>
              {draft.openQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="req-footer">
        {pmCanExportDraft(draft) && (
          <p className="ready-hint">公约信息较齐，可以导出给研发。</p>
        )}
        <div className="req-actions">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="finalize-btn"
              disabled={a.disabled}
              title={a.title}
              onClick={() => onFinalize?.(a)}
            >
              {a.label}
            </button>
          ))}
          <button type="button" className="export-mini primary-export" onClick={onExport}>
            导出 PM 定稿
          </button>
          {onExportWithAppendix && (
            <button
              type="button"
              className="export-mini appendix-export"
              disabled={exportAppendixBusy}
              title="先下载 PM 定稿；研发附录在后台生成，完成后出现在对话区"
              onClick={onExportWithAppendix}
            >
              {exportAppendixBusy || appendixJobStatus === "running"
                ? "附录后台生成中…"
                : appendixJobStatus === "done"
                  ? "重新生成研发附录"
                  : "导出含研发附录"}
            </button>
          )}
        </div>
        {appendixJobStatus === "running" && (
          <p className="appendix-hint muted small">
            已下载 PM 定稿；研发附录后台生成中，完成后可在左侧对话区下载完整版。
          </p>
        )}
        {appendixJobStatus === "done" && (
          <div className="appendix-done">
            <p className="appendix-hint muted small">
              完整含附录文档已就绪；可在左侧对话区「导出」气泡下载，或点下方按钮。
            </p>
            {onDownloadMergedAppendix && (
              <button
                type="button"
                className="export-mini appendix-download"
                onClick={onDownloadMergedAppendix}
              >
                下载完整含研发附录
              </button>
            )}
          </div>
        )}
      </footer>

      <style jsx>{canvasStyles}</style>
    </aside>
  );
}

const canvasStyles = `
  .req-canvas {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    padding: 0.75rem 0.75rem 0.75rem 0.65rem;
    min-height: 0;
    background: var(--panel);
  }
  .req-canvas.empty {
    justify-content: flex-start;
  }
  .req-canvas h2 {
    font-size: 13px;
    margin: 0;
    color: var(--text);
    font-weight: 600;
  }
  .req-sub {
    margin: 0.2rem 0 0;
    font-size: 11px;
    line-height: 1.35;
  }
  .req-header {
    flex-shrink: 0;
    margin-bottom: 0.55rem;
  }
  .req-confirm {
    flex-shrink: 0;
    border: 1px solid #d29922;
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    margin-bottom: 0.55rem;
    background: rgba(210, 153, 34, 0.08);
    font-size: 12px;
    line-height: 1.45;
  }
  .req-confirm-label {
    font-size: 11px;
    color: #d29922;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .req-confirm p {
    margin: 0;
  }
  .req-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .req-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.65rem;
    background: var(--bg);
    font-size: 12px;
  }
  .req-item-head {
    display: flex;
    gap: 0.45rem;
    align-items: flex-start;
    margin-bottom: 0.4rem;
  }
  .req-index {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: var(--panel);
    border: 1px solid var(--border);
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    margin-top: 0.1rem;
  }
  .req-title-block {
    flex: 1;
    min-width: 0;
  }
  .req-title-block strong {
    display: block;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 600;
  }
  .req-page-hint {
    display: block;
    margin-top: 0.15rem;
    font-size: 11px;
    color: var(--muted);
  }
  .req-status {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--muted);
    text-align: right;
    max-width: 5.5rem;
    line-height: 1.3;
  }
  .req-fields {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .req-field {
    margin: 0;
  }
  .req-field dt {
    margin: 0;
    font-size: 10px;
    color: var(--muted);
    font-weight: 500;
  }
  .req-field dd {
    margin: 0.1rem 0 0;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
  }
  .field-multiline dd {
    white-space: pre-wrap;
  }
  .field-missing dd,
  .field-conflict dd {
    color: #f85149;
  }
  .field-pending dd {
    color: #d29922;
  }
  .req-missing {
    margin: 0.35rem 0 0;
    font-size: 11px;
    color: #d29922;
  }
  .req-open h3 {
    font-size: 11px;
    margin: 0.25rem 0 0.35rem;
    color: var(--muted);
    font-weight: 600;
  }
  .req-open ul {
    margin: 0;
    padding-left: 1rem;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.45;
  }
  .appendix-hint {
    margin: 0.45rem 0 0;
    line-height: 1.35;
  }
  .appendix-done {
    margin-top: 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .appendix-download {
    border-color: var(--accent);
  }
  .req-footer {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    padding-top: 0.55rem;
    margin-top: 0.55rem;
  }
  .ready-hint {
    font-size: 11px;
    color: var(--accent);
    margin: 0 0 0.4rem;
    line-height: 1.4;
  }
  .req-actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .finalize-btn,
  .export-mini {
    font-size: 12px;
    padding: 0.4rem 0.55rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .finalize-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .finalize-btn:not(:disabled):hover,
  .export-mini:hover {
    border-color: var(--accent);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 11px;
    line-height: 1.45;
  }
`;
