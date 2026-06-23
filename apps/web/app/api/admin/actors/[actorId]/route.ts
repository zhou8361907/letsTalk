import "server-only";
import { NextResponse } from "next/server";
import { getActorSessions } from "../../../../../lib/admin-aggregation";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ actorId: string }> },
) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { actorId } = await params;
    const sessions = getActorSessions(workspaceRoot, actorId);
    return NextResponse.json({ actorId, sessions });
  } catch (e) {
    console.error("Admin actor sessions error:", e);
    return NextResponse.json({ error: "数据聚合失败" }, { status: 500 });
  }
}
