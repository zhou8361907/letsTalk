import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ActorAccessError, validateActorRequest } from "../../../lib/actor-server";

export const runtime = "nodejs";

function workspaceRoot(): string | null {
  return process.env.WORKSPACE_ROOT?.trim() ?? null;
}

interface SessionLedgerEntry {
  cumulativeCostUsd: number;
  sessionId: string;
}

/** 读取 session ledger 最后一条，取累计花费 */
function getLedgerCost(workspaceRoot: string, sessionId: string): number {
  try {
    const path = join(workspaceRoot, ".agent", "logs", "sessions", `${sessionId}.jsonl`);
    if (!existsSync(path)) return 0;
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) return 0;
    const last = JSON.parse(lines[lines.length - 1]!) as SessionLedgerEntry;
    return last.cumulativeCostUsd ?? 0;
  } catch {
    return 0;
  }
}

/** 当前 Actor 的会话列表 */
export async function GET(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { actorId } = await validateActorRequest(root, req);
    const { listConversations } = await import(
      /* webpackIgnore: true */
      "@lets-talk/conversation"
    );
    const conversations = await listConversations(root, actorId);

    // 用 ledger 的累计花费修正 conversation JSON 中的 totalCostUsd
    const patched = conversations.map((c: { sessionId: string; totalCostUsd?: number }) => ({
      ...c,
      totalCostUsd: getLedgerCost(root, c.sessionId),
    }));

    return Response.json({ conversations: patched });
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** 新建会话（归属当前 Actor） */
export async function POST(req: Request) {
  const root = workspaceRoot();
  if (!root) {
    return Response.json({ error: "未配置 WORKSPACE_ROOT" }, { status: 503 });
  }

  try {
    const { actor, actorId } = await validateActorRequest(root, req);
    const { createConversation } = await import(
      /* webpackIgnore: true */
      "@lets-talk/conversation"
    );
    const record = await createConversation(root, {
      ownerActorId: actorId,
      ownerDisplayName: actor.displayName,
    });
    return Response.json(record);
  } catch (e) {
    if (e instanceof ActorAccessError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
