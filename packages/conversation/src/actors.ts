import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { Actor } from "@lets-talk/shared-types";
import { ANONYMOUS_ACTOR_ID } from "@lets-talk/shared-types";

export const ACTORS_DIR = ".agent/actors";
export const ACTORS_REGISTRY_REL = ".agent/actors/registry.json";

const REGISTRY_VERSION = 1;
const ANON_DISPLAY = "匿名";

interface ActorRegistry {
  version: number;
  actors: Actor[];
}

function actorsDir(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ACTORS_DIR);
}

function registryPath(workspaceRoot: string): string {
  return join(actorsDir(workspaceRoot), "registry.json");
}

function defaultAnonymousActor(): Actor {
  const now = new Date().toISOString();
  return {
    id: ANONYMOUS_ACTOR_ID,
    displayName: ANON_DISPLAY,
    kind: "anonymous",
    createdAt: now,
  };
}

async function readRegistry(workspaceRoot: string): Promise<ActorRegistry | null> {
  try {
    const raw = await readFile(registryPath(workspaceRoot), "utf8");
    return JSON.parse(raw) as ActorRegistry;
  } catch {
    return null;
  }
}

async function writeRegistry(
  workspaceRoot: string,
  registry: ActorRegistry,
): Promise<void> {
  const dir = actorsDir(workspaceRoot);
  await mkdir(dir, { recursive: true });
  await writeFile(registryPath(workspaceRoot), JSON.stringify(registry, null, 2), "utf8");
}

/** 确保 registry 存在且含默认匿名用户 */
export async function ensureActorRegistry(workspaceRoot: string): Promise<ActorRegistry> {
  let registry = await readRegistry(workspaceRoot);
  if (!registry?.actors?.length) {
    registry = { version: REGISTRY_VERSION, actors: [defaultAnonymousActor()] };
    await writeRegistry(workspaceRoot, registry);
    return registry;
  }
  const hasAnon = registry.actors.some((a) => a.id === ANONYMOUS_ACTOR_ID);
  if (!hasAnon) {
    registry.actors.unshift(defaultAnonymousActor());
    await writeRegistry(workspaceRoot, registry);
  }
  return registry;
}

export async function listActors(workspaceRoot: string): Promise<Actor[]> {
  const registry = await ensureActorRegistry(workspaceRoot);
  return [...registry.actors].sort((a, b) => {
    if (a.kind === "anonymous") return -1;
    if (b.kind === "anonymous") return 1;
    return a.displayName.localeCompare(b.displayName, "zh-CN");
  });
}

export async function getActor(
  workspaceRoot: string,
  actorId: string,
): Promise<Actor | null> {
  const registry = await ensureActorRegistry(workspaceRoot);
  return registry.actors.find((a) => a.id === actorId) ?? null;
}

export async function createNamedActor(
  workspaceRoot: string,
  displayName: string,
): Promise<Actor> {
  const name = displayName.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new Error("显示名称不能为空");
  }
  if (name.length > 32) {
    throw new Error("显示名称最长 32 字");
  }
  const registry = await ensureActorRegistry(workspaceRoot);
  const dup = registry.actors.find(
    (a) => a.kind === "named" && a.displayName === name,
  );
  if (dup) {
    return dup;
  }
  const actor: Actor = {
    id: randomUUID(),
    displayName: name,
    kind: "named",
    createdAt: new Date().toISOString(),
  };
  registry.actors.push(actor);
  await writeRegistry(workspaceRoot, registry);
  return actor;
}

export function resolveOwnerActorId(
  recordOwner: string | undefined,
  requestActorId: string,
): string {
  return recordOwner ?? requestActorId;
}

/** 会话是否对当前 actor 可见 */
export function conversationOwnedBy(
  ownerActorId: string | undefined,
  actorId: string,
): boolean {
  if (!ownerActorId) {
    return actorId === ANONYMOUS_ACTOR_ID;
  }
  return ownerActorId === actorId;
}
