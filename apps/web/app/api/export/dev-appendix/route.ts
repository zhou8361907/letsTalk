import "server-only";
import { ActorAccessError } from "../../../../lib/actor-server";
import { loadConversationForActor } from "../../../../lib/conversation-access";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 根据 PM 定稿生成研发附录；支持后台模式 */
export async function POST(req: Request) {
  if (!process.env.LLM_API_KEY?.trim()) {
    return Response.json({ error: "未配置 LLM_API_KEY" }, { status: 503 });
  }

  const body = (await req.json()) as {
    sessionId?: string;
    title?: string;
    anchor?: import("@lets-talk/shared-types").AgentAnchor | null;
    background?: boolean;
  };

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return Response.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  const { updateDevAppendixExport } = await import("@lets-talk/conversation");
  const {
    generateDevAppendix,
    isDevAppendixJobRunning,
    runDevAppendixExportJob,
  } = await import("@lets-talk/agent-runtime");
  const { buildRequirementPrimaryMarkdown, mergePrimaryAndDevAppendix } =
    await import("../../../../lib/export-prd");
  const { resolveWorkspaceLayout } = await import("@lets-talk/context");

  const cwd = resolveWorkspaceLayout().workspaceRoot;
  let record;
  try {
    ({ record } = await loadConversationForActor(cwd, sessionId, req));
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
  if (!record.requirementDraft?.items.length) {
    return Response.json({ error: "当前会话无需求清单" }, { status: 400 });
  }

  const title =
    (record.titleLocked && record.title) ||
    body.title?.trim() ||
    record.title ||
    "需求";
  const anchor = body.anchor ?? record.anchor ?? null;
  const primary = buildRequirementPrimaryMarkdown(record.requirementDraft, {
    title,
    anchor,
  });
  const safeName = title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
  const mergedFilename = `${safeName}-完整含研发附录.md`;

  if (body.background) {
    if (
      isDevAppendixJobRunning(sessionId) ||
      record.devAppendixExport?.status === "running"
    ) {
      return Response.json({
        status: "running",
        devAppendixExport: record.devAppendixExport,
      });
    }

    await updateDevAppendixExport(cwd, sessionId, {
      status: "running",
      startedAt: new Date().toISOString(),
      primaryMarkdown: primary,
    });

    void runDevAppendixExportJob({
      workspaceRoot: cwd,
      sessionId,
      primaryMarkdown: primary,
      mergedMarkdownFilename: mergedFilename,
      anchor,
      mergeFn: mergePrimaryAndDevAppendix,
      summarizeTitle: false,
    }).catch((err) => {
      console.warn(
        `[letsTalk:dev-appendix] ${sessionId} background failed:`,
        err instanceof Error ? err.message : err,
      );
    });

    return Response.json({
      status: "running",
      primary,
      filename: mergedFilename,
    });
  }

  try {
    const appendix = await generateDevAppendix({
      primaryMarkdown: primary,
      anchor,
    });
    const merged = mergePrimaryAndDevAppendix(primary, appendix);
    return Response.json({ primary, appendix, merged, filename: mergedFilename });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** 查询后台附录任务状态 */
export async function GET(req: Request) {
  const root = process.env.WORKSPACE_ROOT?.trim();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return Response.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  let record;
  try {
    ({ record } = await loadConversationForActor(root, sessionId, req));
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return Response.json({
    devAppendixExport: record.devAppendixExport ?? { status: "idle" },
    items: record.items,
    title: record.title,
  });
}
