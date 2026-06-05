---
topic: 银行对接领域知识与支付流水线
pages:
  - workFront/src/pages/common/smsbm/
  - workFront/src/pages/common/smrm/
  - workFront/src/pages/common/smam/
backend:
  - workBack/com.yonyougov.smsbm-8.31/src/main/java/com/yonyougov/smifc/
  - workBack/com.yonyougov.smbe-8.31/src/main/java/com/yonyougov/smifc/
  - workBack/com.yonyougov.smc-8.31/src/main/java/com/yonyougov/smifc/smc/busapi/sign/
  - workBack/com.yonyougov.smip-8.31/src/main/java/com/yonyougov/smifc/
---

# SMIFC 银行对接领域知识

## 一、支持的银行及对接方式

SMIFC 平台支持 15+ 家银行/渠道的对接，每家银行的通信协议、加密方式、报文格式各不相同。以下按银行代码分类说明。

**注意**：各银行的代码枚举定义在 `BankCodeEnum`（smsbm 模块），共 35 个银行条目，远多于以下列出的主要银行。未列出的还包括 NMABC（内蒙农行）、PBOC（人民银行）、BFWF（潍坊银行）、BFSX（山西银行）、BFJS（晋商银行）、BFHS（徽商银行）、SJB（盛京银行）等地方性银行。

### ICBC（中国工商银行）—— 代码 102/102a/102b

**通信协议**：HTTP/HTTPS POST 调用银行 API，配合 NC（信安世纪）签名服务完成加密。

**加密方式**：通过 HTTP POST 调用 INFOSEC_SIGN 签名接口（Content-Type `INFOSEC_SIGN/1.0`），使用 `sun.misc.BASE64Decoder` 进行 Base64 解码，报文编码为 GBK。注意：当 requestType 不为 '1' 时，ICBCDirectMessageEncryptHandle 会直接透传明文，不执行 NC 签名步骤。

**报文格式**：XML，以 `reqData=` 前缀开头。

**主要处理器**：
- ICBCDirectMessageEncryptHandle —— 加密/解密（含条件绕过路径）
- ICBCBankHandle —— 业务处理
- Velocity 模板位于 `smifc/template/smrts/icbc/`、`icbca/`、`icbcb/`

**注意事项**：工行存在 ICBC（标准）、ICBCA、ICBCB 三种接入变体，对应不同的银行接口版本。

### ABC（中国农业银行）—— 代码 103

**通信协议**：Socket/RawSocket。ABCBankHandle 会将 SOCKET 映射为 RAWSOCKET 再分发（`InterfaceTypeEnum.SOCKET` -> `InterfaceTypeEnum.RAWSOCKET`），这是一项重要的协议翻译细节。报文编码 GBK。

**加密方式**：透传——发送时不加密，接收时剥除响应前 7 个字符。

**主要处理器**：
- ABCDirectEncrytionHandle —— 加解密处理（实际为空操作）
- ABCBankHandle —— 业务处理（使用 InterfaceContext 分发协议）
- Velocity 模板：CQRA10、IBAQ06、IBBF23、CQRT71、CQRT04 等

**超时**：ABCBankHandle 设置超时为 120000ms（2 分钟）。

### BOC（中国银行）—— 代码 104

**通信协议**：HTTP/HTTPS 或 Socket，可配置。

**加密方式**：银行特定加密。

**主要处理器**：`BOCBankInvokeProcessor`（位于 `boc/processor/` 下）。注意：不存在名为 `BOCDirectBankHandle` 的类，也不存在 `boc/handler/` 目录。

### CCB（中国建设银行）—— 代码 105

**通信协议**：HTTP/HTTPS 服务端模式，使用独立 HTTP Server 路径 `/smrts/ccb/httpserver/**`。

**加密方式**：同时使用 MD5withRSA 签名（用于请求签名）和 DESede 加密（使用 `DESedeUtil` 工具类），两者均不可遗漏。

**报文格式**：Velocity 模板。

**字符集**：UTF-8（CCBDirectBankHandle.java 中设置 `bankHandlerDTO.setCharset("UTF-8")`）。

### PSBC（中国邮政储蓄银行）—— 代码 403

**通信协议**：HTTP/HTTPS。

**加密方式**：PSBC 客户端包内实现。

**报文格式**：Velocity 模板。

### RCC（农村信用合作社）—— 代码 402/402b

**通信协议**：Socket/RawSocket。

**加密方式**：RCC 客户端包内实现。

**报文格式**：Velocity 模板（QRCB001-006、CBE002-006 等）。

### CIB（兴业银行）—— 代码 309

**通信协议**：HTTP/HTTPS。

