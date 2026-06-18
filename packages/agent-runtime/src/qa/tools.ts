/**
 * QA 模式 Agent 工具 — 录制查询与诊断
 */
import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { loadCurrentSession } from "./store.js";
import { findLogsByTraceId, readJavaSource } from "./log-analyzer.js";

function text(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined as unknown };
}

export function createQaAnalysisTools(options: {
  sessionId: string;
}): ToolDefinition[] {
  // 按条件搜索录制事件
  const searchEvents = defineTool({
    name: "qa_search_events",
    label: "Search QA Recorded Events",
    description: "全文搜索录制中的所有事件（操作/页签/请求）。用户问具体操作时优先用此工具。",
    promptSnippet: "qa_search_events — 搜索录制中的事件",
    promptGuidelines: [
      "优先用 query 参数做全文搜索，支持搜索操作名、URL、状态码等",
      "用户说「受理成功了吗」→ query=受理",
      "用户说「已办页签的查询」→ query=已办 page=支付计划申请",
      "用户说「看看报错」→ status=error",
      "用户说「导出」→ query=导出",
    ],
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "全文搜索关键词（搜索所有事件类型的 summary）" })),
      page: Type.Optional(Type.String({ description: "页面名称过滤" })),
      tab: Type.Optional(Type.String({ description: "页签名称过滤" })),
      status: Type.Optional(Type.String({ description: "'error' 只看 4xx/5xx, 'all' 全部" })),
      action: Type.Optional(Type.String({ description: "按钮文字过滤（如查询/导出）" })),
    }),
    execute: async (_id, raw) => {
      const p = raw as { query?: string; page?: string; tab?: string; status?: string; action?: string };
      const session = loadCurrentSession();
      if (!session) return text("录制不存在");

      let events = [...session.events];

      // 按页面过滤：找 PAGE 事件匹配后，取该页面范围内的请求
      if (p.page) {
        const pageIdx = events.findIndex(
          (e) => e.kind === "PAGE" && e.summary.includes(p.page!),
        );
        if (pageIdx >= 0) {
          // 取该 PAGE 之后到下一个 PAGE 之前的事件
          const nextPage = events.slice(pageIdx + 1).findIndex((e) => e.kind === "PAGE");
          const end = nextPage >= 0 ? pageIdx + 1 + nextPage : events.length;
          events = events.slice(pageIdx, end);
        }
      }

      // 按页签过滤：找 TAB 事件匹配后，取范围内的请求
      if (p.tab) {
        const tabIdx = [...events].reverse().findIndex(
          (e) => e.kind === "TAB" && e.summary.includes(p.tab!),
        );
        if (tabIdx >= 0) {
          const realIdx = events.length - 1 - tabIdx;
          const nextTab = events.slice(realIdx + 1).findIndex((e) => e.kind === "TAB" || e.kind === "PAGE");
          const end = nextTab >= 0 ? realIdx + 1 + nextTab : events.length;
          events = events.slice(realIdx, end);
        }
      }

      // 全文搜索（匹配所有事件类型的 summary）
      if (p.query) {
        const kw = p.query.toLowerCase();
        events = events.filter((e) => e.summary.toLowerCase().includes(kw));
      }

      // 按按钮文字过滤
      if (p.action) {
        events = events.filter(
          (e) =>
            (e.kind === "CLICK" && e.summary.includes(p.action!)) ||
            (e.kind === "REQUEST" && e.summary.includes(p.action!)),
        );
      }

      // 按需展示：有 action/query 时展示操作+请求上下文，否则只展示请求
      const showActions = events.filter((e) => e.kind === "CLICK" || e.kind === "TAB");
      const showRequests = events.filter((e) => e.kind === "REQUEST");

      // 全文搜索或按钮搜索时，展示操作+请求上下文
      if ((p.query || p.action) && showActions.length > 0) {
        // 按时间降序（最新的排最前）
        showActions.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
        const lines: string[] = [];
        if (showActions.length > 1) {
          lines.push(`找到 ${showActions.length} 次匹配，最新的排最前:`);
        } else {
          lines.push("=== 找到以下操作 ===");
        }
        for (let idx = 0; idx < showActions.length; idx++) {
          const a = showActions[idx]!;
          const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString("zh-CN", { hour12: false }) : "";
          const icon = a.kind === "TAB" ? "📑" : "🖱";
          const prefix = idx === 0 ? "▶ " : "  ";
          lines.push(`${prefix}${icon} ${a.summary} (${time})${idx === 0 ? " ← 最新" : ""}`);
          // 找该操作后面的请求
          const aIdx = events.indexOf(a);
          const laterReqs = events.slice(aIdx + 1, aIdx + 20).filter((e) => e.kind === "REQUEST" && e.statusCode);
          for (const r of laterReqs.slice(0, 3)) {
            lines.push(`    🌐 [${r.statusCode}] ${r.method ?? "?"} ${(r.url ?? r.summary).slice(0, 60)}`);
          }
          if (laterReqs.length > 3) lines.push(`    ... 还有 ${laterReqs.length - 3} 个请求`);
        }
        lines.push("", `可以使用 qa_analyze_request 分析具体某次操作，默认分析最新的那条`);
        return text(lines.join("\n"));
      }

      const filtered = p.status === "error"
        ? showRequests.filter((r) => r.statusCode && r.statusCode >= 400)
        : showRequests;

      if (filtered.length === 0) return text("没有匹配的请求");

      const pageLabel = p.page ? `页面: ${p.page}` : "";
      const tabLabel = p.tab ? `页签: ${p.tab}` : "";
      const header = [pageLabel, tabLabel].filter(Boolean).join(" > ");

      const lines = [
        header ? `=== ${header} ===` : "=== 搜索结果 ===",
        `找到 ${filtered.length} 个请求`,
        "---",
        ...filtered.map((r, i) =>
          `#${i + 1} [${r.statusCode}] ${r.method ?? "?"} ${r.url ?? r.summary}${r.traceId ? ` traceId: ${r.traceId}` : ""} ${r.timestamp ? new Date(r.timestamp).toLocaleTimeString("zh-CN", { hour12: false }) : ""}`,
        ),
        "",
        "可以用 qa_analyze_request 分析具体某条请求（指定 sessionId 和 requestIndex）",
      ];
      return text(lines.join("\n"));
    },
  });

  // 列出录制请求
  const listRequests = defineTool({
    name: "qa_list_requests",
    label: "List Recorded Requests",
    description: "列出录制会话中的请求列表",
    promptSnippet: "qa_list_requests — 查看录制中的请求",
    promptGuidelines: [],
    parameters: Type.Object({
      statusFilter: Type.Optional(Type.String({ description: "'error' 只看 4xx/5xx, 'all' 全部" })),
    }),
    execute: async (_id, raw) => {
      const p = raw as { statusFilter?: string };
      const session = loadCurrentSession();
      if (!session) return text("录制不存在");
      const requests = session.events.filter((e) => e.kind === "REQUEST");
      const filtered = p.statusFilter === "error"
        ? requests.filter((r) => r.statusCode && r.statusCode >= 400)
        : requests;
      if (filtered.length === 0) return text("没有请求");
      const lines = [
        `请求总数: ${requests.length}`,
        "---",
        ...filtered.map((r, i) =>
          `#${i + 1} [${r.statusCode}] ${r.method ?? "?"} ${r.url ?? r.summary}${r.traceId ? ` traceId: ${r.traceId}` : ""}`,
        ),
      ];
      return text(lines.join("\n"));
    },
  });

  // 分析某条请求
  const analyzeRequest = defineTool({
    name: "qa_analyze_request",
    label: "Analyze Request",
    description: "分析某条录制请求：按 traceId 查后端日志、读异常堆栈对应的 Java 源码",
    promptSnippet: "qa_analyze_request — 分析请求的后端日志与源码",
    promptGuidelines: [
      "先从 qa_search_events 或上下文拿到 requestIndex",
      "如果有 traceId 直接查日志，没有则按时间窗模糊匹配",
    ],
    parameters: Type.Object({
      requestIndex: Type.Number({ description: "请求序号（从 qa_search_events/qa_list_requests 获取）" }),
      traceId: Type.Optional(Type.String({ description: "traceId（如有可直接查日志）" })),
    }),
    execute: async (_id, raw) => {
      const p = raw as { requestIndex: number; traceId?: string };
      const session = loadCurrentSession();
      if (!session) return text("录制不存在");
      const requests = session.events.filter((e) => e.kind === "REQUEST");
      const req = requests[p.requestIndex - 1];
      if (!req) return text(`不存在序号 ${p.requestIndex} 的请求`);

      const parts: string[] = [
        `## 请求分析`,
        `**URL**: ${req.method ?? "?"} ${req.url ?? req.summary}`,
        `**状态码**: ${req.statusCode}`,
        `**时间**: ${req.timestamp ? new Date(req.timestamp).toLocaleString("zh-CN") : "无"}`,
      ];

      const tid = p.traceId || req.traceId;
      if (tid) {
        parts.push(`**traceId**: ${tid}`);
        const logs = await findLogsByTraceId(tid);
        if (logs.length > 0) {
          parts.push(`\n### 后端日志（${logs.length} 条）`);
          for (const log of logs) {
            const icon = log.level === "ERROR" ? "🔴" : log.level === "WARN" ? "🟡" : "⚪";
            parts.push(`${icon} [${log.level}] ${log.logger} - ${log.message}`);
            if (log.stackTrace.length > 0) {
              parts.push("```");
              parts.push(log.stackTrace.slice(0, 5).join("\n"));
              if (log.stackTrace.length > 5) parts.push(`  ... 还有 ${log.stackTrace.length - 5} 行`);
              parts.push("```");
              for (const line of log.stackTrace) {
                const m = line.match(/at\s+([a-zA-Z0-9_.]+)\(([a-zA-Z0-9_]+\.java):(\d+)\)/);
                if (m) {
                  const src = readJavaSource(m[1]!, parseInt(m[3]!, 10));
                  if (src) {
                    parts.push(`\n**源码**: \`${m[1]!}:${m[3]!}\``);
                    parts.push("```java");
                    if (src.beforeLines.length) parts.push(...src.beforeLines.map((l) => `  ${l}`));
                    parts.push(`→ ${src.targetLine}`);
                    if (src.afterLines.length) parts.push(...src.afterLines.map((l) => `  ${l}`));
                    parts.push("```");
                  }
                  break;
                }
              }
            }
          }
        } else {
          parts.push("\n未在日志中找到该 traceId 的记录（日志文件可能已滚动或不在当天）");
        }
      } else {
        parts.push("\n该请求没有 traceId，无法精准匹配日志");
      }

      return text(parts.join("\n"));
    },
  });

  return [searchEvents, listRequests, analyzeRequest];
}
