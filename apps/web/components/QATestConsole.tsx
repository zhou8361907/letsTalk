"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QaRecordEvent } from "@lets-talk/shared-types";

interface L { id: number; ts: string; kind: string; summary: string; sc?: number; method?: string; url?: string; }

/** 一个操作（按钮点击） */
interface ClickGroup {
  evt: L;        // CLICK 事件
  reqs: L[];     // 该操作触发的请求
  folded: boolean;
}

/** 一个页签 */
interface TabGroup {
  evt: L;        // TAB 事件
  clicks: ClickGroup[];
  reqs: L[];     // 页签自动加载的请求（无 CLICK 上下文）
  folded: boolean;
}

/** 一个页面 */
interface PageSec {
  evt: L;           // PAGE 事件
  tabs: TabGroup[]; // 页签列表
  clicks: ClickGroup[]; // 直属操作（无页签时）
  reqs: L[];        // 页面加载时的初始请求
  badSc?: number;   // 最严重状态码
  folded: boolean;
}

function fmt(iso: string) { try { return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false }); } catch { return iso; } }
function icon(k: string) { return k === "PAGE" ? "📄" : k === "TAB" ? "📑" : k === "CLICK" ? "🖱" : "🌐"; }

export interface FocusedRequest {
  seq: number;
  url: string;
  method: string;
  statusCode: number;
  traceId: string;
  timestamp: string;
  summary: string;
}

interface Props {
  chatSessionId: string;
  /** 页面切换回调：用于同步锚点 */
  onPageChange?: (pageLabel: string) => void;
  /** 关注某条请求：面板点击选中 */
  onFocusRequest?: (req: FocusedRequest | null) => void;
}

