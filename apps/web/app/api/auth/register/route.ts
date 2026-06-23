import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "../../../../lib/user-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { username, password, displayName } = (await req.json()) as {
      username?: string;
      password?: string;
      displayName?: string;
    };

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    if (username.length < 2) {
      return NextResponse.json({ error: "用户名至少 2 个字符" }, { status: 400 });
    }

    const user = await registerUser(workspaceRoot, username, password, displayName);
    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "注册失败";
    const status = message === "用户名已存在" ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
