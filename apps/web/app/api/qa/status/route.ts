import "server-only";

/**
 * GET /api/qa/status — 查询录制状态
 * 响应: { active: boolean; sessionId: string | null; eventCount: number; browserUrl: string | null }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getRecordingStatus, getWhitelist } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );

    const status = getRecordingStatus();
    const whitelist = getWhitelist();

    return Response.json({ ...status, whitelist });
  } catch (e) {
    console.error("qa/status error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "查询状态失败" },
      { status: 500 },
    );
  }
}
