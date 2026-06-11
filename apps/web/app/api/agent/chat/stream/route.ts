/** 仅服务端运行（Pi SDK 依赖 node:fs 等，不能打进浏览器包） */
import "server-only";

/**
 * 对话接口：POST /api/agent/chat/stream
 *
 * 请求体：ChatStreamRequest（sessionId, message, anchor?, chatMode?）
 * 响应：SSE 流，事件类型见 @lets-talk/shared-types SseEvent
 *
 * 必须用 nodejs runtime，因为 Pi SDK 不能在 Edge 跑。
 */

import { randomUUID } from "node:crypto";
import { formatSseData, type ChatStreamRequest } from "@lets-talk/shared-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traceId = randomUUID();
  const routeT0 = Date.now();

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
  const { runChat, createRequestLogger, logAgentStep } = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );

  const reqLog = createRequestLogger({ traceId, sessionId: body.sessionId });
  logAgentStep(reqLog, {
    step: "route.auth_parse",
    durationMs: Date.now() - routeT0,
    success: true,
    chatMode: body.chatMode ?? "explore",
  });

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (event: Parameters<typeof formatSseData>[0]) => {
        if (controller.desiredSize === null) return;
        try {
          controller.enqueue(encoder.encode(formatSseData(event)));
        } catch {
          // 流已关闭时忽略（例如工具晚于 turn_end 回调）
        }
      };

      const chatT0 = Date.now();
      let flushOk = true;

      runChat({
        traceId,
        sessionId: body.sessionId,
        message: body.message.trim(),
        anchor: body.anchor ?? null,
        chatMode: body.chatMode ?? "explore",
        useTools: true,
        onEvent: enqueue,
      })
        .catch((err: unknown) => {
          flushOk = false;
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(
              formatSseData({ type: "error", code: "agent_error", message }),
            ),
          );
        })
        .finally(() => {
          logAgentStep(reqLog, {
            step: "sse.flush",
            durationMs: Date.now() - chatT0,
            success: flushOk,
            ...(flushOk ? {} : { error: "agent turn failed" }),
          });
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
