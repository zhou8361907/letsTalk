/**
 * 本地测试：不启动网页，直接在终端跑 Pi
 *
 * 用法：
 *   1. 配置根目录 .env（LLM_API_KEY、WORKSPACE_ROOT）
 *   2. pnpm minimal
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { createPiSession } from "../src/create-session";

// 加载 .env
config({ path: resolve(process.cwd(), ".env") });

const cwd = process.env.WORKSPACE_ROOT ?? process.cwd();

const { session, modelLabel, dispose } = await createPiSession(resolve(cwd), true);

console.error(`[测试] 目录=${cwd} 模型=${modelLabel}`);

try {
  // 打印流式回复
  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.error(`\n[工具] ${event.toolName}`);
    }
  });

  await session.prompt("用一句话说明当前项目做什么。");
  console.log("\n[完成]");
} finally {
  dispose();
}
