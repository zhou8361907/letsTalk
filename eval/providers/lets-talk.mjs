/**
 * Promptfoo custom provider for letsTalk
 *
 * 调用进程内 runChat，返回结构化 EvalTurnResult
 */

import { runEvalTurn } from "../lib/run-turn.mjs";

export async function callApi(prompt, context) {
  const config = context.config;

  if (!config?.workspaceRoot) {
    throw new Error("lets-talk provider requires workspaceRoot in config");
  }

  // 设置 WORKSPACE_ROOT 环境变量（runChat 内部会读取）
  process.env.WORKSPACE_ROOT = config.workspaceRoot;

  const result = await runEvalTurn(prompt, config);

  // Promptfoo 期望返回 { output, cost } 或直接返回 output
  // 我们返回 EvalTurnResult，promptfoo 会把它当作 output
  return {
    output: result,
    cost: result.turnCostUsd || 0,
  };
}

export const id = "lets-talk";
