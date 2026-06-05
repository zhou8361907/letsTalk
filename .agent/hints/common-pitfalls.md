---
topic: SMIFC 开发常见陷阱与注意事项
pages:
  - workFront/src/pages/common/smsbm/
  - workFront/src/pages/common/smrm/
  - workFront/src/pages/common/smr/
  - workFront/src/pages/common/smrts/
backend:
  - workBack/com.yonyougov.smcs-8.31/
  - workBack/com.yonyougov.smsbm-8.31/
  - workBack/com.yonyougov.smbe-8.31/
  - workBack/com.yonyougov.smip-8.31/
  - workBack/com.yonyougov.smc-8.31/
---

# SMIFC 开发常见陷阱与注意事项

## 一、开发环境与流程陷阱

### 1.1 多模块构建耗时

SMIFC 包含 11 个 Maven 模块，全量构建需要较长时间。建议在开发时：

- 只构建修改的模块：`mvn install -pl com.yonyougov.smsbm -am`
- 使用 `smifc.version` 版本属性（当前 `8.31.20-SNAPSHOT`）注意 SNAPSHOT 依赖的缓存刷新
- `smcs` 是唯一可启动模块，调试时必须启动 smcs

### 1.2 License 过期问题

构建配置中有硬编码的 License 过期日期（2021-03-31）。如在此日期后构建，可能失败。处理方式：

- 检查项目的 License 校验逻辑，可能需要修改过期日期或注释 License 校验
- 在 Maven profile 中配置 `skipLicenseCheck=true` 等方式跳过

### 1.3 双 ORM 并存

项目中同时使用 Hibernate 3.6.10.Final（约 2012 年版本，通过 `spring-hibernate3` 集成模块引入）和 MyBatis 3.5.2：

- Hibernate 仅用于遗留代码，新开发应该使用 MyBatis
- 事务管理需注意：两者使用不同的 `PlatformTransactionManager`，混用可能导致事务失效
- Hibernate 版本极旧（3.6），存在已知的安全漏洞和兼容性问题，不建议扩展使用 Hibernate

### 1.4 ShardingSphere 分库分表

使用 ShardingSphere 5.0.0 进行分库分表：

- 自定义分片策略目录路径存在 typo：`rg/apache` 而非 `org/apache`（路径 `smcs/src/main/java/rg/apache/`）。需确认 classpath 加载是否正常，如果缺失需添加符号链接或调整配置
- 如果新增分片字段，需同步修改分片策略实现
- ShardingSphere 5.0.0 与部分 SQL 语法不兼容，尤其是 JOIN 和子查询

### 1.5 自定义 PageHelper 分页

项目使用自定义 Fork 的 PageHelper（`com.yonyougov.common.pagehelper`），非标准的 `com.github.pagehelper`：

- 引入分页依赖时注意坐标，不要误用标准版
- 自定义版可能与标准版 API 有细微差异
- 分页插件与 ShardingSphere 可能存在兼容性问题

---

## 二、银行对接陷阱

### 2.1 加密 Provider 类冲突

**问题**：项目引入了 BouncyCastle、JIT（吉大正元）、FishermanJCE（渔人/四川医保）、SWXA（三未信安）、JNTA（江南天安）、XASJ（信安世纪）等多个加密库，提供相同的 SM 算法实现，存在 Provider 冲突风险。**Kona 不是本项目使用的加密库**。

**避免方式**：
- 在 `$JAVA_HOME/jre/lib/security/java.security` 中配置正确的 Provider 排序
- BouncyCastle 通常应排在最后（因为它的 SM 算法实现可能与其他厂商冲突）
- 启动日志中出现 `NoSuchAlgorithmException: SM4` 或 `SM4 not available` 通常是 Provider 排序问题
- 可使用 `Security.getProviders()` 在启动时打印所有 Provider 的加载顺序用于排查

### 2.2 sun.misc.BASE64Decoder 依赖

