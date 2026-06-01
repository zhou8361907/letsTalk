---
topic: smip模块各省份个性化目录
kind: glossary
confidence: verified
aliases: [smip省份, 省份个性化, smip各地区, smip扩展]
updated_at: 2026-06-01T03:32:03.877Z
sources:
  - workBack/com.yonyougov.smip-8.31/src/main/java/com/yonyougov/smifc/
---

# smip 模块 — 各省份个性化需求

`smip-8.31` 是 **医保各地区扩展配置模块**，每个省/市有独立子包，定制需求彼此隔离。

## 模块子包（Sub-module）含义

| 子包 | 含义 |
|------|------|
| `smr` | 支付管理核心 |
| `smc` | 资金/结算 |
| `smrts` | 支付计划（Payment Plan） |
| `smsbm` | 上报/报表模块 |
| `smfm` | 基金管理 |
| `smfs` | 基金划拨 |
| `smrm` | 收入管理（Receivables Management） |
| `smda` | 数据任务 |
| `smcc` | ？ |
| `secret` | 加密/签章相关 |
| `common` | 公共工具 |

## 省份清单与定制范围

### 全部省份（30个）
anhui, chongqing, fujian, fushun, gansu, guangxi, hainan, hebei, heilongjiang, henan, huludao, jiangsu, jiangxi, jilin, liaoning, neimeng, ningxia, panjin, qingdao, qinghai, shaanxi, shanxi, shenyang, sichuan, tianjin, tieling, xinjiang, xjbingtuan, yingkou, zhejiang

### 各省定制子包分布

| 省份 | smr | smc | smrts | smsbm | smfm | smfs | smrm | 其它 |
|------|:---:|:---:|:-----:|:-----:|:----:|:----:|:----:|------|
| 新疆 xinjiang | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| 新疆兵团 xjbingtuan | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — |
| 广西 guangxi | ✔ | ✔ | ✔ | ✔ | — | ✔ | — | — |
| 海南 hainan | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — |
| 内蒙古 neimeng | ✔ | ✔ | ✔ | ✔ | — | ✔ | — | job/medical/province |
| 四川 sichuan | ✔ | — | ✔ | ✔ | — | — | — | common |
| 重庆 chongqing | ✔ | ✔ | ✔ | — | — | — | — | dubbo/secret |
| 陕西 shaanxi | ✔ | ✔ | ✔ | ✔ | — | — | — | — |
| 甘肃 gansu | ✔ | — | ✔ | ✔ | — | — | — | — |
| 河南 henan | ✔ | — | ✔ | ✔ | — | — | — | — |
| 安徽 anhui | ✔ | — | ✔ | ✔ | — | — | — | — |
| 吉林 jilin | ✔ | ✔ | ✔ | ✔ | — | — | — | — |
| 黑龙江 heilongjiang | ✔ | — | ✔ | ✔ | — | ✔(forward) | — | smfm |
| 青海 qinghai | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | secret |
| 福建 fujian | — | — | ✔ | ✔ | — | — | ✔(processor) | secret |
| 宁夏 ningxia | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | smcc |
| 山西 shanxi | — | — | ✔ | — | — | — | — | secret/smda |
| 天津 tianjin | — | — | ✔ | — | — | — | — | secret |
| 辽宁 liaoning | ✔ | — | ✔ | ✔ | — | — | — | — |
| 沈阳 shenyang | ✔ | ✔ | ✔ | ✔ | — | — | — | — |
| 抚顺 fushun | ✔ | — | ✔ | ✔ | — | — | — | — |
| 盘锦 panjin | ✔ | — | ✔ | ✔ | — | — | — | — |
| 葫芦岛 huludao | — | — | ✔ | — | — | — | — | — |
| 营口 yingkou | — | — | ✔ | — | — | — | — | — |
| 铁岭 tieling | — | — | ✔ | — | — | — | — | — |
| 青岛 qingdao | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — |
| 河北 hebei | ✔ | — | ✔ | — | — | — | — | — |
| 江西 jiangxi | ✔ | — | ✔ | — | — | — | — | — |
| 江苏 jiangsu | — | — | — | ✔ | — | — | — | — |
| 浙江 zhejiang | ✔ | — | ✔ | ✔ | — | — | — | finance |

## 定制深度分类

**全面定制（5+ 子包）**：新疆、青海、内蒙古、海南

**中等定制（3-4 子包）**：新疆兵团、广西、四川、重庆、陕西、甘肃、河南、安徽、吉林、黑龙江、福建、宁夏、辽宁、沈阳、青岛

**轻量定制（1-2 子包）**：山西、天津、河北、江西、江苏、浙江、抚顺、盘锦、葫芦岛、营口、铁岭

## 注意

- xinjiang（新疆自治区）和 xjbingtuan（新疆兵团）是**两个独立主体**，不要混用。
- 部分城市（抚顺、沈阳、盘锦等）是辽宁省下单独定制，非省统管。
- 代码路径格式：`smip-8.31/.../{province}/{sub_module}/...`
