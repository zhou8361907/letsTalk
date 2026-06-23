import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { logoutUser } from "../../../../lib/user-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const token = req.cookies.get("auth_token")?.value;
  if (token) {
    await logoutUser(workspaceRoot, token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
