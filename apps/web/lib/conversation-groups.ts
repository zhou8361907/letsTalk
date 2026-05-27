import type { ConversationSummary } from "@lets-talk/shared-types";

export interface ConversationGroup {
  label: string;
  sessions: ConversationSummary[];
}

/** 侧栏分组：今天 / 7 天内 / 30 天内 / YYYY-MM */
export function groupConversationsByDate(
  sessions: ConversationSummary[],
): ConversationGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msDay = 86400000;

  const buckets = new Map<string, ConversationSummary[]>();
  const order: string[] = [];

  for (const s of sessions) {
    const d = new Date(s.updatedAt);
    let label: string;
    if (d >= startOfToday) {
      label = "今天";
    } else if (d >= new Date(startOfToday.getTime() - 7 * msDay)) {
      label = "7 天内";
    } else if (d >= new Date(startOfToday.getTime() - 30 * msDay)) {
      label = "30 天内";
    } else {
      label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    if (!buckets.has(label)) {
      buckets.set(label, []);
      order.push(label);
    }
    buckets.get(label)!.push(s);
  }

  return order.map((label) => ({
    label,
    sessions: buckets.get(label) ?? [],
  }));
}
