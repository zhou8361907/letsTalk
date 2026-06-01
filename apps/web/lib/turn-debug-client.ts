import type { TranscriptItem, TurnDebugSnapshot } from "@lets-talk/shared-types";

export function mergeTurnDebugSnapshots(
  disk: TurnDebugSnapshot[],
  live: TurnDebugSnapshot[],
): TurnDebugSnapshot[] {
  const map = new Map<string, TurnDebugSnapshot>();
  for (const t of disk) {
    map.set(t.turnId, t);
  }
  for (const t of live) {
    map.set(t.turnId, t);
  }
  return Array.from(map.values()).sort((a, b) => a.at.localeCompare(b.at));
}

export function buildAssistantTurnIds(
  items: TranscriptItem[],
  turns: TurnDebugSnapshot[],
): string[] {
  const ids: string[] = [];
  let lastUser = "";
  for (const item of items) {
    if (item.kind === "user") {
      lastUser = item.text.trim();
    } else if (item.kind === "assistant") {
      const hit = [...turns]
        .reverse()
        .find((t) => t.userMessage.trim() === lastUser);
      ids.push(hit?.turnId ?? "");
    }
  }
  return ids;
}
