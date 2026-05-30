import type { RequirementDraftState } from "@lets-talk/shared-types";

/** 每轮 JIT 注入：让 Agent 更新草稿时带上已有 id 与上下文 */
export function formatRequirementDraftSnapshot(
  draft: RequirementDraftState | null | undefined,
): string {
  if (!draft?.items.length) {
    return "（右侧需求清单尚无条目；PM 描述后拆 1 条即可，不要拆前后端两条。）";
  }

  const lines: string[] = [
    "当前右侧需求清单（更新时必须保留 id，在同一上下文上修改）：",
  ];

  for (const it of draft.items) {
    const parts: string[] = [];
    for (const f of it.fields) {
      const v = f.value.trim();
      if (!v || f.key === "codePaths") continue;
      parts.push(`${f.label || f.key}=${v}`);
    }
    lines.push(`- id="${it.id}" title="${it.title}"${parts.length ? ` | ${parts.join(" | ")}` : ""}`);
  }

  if (draft.blockingQuestion?.trim()) {
    lines.push(`待确认：${draft.blockingQuestion.trim()}`);
  }

  lines.push(
    "规则：PM 一件事 = 清单 1 条；后端/数据库改造写在 codePaths，勿新建「后端支持」条目。",
  );

  return lines.join("\n");
}

/** C1：每轮 prefix 用的紧凑摘要（id | title | page | control） */
export function formatRequirementDraftBriefSummary(
  draft: RequirementDraftState | null | undefined,
  maxItems = 8,
): string {
  if (!draft?.items.length) return "";
  const lines: string[] = [
    "当前需求清单摘要（更新时须带 id；未传 fields 会保留旧值；详情请 get_requirement_draft）：",
  ];
  for (const it of draft.items.slice(0, maxItems)) {
    const page =
      it.fields.find((f) => f.key === "page")?.value.trim() ?? "";
    const control =
      it.fields.find((f) => f.key === "control")?.value.trim() ?? "";
    const bits = [
      `id=${it.id}`,
      `title=${it.title}`,
      page ? `page=${page}` : "",
      control ? `control=${control}` : "",
    ].filter(Boolean);
    lines.push(`- ${bits.join(" | ")}`);
  }
  if (draft.items.length > maxItems) {
    lines.push(`… 另有 ${draft.items.length - maxItems} 条，请 get_requirement_draft`);
  }
  return lines.join("\n");
}
