import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "../../../../lib/user-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    const { user, token } = loginUser(workspaceRoot, username, password);

    const response = NextResponse.json({ user });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 天
    });
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "登录失败";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
