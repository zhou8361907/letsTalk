/** L0 记忆要点：注入 arch_rules（≤600 字符） */
export const MEMORY_ARCH_RULES_SNIPPET = `记忆（V1）：USER/CORE 在 project_context 前部；磁盘更新后 <core_memory_refresh> 前缀；topics 按需 Pull。
写入：称呼/偏好→memory(user)；惯例/踩坑→memory(core)；jargon→save_memory+INDEX。Pull 后仍须 grep。`;

/** L0 记忆要点：注入 pm_rules */
export const MEMORY_PM_RULES_SNIPPET = `清单写 PM 业务话；跨会话共识→memory（USER/CORE/topics），勿塞进 replaceItems。
写清单前若 jargon INDEX 命中，先 read 再 update_requirement_draft。`;
