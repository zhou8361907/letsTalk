/** 稳定层记忆行为指导（对齐 Hermes MEMORY_GUIDANCE，适配 letsTalk ERP） */
export const MEMORY_GUIDANCE = `你有跨会话持久记忆（USER.md 画像、CORE.md 助手笔记、topics jargon 索引）。
主动用 memory 工具保存仍成立的事实：用户纠正、说「记住」、偏好、环境惯例、工具/项目踩坑。
优先减少用户重复纠正——称呼、沟通风格、反复纠错比单次任务步骤更重要。
写成陈述句事实，不要写成给自己的命令（「用户偏好简短回复」✓，「始终简短回复」✗）。
勿把任务进度、PR/分支、今天改了哪些文件、本单需求正文写入 memory——用 git、requirementDraft 或对话历史。
7 天后会过时的 artifact 不要进 memory。多步工作流以后用 skill/文档，不要堆进 CORE。
写入路由：称呼/偏好→memory(target=user)；惯例/踩坑→memory(target=core)；项目 jargon 消歧→save_memory+INDEX。
勿把 nickname 写进 glossary/INDEX。Pull/read memory 后仍须 grep/read 代码；与代码冲突以代码为准。`;
