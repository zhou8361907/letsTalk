import type { IndexRow } from "./index-table.js";

export interface MatchedIndexTerm {
  term: string;
  relPath: string;
  kind: IndexRow["kind"];
}

/**
 * 匹配策略（按优先级依次尝试）：
 *   1. 精确子串匹配               "枚举字典" in "枚举字典怎么查"
 *   2. 中文连续字重叠匹配（≥2 字）  "字典表" → "枚举字典"（共享"字典"）
 *
 * 别名由 INDEX 多行实现：save_memory 的 aliases 参数通过 syncIndexForTopic
 * 将别名写为独立 INDEX 行，子串匹配自然覆盖。无需额外 aliases.json 文件。
 */

/**
 * 检测 message 中是否包含 term 的 ≥minOverlap 个连续字符。
 * 专门用于中文：term="枚举字典" → message="字典表" → 命中"字典"（2 字符重叠）。
 */
function hasCharOverlap(
  term: string,
  message: string,
  minOverlap = 2,
): boolean {
  const hasChinese = /[一-鿿]/.test(term);
  if (!hasChinese) return false;
  if (term.length < minOverlap) return false;

  const termChars = [...term];
  const msgChars = [...message];
  if (msgChars.length < minOverlap) return false;

  for (let i = 0; i <= termChars.length - minOverlap; i++) {
    const subSeq = termChars.slice(i, i + minOverlap).join("");
    for (let j = 0; j <= msgChars.length - minOverlap; j++) {
      let match = true;
      for (let k = 0; k < minOverlap; k++) {
        if (msgChars[j + k] !== termChars[i + k]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
  }

  return false;
}

/**
 * 用户消息子串匹配 INDEX 黑话。
 *
 * 规则：
 *   - 精确子串匹配（INDEX 多行覆盖别名）
 *   - 中文连续字重叠（≥2 字）："字典表" → "枚举字典"
 * 长词优先，同文件去重。
 */
export function matchIndexTerms(
  message: string,
  rows: IndexRow[],
): MatchedIndexTerm[] {
  if (!message.trim() || rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) =>
      b.term.length - a.term.length ||
      a.term.localeCompare(b.term, "zh-CN"),
  );

  const seenFiles = new Set<string>();
  const matched: MatchedIndexTerm[] = [];

  for (const row of sorted) {
    // 策略 1：精确子串匹配
    if (row.term && message.includes(row.term)) {
      if (!seenFiles.has(row.relPath)) {
        seenFiles.add(row.relPath);
        matched.push({ term: row.term, relPath: row.relPath, kind: row.kind });
      }
      continue;
    }

    if (seenFiles.has(row.relPath)) continue;

    // 策略 2：中文连续字重叠（≥2 字）
    if (hasCharOverlap(row.term, message, 2)) {
      seenFiles.add(row.relPath);
      matched.push({ term: row.term, relPath: row.relPath, kind: row.kind });
    }
  }

  return matched;
}
