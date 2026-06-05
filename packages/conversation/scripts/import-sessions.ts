#!/usr/bin/env node
/**
 * 从 WORKSPACE_ROOT/.agent/conversations/*.json 导入 state.db
 * 用法：pnpm sessions:import
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { importConversationsFromJson } from "../src/import-json.js";

config({ path: resolve(process.cwd(), "../../.env") });

async function main(): Promise<void> {
  const root = process.env.WORKSPACE_ROOT?.trim();
  if (!root) {
    console.error("未设置 WORKSPACE_ROOT");
    process.exit(1);
  }

  const result = await importConversationsFromJson(root);
  console.log(
    `import 完成: imported=${result.imported} skipped=${result.skipped} errors=${result.errors.length}`,
  );
  for (const err of result.errors) {
    console.error(`  ${err}`);
  }
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
