/** Skills 默认开启；设 LETS_TALK_SKILLS=0 关闭 */
export function isSkillsEnabled(): boolean {
  const v = process.env.LETS_TALK_SKILLS?.trim();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

/** 后台 self-improvement review 间隔；0 关闭。兼容 LETS_TALK_MEMORY_NUDGE_INTERVAL */
export function selfImprovementReviewInterval(): number {
  const raw =
    process.env.LETS_TALK_SELF_IMPROVE_NUDGE_INTERVAL?.trim() ??
    process.env.LETS_TALK_MEMORY_NUDGE_INTERVAL?.trim();
  if (raw === "0" || raw === "false" || raw === "no") return 0;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 10;
}
