"use client";

import { useCallback, useState } from "react";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!username.trim() || !password.trim()) return;
    setBusy(true);
    setError(null);

    try {
      if (tab === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password: password.trim(),
            displayName: displayName.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "注册失败");
        }
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "登录失败");
      }

      window.location.href = "/";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }, [tab, username, password, displayName]);

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">letsTalk</h1>
        <p className="login-sub">登录以使用对话助手</p>

        <div className="tabs">
          <button
            type="button"
            className={tab === "login" ? "tab active" : "tab"}
            onClick={() => { setTab("login"); setError(null); }}
          >
            登录
          </button>
          <button
            type="button"
            className={tab === "register" ? "tab active" : "tab"}
            onClick={() => { setTab("register"); setError(null); }}
          >
            注册
          </button>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="form">
          <input
            type="text"
            className="input"
            placeholder="用户名"
            value={username}
            maxLength={32}
            disabled={busy}
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && handleSubmit()}
          />
          <input
            type="password"
            className="input"
            placeholder="密码"
            value={password}
            maxLength={128}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && handleSubmit()}
          />
          {tab === "register" && (
            <input
              type="text"
              className="input"
              placeholder="显示名称（选填）"
              value={displayName}
              maxLength={32}
              disabled={busy}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && handleSubmit()}
            />
          )}
          <button
            type="button"
            className="submit-btn"
            disabled={busy || !username.trim() || !password.trim()}
            onClick={() => handleSubmit()}
          >
            {busy ? "处理中…" : tab === "login" ? "登录" : "注册并登录"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .login-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 14px;
        }
        .login-card {
          width: min(360px, 92%);
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 2rem 1.5rem;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
        }
        .login-title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          text-align: center;
        }
        .login-sub {
          margin: 0.4rem 0 1.2rem;
          font-size: 12px;
          color: var(--muted);
          text-align: center;
        }
        .tabs {
          display: flex;
          gap: 0;
          margin-bottom: 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .tab {
          flex: 1;
          padding: 0.45rem 0;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.12s;
        }
        .tab.active {
          background: var(--accent);
          color: #0d1117;
          font-weight: 600;
        }
        .tab:not(.active):hover {
          background: rgba(88, 166, 255, 0.08);
          color: var(--text);
        }
        .error-msg {
          margin: 0 0 0.8rem;
          padding: 0.4rem 0.6rem;
          font-size: 12px;
          color: #f85149;
          background: rgba(248, 81, 73, 0.08);
          border-radius: 6px;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .input {
          width: 100%;
          padding: 0.5rem 0.6rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }
        .input:focus {
          border-color: var(--accent);
        }
        .input::placeholder {
          color: var(--muted);
        }
        .submit-btn {
          width: 100%;
          padding: 0.55rem;
          border-radius: 8px;
          border: none;
          background: var(--accent);
          color: #0d1117;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 0.25rem;
        }
        .submit-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
