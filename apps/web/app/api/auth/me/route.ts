import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "../../../../lib/user-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const token = req.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = await validateSession(workspaceRoot, token);
  return NextResponse.json({ user });
}
