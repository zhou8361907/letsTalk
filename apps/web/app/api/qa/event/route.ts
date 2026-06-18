import "server-only";

/**
 * GET /api/qa/event?sessionId=xxx — SSE 实时录制事件流
 *
 * 用于 QA 测试控制台面板的实时日志展示
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return Response.json({ error: "缺少 sessionId 参数" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 发送初始连接确认
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`),
      );

      // 订阅录制事件
      import(
        /* webpackIgnore: true */
        "@lets-talk/agent-runtime"
      ).then((mod) => {
        const qa = mod as typeof import("@lets-talk/agent-runtime");
        cleanup = (qa as any).subscribeEvents(sessionId, (event: any) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            // 连接已关闭
          }
        });
      }).catch((err: Error) => {
        console.error("qa/event: failed to subscribe", err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "订阅事件失败" })}\n\n`),
        );
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