**加密方式**：CIB 客户端包内实现。

**报文格式**：Velocity 模板。

### 其他银行

| 银行 | 代码 | 协议 | 说明 |
|------|------|------|------|
| 上海银行（BFSH） | 313 | HTTP/HTTPS | 自定义报文格式 |
| 海南银行 | HN | HTTP + 政务云密码平台 | SM4 加密 |
| 江苏支付中心 | JS001 | 自定义 | 自定义 SMSBM 选择器 |
| 社保银行（BFSB） | 000 | 默认 | 仅支付进度展示 |
| 商保（BIZORG） | 630000/730000 | 默认 | 含太平洋保险 |

---

## 二、支付处理流程

任何一笔医保基金支付从发起到完成，经历以下处理阶段。注意：代码中**不存在**名为 `monitorCode` 的追踪概念或类似 `PAYMENT_ASSEMBLY`、`ENCRYPTION_COMPLETE`、`SENT_TO_BANK`、`DECRYPTION_COMPLETE` 的常数值。以下使用 `BusinessHandleTypeEnum` 中定义的操作类型作为阶段标识。

### 阶段 1：前端请求（Frontend Request）

**触发方式**：用户在 SMSBM 前端页面发起批量支付、单笔支付、余额查询等操作。

**入口端点**：
- `MedicalSendToBankController` —— `/bdmp/medicalSend/` 系列
- `MedicalBankSingleController` —— `/smsbm/getMedicalBankSingle/` 系列

**注解**：
- `@PayValidate` —— 参数校验
- `@RepeatSubmit` —— 防止重复提交（基于 Redisson 分布式锁）
- `@LogAnnotation` —— 审计日志

### 阶段 2：业务分发（Business Handle Dispatch）

**流程**：Controller 调用 `SendBankBussinessHandleFactory.bussinessHandle()`，传入 `BusinessHandleTypeEnum` 操作类型。

**分发机制**：工厂从 `serviceCache`（ConcurrentHashMap）中按操作类型查找对应的 `SendBankBussinessHandle` 实现。

**省份路由**：工厂会检查 `app.province` 配置进行省份特定路由（如海南的大批量支付模式通过 `sysSwitchConfig` 切换到大数据通道）。

**防并发**：Redisson 分布式锁防止同批次并发处理。

**BusinessHandleTypeEnum 关键操作类型**：
- `SEND_BATCH_PAY` —— 批量支付
- `SEND_SINGLE_PAY` —— 单笔支付
- `SEND_QUERY_BALANCE` —— 余额查询
- `SEND_QUERY_BATCH_PAY_PROCESS` —— 批付进度查询
- `SEND_QUERY_RETURN` —— 回执查询
- `HN_RECEIVE_*` —— 海南专属接收操作
- `HOSPITAL_SETTLEMENT_DATA_PUSH` —— 医院结算数据推送
- 以及其他 40+ 操作类型

### 阶段 3：报文组装（Message Assembly）

**流程**：`SendBankBussinessHandle` 使用银行特定的消息处理器组装报文。

**组装方式**：
- ABC/RCC/ICBCB 等：用 Velocity 模板（`.vm` 文件）生成 XML 报文
- ICBC：调用 NC 签名服务
- 新疆：调用 JIT AdvanceSignClient

**参数内容**：基金批次号、收款人/银行账户信息、金额、用途等。

### 阶段 4：加密（Encryption）

**流程**：`EncryptionHandleFactory.encryption()` 按银行代码分发到银行特定 `EncryptionHandle`。

**各银行加密方式**：
- ICBC：NC 签名服务 HTTP 调用（INFOSEC_SIGN/1.0 content type）。NC 签名响应为带 `<sign>` 标签的 XML，需解析提取签名值
- ABC：透传（不加密）
- CCB：MD5withRSA 签名 + DESede 加密（两步均执行）
- 海南：政务云密码平台 SM4/ECB/PKCS7Padding + Basic Auth
- 重庆/福建/四川等 SM 省份：SM2+SM4 混合加密（通过 JIT/JNTA/SWXA 等提供商）
- 新疆：SM2 数字签名 + SM4 数据加密

**输出**：加密后的报文存入 `BankInteractionParamDTO.encryptionRequestMessage`。

### 阶段 5：发送到银行（Transport to Bank）

**流程**：`BankHandle.sendBank()` 创建 `BankHandlerDTO`，包含加密报文、超时时间（注意：各银行超时不同——ICBC 为 600000ms/10 分钟，ABC 为 120000ms/2 分钟，BankHandlerDTO javadoc 标注默认 60 秒）、字符集（通常 GBK，但 CCB 使用 UTF-8）。

