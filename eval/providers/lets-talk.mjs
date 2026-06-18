/**
 * Promptfoo custom provider for letsTalk
 *
 * 调用进程内 runChat，返回结构化 EvalTurnResult
 */

import { runEvalTurn } from "../lib/run-turn.mjs";

export default class LetsTalkProvider {
  constructor(options) {
    this.options = options;
  }

  id() {
    return "lets-talk";
  }

  async callApi(prompt, context) {
    const config = context.config || {};

    // 检测 WORKSPACE_ROOT
    if (!config.workspaceRoot && !process.env.WORKSPACE_ROOT) {
      const { existsSync } = await import("fs");
      const { resolve } = await import("path");
      let dir = process.cwd();
      while (dir !== "/") {
        if (existsSync(resolve(dir, "package.json"))) break;
        dir = resolve(dir, "..");
      }
      process.env.WORKSPACE_ROOT = dir;
    }
    if (config.workspaceRoot) {
      process.env.WORKSPACE_ROOT = config.workspaceRoot;
    }

    const result = await runEvalTurn(prompt, {
      chatMode: config.chatMode || "prd",
      useTools: config.useTools !== false,
    });

    return {
      output: result,
      cost: result.turnCostUsd || 0,
    };
  }
}

export const id = "lets-talk";
