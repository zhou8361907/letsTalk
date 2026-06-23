import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getActorConsumption } from "../../../../lib/admin-aggregation";
import { validateSession } from "../../../../lib/user-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const token = req.cookies.get("auth_token")?.value;
  const user = token ? await validateSession(workspaceRoot, token) : null;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 401 });
  }

  try {
    const actors = getActorConsumption(workspaceRoot);
    return NextResponse.json({ actors });
  } catch (e) {
    console.error("Admin actors error:", e);
    return NextResponse.json({ error: "数据聚合失败" }, { status: 500 });
  }
}