**问题**：ICBC 加密中使用 `sun.misc.BASE64Decoder`，该 API 在 Java 9+ 中已被标记为移除。当前使用 Java 8 可以正常工作，但存在以下风险：

- 升级 JDK 版本会导致 ICBC 对接功能不可用
- 需要替换为 `java.util.Base64` 才能迁移到更高版本 JDK
- 项目中有多处使用 `sun.misc.*` 的地方，建议全局搜索替换

### 2.3 银行超时处理

**问题**：支付发送到银行后，银行响应可能超时。各银行超时配置不同，**不存在统一的默认值**。

**注意**：
- ICBCBankHandle 设置超时为 600000ms（10 分钟）
- ABCBankHandle 设置超时为 120000ms（2 分钟）
- BankHandlerDTO javadoc 写明默认 60 秒
- 批量支付可能需要更长的超时，需在 `BankHandlerDTO` 中按银行设置
- 超时后系统会将状态更新为 `SEND_FAIL`，但银行侧可能已经处理成功，需要后续通过进度查询接口核对
- 基金支付对时效性要求高，超时参数需要和业务方确认

### 2.4 重复支付防护

**问题**：使用 `@RepeatSubmit` 注解 + Redisson 分布式锁防重，但存在边界情况。

**注意**：
- 锁超时时间必须大于业务处理时间，否则锁自动释放后重复请求可能通过
- 分布式锁依赖于 Redis，Redis 宕机时防重机制失效
- 极端情况下（网络重传、客户端重试）可能出现重复支付，需要设计对账和冲正机制

### 2.5 银行字符集不一致

**问题**：各银行使用的字符集不同。

- ICBC：GBK
- ABC：GBK
- CCB：UTF-8（注意 CCB 明确使用 UTF-8，与多数银行不同）
- 部分银行使用 UTF-8
- 报文组装时需按银行要求设置正确的字符集
- 响应解析时同样需要匹配银行使用的字符集，否则可能出现乱码或验签失败

### 2.6 银行服务端模式

**问题**：部分银行采用 SMIFC 启动 HTTP Server 等待银行回调的模式（海南、新疆、河南、内蒙古、吉林）。

**陷阱**：
- 服务端端口需预先分配且不能与其他服务冲突
- 需配置防火墙允许银行 IP 访问
- 需配置 SSL 证书（如果使用 HTTPS）
- SMIFC 下线维护期间，银行发起的回调会失败
- 服务端的线程池配置需与交易量匹配，否则高并发时可能拒绝服务

### 2.7 双代码路径维护

**问题**：smbe 模块中存在 `direct.client.*` 和 `agent.*` 两种代码路径。但 `agent/` 目录下仅包含 ICBC 代理模式代码，**不包含**海南或新疆的代理实现。海南和新疆均在 `direct/client/` 下实现。

- 修改代码前需确认当前交易走的是哪条路径
- ICBC 存在标准 direct 和 agent 两种路径，需区分
- 修复 Bug 时可能一条路径修复了，另一条路径未修复

### 2.8 回执状态不一致

**问题**：支付发送成功后，银行的最终回执可能延迟到达。

- `SEND_SUCC` 不代表支付最终成功，必须等待 `BACK_SUCC`
- 部分银行可能长期不回执，需要定时查询机制（轮询），通过 Xxl-Job 定时任务实现
- 吉林 BOC 的处理逻辑：`JlQueryPayProgressJob` 是专门处理 BOC 交易的定时任务，它**仅处理 BOC**的交易查询（其他银行被跳过），而非跳过 BOC。注意方向不要搞反。

### 2.9 ICBC NC 签名服务说明

**问题**：ICBC 的 NC 签名使用 HTTP POST，Content-Type 为 `INFOSEC_SIGN/1.0`。签名响应为带 `<sign>` 标签的 XML，需解析提取签名值。使用 `sun.misc.BASE64Decoder` 进行 Base64 解码。

---

