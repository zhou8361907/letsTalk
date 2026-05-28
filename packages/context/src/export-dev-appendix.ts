import type { AgentAnchor } from "@lets-talk/shared-types";

/** 构建给 generateDevAppendix 的 prompt 输入 */
export function buildDevAppendixPromptInput(
  primaryMarkdown: string,
  anchor: AgentAnchor | null,
  workspaceDirsHint: string,
): string {
  const anchorBlock = anchor
    ? JSON.stringify(anchor, null, 2)
    : "（无锚点，仅根据需求描述与仓库结构推测）";

  return [
    "你是研发线索整理助手。下面「PM 定稿」部分**禁止改写**，仅作理解需求的依据。",
    "请在工作区内用 grep/read 等工具**适度**查代码，整理「前端可能涉及」「后端可能涉及」「联调与注意」三节。",
    "要求：",
    "- 输出 Markdown，不要 JSON",
    "- 路径/接口写「可能」、注明以代码为准",
    "- 不要编造未读到的类名；读不到就写「需在仓库内进一步定位」",
    "- 不要修改 PM 定稿里的 toBe/验收",
    "",
    workspaceDirsHint,
    "",
    "## 锚点",
    "```json",
    anchorBlock,
    "```",
    "",
    "## PM 定稿（只读）",
    primaryMarkdown,
  ].join("\n");
}
