/**
 * 产品线（医保 / 社保）配置
 */
export type ProductLineId = "yibao" | "shebao";

export interface ProductLine {
  id: ProductLineId;
  label: string;
  /** 前端代码目录（相对 WORKSPACE_ROOT） */
  frontendRoot: string;
  /** 后端代码目录（相对 WORKSPACE_ROOT） */
  backendRoot: string;
  /** 菜单过滤 ID（sys_menu.USER_SYS_ID） */
  userSysId: string;
  /** 菜单表名 */
  menuTable: string;
}

export const PRODUCT_LINES: Record<ProductLineId, ProductLine> = {
  yibao: {
    id: "yibao",
    label: "医保",
    frontendRoot: "workFront",
    backendRoot: "workBack",
    userSysId: "672",
    menuTable: "sys_menu",
  },
  shebao: {
    id: "shebao",
    label: "社保",
    frontendRoot: "workFrontShebao",
    backendRoot: "workBackShebao",
    userSysId: "673",
    menuTable: "sys_menu_shebao",
  },
};

export const DEFAULT_PRODUCT_LINE: ProductLineId = "yibao";
