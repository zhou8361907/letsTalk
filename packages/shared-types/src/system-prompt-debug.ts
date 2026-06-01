/** 会话级 system prompt 调试快照（Pi ResourceLoader 解析结果） */
export interface SystemPromptFilePart {
  /** 相对 WORKSPACE_ROOT */
  path: string;
  content: string;
}

export interface SystemPromptSnapshot {
  capturedAt: string;
  chatMode: string;
  modelLabel?: string;
  activeTools?: string[];
  /** AGENTS.md 等 project_context */
  agentsFiles: SystemPromptFilePart[];
  /** Pi 额外 system 源（若配置） */
  baseSystem?: string;
  /** letsTalk appendSystemPrompt 各块 */
  appendBlocks: string[];
  /** 合并展示文本（近似发给 API 的 system 侧） */
  combined: string;
  /** 非实时快照时的说明（如从磁盘按当前配置重建） */
  sourceNote?: string;
}
