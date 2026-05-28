# 菜单库接入说明（初探）

| 项目 | 内容 |
|------|------|
| 库 | MySQL `mifc` @ `10.16.28.136:32106` |
| 表 | `sys_menu` |
| 状态 | **已连通**；Web「系统菜单」锚点（mega-menu UI）已接入 |

---

## 1. `sys_menu` 结构摘要

| 字段 | 含义（推断） |
|------|----------------|
| `MENU_ID` | 主键 UUID |
| `MENU_CODE` | 菜单编码 |
| `MENU_NAME` | 显示名（PM 可点选） |
| `PARENT_ID` | 父菜单 → 树形 |
| `LEVEL_NUM` | 层级 |
| `IS_LEAF` | 是否叶子 |
| `ENABLED` | 是否启用 |
| `url` | 前端路由/页面路径（常为平台 URL，非 vue 文件路径） |
| `USER_SYS_ID` | 子系统/租户维度（如 `001`、`664`、`673`） |
| `DISP_ORDER` | 排序 |

约 **4409** 行；其中 **ENABLED=1 且叶子且有 url** 约 **3844** 条。

---

## 2. 样例数据特征

- 锚点字段（推荐 **两者都存**）：
  - `menuUrl`：`sys_menu.url` 原值（完整）
  - `routePath`：解析后的路由（`#/smc/dictionary` → `/smc/dictionary`；`.html` 页保留全路径）
  - `ref` = `routePath`（Agent grep 用）
- `url` 多为产品路径，例如：
  - `/df/fap/config/userConfig/userConfig.html`（菜单名「用户管理」）
  - `/smifc/web/index.html#/…`（分省业务页）
- **不是** `workFront/src/views/...vue` 这种仓库内路径。
- 同名菜单可能多条（不同 `USER_SYS_ID` / 废弃路径 `discardFolder`）。

当前 `WORKSPACE_ROOT` 下 `workFront` 指向 **RunningAccount 演示 Vue**（`legacy/test-project/...`），与库内全量 mifc 菜单 **不是同一套页面**。锚点映射需分两档：

| 场景 | 锚点 `ref` 建议 |
|------|------------------|
| 接菜单库（PM 点真系统菜单） | 以 `url` + `MENU_NAME` 为主；`component` 需后续路由表或人工映射 |
| 接演示仓库（读代码改需求） | 仍用现有 vue 文件列表 / 手选路径 |

---

## 3. 环境变量

见根目录 `.env.example`：

```bash
MENU_DB_HOST=
MENU_DB_PORT=32106
MENU_DB_USER=
MENU_DB_PASSWORD=
MENU_DB_NAME=mifc
```

密码只放本地 `.env`，**勿提交 Git**。

---

## 4. 已落地（P1a 初版）

| 能力 | 说明 |
|------|------|
| UI | 锚点栏 **系统菜单**：左一级 + 右分组标题 + 三列链接（对齐门户 mega-menu） |
| API | `GET /api/menu/tree`（默认合并全部一级）；单子系统：`?userSysId=672&merged=0` |
| 数据 | 优先 `MENU_DB_*` 直连；失败可读 `.agent/menu-map/{id}.json` |
| 锚点 | `kind: "menu"`，`ref`=url，`breadcrumb` 注入 Agent |
| 同步 | `node scripts/sync-menu-map.mjs [userSysId]` |

**暂不**每轮对话直连 DB；可定期跑同步脚本离线缓存。

---

## 5. 待你确认

1. PM 选菜单时，默认展示哪个 `USER_SYS_ID`（或全部 + 搜索）？
2. 锚点以 **`url`** 为准，还是必须映射到 `workFront` 下某个 `.vue`？
3. `discardFolder`、重复「用户管理」是否过滤掉？

确认后再写同步脚本与 UI。
