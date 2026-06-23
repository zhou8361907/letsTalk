import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getActorSessions } from "../../../../../lib/admin-aggregation";
import { validateSession } from "../../../../../lib/user-auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ actorId: string }> },
) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const token = req.cookies.get("auth_token")?.value;
  const user = token ? validateSession(workspaceRoot, token) : null;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 401 });
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