export function QATestConsole({ chatSessionId, onPageChange, onFocusRequest }: Props) {
  const [on, setOn] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [secs, setSecs] = useState<PageSec[]>([]);
  const [showAll, setShowAll] = useState(true);
  const [wl, setWl] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetUrl, setTargetUrl] = useState("http://localhost:9999/pf/portal/login/login.html");
  const [logPath, setLogPath] = useState("/Users/zs/IdeaProjects/work/YB/831/yb-831-dev/smfic_logs");
  const feedRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const autoRef = useRef(true);

  useEffect(() => { if (autoRef.current && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [secs]);

  const push = useCallback((l: L) => {
    setSecs((prev) => {
      // 深拷贝避免 mutation
      const cp = (s: PageSec) => ({
        ...s,
        tabs: s.tabs.map((t) => ({ ...t, clicks: t.clicks.map((c) => ({ ...c, reqs: [...c.reqs] })), reqs: [...t.reqs] })),
        clicks: s.clicks.map((c) => ({ ...c, reqs: [...c.reqs] })),
        reqs: [...s.reqs],
      });
      const next = prev.map(cp);
      const last = next[next.length - 1];

      const updBad = (s: PageSec, sc?: number) => {
        if (!sc) return;
        if (sc >= 500) s.badSc = 500;
        else if (sc >= 400 && s.badSc !== 500) s.badSc = 400;
      };

      if (l.kind === "PAGE") {
        next.push({ evt: l, tabs: [], clicks: [], reqs: [], folded: false });
        // 通知父组件更新锚点
        onPageChange?.(l.summary);
      } else if (l.kind === "TAB") {
        if (last) last.tabs.push({ evt: l, clicks: [], reqs: [], folded: false });
        else next.push({ evt: l, tabs: [{ evt: l, clicks: [], reqs: [], folded: false }], clicks: [], reqs: [], folded: false });
      } else if (l.kind === "CLICK") {
        if (!last) { next.push({ evt: l, tabs: [], clicks: [{ evt: l, reqs: [], folded: false }], reqs: [], folded: false }); return next; }
        const lastTab = last.tabs[last.tabs.length - 1];
        if (lastTab) lastTab.clicks.push({ evt: l, reqs: [], folded: false });
        else last.clicks.push({ evt: l, reqs: [], folded: false });
      } else if (l.kind === "REQUEST") {
        if (!last) return next;
        const lastTab = last.tabs[last.tabs.length - 1];
        if (lastTab) {
          const lastClick = lastTab.clicks[lastTab.clicks.length - 1];
          if (lastClick) lastClick.reqs.push(l);
          else lastTab.reqs.push(l);
        } else {
          const lastClick = last.clicks[last.clicks.length - 1];
          if (lastClick) lastClick.reqs.push(l);
          else last.reqs.push(l);  // 页面初始加载请求
        }
        updBad(last, l.sc);
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/qa/status"); if (r.ok) { const d = await r.json(); setOn(d.active); setSid(d.sessionId); if (d.whitelist) setWl(d.whitelist); } } catch {}
  }, []);

  const connect = useCallback((s: string) => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/qa/event?sessionId=${s}`); esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as QaRecordEvent & { type?: string };
        if (ev.type === "connected" || ev.type === "error") return;
        push({ id: Date.now() + Math.random(), ts: ev.timestamp, kind: ev.kind, summary: ev.summary || "", sc: ev.statusCode, method: ev.method, url: ev.url });
      } catch {}
    };
  }, [push]);

  const open = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/qa/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatSessionId, targetUrl }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})) as any; window.alert(e.error || "启动失败"); return; }
      const d = await r.json() as { sessionId: string };
      setOn(true); setSid(d.sessionId); setSecs([]); autoRef.current = true; connect(d.sessionId);
    } catch (e) { window.alert(e instanceof Error ? e.message : "启动失败"); } finally { setBusy(false); }
  }, [chatSessionId, connect, targetUrl]);

  const close = useCallback(async () => {
    await fetch("/api/qa/stop", { method: "POST" }).catch(() => {});
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setOn(false); setSid(null);
  }, []);

  useEffect(() => { void refresh(); return () => { if (esRef.current) esRef.current.close(); }; }, [refresh]);
  useEffect(() => {
    if (!logPath.trim()) return;
    const t = setTimeout(() => { fetch("/api/qa/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logPath: logPath.trim() }) }).catch(() => {}); }, 500);
    return () => clearTimeout(t);
  }, [logPath]);

  const totReq = secs.reduce((s, x) => s + x.reqs.length + x.clicks.reduce((a, c) => a + c.reqs.length, 0) + x.tabs.reduce((a, t) => a + t.reqs.length + t.clicks.reduce((b, c) => b + c.reqs.length, 0), 0), 0);
  const totErr = secs.filter((x) => x.badSc && x.badSc >= 400).length;

  // 点击请求行 → 设为关注
  const focusReq = (r: L) => {
    const newId = focusedId === r.id ? null : r.id;
    setFocusedId(newId);
    if (!onFocusRequest) return;
    if (!newId) { onFocusRequest(null); return; }
    onFocusRequest({
      seq: r.id,
      url: r.url || r.summary || '',
      method: r.method || '?',
      statusCode: r.sc || 0,
      traceId: '',
      timestamp: r.ts,
      summary: r.summary || '',
    });
  };

  return (
    <aside className="qt">
      <div className="qt-h"><h2>QA</h2><span className={`qd${on ? " on" : ""}`} /><span>{on ? "录制中" : "离线"}</span></div>

      <details className="qc" open={!on}>
        <summary>设置</summary>
        <label>URL <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} disabled={on} /></label>
        <label>日志 <input value={logPath} onChange={e => setLogPath(e.target.value)} /></label>
      </details>

      <div className="qt-bar">
        {!on ? <><button className="b b-p" onClick={open} disabled={busy}>{busy ? "…" : "打开浏览器"}</button><button className="b" onClick={async () => { await fetch("/api/qa/clear", {method:"POST"}); setSecs([]); setSid(null); }}>清除</button></>
        : <><button className="b b-d" onClick={close}>关闭</button><button className="b" onClick={() => setShowAll(!showAll)}>{showAll ? "收" : "展"}</button></>}
      </div>

      {secs.length > 0 && <div className="qt-sum"><span>{secs.length} 页</span><span>{totReq} 请求</span>{totErr > 0 && <span className="qt-err">{totErr} 异常</span>}</div>}

      <div className="qf" ref={feedRef}>{secs.length === 0 && <p className="qe">{on ? "等待操作…" : "点「打开浏览器」启动"}</p>}

        {secs.map((s, si) => (
          <div key={si} className={`gs${s.badSc && s.badSc >= 400 ? " ge" : ""}`}>
            <div className="gh" onClick={() => setSecs(p => { const n = [...p]; n[si] = { ...n[si], folded: !n[si].folded }; return n; })}>
              <span className="ga">{s.folded ? "▸" : "▾"}</span><span className="gi">📄</span><span className="gl">{s.evt.summary}</span><span className="gb">{s.tabs.length + s.clicks.length}</span>
            </div>
            {!s.folded && <div className="gbd">
              {/* 页面初始加载请求 */}
              {s.reqs.map((r, ri) => (
                <div key={`pr${ri}`} className={`qr${r.sc && r.sc >= 500 ? " e5" : r.sc && r.sc >= 400 ? " e4" : ""}${focusedId === r.id ? " qr-f" : ""}`} data-seq={r.id} onClick={() => focusReq(r)}>
                  <span className="qtm">{fmt(r.ts).slice(0, 8)}</span>
                  <span className="qurl">{r.method} {r.url ?? r.summary}</span>
                  {r.sc && <span className={`qsc${r.sc >= 500 ? " e5" : r.sc >= 400 ? " e4" : " e2"}`}>{r.sc}</span>}
                </div>
              ))}
              {/* 页签 */}
              {s.tabs.map((t, ti) => (
                <div key={ti} className="tg">
                  <div className="tgh" onClick={() => setSecs(p => {
                    const n = [...p]; if (!n[si]) return n;
                    const tabs = [...n[si].tabs]; tabs[ti] = { ...tabs[ti], folded: !tabs[ti].folded };
                    n[si] = { ...n[si], tabs }; return n;
                  })}>
                    <span className="ga2">{t.folded ? "▸" : "▾"}</span><span className="gi">📑</span><span className="gl">{t.evt.summary}</span><span className="gb2">{t.clicks.length}</span>
                  </div>
                  {!t.folded && <div className="tgb">
                    {/* 页签自动加载的请求 */}
                    {t.reqs.map((r, ri) => (
                      <div key={`tr${ri}`} className={`qr${r.sc && r.sc >= 500 ? " e5" : r.sc && r.sc >= 400 ? " e4" : ""}${focusedId === r.id ? " qr-f" : ""}`} data-seq={r.id} onClick={() => focusReq(r)}>
                        <span className="qtm">{fmt(r.ts).slice(0, 8)}</span>
                        <span className="qurl">{r.method} {r.url ?? r.summary}</span>
                        {r.sc && <span className={`qsc${r.sc >= 500 ? " e5" : r.sc >= 400 ? " e4" : " e2"}`}>{r.sc}</span>}
                      </div>
                    ))}
                    {t.clicks.map((c, ci) => (
                      <div key={ci} className="cg">
                        <div className="cgh" onClick={() => setSecs(p => {
                          const n = [...p]; if (!n[si]) return n;
                          const tabs = [...n[si].tabs];
                          const clicks = [...tabs[ti].clicks]; clicks[ci] = { ...clicks[ci], folded: !clicks[ci].folded };
                          tabs[ti] = { ...tabs[ti], clicks }; n[si] = { ...n[si], tabs }; return n;
                        })}>
                          <span className="ga3">{c.folded ? "▸" : "▾"}</span><span className="gi">🖱</span><span className="gl">{c.evt.summary}</span><span className="gb2">{c.reqs.length}</span>
                        </div>
                        {!c.folded && <div className="cgb">
                          {c.reqs.map((r, ri) => (
                            <div key={ri} className={`qr${r.sc && r.sc >= 500 ? " e5" : r.sc && r.sc >= 400 ? " e4" : ""}${focusedId === r.id ? " qr-f" : ""}`} data-seq={r.id} onClick={() => focusReq(r)}>
                              <span className="qtm">{fmt(r.ts).slice(0, 8)}</span>
                              <span className="qurl">{r.method} {r.url ?? r.summary}</span>
                              {r.sc && <span className={`qsc${r.sc >= 500 ? " e5" : r.sc >= 400 ? " e4" : " e2"}`}>{r.sc}</span>}
                            </div>
                          ))}
                        </div>}
                      </div>
                    ))}
                  </div>}
                </div>
              ))}
              {/* 直属操作（无页签） */}
              {s.clicks.map((c, ci) => (
                <div key={ci} className="cg">
                  <div className="cgh" onClick={() => setSecs(p => {
                    const n = [...p]; if (!n[si]) return n;
                    const clicks = [...n[si].clicks]; clicks[ci] = { ...clicks[ci], folded: !clicks[ci].folded };
                    n[si] = { ...n[si], clicks }; return n;
                  })}>
                    <span className="ga3">{c.folded ? "▸" : "▾"}</span><span className="gi">🖱</span><span className="gl">{c.evt.summary}</span><span className="gb2">{c.reqs.length}</span>
                  </div>
                  {!c.folded && <div className="cgb">
                    {c.reqs.map((r, ri) => (
                      <div key={ri} className={`qr${r.sc && r.sc >= 500 ? " e5" : r.sc && r.sc >= 400 ? " e4" : ""}${focusedId === r.id ? " qr-f" : ""}`} data-seq={r.id} onClick={() => focusReq(r)}>
                        <span className="qtm">{fmt(r.ts).slice(0, 8)}</span>
                        <span className="qurl">{r.method} {r.url ?? r.summary}</span>
                        {r.sc && <span className={`qsc${r.sc >= 500 ? " e5" : r.sc >= 400 ? " e4" : " e2"}`}>{r.sc}</span>}
                      </div>
                    ))}
                  </div>}
                </div>
              ))}
            </div>}
          </div>
        ))}
      </div>

      <details className="qwl"><summary>白名单 {wl.length}</summary><ul>{wl.map((p, i) => <li key={i}>{p}</li>)}</ul></details>

      <style jsx>{`
        .qt { width:380px; flex-shrink:0; border-left:1px solid var(--border); padding:5px 6px; font-size:12px; display:flex; flex-direction:column; min-height:0; height:100vh; background:var(--bg); gap:2px; }
        .qt-h { display:flex; align-items:center; gap:4px; flex-shrink:0; }
        .qt-h h2 { font-size:11px; margin:0; color:var(--muted); font-weight:600; }
        .qd { width:6px; height:6px; border-radius:50%; background:var(--muted); flex-shrink:0; }
        .qd.on { background:#3fb950; }
        .qc { flex-shrink:0; }
        .qc>summary { cursor:pointer; font-size:10px; color:var(--muted); }
        .qc label { display:flex; flex-direction:column; gap:1px; font-size:9px; color:var(--muted); margin-top:2px; }
        .qc input { font-size:10px; padding:2px 5px; background:var(--panel); border:1px solid var(--border); color:var(--text); border-radius:3px; }
        .qt-bar { display:flex; gap:4px; flex-shrink:0; }
        .b { font-size:11px; padding:3px 8px; border:1px solid var(--border); border-radius:4px; cursor:pointer; background:var(--panel); color:var(--text); }
        .b-p { border-color:var(--accent); color:var(--accent); }
        .b-d { border-color:#f85149; color:#f85149; }
        .qt-sum { display:flex; gap:6px; flex-shrink:0; font-size:10px; color:var(--muted); padding:2px 0; }
        .qt-err { color:#f85149; font-weight:600; }
        .qf { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
        .qe { color:var(--muted); text-align:center; margin-top:2rem; flex-shrink:0; font-size:11px; }
        .ga,.ga2,.ga3 { color:var(--muted); width:.6em; flex-shrink:0; font-size:8px; }
        .gi { flex-shrink:0; width:.9em; text-align:center; font-size:10px; }
        .gl { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); font-size:10px; }
        .gb { flex-shrink:0; font-size:9px; color:var(--muted); background:var(--bg); padding:0 7px; border-radius:8px; }
        .gb2 { flex-shrink:0; font-size:8px; color:var(--muted); background:var(--bg); padding:0 6px; border-radius:6px; }
        .gs { border:1px solid var(--border); border-radius:4px; overflow:hidden; background:var(--panel); flex-shrink:0; }
        .ge { border-color:rgba(248,81,73,.3); }
        .gh { display:flex; align-items:center; gap:3px; padding:4px 6px; cursor:pointer; user-select:none; }
        .gh:hover { background:rgba(128,128,128,.04); }
        .gbd { border-top:1px solid var(--border); padding:2px 2px 2px 14px; display:flex; flex-direction:column; gap:1px; }
        .tg { border:1px solid var(--border); border-radius:2px; overflow:hidden; }
        .tgh { display:flex; align-items:center; gap:2px; padding:2px 3px; cursor:pointer; user-select:none; font-size:10px; background:var(--panel); }
        .tgh:hover { background:rgba(128,128,128,.04); }
        .tgb { border-top:1px solid var(--border); padding:1px 0 1px 10px; display:flex; flex-direction:column; gap:1px; background:var(--bg); }
        .cg { border:1px solid var(--border); border-radius:2px; overflow:hidden; background:var(--bg); }
        .cgh { display:flex; align-items:center; gap:2px; padding:1px 3px; cursor:pointer; user-select:none; font-size:10px; }
        .cgh:hover { background:rgba(128,128,128,.03); }
        .cgb { padding:0 2px 0 8px; display:flex; flex-direction:column; gap:0; font-family:ui-monospace,monospace; font-size:10px; }
        .qr { display:flex; align-items:center; gap:2px; padding:0; border-radius:1px; cursor:pointer; }
        .qr:hover { background:rgba(128,128,128,.06); }
        .qr-f { outline:1px solid var(--accent); outline-offset:-1px; background:rgba(88,166,255,.06); }
        .qr.e5 { background:rgba(248,81,73,.08); }
        .qr.e4 { background:rgba(210,153,34,.05); }
        .qtm { color:var(--muted); flex-shrink:0; font-size:9px; min-width:3.5em; }
        .qurl { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); font-size:9px; }
        .qsc { font-weight:600; font-size:9px; flex-shrink:0; }
        .qsc.e5 { color:#f85149; }
        .qsc.e4 { color:#d29922; }
        .qsc.e2 { color:#3fb950; }
        .qwl { flex-shrink:0; font-size:9px; color:var(--muted); margin-top:2px; }
        .qwl>summary { cursor:pointer; }
        .qwl ul { margin:2px 0 0; padding-left:14px; list-style:none; font-family:monospace; font-size:9px; }
      `}</style>
    </aside>
  );
}
