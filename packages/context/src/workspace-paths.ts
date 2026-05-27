import { relative, resolve } from "node:path";

/** letsTalk 运行根目录 + 前后端子目录布局 */
export interface WorkspaceLayout {
  /** 项目运行根（letsTalk 仓库根），Pi cwd 与工具路径基准 */
  workspaceRoot: string;
  /** 前端分析目录绝对路径 */
  frontendRoot: string;
  /** 后端分析目录绝对路径 */
  backendRoot: string;
  /** 相对 workspaceRoot，如 workFront */
  frontendRel: string;
  /** 相对 workspaceRoot，如 workBack */
  backendRel: string;
}

/**
 * 从环境变量解析工作区布局：
 * - WORKSPACE_ROOT：letsTalk 运行根（必填，建议填仓库绝对路径）
 * - FRONTEND_ROOT：前端目录，相对 WORKSPACE_ROOT 或绝对路径（默认 workFront）
 * - BACKEND_ROOT：后端目录（默认 workBack）
 */
export function resolveWorkspaceLayout(): WorkspaceLayout {
  const workspaceRoot = resolve(
    process.env.WORKSPACE_ROOT?.trim() || process.cwd(),
  );

  const frontendEnv = process.env.FRONTEND_ROOT?.trim() || "workFront";
  const backendEnv = process.env.BACKEND_ROOT?.trim() || "workBack";

  const frontendRoot = resolve(
    frontendEnv.startsWith("/") ? frontendEnv : workspaceRoot,
    frontendEnv.startsWith("/") ? "." : frontendEnv,
  );
  const backendRoot = resolve(
    backendEnv.startsWith("/") ? backendEnv : workspaceRoot,
    backendEnv.startsWith("/") ? "." : backendEnv,
  );

  const frontendRel = toPosixRelative(workspaceRoot, frontendRoot);
  const backendRel = toPosixRelative(workspaceRoot, backendRoot);

  return { workspaceRoot, frontendRoot, backendRoot, frontendRel, backendRel };
}

function toPosixRelative(from: string, to: string): string {
  const rel = relative(from, to).replace(/\\/g, "/");
  return rel || ".";
}

/** 将用户输入的路径规范为相对 workspaceRoot（Pi 工具用） */
export function toWorkspaceRef(
  layout: WorkspaceLayout,
  ref: string,
): string {
  const normalized = ref.replace(/^\/+/, "").replace(/\\/g, "/");
  if (
    normalized.startsWith(`${layout.frontendRel}/`) ||
    normalized === layout.frontendRel
  ) {
    return normalized;
  }
  if (
    normalized.startsWith(`${layout.backendRel}/`) ||
    normalized === layout.backendRel
  ) {
    return normalized;
  }
  // 默认：前端下的相对路径，如 src/views/Login.vue
  return `${layout.frontendRel}/${normalized}`;
}

/** 注入 prompt 的目录说明（让模型知道去哪 grep/read） */
export function formatWorkspaceDirsHint(layout: WorkspaceLayout): string {
  return [
    `工作区根目录: ${layout.workspaceRoot}`,
    `前端代码目录: ${layout.frontendRel}/（Vue 页面、组件等）`,
    `后端代码目录: ${layout.backendRel}/（Java/Spring 等）`,
    `使用 read/grep/find 时请写相对工作区根的路径，例如 ${layout.frontendRel}/src/views/Login.vue 或 ${layout.backendRel}/src/main/java/...`,
  ].join("\n");
}
