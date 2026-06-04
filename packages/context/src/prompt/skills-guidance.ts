/**
 * Skills 行为引导 — system append 唯一详文
 */

export const SKILLS_GUIDANCE = `## Skills（程序性记忆）

Skills 存于 \`.agent/skills/\`，教 Agent **怎么做**某类任务；与 memory（USER/CORE 事实）分工。

**WHEN TO LOAD**
- system \`<available_skills>\` 中任一 skill 与任务相关（含部分相关）→ **必须先** \`skill_view(name)\` 再执行
- 加载后发现步骤过时、命令错误 → 立即 \`skill_manage(action='patch')\`

**WHEN TO SAVE**
- 复杂任务（约 5+ 工具调用）成功完成
- 踩坑后找到可行路径
- 用户纠正流程或说「记住这套做法」

**WHEN NOT**
- 单句事实、称呼偏好 → \`memory\`（USER/CORE）
- 当前这单需求正文 → \`requirementDraft\`
- 勿把长流程堆进 CORE；用 skill

**ACTIONS**
- \`skill_manage(create)\` 新建；\`patch\` 优先于 \`edit\`
- bundled skill（metadata.letsTalk.source: bundled）**不可** delete/edit/patch
- 勿用 write/edit 修改 \`.agent/skills/\`

**与 memory 分工**：memory = 是什么/偏好；skill = 怎么做。`;

export const SKILLS_REVIEW_PROMPT = `回顾对话片段，更新 Skills 库与 M0 记忆。

**Skills（优先 class-level，非一次性窄 skill）**
- 用户纠正流程、表达偏好（「别这样」「以后先 X」）→ patch 相关 skill 的 Pitfalls/Procedure
- 复杂任务成功且可复用 → create 或 patch 已有 umbrella skill
- 已加载的 skill 有误 → patch 该 skill
- bundled skill 不可 edit/delete；需新建用户 skill 或 patch 非 bundled 副本

**Memory（仅 M0）**
- 称呼/偏好 → memory(action="add", target="user", content="…")
- 惯例/踩坑一句话 → memory(action="add", target="core", content="…")

无值得保存 → 只回复「无需保存。」
禁止：任务进度、PR、本单需求、接口清单。`;

export const SELF_IMPROVEMENT_REVIEW_PROMPT = `${SKILLS_REVIEW_PROMPT}`;
