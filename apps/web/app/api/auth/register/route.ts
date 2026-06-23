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

    // 同步写 Actor 注册表，确保会话 API 能识别该用户
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
      // Actor 注册失败不影响用户创建
    }

    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "注册失败";
    const status = message === "用户名已存在" ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
