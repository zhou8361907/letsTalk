---
topic: SMIFC 模块全景与依赖关系
pages:
  - workFront/src/pages/common/smc/
  - workFront/src/pages/common/smsbm/
  - workFront/src/pages/common/smr/
  - workFront/src/pages/common/smrts/
  - workFront/src/pages/common/smrm/
  - workFront/src/pages/common/smrw/
  - workFront/src/pages/common/smps/
  - workFront/src/pages/common/smcm/
  - workFront/src/pages/common/smda/
  - workFront/src/pages/common/smam/
  - workFront/src/pages/common/smdm/
  - workFront/src/pages/common/smfm/
  - workFront/src/pages/common/smfs/
  - workFront/src/pages/common/smcs/
  - workFront/src/pages/common/smdmt/
  - workFront/src/pages/common/workflow/
  - workFront/src/pages/common/workSpace/
backend:
  - workBack/com.yonyougov.smc-8.31/
  - workBack/com.yonyougov.smsbm-8.31/
  - workBack/com.yonyougov.smbe-8.31/
  - workBack/com.yonyougov.smr-8.31/
  - workBack/com.yonyougov.smrm-8.31/
  - workBack/com.yonyougov.smrw-8.31/
  - workBack/com.yonyougov.smps-8.31/
  - workBack/com.yonyougov.smcm-8.31/
  - workBack/com.yonyougov.smda-8.31/
  - workBack/com.yonyougov.smcs-8.31/
  - workBack/com.yonyougov.smip-8.31/
---

# SMIFC 模块全景与依赖关系

## 模块总览

SMIFC（医保基金财务控制平台）采用多模块分层架构，包含 11 个 Maven 模块 + 1 个省份定制模块（smip）。每个模块对应一个业务子领域。以下按业务域分组说明。

---

## 一、基础核心模块

### smc（com.yonyougov.smc）—— 通用基础库

**业务定位**：全平台的"底座"模块，提供所有其他模块共用的实体定义、MyBatis Mapper（约 134 个）、常量枚举、Activiti 工作流引擎集成、Redis 缓存配置、加密工具（SM2/SM3/SM4）、以及 60+ 公共控制器。

**关键控制器**：
- `DictController` —— 数据字典（统一维护码表）
- `BillController` —— 单据通用管理
- `InsuranceAccoController` —— 险种账户配置
- `BankAccountConfigController` —— 银行账户配置
- `BusinessTypeController` —— 业务类型管理
- `FundController` —— 基金款项管理（表名 SMC_FUND）
- `UnitAccountController` —— 单位账户管理
- `WorkflowFormController` —— 工作流表单
- `ActTaskController` —— 工作流任务

**加密工具包路径**：`smc/busapi/sign/` 下包含 JitUtil（吉大正元）、SWXASM4Util（三未信安）、JNTASM4Util（江南天安）、XASJSM3Util（信安世纪）等，是全省加密调度的核心出口。

**依赖关系**：被所有其他模块依赖（smda、smsbm、smr、smrm、smrw、smps、smcm、smip 全部依赖 smc）

**前端页面**：`workFront/src/pages/common/smc/` 包括：系统选项、字典管理、费用项目、业务支付、险种账户配置、银行账户配置、基金款项、过渡户管理、支付密码管理、黑名单、年度预算录入、月度年度预算管理、业务类型、工作流失败重试等。

---

## 二、医保-银行直连模块

### smsbm（com.yonyougov.smsbm）—— 医保银行直连管理

**业务定位**：核心的银行对接管理层。接收前端发起的支付/查询指令，通过工厂模式分发到具体的银行处理器，管理支付单状态流转。

**关键架构组件**：
- `EncryptionHandleFactory` —— 加密处理器工厂（按银行代码分发到不同银行的加密实现）
- `SendBankBussinessHandleFactory` —— 业务分发工厂（按 BusinessHandleTypeEnum 分发到 40+ 业务操作）
- `BankHandleFactory` —— 银行通信处理器工厂

**关键组件位置**：`EncryptEnum`（常规定义编码和 HTTP Server 类名映射）位于 `com.yonyougov.smifc.common.constant`，属于 smsbm 模块。

