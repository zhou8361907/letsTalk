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
