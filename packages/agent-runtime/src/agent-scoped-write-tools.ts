/**
 * Pi write / edit 的白名单封装（仅 .agent/memory、.agent/hints）
 */

import { access, mkdir as fsMkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createEditToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  assertWritableAgentDir,
  assertWritableAgentPath,
  formatWritablePathsHint,
} from "./agent-write-policy.js";

export function createScopedWriteTools(workspaceRoot: string): ToolDefinition[] {
  const cwd = resolve(workspaceRoot);

  const writeDef = createWriteToolDefinition(cwd, {
    operations: {
      async mkdir(dir) {
        assertWritableAgentDir(cwd, dir);
        await fsMkdir(dir, { recursive: true });
      },
      async writeFile(absolutePath, content) {
        assertWritableAgentPath(cwd, absolutePath);
        await writeFile(absolutePath, content, "utf-8");
      },
    },
  });

  writeDef.description = [
    writeDef.description,
    `仅可写入 ${formatWritablePathsHint()}。workFront/workBack 禁止修改；.agent/skills 用 skill_manage。`,
  ].join(" ");

  const editDef = createEditToolDefinition(cwd, {
    operations: {
      async readFile(absolutePath) {
        assertWritableAgentPath(cwd, absolutePath);
        return readFile(absolutePath);
      },
      async writeFile(absolutePath, content) {
        assertWritableAgentPath(cwd, absolutePath);
        await writeFile(absolutePath, content, "utf-8");
      },
      async access(absolutePath) {
        assertWritableAgentPath(cwd, absolutePath);
        await access(absolutePath);
      },
    },
  });

  editDef.description = [
    editDef.description,
    `仅可编辑 ${formatWritablePathsHint()}；.agent/skills 用 skill_manage。`,
  ].join(" ");

  return [writeDef, editDef] as ToolDefinition[];
}
