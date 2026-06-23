---
topic: SMIFC 省份差异与多区域部署机制
pages:
  - workFront/src/pages/common/
  - workFront/src/pages/projects/
  - workFront/src/entrys/
  - workFront/build/HtmlWebpackPlubin.js
backend:
  - workBack/com.yonyougov.smip-8.31/src/main/java/com/yonyougov/smifc/
  - workBack/com.yonyougov.smcs-8.31/src/main/resources/
  - workBack/com.yonyougov.smc-8.31/src/main/java/com/yonyougov/smifc/smc/
---

# SMIFC 省份差异与多区域部署机制

## 一、概述

SMIFC 平台采用"一套代码基线 + 多省份定制覆盖"的架构模式。目前覆盖 30 个省份/城市，每个省份在代码库中有专用目录，包含差异化配置和代码。

这种设计允许各省独立管理业务流程（如加密方式、银行对接参数、业务规则、表单布局），同时共享核心的业务逻辑和页面组件。

---

## 二、后端差异：smip 模块

### 模块结构

所有省份定制代码位于 `workBack/com.yonyougov.smip-8.31/`，按省份分包：

```
com.yonyougov.smifc/
  chongqing/    -- 重庆
  fujian/       -- 福建
  hainan/       -- 海南
  xinjiang/     -- 新疆
  henan/        -- 河南
  gansu/        -- 甘肃
  ... 共 30 个省份/城市
```

### 加载机制

使用 `ProvinceTypeFilter`（定义于 smc 模块的 `com.yonyougov.smifc.smc.config.ProvinceTypeFilter`，Spring TypeFilter 实现），通过 `application.yml` 中的 `app.province` 配置控制加载。同时通过 `ProvinceEnum.getByCode()` 验证省份代码是否在枚举范围内，过滤不在枚举中的类。

过滤规则：按类路径深度 level 3 匹配（`className.split(".")[3]`）。例如配置 `app.province=chongqing` 时，仅加载 `com.yonyougov.smifc.chongqing.*` 包下的 Bean。

这意味着省份包结构必须严格遵循 `com.yonyougov.smifc.<province>.<subsystem>` 的三级深度规则，否则无法被正常加载。

### 覆盖范围

每个省份包内可覆盖如下子系统（注意：实际存在的子系统包多于基础列表）：
- `smr/` —— 基金收入业务逻辑
- `smrts/` —— 基金支出业务逻辑
- `smsbm/` —— 银行直连业务逻辑
- `smfm/` —— 基金使用管理
- `smfs/` —— 基金周转
- `smc/` —— 公共基础服务/安全
- `smrm/` —— 对账逻辑
- `smcc/` —— 清算/对账（宁夏专用，如 `ningxia/smcc/`）
- `smda/` —— 数据接入（山西 `shanxi/smda/`）
- `forward/` —— 转发（黑龙江 `heilongjiang/forward/`）
- `job/medical/province/` —— 定时任务（内蒙古 `neimeng/`）
- `finance/` —— 财务（浙江 `zhejiang/finance/`）
- `common/` —— 公共工具（四川 `sichuan/common/`、新疆兵团 `xjbingtuan/common/`）
- `emuns/` —— 枚举（新疆兵团 `xjbingtuan/emuns/`）
- `secret/` —— 密钥管理（重庆、福建、青海、山西、天津）
- `dubbo/` —— Dubbo RPC 配置（重庆）
- `processor/` —— 消息处理器（福建）

### 覆盖机制

省份定制通过 Spring Bean 覆盖机制实现：
1. **同名覆盖**：在 smip 中定义与基线模块同名的 `@Service`/`@Controller`，Spring 使用省份版本替代基线版本
2. **`@Primary`**：标记省份实现为优先注入
3. **Bean 条件加载**：部分省份使用 `@ConditionalOnProperty` 根据配置决定是否生效

### 各省差异汇总

#### 加密差异（最重要的差异维度）

| 省份 | 加密提供商 | 加密方式 | 配置文件 |
|------|-----------|---------|---------|
| 重庆 | JIT（吉大正元） | SM2+SM4 数字信封 | jitconfigcq.properties |
| 山西 | JIT（吉大正元）远程 API | SM2+SM4 数字信封 | 无独立文件，使用 JitUtil |
| 新疆 | JIT（吉大正元）+ 动态密钥（独立实现） | SM2 签名 + SM4 加密 | cssconfig.properties |
| 福建 | 江南天安 HSM + 信安世纪 | SM4（HSM）+ SM3（NetSign） | netsignagent.properties |
| 天津 | SWXA（三未信安）HSM | SM4（密码机本地） | swsdsTj.ini |
| 青海 | SWXA（三未信安）HSM | SM4（密码机本地） | swsdsQh.ini |
| 海南 | 政务云密码平台 REST API | SM4/ECB/PKCS7 | application.yml + 字典表配置 |
| 甘肃 | 自定义 GsMessageEncrytionImplHandle | 甘肃特定加密 | 无独立配置文件 |
| 河南 | 自定义 HeNMessageEncrytionImplHandle | 河南特定加密 | 无独立配置文件 |
| 吉林 | 自定义 JlMessageEncrytionImplHandle | 吉林特定加密 | 无独立配置文件 |
| 内蒙古 | 独立 NmBankHttpServer（不继承新疆） | NMG 特定 | 无独立配置文件 |
| 广西 | 自定义 GxMessageEncrytionImplHandle | 广西特定 | 无独立配置文件 |
| 四川 | SM2+SM4（ScMessageEncrytionImplHandle） | SM2+SM4 | 无独立配置文件 |
| 浙江 | 自定义 ZjMessageEncrytionImplHandle | 浙江特定 | 无独立配置文件 |
| 新疆兵团 | 新疆兵团 SM2（XJBTMessageEncrytionImplHandle） | SM2 签名 | 无独立配置文件 |

