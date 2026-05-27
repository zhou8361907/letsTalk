/** 仅服务端运行（Pi SDK 依赖 node:fs 等，不能打进浏览器包） */
import "server-only";

/**
 * 对话接口：POST /api/agent/chat/stream
 *
 * 请求体：{ sessionId, message }
 * 响应：SSE 流（assistant_delta、tool_start、tool_output、turn_end）
 *
 * 必须用 nodejs runtime，因为 Pi SDK 不能在 Edge 跑。
 */

import { formatSseData, type ChatStreamRequest } from "@lets-talk/shared-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // --- 解析请求 ---
  let body: ChatStreamRequest;
  try {
    body = (await request.json()) as ChatStreamRequest;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }

  if (!body.sessionId || !body.message?.trim()) {
    return Response.json({ error: "需要 sessionId 和 message" }, { status: 400 });
  }

  if (!process.env.LLM_API_KEY) {
    return Response.json({ error: "未配置 LLM_API_KEY（.env）" }, { status: 503 });
  }

  // --- SSE 流 ---
  const encoder = new TextEncoder();

  // 运行时再从 Node 加载 Pi（避免 Webpack 把 pi-ai 的动态 require 打进 bundle）
  const { runChat } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );

  const stream = new ReadableStream({
    start(controller) {
      runChat({
        sessionId: body.sessionId,
        message: body.message.trim(),
        anchor: body.anchor ?? null,
        chatMode: body.chatMode ?? "explore",
        useTools: true,
        onEvent(event) {
          controller.enqueue(encoder.encode(formatSseData(event)));
        },
      })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(
              formatSseData({ type: "error", code: "agent_error", message }),
            ),
          );
        })
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
