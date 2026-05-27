import { resolve } from "node:path";

/** 将相对工作区根的路径解析为绝对路径，并防止目录穿越 */
export function resolveJavaFile(workspaceRoot: string, filePath: string): string {
  const root = resolve(workspaceRoot);
  const abs = resolve(root, filePath.replace(/^\/+/, ""));
  if (!abs.startsWith(root)) {
    throw new Error("文件路径必须在工作区内");
  }
  if (!abs.endsWith(".java")) {
    throw new Error("仅支持 .java 文件");
  }
  return abs;
}
