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
import { ActorAccessError } from "../../../../../lib/actor-server";
import { loadConversationForActor } from "../../../../../lib/conversation-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traceId = randomUUID();

  // --- 解析请求 ---
  const parseT0 = Date.now();
  let body: ChatStreamRequest;
  try {
    body = (await request.json()) as ChatStreamRequest;
  } catch {
    return Response.json({ error: "JSON 格式错误" }, { status: 400 });
  }
  const parseMs = Date.now() - parseT0;

  if (!body.sessionId || !body.message?.trim()) {
    return Response.json({ error: "需要 sessionId 和 message" }, { status: 400 });
  }

  if (!process.env.LLM_API_KEY) {
    return Response.json({ error: "未配置 LLM_API_KEY（.env）" }, { status: 503 });
  }

  // --- SSE 流 ---
  const encoder = new TextEncoder();

  const bundleT0 = Date.now();
  const runtimeMod = await import(
    /* webpackIgnore: true */
    "@lets-talk/agent-runtime"
  );
  const bundleMs = Date.now() - bundleT0;

  const {
    runChat,
    createRequestLogger,
    logAgentStep,
    TraceRecorder,
    finalizeTrace,
    getWorkspaceRoot,
  } = runtimeMod;

  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  if (!workspaceRoot) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  let actorId: string;
  let actorDisplayName: string;
  try {
    const loaded = await loadConversationForActor(
      workspaceRoot,
      body.sessionId,
      request,
    );
    actorId = loaded.actorId;
    actorDisplayName = loaded.displayName;
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const chatMode = body.chatMode ?? "explore";
  const recorder = new TraceRecorder({
    traceId,
    sessionId: body.sessionId,
    chatMode,
    actorId,
    actorDisplayName,
  });

  const reqLog = createRequestLogger({ traceId, sessionId: body.sessionId });
  const logCtx = { traceId, sessionId: body.sessionId };

  logAgentStep(
    reqLog,
    logCtx,
    {
      step: "route.bundle_load",
      durationMs: bundleMs,
      success: true,
      chatMode,
    },
    recorder,
  );
  logAgentStep(
    reqLog,
    logCtx,
    {
      step: "route.auth_parse",
      durationMs: parseMs,
      success: true,
      chatMode,
    },
    recorder,
  );

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
      const cwd = workspaceRoot || getWorkspaceRoot();

      runChat({
        traceId,
        traceRecorder: recorder,
        sessionId: body.sessionId,
        message: body.message.trim(),
        anchor: body.anchor ?? null,
        chatMode,
        actorId,
        useTools: true,
        productLine: body.productLine || process.env.PRODUCT_LINE?.trim() || "yibao",
        qaFocusedRequest: body.qaFocusedRequest ?? null,
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
          void (async () => {
            logAgentStep(
              reqLog,
              logCtx,
              {
                step: "sse.flush",
                durationMs: Date.now() - chatT0,
                success: flushOk,
                ...(flushOk ? {} : { error: "agent turn failed" }),
              },
              recorder,
            );
            try {
              await finalizeTrace(cwd, recorder);
            } catch {
              // 落盘失败不阻断 SSE 关闭
            }
            controller.close();
          })();
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