**BusinessHandleTypeEnum 中的关键操作类型**：
- SEND_BATCH_PAY —— 批量支付
- SEND_SINGLE_PAY —— 单笔支付
- SEND_QUERY_BALANCE —— 余额查询
- SEND_QUERY_BATCH_PAY_PROCESS —— 批付进度查询
- SEND_QUERY_RETURN —— 回执查询
- 以及收入、连通性测试、电子单据下载、退票处理、省份特定操作（如 HN_RECEIVE_*）等共 40+ 操作

**关键 Controller**：
- `MedicalSendToBankController` —— 通用发往银行控制器（`/bdmp/medicalSend/`）
- `MedicalBankSingleController` —— 单笔支付查询控制器（`/smsbm/getMedicalBankSingle/`）
- `MedicalBankController` —— 银行接口管理
- `DayBookController` —— 日记账管理（财务云日记账，由银行流水生成）
- `PaymentsDetailController` —— 支付明细跟踪
- `ReturnPayExceptionController` —— 退票异常处理
- `ElectronicStatementController` —— 电子对账单
- `WsServerController` —— WebService 服务端

**依赖**：smc（公共基础）、smbe（银行通信实现）

**前端页面**：`workFront/src/pages/common/smsbm/` 包括：银行配置、福建银行配置、海南 CA 认证、日志消息、批量支付、单笔支付、大批量支付、银医相关页面。

---

### smbe（com.yonyougov.smbe）—— 银行协议扩展

**业务定位**：底层银行通信实现模块，包含 15+ 家银行的具体客户端实现。处理 HTTP/HTTPS、Socket、WebService 等多协议发送与接收。包含 Velocity 模板用于按银行格式化报文。

**银行目录结构**：`direct/client/` 下按银行代码分包：
- abc/ —— 农业银行（Socket/XML）
- icbc/ —— 工商银行（HTTP/NC 签名）
- boc/ —— 中国银行（HTTP/Socket）
- ccb/ —— 建设银行（HTTP + DESede 加密 + MD5withRSA 签名）
- psbc/ —— 邮政储蓄银行
- rcc/ —— 农信社
- cib/ —— 兴业银行
- hainan/ —— 海南银行
- xinjiang/ —— 新疆定制加密（包含多省份加密实现）
- bfsh/ —— 上海银行
- cbe/ —— 其他银行客户端
- custom/ —— 自定义银行客户端
- icbca/ —— ICBC A 接入变体
- icbcb/ —— ICBC B 接入变体

**agent/ 目录**：仅包含 icbc/（工商银行代理模式），不包含海南或新疆代理代码。海南和新疆均在 direct/client/ 中实现。

**省份加密实现（位于 direct/client/xinjiang/handle/）**：
该目录集中存放了约 10 个省份的加密处理器，而非 15+：
- `FjMessageEncrytionImplHandle` —— 福建
- `GsMessageEncrytionImplHandle` —— 甘肃
- `GxMessageEncrytionImplHandle` —— 广西
- `HeNMessageEncrytionImplHandle` —— 河南
- `JlMessageEncrytionImplHandle` —— 吉林
- `NMGMessageEncrytionImplHandle` —— 内蒙古（独立实现，不继承新疆）
- `ScMessageEncrytionImplHandle` —— 四川
- `Sm2AndSm4MessageEncrytionImplHandle` —— SM2+SM4 混合（重庆等）
- `XJBTMessageEncrytionImplHandle` —— 新疆兵团
- `ZjMessageEncrytionImplHandle` —— 浙江
- `DefaultMessageEncrytionImplHandle` —— 默认

**依赖**：smsbm（业务调度）、smc（公共基础）

---

## 三、基金收支模块

### smr（com.yonyougov.smr）—— 基金收入管理

**业务定位**：管理医保基金的所有收入项，包括保费征收、财政补贴、转移收入、利息收入、下级上缴、上级补助等。

**关键 Controller**：
- `CollectionPlanController` —— 征收计划管理
- `FiscalSubsidyIncomeController` —— 财政补贴收入
- `IncomeSummaryController` —— 收入汇总
- `InterestIncomeController` —— 利息收入
- `TransferIncomeController` —— 转移收入
- `SubordinatePaymentIncomeController` —— 下级上缴收入
- `SuperiorSubsidyIncomeController` —— 上级补助收入
- `RefundController` —— 退款管理
- `UnKnowPayMentController` —— 未知来款处理
- `TreasuryReconController` —— 国库对账
- `SmrAdvancePaymentController` —— 预付款管理