**协议选择**：通过 `InterfaceContext` 选择传输协议：
- `WEBSERVICECOMP` —— CXF/Axis2 的 WebService 调用
- `SOCKETCOMP` / `RAWSOCKETCOMP` —— Socket 直连
- `HTTPCOMP` —— HTTP 直接调用

**服务端模式**：部分银行（海南、新疆、河南、内蒙古、吉林等）采用银行连接 SMIFC 的 HTTP Server 方式，而非 SMIFC 主动调用银行。

### 阶段 6：响应解密（Response Decryption）

**流程**：银行返回加密响应报文，`EncryptionHandleFactory.decryption()` 按银行分发解密。

**各银行解密方式**：
- ICBC：Base64 解码 + XML 解析
- ABC：去掉前 7 个字符
- CCB：DESede 解密
- SM4 省份：使用对应提供商解密

**输出**：解密后的报文存入 `param.responseMessage`。

### 阶段 7：结果处理（Result Processing）

**流程**：`SendBankBussinessHandle` 处理解密后的响应。

**状态更新**（PayBillStatus 枚举）：
- `UNPAID (00)` —— 未支付
- `SENDING (01)` —— 发送中
- `SEND_SUCC (02)` —— 发送成功
- `SIGN_SUCC (04)` —— 签名成功
- `SIGN_FAIL (05)` —— 签名失败
- `SEND_FAIL (-2)` —— 发送失败
- `BACK_SUCC (03/06)` —— 回执成功
- `BACK_FAIL (-4/-7)` —— 回执失败
- `BANK_PROCCESS (10)` —— 银行处理中（注意拼写为 PROCCESS 而非 PROCESS）
- `RE_PAYED (11)` —— 重新支付
- `PRE_AMT_WRITE_OFF (12)` —— 预付款核销
- `MANUAL_PAY_AUDIT (13)` —— 人工支付审核
- `BACK_PROCESSING (14)` —— 回执处理中
- `CANCEL_PAY (09)` —— 撤单/止付

**银行特定展示**：不同银行对支付进度查询结果的展示方式不同（BFSB、HN、XJ、RCCB、SJB 各有定制）。

### 阶段 8：异常处理（Exception Handling）

**退票处理**：通过 `ReturnPayExceptionController` 管理退票异常，支持批量退票通知（`medicalBatchReturnNotice` 端点）。

**撤单（抽单止付）**：通过 `medicalCancelPay` 端点实现，支持逐笔撤单追踪。

**超额支付防护**：通过 `SysSwitchConfig` 配置超余额支付拦截。

**重发**：通过 `againSendToBank` 端点重新发送失败的支付。

**定时轮询**：部分银行可能长期不回执，需要通过 Xxl-Job 定时任务（扩展 IJobHandler）轮询支付进度。例如 `JlQueryPayProgressJob` 专门查询 BOC 交易的支付进度。

---

## 三、加密体系总览

SMIFC 的加密方案并非严格的三层分层架构，而是按照银行/省份维度组织的。以下从不同维度归类：

### 国家 SM 密码套件（SM2/SM3/SM4）

覆盖约 10 个省份，使用不同的密码硬件/服务提供商：

| 提供商 | 适用省份 | 实现方式 | 配置文件 |
|--------|---------|---------|---------|
| JIT（吉大正元） | 重庆、山西 | 证书信封 + 远程 API | `jitconfigcq.properties` |
| SWXA（三未信安） | 天津、青海 | SwxaJCE Provider + HSM 硬件 | `swsdsTj.ini`、`swsdsQh.ini` |
| JNTA（江南天安） | 福建 | GHSM 硬件模块 | `netsignagent.properties` |
| XASJ（信安世纪） | 福建 | NetSignAgent SM3 签名 | `netsignagent.properties` |

**注意**：新疆不使用 JIT 加密，而是使用自己的独立加密实现（`XJDynamicKeyHandle`、`ScMessageEncrytionImplHandle`）映射到独立 HttpServer 类（`XjSmsbmServerController`），与 JIT-based 省份（重庆、山西）不同。

### 银行特定加密

- ICBC：信安世纪（NC/Infosec）签名服务
- ABC：透传（不加密）
- CCB：MD5withRSA + DESede
- 其他银行：各自包内实现

### 外部政务云加密

- 海南：海南省电子政务云密码服务平台 REST API，IP 和端口从字典表（CommonBasicDataItem，typeCode `SIGN_SERVER`，asCodes `IP` 和 `PORT`）运行时读取，**非硬编码**。加密方式 SM4/ECB/PKCS7Padding + Basic Auth。

