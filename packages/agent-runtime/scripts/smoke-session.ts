/**
 * 仅聊天、不调工具（调试用）
 * 推荐日常用：pnpm minimal
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createPiSession } from "../src/create-session";

config({ path: resolve(process.cwd(), ".env") });

const { session, dispose } = await createPiSession(
  resolve(process.env.WORKSPACE_ROOT ?? process.cwd()),
  false,
);

session.subscribe((e) => {
  if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(e.assistantMessageEvent.delta);
  }
});

try {
  await session.prompt("你好");
  console.log();
} finally {
  dispose();
}
