import "server-only";
import { NextResponse } from "next/server";
import { getAdminOverview } from "../../../../lib/admin-aggregation";

export const runtime = "nodejs";

export async function GET() {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const overview = getAdminOverview(workspaceRoot);
    return NextResponse.json(overview);
  } catch (e) {
    console.error("Admin overview error:", e);
    return NextResponse.json({ error: "数据聚合失败" }, { status: 500 });
  }
}