**前端页面**：`workFront/src/pages/common/smr/` 包括：转移收入、利息收入、上级收入、下级收入、下级收入合并、财政补贴、其他收入、医保退费申请/审批、征收计划、转换科目、未知来款管理、票据管理、收入管理。

**依赖**：smc、mybatis

---

### smrts（非独立后端模块，属 smps 内部子域）

前端 `smrts` 目录指向基金支出管理页面：`workFront/src/pages/common/smrts/` 包括：摘要规则、支出计划规则、基金支出审批、医保办公、转账支出管理、支付结果查询、招标支付计划、异地就医、支付退款管理、财务管理、采购合同、拆分规则、药品采集、日结算、预付款台账、预付款回收、两定机构信息采集表等。

后端所有 smrts 相关的控制器、服务和实体实际位于 **smps 模块**的 `com.yonyougov.smifc.smrts` 包下。smrts 是 smps 模块内部的一个子域，并非跨模块分散。

---

### smps（com.yonyougov.smps）—— 预结算与基金分配管理

**业务定位**：管理预付结算基金比例、月度支付申请、结算账户、单位定额管理、基金分配和现金结算。

**关键 Controller**：
- `FundRatioController` —— 基金比例配置
- `MonthPayApplyController` —— 月度支付申请
- `PaySettleAccountController` —— 结算账户
- `UnitNormController` —— 单位定额
- `UnitNormChgSetController` —— 定额变更
- `UnitNormSplitController` —— 定额拆分
- `UnitNormTransController` —— 定额流转
- `CutDataController` —— 扣款/黑名单管理
- `DelayBlackListController` —— 延迟黑名单
- `TemplateController` —— 模板管理
- `MoneyRecordController` —— 资金记录

**子业务域**：smcs（现金结算）、smdm（调整）、smfm（基金使用管理）、smfs（基金周转）、smrts（基金支出）

**前端页面**：`workFront/src/pages/common/smps/` 包括：预指标管理、预结算指标管理、预延迟管理、预扣款管理、预下月申请、预指标结算、预单位变更管理、观察名单、预指标配置。

**依赖**：smc

---

## 四、对账核销模块

### smrm（com.yonyougov.smrm）—— 多方智能对账系统

**业务定位**：自动对账引擎，对医保基金账、银行账、内部账进行三方核对。包含三个版本的对账逻辑（v2/v3），支持银行流水导入、对账单管理、数据源配置、汇总上报审批、异常处理。

**关键组件**：
- 控制器位于根级 `controller/` 目录下（无 `v1/controller` 子包）：
  - `SmrmPlanController` —— 对账计划管理
  - `SmrmTableController` —— 对账表管理
  - `CollectRecController` —— 汇总对账
  - `DetailRecController` —— 明细对账
- `v2/controller/` —— 第二版对账控制器
- `v3/controller/` —— 第三版对账控制器

**关键实体**：
- `CollectRecStatement` —— 汇总对账记录
- `DetailRecRecord` —— 明细对账记录
- `DetailRecDiff` —— 对账差异记录

**前端页面**：`workFront/src/pages/common/smrm/` 包括：银行对账单、对账单管理（多版）、对账数据源配置、对账配置、汇总上报提交/审批。

**依赖**：smc、smsbm（获取银行流水）、mybatis

---

## 五、风险监控模块

### smrw（com.yonyougov.smrw）—— 基金运行风险监控

**业务定位**：监控基金运行中的异常情况，生成风险预警，追踪基金使用合规性。可配置预警规则和任务，自动扫描疑点数据。

**关键 Controller**：
- `AlertRuleController` —— 预警规则配置
- `AlertTaskController` —— 预警任务管理
- `AlertDoubtDataController` —— 疑点数据
- `AlertEvidenceDataController` —— 证据数据
- `RiskReportTemplateController` —— 风控报告模板
- `RiskReportRecordController` —— 风控报告记录
- `AlertDataSourceController` —— 预警数据源
- `TaskEmailController` —— 邮件通知
- `AlertDataStatisticsController` —— 数据统计

