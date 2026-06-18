import "server-only";

/**
 * POST /api/qa/clear — 清除当前录制数据
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { clearSession } = await import(
      /* webpackIgnore: true */
      "@lets-talk/agent-runtime"
    );
    clearSession();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "清除失败" },
      { status: 500 },
    );
  }
}
