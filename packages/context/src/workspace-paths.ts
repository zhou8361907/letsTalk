import { isAbsolute, relative, resolve } from "node:path";

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
  /** 当前产品线 */
  productLine?: string;
}

import { PRODUCT_LINES, DEFAULT_PRODUCT_LINE, type ProductLineId } from "@lets-talk/shared-types";

/**
 * 从环境变量 + 产品线解析工作区布局：
 * - WORKSPACE_ROOT：letsTalk 运行根（必填，建议填仓库绝对路径）
 * - FRONTEND_ROOT：前端目录（默认取产品线配置）
 * - BACKEND_ROOT：后端目录（默认取产品线配置）
 * - PRODUCT_LINE：产品线 id（默认 yibao）
 */
export function resolveWorkspaceLayout(
  productLine?: ProductLineId | null,
): WorkspaceLayout {
  const workspaceRoot = resolve(
    process.env.WORKSPACE_ROOT?.trim() || process.cwd(),
  );

  const plId: ProductLineId = productLine
    ?? (process.env.PRODUCT_LINE?.trim() as ProductLineId)
    ?? DEFAULT_PRODUCT_LINE;
  const pl = PRODUCT_LINES[plId];

  // 按产品线读取对应的 env 覆盖
  const frontendEnv = (plId === "shebao"
    ? process.env.SHEBAO_FRONTEND_ROOT?.trim()
    : process.env.FRONTEND_ROOT?.trim()) || pl.frontendRoot;
  const backendEnv = (plId === "shebao"
    ? process.env.SHEBAO_BACKEND_ROOT?.trim()
    : process.env.BACKEND_ROOT?.trim()) || pl.backendRoot;

  const frontendRoot = resolve(
    isAbsolute(frontendEnv) ? frontendEnv : workspaceRoot,
    isAbsolute(frontendEnv) ? "." : frontendEnv,
  );
  const backendRoot = resolve(
    isAbsolute(backendEnv) ? backendEnv : workspaceRoot,
    isAbsolute(backendEnv) ? "." : backendEnv,
  );

  const frontendRel = toPosixRelative(workspaceRoot, frontendRoot);
  const backendRel = toPosixRelative(workspaceRoot, backendRoot);

  return { workspaceRoot, frontendRoot, backendRoot, frontendRel, backendRel, productLine: plId };
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
    `前端代码目录: ${layout.frontendRel}/`,
    `后端代码目录: ${layout.backendRel}/`,
  ].join("\n");
}
