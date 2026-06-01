/** 用户明确要求本轮不使用 memory（ShareAI s09） */
const IGNORE_PATTERNS: RegExp[] = [
  /不要参考记忆/,
  /不要参考\s*memory/i,
  /忽略记忆/,
  /忽略\s*memory/i,
  /忽略之前的记忆/,
  /别参考记忆/,
  /forget\s+memory/i,
  /ignore\s+memory/i,
  /don'?t\s+use\s+memory/i,
  /without\s+memory/i,
  /按\s*memory\s*为空/i,
];

export function isMemoryIgnoredMessage(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return IGNORE_PATTERNS.some((re) => re.test(text));
}
