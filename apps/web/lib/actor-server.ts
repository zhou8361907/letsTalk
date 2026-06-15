import {
  ACTOR_ID_HEADER,
  ACTOR_NAME_HEADER,
  ANONYMOUS_ACTOR_ID,
  type Actor,
} from "@lets-talk/shared-types";

export interface ResolvedActorRequest {
  actorId: string;
  displayName?: string;
}

export function parseActorFromRequest(req: Request): ResolvedActorRequest {
  const actorId =
    req.headers.get(ACTOR_ID_HEADER)?.trim() || ANONYMOUS_ACTOR_ID;
  const displayName = req.headers.get(ACTOR_NAME_HEADER)?.trim() || undefined;
  return { actorId, displayName };
}

export async function validateActorRequest(
  workspaceRoot: string,
  req: Request,
): Promise<{ actor: Actor; actorId: string }> {
  const { actorId } = parseActorFromRequest(req);
  const { getActor, ensureActorRegistry } = await import(
    /* webpackIgnore: true */
    "@lets-talk/conversation"
  );
  await ensureActorRegistry(workspaceRoot);
  const actor = await getActor(workspaceRoot, actorId);
  if (!actor) {
    throw new ActorAccessError("无效的身份，请重新选择", 401);
  }
  return { actor, actorId };
}

export class ActorAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ActorAccessError";
  }
}