## 三、省份定制陷阱

### 3.1 ProvinceTypeFilter 深度限制

**问题**：ProvinceTypeFilter 使用 `className.split(".")[3]` 进行包深度匹配。

**后果**：
- 包结构必须严格为 `com.yonyougov.smifc.<province>` 的三层深度
- 省份包内如果存在 `com.yonyougov.smifc.<province>.smr.config` 等四级包，其中的 Bean 可能不会被加载
- 如需四层包结构，必须修改 TypeFilter 逻辑或使用其他加载方式

### 3.2 同名 Bean 覆盖陷阱

**问题**：省份通过同名 Service/Controller 覆盖基线实现时，如果 Bean 名称不一致，两个实现会同时存在。

**后果**：
- `@Autowired` 注入时按类型匹配到哪个实现具有不确定性，可能注入基线实现而非省份定制实现
- 解决方法：确保省份实现使用与基线完全相同的 `@Service("beanName")` 或 `@Controller` 名称

### 3.3 加密配置文件遗漏

**问题**：新增省份时，加密配置文件容易遗漏。

**检查清单**：
- 省份是否需要 JIT/SWXA/JNTA/XASJ 等加密提供商？
- 对应的配置文件是否已放入 `smcs/resources/`？
- 配置文件名前缀是否与 `app.province` 值匹配？
- providers 是否已在 `java.security` 中配置？

### 3.4 跨省份代码共享风险

**问题**：`smbe/direct/client/xinjiang/handle/` 目录集中存放了约 10 个省份的加密处理实现（Fj、Gs、Gx、HeN、Jl、NMG、Sc、XJBT、XJ、Zj + 默认 + SM2+SM4 混合）。注意路径包含完整的 `direct/client` 前缀。

**后果**：
- 修改该目录下某个文件可能影响多个省份的银行加密功能
- 修改前必须确认影响范围
- 新增省份时如果实现与其他省份类似，优先考虑复用而非复制

---

## 四、常见 Bug 模式

### 4.1 金额精度问题

**问题**：数据库中使用 `DECIMAL` 或 `BIGINT` 存储金额，Java 中使用 `BigDecimal` 或 `Long`。

**常见 Bug**：
- 金额转换时精度丢失（数据库中存 100.50，Java 读取为 100.5）
- 分/元单位转换错误（数据库中存分，页面上显示元，反之亦然）
- 银行报文中的金额格式要求各不相同（有的要求 12 位定长，有的要求小数点后 2 位）

### 4.2 支付状态机不一致

**问题**：支付状态流转可能因异常路径导致状态不一致。

**完整状态转移**：
```
PRESENDING (0) -> SENDING (1) -> SENDINGSUCCESS (2)/SENDINGFAILURE (-2)
                                    |
                            TRANSFERSUCESS (3)/TRANSFERFAILURE (-3)
                                    |
                              PAYSUCCESS (4)
                                    |
                         RETURN_SUCCESS (6)
```
其他重要状态：
- `SIGN_SUCC (04)` / `SIGN_FAIL (05)` —— 签名成功/失败
- `BANK_PROCCESS (10)` —— 银行处理中（注意拼写为 PROCCESS 非 PROCESS）
- `RE_PAYED (11)` —— 重新支付
- `CANCEL_PAY (09)` —— 撤单/止付
- `BACK_PROCESSING (14)` —— 回执处理中
- `VALIDATEFAILURE (-9)` —— 校验失败
- `REWRITE_SUCCESS (7)` / `REWRITE_FAILURE (-7)` —— 重写成功/失败

**常见 Bug**：
- 网络超时导致状态停留在 SENDING，未按预期转为 SEND_FAIL
- 银行已成功但系统记录为失败（需对账修复）
- 同一批次不同单据的状态不一致

### 4.3 时间戳与时区

**问题**：银行接口对时间戳格式要求各异，且涉及时区问题。

