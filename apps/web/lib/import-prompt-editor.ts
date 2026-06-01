import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function firstExistingPath(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "找不到 prompt-editor 模块，请执行 pnpm --filter @lets-talk/context build",
  );
}

async function resolvePromptEditorJs(): Promise<string> {
  const workspaceRoot = process.env.WORKSPACE_ROOT?.trim();
  const cwd = process.cwd();

  return firstExistingPath(
    [
      workspaceRoot &&
        join(workspaceRoot, "packages/context/dist/prompt/prompt-editor.js"),
      join(cwd, "node_modules/@lets-talk/context/dist/prompt/prompt-editor.js"),
      join(cwd, "../../packages/context/dist/prompt/prompt-editor.js"),
    ].filter((p): p is string => Boolean(p)),
  );
}

/** 绕过 Next/webpack 对 @lets-talk/context 命名 re-export 的加载问题 */
export async function importPromptEditorModule(): Promise<
  typeof import("@lets-talk/context/prompt-editor")
> {
  const modPath = await resolvePromptEditorJs();
  return import(/* webpackIgnore: true */ pathToFileURL(modPath).href);
}
