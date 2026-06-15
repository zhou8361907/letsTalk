import {
  ACTOR_ID_HEADER,
  ACTOR_NAME_HEADER,
  ANONYMOUS_ACTOR_ID,
  type Actor,
} from "@lets-talk/shared-types";

export const ACTOR_STORAGE_KEY = "letsTalk.actorId";
export const ACTOR_NAME_STORAGE_KEY = "letsTalk.actorName";

export function loadStoredActorId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTOR_STORAGE_KEY);
}

export function loadStoredActorName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTOR_NAME_STORAGE_KEY);
}

export function persistActorChoice(actor: Actor): void {
  localStorage.setItem(ACTOR_STORAGE_KEY, actor.id);
  localStorage.setItem(ACTOR_NAME_STORAGE_KEY, actor.displayName);
}

export function clearActorChoice(): void {
  localStorage.removeItem(ACTOR_STORAGE_KEY);
  localStorage.removeItem(ACTOR_NAME_STORAGE_KEY);
}

export function actorHeaders(actorId?: string, displayName?: string): HeadersInit {
  const id = actorId ?? loadStoredActorId() ?? ANONYMOUS_ACTOR_ID;
  const name = displayName ?? loadStoredActorName() ?? undefined;
  const headers: Record<string, string> = {
    [ACTOR_ID_HEADER]: id,
  };
  if (name) {
    headers[ACTOR_NAME_HEADER] = encodeURIComponent(name);
  }
  return headers;
}

/** 带 Actor 头的 fetch（部门内会话隔离） */
export function actorFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const actor = actorHeaders();
  for (const [k, v] of Object.entries(actor)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return fetch(input, { ...init, headers });
}