- 大多数银行使用 yyyyMMddHHmmss 格式
- 部分银行要求使用 Unix 时间戳
- 系统默认时区为北京时间（GMT+8），但服务器配置可能不同
- 跨日交易的日期边界处理

### 4.4 前端 API 路径差异

**问题**：开发环境和生产环境的 API 路径不同。

- 开发环境：`/apis` 代理到 `http://10.16.23.71:9081/`
- 生产环境：`window.configData.baseUrl`
- 不同省份的 API 网关地址不同
- 部分省份使用独立域名部署

### 4.5 权限与角色配置

**问题**：前端按钮级权限通过 `ResState.do` 调用验证，依赖 `menuId` 和 `roleId`。

- 新功能开发时容易遗漏权限配置，导致用户看到按钮但无法操作
- 权限校验在 Axios 拦截器中通过 `menuid` header 传递
- 开发环境可能关闭权限校验（`enableAuth: false`），导致上线后暴露权限问题

---

## 五、数据库与 ORM 陷阱

### 5.1 MyBatis Mapper 数量庞大

smc 模块包含约 134 个 MyBatis Mapper 接口。新增功能时需注意：
- 不要重复创建已经存在的 Mapper
- XML 映射文件可能分散在多个模块中，搜索确认后再新增
- 使用 tk.mybatis 通用 Mapper 时注意泛型类型

### 5.2 多数据源配置

系统可能配置多个数据源（主数据库 + ShardingSphere 分片 + Oracle 备选）：
- 确认当前操作使用的数据源
- 跨数据源事务需要使用分布式事务方案（如 Seata 或 TCC）
- ShardingSphere 绑定表配置需与实际表结构一致

### 5.3 字段命名规范

数据库字段命名风格与 Java 属性命名的转换（下划线 vs 驼峰）：
- MyBatis 配置了自动驼峰转换 `mapUnderscoreToCamelCase=true`
- 确保数据库字段使用下划线命名（如 `fund_batch_num`），Java 属性使用驼峰命名（如 `fundBatchNum`）
- 不一致的命名会导致查询结果映射为空

### 5.4 数据库版本兼容

**问题**：项目使用 MyBatis XML mapper 文件，但**不使用** `databaseId` 属性区分数据库。

**实际方案**：通过 `mappings/oracle/` 和 `mappings/mysql/` 不同的 XML 文件目录区分数据库类型，在构建或部署时选择对应的 mapper 目录。

- 主要使用 MySQL 8.0.19，部分部署使用 Oracle 12.2.0.1 或 GaussDB 100
- SQL 语法在三种数据库间可能存在差异
- MyBatis XML 中尽量避免使用数据库特定的 SQL 函数

---

## 六、构建与部署陷阱

### 6.1 Maven 版本管理

- 父 POM `smifc-parent-8.31` 定义 `smifc.version=8.31.20-SNAPSHOT`
- SNAPSHOT 版本在多次构建时可能被本地缓存，需使用 `mvn -U` 强制更新
- 各模块版本统一由属性管理，修改版本时需同时修改父 POM 和子模块

### 6.2 打包格式

项目支持三种打包格式：
- `web.zip` —— 前端独立部署
- `web.war` —— 前端 WAR 包
- `smifc.war` —— 全量 WAR 包

不同部署模式对应的配置不同，打包前确认目标环境。

### 6.3 远程调试

- 使用 Dubbo 进行模块间 RPC 调用
- 调试跨模块问题时需要同时启动 Consumer 和 Provider 模块
- 服务注册中心（ZooKeeper/Nacos）配置需与开发环境一致
- 本地调试时可以绕过 Dubbo，直接注入本地 Service 实现

### 6.4 定时任务框架

项目使用 Xxl-Job 管理定时任务，通过实现 `IJobHandler` 接口和 `@JobHandler` 注解注册任务。例如：
- 支付进度轮询任务
- 对账定时任务
- 银行回执查询任务

了解此框架对排查后台任务相关问题至关重要。
