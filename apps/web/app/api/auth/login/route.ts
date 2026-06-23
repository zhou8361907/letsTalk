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

    const { user, token } = await loginUser(workspaceRoot, username, password);

    // 确保 Actor 注册表中有该用户
    try {
      const { ensureActorRegistry } = await import(
        /* webpackIgnore: true */
        "@lets-talk/conversation"
      );
      const registry = await ensureActorRegistry(workspaceRoot);
      const exists = registry.actors.some((a: { id: string }) => a.id === user.id);
      if (!exists) {
        registry.actors.push({
          id: user.id,
          displayName: user.display_name,
          kind: "named",
          createdAt: new Date().toISOString(),
        });
        const { writeFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        writeFileSync(
          join(workspaceRoot, ".agent", "actors", "registry.json"),
          JSON.stringify(registry, null, 2),
          "utf8",
        );
      }
    } catch {
      // 不影响登录
    }

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
