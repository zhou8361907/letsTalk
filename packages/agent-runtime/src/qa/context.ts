/**
 * QA 上下文构建器 — 将录制信息注入 agent 对话前缀
 *
 * 每次用户发消息时调用，生成当前 QA 录制状态的快照。
 */
import { loadCurrentSession } from "./store.js";
import type { QaRecordEvent } from "@lets-talk/shared-types";

export interface QaFocusedRequest {
  seq: number;
  url: string;
  method: string;
  statusCode: number;
  traceId: string;
  timestamp: string;
}

/**
 * 构建 QA 上下文前缀文本
 * @param sessionId 对话会话 ID
 * @param focusedRequest 面板选中的请求（可选）
 */
export function buildQaContextPrefix(
  sessionId: string,
  focusedRequest?: QaFocusedRequest | null,
): string {
  const record = loadCurrentSession();
  if (!record || record.events.length === 0) return "";

  const events = record.events;

  // 找最后一个 PAGE
  const lastPage = [...events].reverse().find((e) => e.kind === "PAGE");
  // 找最后一个 TAB
  const lastTab = [...events].reverse().find((e) => e.kind === "TAB");
  // 找最近 5 个操作（CLICK 或 TAB）
  const recentActs = events.filter((e) => e.kind === "CLICK" || e.kind === "TAB").slice(-5);
  // 统计异常请求
  const errReqs = events.filter((e) => e.kind === "REQUEST" && e.statusCode && e.statusCode >= 400);
  // 总请求数
  const totalReqs = events.filter((e) => e.kind === "REQUEST").length;

  const lines: string[] = [];
  lines.push("[QA 录制上下文]");

  if (lastPage) {
    const pageName = lastPage.summary || "未知页面";
    lines.push(`当前页面: ${pageName}`);
  } else {
    lines.push("当前页面: 无");
  }

  if (lastTab) {
    const tabName = lastTab.summary.replace("页签: ", "");
    lines.push(`当前页签: ${tabName}`);
  }

  // 最近操作
  if (recentActs.length > 0) {
    const actLines = recentActs.map((a) => {
      const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString("zh-CN", { hour12: false }) : "";
      return `  ${a.kind === "TAB" ? "📑" : "🖱"} ${a.summary}${time ? ` (${time})` : ""}`;
    });
    lines.push("最近操作:", ...actLines);
  }

  // 关注请求
  if (focusedRequest) {
    lines.push(
      `关注请求: ${focusedRequest.method} ${focusedRequest.url} [${focusedRequest.statusCode}]`,
    );
    if (focusedRequest.traceId) {
      lines.push(`  traceId: ${focusedRequest.traceId}`);
    }
  }

  // 异常统计
  if (errReqs.length > 0) {
    lines.push(`异常请求: ${errReqs.length} 个`);
    for (const er of errReqs.slice(0, 3)) {
      const time = er.timestamp ? new Date(er.timestamp).toLocaleTimeString("zh-CN", { hour12: false }) : "";
      lines.push(`  🔴 [${er.statusCode}] ${er.method ?? "?"} ${er.url ?? er.summary}${time ? ` (${time})` : ""}`);
    }
    if (errReqs.length > 3) lines.push(`  ... 还有 ${errReqs.length - 3} 个`);
  }

  lines.push(`录制概要: ${events.length} 事件, ${totalReqs} 请求`);
  lines.push("---");

  return lines.join("\n");
}