### 加密调度机制

使用双层策略模式：
1. `EncryptionHandleFactory`（smsbm 模块）—— 按银行代码分发
2. `EncryptEnum`（smsbm 模块，`com.yonyougov.smifc.common.constant`）—— 按省份映射到加密标志和 HTTP Server 类名

### 加密 Provider 注意事项

项目中引入了 BouncyCastle、JIT（吉大正元）、FishermanJCE（渔人/四川医保）、SWXA（三未信安）、JNTA（江南天安）、XASJ（信安世纪）等多个加密库。不存在名为 Kona 的加密库。需在 JVM 的 `java.security` 中仔细配置 Provider 顺序，通常 BouncyCastle 应排在最后，否则 SM 算法调用可能失败。

---

## 四、CA 证书管理（分省）

| 省份 | CA/证书类型 | 管理方式 |
|------|------------|---------|
| 重庆、山西 | 吉大正元（JIT）证书 | 证书 ID 'cqyb' 通过 AdvanceSignClient 调用 |
| 新疆 | 吉大正元（JIT）证书 + SM2 密钥对 | XJDynamicKeyHandle 动态密钥管理（独立实现，不同于重庆/山西的 JitUtil 路径） |
| 福建 | 信安世纪 NetSignAgent | netsignagent.properties 配置；使用 Kona SSL/TLCP 配置进行 TLS 国密通信 |
| 天津、青海 | 三未信安 HSM 硬件 | 密码机本地配置 |
| 海南 | 政务云密码平台 | REST API + Basic Auth（地址从字典表运行时读取） |

---

## 五、银行配置模式

### bank.properties（集中式）

`bank.properties` 是 smbe 模块下的单个文件，**并非**每个省份各自维护。省份特定配置以独立文件形式存放在 smcs/resources/ 下，例如 `jitconfigcq.properties`、`netsignagent.properties` 等。

### 关键银行配置项（按省份分布）

- 海南：`application.yml` + 政务云 API 地址（字典表配置）+ Basic Auth 凭证
- 重庆：`jitconfigcq.properties` + Dubbo 配置（东软 RPC）
- 新疆：`cssconfig.properties` + SM2 密钥对配置
- 福建：`netsignagent.properties` + HSM 地址（10.70.120.5:8019）

### 银行代码枚举（BankCodeEnum）

定义在 smsbm 模块中，包含 35 个银行代码定义，是加密调度和业务分发的关键入口。

### 接口类型枚举（InterfaceTypeEnum）

定义 4 种传输协议：WebService、Socket、HTTP、RawSocket。

---

## 六、常见集成问题

1. **加密提供商标类冲突**：项目中引入 BouncyCastle、JIT、FishermanJCE、SWXA、JNTA、XASJ 等多个加密库，需在 JVM 的 `java.security` 中仔细配置 Provider 顺序，否则 SM 算法调用会失败。**Kona 并不是本项目使用的加密库**。

2. **字符集问题**：大部分银行使用 GBK 编码（如 ICBC、ABC），但 CCB 明确使用 UTF-8。报文组装和解析时编码不一致会导致乱码或验签失败。

3. **超时配置**：各银行超时时间不同——ICBC 为 600000ms（10 分钟），ABC 为 120000ms（2 分钟），BankHandlerDTO javadoc 标注默认 60 秒。需根据实际业务调整超时参数，不可假定统一默认值。

4. **重复支付风险**：`@RepeatSubmit` 注解基于 Redisson 分布式锁防重，但需确保锁的超时时间大于业务处理时间，否则极端情况下可能产生重复支付。

5. **双代码路径**：smbe 中 `agent/` 目录仅包含 icbc 代理模式代码。海南和新疆的实现均在 `direct/client/` 下，不存在 `agent.*` 路径。修改时需确认走的是 direct 中的哪个银行客户端路径。

6. **服务端模式适配**：部分银行采用 SMIFC 启动 HTTP Server 等待银行回调的方式（海南、新疆、河南、内蒙古、吉林），而非 SMIFC 主动调用银行。这种模式下需额外注意 Server 的端口配置、防火墙规则和证书管理。

7. **响应解析差异**：同一种业务操作（如支付进度查询），不同银行的返回报文结构差异很大，需要各自独立的解析逻辑。新增银行时务必从 `BusinessHandleTypeEnum` 确认是否需要新增操作类型。

8. **sun.misc.BASE64Decoder**：ICBC 加密中使用 `sun.misc.BASE64Decoder`，该 API 在 Java 9+ 中已被移除。如果要升级 JDK 版本，需要替换为 `java.util.Base64`，影响 ICBC 对接功能。
