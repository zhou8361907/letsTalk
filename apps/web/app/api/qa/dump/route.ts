import "server-only";

/**
 * GET /api/qa/dump — 查看录制调试日志
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { listSessions, loadSession } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    ) as any;

    const sessions = listSessions() as { sessionId: string; startedAt: string; eventCount: number }[];
    if (sessions.length === 0) {
      return new Response("暂无录制记录", { headers: { "Content-Type": "text/plain;charset=utf-8" } });
    }

    // 显示最新会话
    const latest = sessions[sessions.length - 1]!;
    const session = loadSession(latest.sessionId) as any;
    if (!session) return new Response("无法加载会话", { headers: { "Content-Type": "text/plain;charset=utf-8" } });

    const lines: string[] = [
      `=== QA 录制调试 ===`,
      `会话ID: ${session.sessionId}`,
      `开始:   ${session.startedAt}`,
      `结束:   ${session.endedAt ?? "进行中"}`,
      `事件数: ${session.events.length}`,
      `浏览器: ${session.browserUrl ?? "无"}`,
      ``,
      `--- 事件列表 ---`,
    ];

    for (const ev of session.events) {
      const t = new Date(ev.timestamp).toLocaleTimeString("zh-CN", { hour12: false });
      const icon = ev.kind === "PAGE" ? "📄" : ev.kind === "TAB" ? "📑" : ev.kind === "CLICK" ? "🖱" : "🌐";
      const status = ev.statusCode ? ` [${ev.statusCode}]` : "";
      lines.push(`${t} ${icon} ${ev.kind.padEnd(6)} ${ev.summary}${status}`);
    }

    lines.push(``, `--- 原始 JSON ---`);
    lines.push(JSON.stringify(session.events, null, 2));

    return new Response(lines.join("\n"), {
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });
  } catch (e) {
    return new Response(`错误: ${e instanceof Error ? e.message : String(e)}`, {
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      status: 500,
    });
  }
}
