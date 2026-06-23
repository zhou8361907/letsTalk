import "server-only";
import { NextResponse } from "next/server";
import { getActorConsumption } from "../../../../lib/admin-aggregation";

export const runtime = "nodejs";

export async function GET() {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const actors = getActorConsumption(workspaceRoot);
    return NextResponse.json({ actors });
  } catch (e) {
    console.error("Admin actors error:", e);
    return NextResponse.json({ error: "数据聚合失败" }, { status: 500 });
  }
}