**注意**：自定义加密类命名规则为 `<Province>MessageEncrytionImplHandle`，而不是简写形式（如 `HeNEncryption`/`JlEncryption`/`GxEncryption`/`ZjEncryption`）。

#### 银行对接差异

| 省份 | 特殊银行对接 | 说明 |
|------|------------|------|
| 海南 | 政务云密码平台 + 大批量大数据通道 | 独立 SMSBM 全套控制器/服务/仓库 |
| 新疆 | JIT + 动态密钥更新 | 完整的 SMSBM 控制器/服务/仓库栈 |
| 内蒙古 | NM103（ABC 变种） | 自定义 NmBankHttpServer（独立实现，非继承新疆） |
| 河南 | 自定义 HeNHttpServer | 河南专属 HTTP 服务端 |
| 吉林 | BOC 仅查询支付进度（其他跳过） | JlQueryPayProgressJob 专门处理 BOC，其他银行跳过 |
| 江苏 | JS001 支付中心 | 自定义 SMSBM 选择器 |
| 福建 | HSM 硬件加密 | 独立 SMSBM 覆盖 |
| 重庆 | 东软 RPC（Dubbo） | dubbo-config-chongqing.xml |

**关于吉林 BOC 的修正说明**：`JlQueryPayProgressJob.java` 第 69-70 行的逻辑为 `if(!BankCodeEnum.BOC.getCode().equals(bankCode)){...continue;}`，即**仅处理 BOC 交易**（其他银行被跳过），而非跳过 BOC。

#### 业务逻辑差异

| 省份 | 差异点 |
|------|--------|
| 重庆 | 收入、支出、加密密钥管理全套覆盖 |
| 海南 | 收入、支出、基金使用、基金周转、银行对接全套覆盖 |
| 新疆 | 收入+支出+基金使用+基金周转+对账+银行对接，最大的覆盖量 |
| 河南 | 收入+支出+银行对接全套覆盖 |
| 福建 | 支出+银行对接+处理器覆盖 |
| 甘肃 | 收入+支出+银行对接控制器覆盖 |
| 陕西 | 支出 + 安全服务（smc/safe/） |
| 山西 | 仅加密（JitUtil 远程 API） |
| 天津 | 仅加密（SWXA 配置） |
| 黑龙江、河北、安徽、江西、辽宁、宁夏、山东、抚顺、葫芦岛、盘锦、沈阳、铁岭、营口等 | 业务逻辑微调，增量较小 |

---

## 三、前端差异

### 构建时多区域 SPA

前端通过构建时选择入口实现多区域。Webpack 根据 `NODE_ENV` 选择入口文件。

**配置文件**：`workFront/build/HtmlWebpackPlubin.js`

**地区入口**：`workFront/src/entrys/<REGION>/`

| 入口标识 | 地区 |
|---------|------|
| ALL | 全部（聚合所有省份功能的入口包） |
| SMIFC | 基线 |
| CQYB | 重庆 |
| FJMYB | 福建 |
| HNQYB | 海南 |
| XJYB | 新疆 |
| XJBTYB | 新疆兵团 |
| NMYB | 内蒙古 |
| GSYB | 甘肃 |
| SCYB | 四川 |
| HNYYB | 河南（注意为 HNYYB，非 HNYB） |
| NXYB | 宁夏 |
| ZJYB | 浙江 |
| AHYB | 安徽 |
| GXYB | 广西 |
| HBJYB | 河北 |
| HLJYB | 黑龙江 |
| JXYB | 江西 |
| SHENYANGYB | 沈阳 |
| JLYB | 吉林 |
| SXQYB | 陕西 |
| SXJYB | 山西 |
| FUSHUNYB | 抚顺 |
| LNYB | 辽宁 |
| QINGDAOYB | 青岛 |
| ...以及其他 |

**实际数量说明**：`entrys/` 目录下有 27 个地区入口目录，但 `HtmlWebpackPlubin.js` 的 `projectList` 中只定义了 26 个映射。GZYB（贵州）目录存在但未在 `projectList` 中注册，因此不参与构建。

### 地区入口文件职责