**前端页面**：`workFront/src/pages/common/smrw/` 包括：预警规则、预警点管理/提交/审批、信息报送、消息发送日志、自动扫描、手工扫描/预警、数据源配置、报告模板、报告查看、基金监控大盘。

**依赖**：smc（从中获取公共数据）

---

## 六、配置与表单模块

### smcm（com.yonyougov.smcm）—— 自定义表单与动态配置

**业务定位**：系统管理员通过此模块自定义表单布局、配置数据源表、定义动态查询 API，集成 URule 规则引擎。

**关键 Controller**：
- `CommonAppController` —— 通用应用配置
- `LoadController` —— 表单加载
- `SelectApiController` —— 动态查询 API
- `SfcDataSourceController` —— 数据源配置
- `SfcPlanController` —— 数据源计划

**前端页面**：`workFront/src/pages/common/smcm/` 包括：表单生成器、初始化表、数据源列表、打印模块设置、子表单生成器。

**依赖**：smc

---

## 七、数据交换模块

### smda（com.yonyougov.smda）—— 数据接入与交换

**业务定位**：处理 SMIFC 与外部系统之间的 ETL 数据交换。支持 HTTP、WebService、文件等协议。管理交换计划、数据源配置、收入数据导入、数据访问日志。

**关键 Controller**：
- `DataAccessController` —— 数据访问（非 DataImportBusiTypeConfigController）
- `ExchangeController` —— 数据交换管理（非 DataExchangeController）
- `DataSourceConfigController` —— 数据源配置（非 DataSourcesListController）
- `DataPushConfigController` —— 数据推送配置

**前端页面**：`workFront/src/pages/common/smda/` 包括：数据导入业务类型配置、数据交换、目标表配置、数据源列表、数据推送配置/任务、数据源查询、转换科目配置、数据接入规则校验、基金划转类型。

**依赖**：smc、mybatis

---

## 八、合包启动模块

### smcs（com.yonyougov.smcs）—— 产品合包工程

**业务定位**：唯一可启动的 Spring Boot 模块，包含 `MifcApplication` 主类和所有 Spring 配置。这是最终部署运行的入口，聚合了所有模块的 Bean。

**关键内容**：
- `MifcApplication` —— 主启动类（通过 `@ComponentScan` 的 excludeFilters 引入 `ProvinceTypeFilter`）
- `application.yml` / `application-ext.yml` —— 主配置（数据源、Redis、Dubbo 等）
- `sharding-config.yml` —— 分库分表配置（ShardingSphere）
- `SignClientConfig` —— 签名客户端配置（JIT 证书调用）
- 各省加密配置文件：jitconfigcq.properties（重庆）、cssconfig.properties（新疆）、netsignagent.properties（福建）、swsdsQh.ini（青海）、swsdsTj.ini（天津）
- JasperReports 模板
- `SysGeneratorController` —— 代码生成器
- 自定义 ShardingSphere 策略（含路径 typo：rg/apache 而非 org/apache）
- PageHelper 自定义分页

**注意**：smcs 依赖所有其他模块，任何模块不应反向依赖 smcs，否则产生循环依赖。

---

## 九、银行账户管理模块

### smam（前端模块）

**前端页面**：`workFront/src/pages/common/smam/` 包括：银行信息管理、单位账户管理、流水记录管理、财务对账记录/审批、专户收支管理、跨单位账户查询、银行流水查询。

后端对应功能分散在 smc（账户实体）、smsbm（银行流水同步）、smrm（对账）等模块中。

---

## 十、其他前端模块

