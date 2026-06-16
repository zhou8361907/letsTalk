import { createHash, timingSafeEqual } from "node:crypto";
import { relative } from "node:path";

const PROD_PREVIEW_MAX = 200;

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

export function truncateForProdLog(
  text: string,
  maxLen = PROD_PREVIEW_MAX,
): { preview: string; truncated: boolean } {
  if (text.length <= maxLen) {
    return { preview: text, truncated: false };
  }
  return { preview: text.slice(0, maxLen), truncated: true };
}

/** 生产 log 用相对 WORKSPACE_ROOT 路径；无法 relativize 时返回 basename */
export function toWorkspaceRelativePath(
  absPath: string,
  workspaceRoot: string,
): string {
  try {
    return relative(workspaceRoot, absPath).replace(/\\/g, "/");
  } catch {
    const parts = absPath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] ?? absPath;
  }
}

/** 恒定时间比较 hash，供未来校验用途 */
export function safeEqualHash(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
