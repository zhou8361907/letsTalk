import "server-only";
import { NextResponse } from "next/server";
import { getSessionTurnTraces } from "../../../../../lib/admin-aggregation";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { sessionId } = await params;
    const detail = getSessionTurnTraces(workspaceRoot, sessionId);
    if (!detail) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error("Admin session detail error:", e);
    return NextResponse.json({ error: "数据聚合失败" }, { status: 500 });
  }
}
