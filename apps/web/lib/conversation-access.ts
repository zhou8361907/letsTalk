import "server-only";
import type { ConversationRecord } from "@lets-talk/shared-types";
import { ActorAccessError, validateActorRequest } from "./actor-server";

export async function loadConversationForActor(
  workspaceRoot: string,
  sessionId: string,
  req: Request,
): Promise<{
  record: ConversationRecord;
  actorId: string;
  displayName: string;
}> {
  const { actor, actorId } = await validateActorRequest(workspaceRoot, req);
  const {
    getConversation,
    assertConversationAccess,
    claimConversationOwner,
  } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );

  let record = await getConversation(workspaceRoot, sessionId);
  if (!record) {
    throw new ActorAccessError("会话不存在", 404);
  }

  if (!record.ownerActorId) {
    record =
      (await claimConversationOwner(
        workspaceRoot,
        sessionId,
        actorId,
        actor.displayName,
      )) ?? record;
  }

  try {
    assertConversationAccess(record, actorId);
  } catch {
    throw new ActorAccessError("无权访问此会话", 403);
  }

  return {
    record,
    actorId,
    displayName: actor.displayName,
  };
}
