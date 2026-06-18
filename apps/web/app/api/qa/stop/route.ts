import "server-only";

/**
 * POST /api/qa/stop — 关闭浏览器并停止录制
 * 响应: { ok: boolean; eventCount?: number; error?: string }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { closeBrowser, stopRecording, getRecordingStatus } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );

    const status = getRecordingStatus();
    const eventCount = status.eventCount;

    await closeBrowser();

    return Response.json({
      ok: true,
      eventCount,
    });
  } catch (e) {
    console.error("qa/stop error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "停止录制失败" },
      { status: 500 },
    );
  }
}