每个 `entrys/<REGION>/` 目录下三个核心文件：

1. **main.js** —— Vue 实例化入口，引入全局组件、过滤器、指令
2. **router.js** —— 路由配置，`extends commonRouter` 后通过 `pushRouter()` 注入地区特定路由
3. **protoMethods.js** —— 设置 `Vue.prototype.projectFlag`，包含 `baseUrl`、`baseName` 等运行时配置。注：ALL 和 SMIFC 的 name 参数不同（ALL vs SMIFC），是不同的构建产物。

### 页面覆盖机制

**自定义页面位置**：`workFront/src/pages/projects/<REGION>/`

当地区需要差异化页面时，通过各省 `router.js` 中 `import('@/pages/projects/<REGION>/...')` **显式导入**页面组件，而非 Webpack 自动优先匹配。Webpack resolve 配置中没有 `pages/projects/` 优先的别名或 fallback 配置。

### 运行时配置

`static/config.js` 提供运行时特性开关（feature flags），例如：

```
window.configData = {
  baseUrl: 'https://...',  // API 基础地址
  enableAuth: true,        // 是否启用权限认证
  // ... 其他区域特定配置
}
```

### API 地址差异

- 开发环境：`/apis` 代理到 `http://10.16.23.71:9081/`
- 生产环境：`Vue.prototype.projectFlag.baseUrl` （从 `window.configData.baseUrl` 读取）
- 部分省份有独立的 API 网关地址

---

## 四、配置覆盖模式总结

### 配置优先级（高到低）

```
1. smcs/resources/ 省份特定加密配置文件（jitconfigcq.properties、swsdsTj.ini、netsignagent.properties 等）
2. smcs/resources/ 合包公共配置文件（application.yml、application-ext.yml 等）
3. smc/resources/ 基础模块配置文件
4. application.yml / application-ext.yml 主配置（数据源、Redis、Dubbo 等）
```

**注意**：`smip/<province>/resources/` 目录下没有 `.properties`、`.yml` 或 `.ini` 配置文件。省份加密配置文件实际集中放置在 `smcs-8.31/src/main/resources/` 下。`smip` 模块的 `resources/` 目录下只有 mapper XML 和 Velocity 模板（`.vm`）文件。

### 生效机制

- `app.province` 配置驱动 ProvinceTypeFilter 加载对应省份 Bean
- 配置文件在 Maven 构建时通过 profile 选择
- 前端在构建时通过 `NODE_ENV` 选择入口

---

## 五、新增地区/省份的步骤

### 后端

1. 在 `smip` 模块下创建省份包：`com.yonyougov.smifc.<province>/`
2. 在该包下创建需要覆盖的子包（smr、smsbm、smrts 等）
3. 书写覆盖的 Service/Controller，确保 Bean 名称或类型与基线一致
4. 如需特定加密方案，实现 `EncryptionHandle` 接口，并在 `EncryptEnum` 中注册
5. 如需特定银行通信，在 `smbe` 中添加银行客户端实现
6. 将配置文件（加密配置、银行属性等）放入 `smcs/resources/`
7. 在 `application.yml` 中配置该省份启动参数

### 前端

1. 在 `workFront/src/entrys/` 下创建省份入口目录
2. 创建 main.js、router.js（extend commonRouter）、protoMethods.js
3. 如需自定义页面，在 `workFront/src/pages/projects/<REGION>/` 下创建，通过 router.js 显式 import
4. 在 `build/HtmlWebpackPlubin.js` 的 projectList 中添加映射
5. 如需运行时特性开关，在 `static/config.js` 中添加配置

---

## 六、典型陷阱

1. **ProvinceTypeFilter 深度匹配**：过滤规则基于 `className.split(".")[3]`，因此包深度必须精确为 3 层（`com.yonyougov.smifc.<province>`），如果省份内部再套子包，内部子包的 Bean 会无法被加载。

2. **同名 Bean 覆盖的隐式规则**：省份 Service 覆盖基线时，如果 Bean 名称不一致（如 `@Service("abcService")` vs `@Service("abcServiceImpl")`），会同时存在两个 Bean，导致 `@Autowired` 注入时按类型匹配到错误实现。

3. **前端路由冲突**：省份自定义路由如果与基线路由的 path 相同但组件不同，需要在 router.js 中明确覆盖，否则可能加载错误的组件。

4. **加密配置文件缺失**：新增省份时最容易遗漏的是加密配置文件。每个省份的加密提供商都需要对应的 JAR 依赖和配置文件。构建时必须确保 `smcs/resources/` 下有正确的配置文件，否则启动时会因签名验证失败而报错。

5. **跨省份代码影响**：`smbe/direct/client/xinjiang/handle/` 目录集中存放了约 10 个省份的加密处理实现（Fj、Gs、Gx、HeN、Jl、NMG、Sc、XJBT、XJ、Zj + 默认 + SM2+SM4），修改该目录下某个文件可能影响多个省份的银行加密功能。修改前务必确认该文件被哪些省份使用。