| 前端模块 | 路径 | 业务说明 |
|---------|------|---------|
| smdm | `workFront/src/pages/common/smdm/` | 调整管理：单据计划配置、调整凭证、调整审批 |
| smfm | `workFront/src/pages/common/smfm/` | 基金使用管理：支出制作/审批、单位支出、财务支出 |
| smfs | `workFront/src/pages/common/smfs/` | 基金周转：余额制作/审批/合并、利息制作/审批、基金调度 |
| smcs | `workFront/src/pages/common/smcs/` | 现金结算：现金控制、日结、数据审批 |
| smdmt | `workFront/src/pages/common/smdmt/` | 异地就医：两定结算申请/审批、上划清算、预拨付、下划清算 |
| smsa | `workFront/src/pages/common/smsa/` | 统计分析：数据源配置、分析面板/图表、视图列表、SQL 编辑、大屏 |
| workflow | `workFront/src/pages/common/workflow/` | 工作流引擎：BPMN 编辑、接口、工作流列表、类型配置 |
| workSpace | `workFront/src/pages/common/workSpace/` | 工作台首页：待办、通知、通用工具、支付相关 |
| robot | `workFront/src/pages/common/robot/` | RPA/数字员工：场景设置、插件发布/下载、监控管理 |
| smcc | `workFront/src/pages/common/smcc/` | 清算/对账管理 |

---

## 十一、省份定制模块

### smip（com.yonyougov.smip）—— 省份定制

**业务定位**：包含 30 个省份/城市的业务定制覆盖。这是实现"一套代码、多省部署"的核心机制。

**省份列表**（按包名）：anhui、chongqing、fujian、fushun、gansu、guangxi、hainan、hebei、heilongjiang、henan、huludao、jiangsu、jiangxi、jilin、liaoning、neimeng、ningxia、panjin、qingdao、qinghai、shaanxi、shanxi、shenyang、sichuan、tianjin、tieling、xinjiang、xjbingtuan、yingkou、zhejiang

**加载机制**：`ProvinceTypeFilter`（定义于 smc 模块的 `com.yonyougov.smifc.smc.config.ProvinceTypeFilter`，作为 `@ComponentScan` 排除过滤器使用）基于 Spring TypeFilter 机制。在 `application.yml` 中配置 `app.province` 属性，过滤规则按包深度 level 3（`className.split(".")[3]`）匹配模块路径，仅在匹配时加载对应省份的 Bean。同时通过 `ProvinceEnum.getByCode()` 验证省份代码是否在枚举范围内，过滤不在枚举中的类。

**覆盖范围**：每个省份包内可覆盖 smc、smr、smsbm、smrts、smfm、smfs、smrm 等任意模块的 Service/Controller 实现。smip 也是 smps 模块内子域的省份定制包存放位置。

**详情见 `regional-differences.md`**。

---

## 十二、模块间典型调用链路

```
前端页面 → 后端 Controller
    → 本模块 Service
        → smc 公共 Service/Mapper（数据字典、账户、基础实体）
        → 其他模块 Service（Dubbo/Spring 注入）
    → 返回前端

银行支付链路（最复杂）：
前端 smsbm 页面 → MedicalSendToBankController
    → SendBankBussinessHandleFactory.bussinessHandle()
        → EncryptionHandleFactory.encryption()   （smc + smsbm）
            → smbe BankHandle.sendBank()         （具体银行通信）
                → 银行返回
            → EncryptionHandleFactory.decryption()
        → 结果更新 MedicalBankEntity 状态
    → 返回前端
```

**注意**：smip 省份 Bean 通过 Spring 的 Bean 覆盖机制（`@Primary` 或同名的 `@Service`/`@Controller`）来替换 smc/smsbm/smr/smrts 基线的实现，开发省份定制时需确保 Bean 名称/类型与基线一致。

---

## 十三、关键技术选型

- **Java 版本**：1.8
- **框架**：Spring Boot 2.2.5.RELEASE + Spring Framework 5.2.4.RELEASE（主），父 POM 同时定义了 `<spring.version>4.3.18.RELEASE` 用于遗留 Hibernate 依赖，存在版本混合情况
- **ORM**：MyBatis 3.5.2 + tk.mybatis 4.1.5（主力）+ Hibernate 3.6.10.Final（遗留，使用 spring-hibernate3 集成模块）
- **数据库**：MySQL 8.0.19（主）、Oracle 12.2.0.1（备选）、华为 GaussDB 100
- **分库分表**：Apache ShardingSphere 5.0.0
- **工作流**：Activiti
- **构建工具**：Maven（父 POM smifc-parent-8.31）
- **缓存**：Redis
- **定时任务**：Xxl-Job（扩展 IJobHandler，使用 @JobHandler 注解）
- **前端**：Vue 2.5.2 + Webpack 3.6.0
